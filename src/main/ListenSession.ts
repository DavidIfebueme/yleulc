import { Context, Effect, Layer, Stream } from "effect"
import type { AskRequest } from "../shared/askIpc"
import {
  shouldAutoAnswer,
  toAutoAnswerQuestion,
  type ListenChannel,
  type ListenTranscriptEntry
} from "../shared/listenIpc"
import type { AudioCaptureError } from "./AudioCapture"
import { AskService, type AskServiceError } from "./AskService"
import type { ChatEvent, ProviderError } from "./providers/Provider"
import type { TranscriptSegment } from "./Transcription"
import type { TranscriptionEngineError } from "./TranscriptionEngine"

export interface ListenInput {
  readonly channel: ListenChannel
  readonly segment: TranscriptSegment
}

export interface ListenAnswerEvent {
  readonly entryId: string
  readonly event: ChatEvent
  readonly question: string
  readonly requestId: string
}

export type ListenFailure =
  | AudioCaptureError
  | AskServiceError
  | ProviderError
  | TranscriptionEngineError

export function toListenEntry(input: ListenInput): ListenTranscriptEntry {
  return {
    channel: input.channel,
    endMs: input.segment.endMs,
    id: input.segment.id,
    interim: input.segment.interim,
    language: input.segment.language,
    startMs: input.segment.startMs,
    text: input.segment.text
  }
}

export function toAutoAnswerRequest(entry: ListenTranscriptEntry, requestId: string): AskRequest {
  return { question: toAutoAnswerQuestion(entry), requestId }
}

export function listenAnswerRequestId(entry: ListenTranscriptEntry): string {
  return `listen-${entry.id}`
}

export function describeListenFailure(cause: ListenFailure): string {
  switch (cause._tag) {
    case "AudioCaptureError":
    case "AssemblyaiError":
    case "AzureError":
    case "BootstrapError":
    case "DeepgramError":
    case "TranscriptionError":
      return `${cause.operation}: ${cause.reason}`
    default:
      return cause.message
  }
}

export interface ListenSessionShape {
  readonly observe: <E>(
    inputs: Stream.Stream<ListenInput, E>
  ) => Stream.Stream<ListenTranscriptEntry, E>
  readonly streamAutoAnswer: (
    entry: ListenTranscriptEntry,
    requestId: string
  ) => Stream.Stream<ChatEvent, AskServiceError | ProviderError>
  readonly streamAnswers: <E>(
    inputs: Stream.Stream<ListenInput, E>
  ) => Stream.Stream<ListenAnswerEvent, AskServiceError | E | ProviderError>
}

export function makeListenSession(ask: {
  readonly streamAsk: (request: AskRequest) => Stream.Stream<ChatEvent, AskServiceError | ProviderError>
}): ListenSessionShape {
  const observe = <E>(
    inputs: Stream.Stream<ListenInput, E>
  ): Stream.Stream<ListenTranscriptEntry, E> => Stream.map(inputs, toListenEntry)
  const streamAutoAnswer = (
    entry: ListenTranscriptEntry,
    requestId: string
  ): Stream.Stream<ChatEvent, AskServiceError | ProviderError> => {
    if (!shouldAutoAnswer(entry)) {
      return Stream.empty
    }
    return ask.streamAsk(toAutoAnswerRequest(entry, requestId))
  }
  const streamAnswers = <E>(
    inputs: Stream.Stream<ListenInput, E>
  ): Stream.Stream<ListenAnswerEvent, AskServiceError | E | ProviderError> =>
    Stream.flatMap(observe(inputs), (entry) => {
      if (!shouldAutoAnswer(entry)) {
        return Stream.empty
      }
      const requestId = listenAnswerRequestId(entry)
      const question = toAutoAnswerQuestion(entry)
      return Stream.map(streamAutoAnswer(entry, requestId), (event): ListenAnswerEvent => ({
        entryId: entry.id,
        event,
        question,
        requestId
      }))
    })
  return { observe, streamAnswers, streamAutoAnswer }
}

export class ListenSession extends Context.Service<ListenSession, ListenSessionShape>()(
  "ListenSession"
) {
  static readonly Live = Layer.effect(
    ListenSession,
    Effect.gen(function* () {
      const ask = yield* AskService
      return makeListenSession(ask)
    })
  )
  static readonly Test = ListenSession.Live.pipe(Layer.provide(AskService.Test))
}
