import { Data, Effect, Option, Schema, Stream } from "effect"
import {
  ListenStartRequestSchema,
  type ListenEvent,
  type SystemAudioSupport
} from "../shared/listenIpc"
import { AudioCaptureError, type AudioCaptureShape } from "./AudioCapture"
import {
  describeListenFailure,
  type ListenFailure,
  type ListenInput,
  type ListenSessionShape
} from "./ListenSession"
import type { TranscriptionEngineShape } from "./TranscriptionEngine"

export class ListenIpcError extends Data.TaggedError("ListenIpcError")<{
  readonly message: string
}> {}

const decodeStartRequestEffect = Schema.decodeUnknownEffect(ListenStartRequestSchema)

export interface ListenSessionDeps {
  readonly capture: AudioCaptureShape
  readonly engine: TranscriptionEngineShape
  readonly session: ListenSessionShape
}

export function listenSegmentEvents(deps: ListenSessionDeps): Stream.Stream<ListenEvent, ListenFailure> {
  const tagged = Stream.map(
    deps.engine.listen(deps.capture.frames),
    (segment): ListenInput => ({ channel: "mic", segment })
  )
  return Stream.map(deps.session.observe(tagged), (entry): ListenEvent => ({ _tag: "segment", entry }))
}

export function runListenSession(
  raw: unknown,
  deps: ListenSessionDeps,
  send: (event: ListenEvent) => Effect.Effect<void>,
  systemAudio: SystemAudioSupport
): Effect.Effect<void, ListenIpcError> {
  return Effect.gen(function* () {
    yield* decodeStartRequestEffect(raw).pipe(
      Effect.mapError(() => new ListenIpcError({ message: "invalid listen start request" }))
    )
    yield* send({ _tag: "status", state: "started", systemAudio })
    const startFailure = yield* deps.capture.start.pipe(
      Effect.as(Option.none<ListenFailure>()),
      Effect.catch((cause): Effect.Effect<Option.Option<ListenFailure>, never> =>
        Effect.succeed(Option.some<ListenFailure>(cause))
      )
    )
    if (Option.isSome(startFailure)) {
      yield* send({ _tag: "error", message: describeListenFailure(startFailure.value) })
      return
    }
    yield* Stream.runForEach(listenSegmentEvents(deps), (event) => send(event)).pipe(
      Effect.catch((cause: ListenFailure) =>
        send({ _tag: "error", message: describeListenFailure(cause) })
      ),
      Effect.ensuring(Effect.ignore(deps.capture.stop))
    )
  })
}

export function stopListenSession(deps: ListenSessionDeps): Effect.Effect<void, AudioCaptureError> {
  return deps.capture.stop
}
