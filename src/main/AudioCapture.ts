import { spawn } from "node:child_process"
import type { ChildProcessByStdio } from "node:child_process"
import type { Readable } from "node:stream"
import { Context, Data, Effect, Layer, Option, Queue, Ref, Schema, Stream } from "effect"

export const captureSampleRateHz = 16000
export const captureChannels = 1
export const captureSampleBytes = 2

export const AudioFrameSchema = Schema.Struct({
  capturedAtMs: Schema.Number,
  pcm: Schema.Uint8Array
})

export type AudioFrame = typeof AudioFrameSchema.Type

export const decodeAudioFrame = Schema.decodeUnknownSync(AudioFrameSchema)

export class AudioCaptureError extends Data.TaggedError("AudioCaptureError")<{
  readonly operation: string
  readonly reason: string
}> {}

export interface AudioCaptureShape {
  readonly channels: number
  readonly frames: Stream.Stream<AudioFrame, AudioCaptureError>
  readonly sampleRateHz: number
  readonly start: Effect.Effect<void, AudioCaptureError>
  readonly stop: Effect.Effect<void, AudioCaptureError>
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

export class AudioCapture extends Context.Service<AudioCapture, AudioCaptureShape>()("AudioCapture") {
  static readonly Live = Layer.effect(
    AudioCapture,
    Effect.gen(function* () {
      const running = yield* Ref.make(Option.none<ChildProcessByStdio<null, Readable, Readable>>())
      const frameQueue = yield* Queue.unbounded<AudioFrame>()
      const stopRunning = Effect.gen(function* () {
        const current = yield* Ref.get(running)
        if (Option.isNone(current)) {
          return
        }
        yield* Effect.sync(() => {
          current.value.kill()
        })
        yield* Ref.set(running, Option.none())
      })
      return AudioCapture.of({
        channels: captureChannels,
        frames: Stream.fromQueue(frameQueue),
        sampleRateHz: captureSampleRateHz,
        start: Effect.gen(function* () {
          const current = yield* Ref.get(running)
          if (Option.isSome(current)) {
            return
          }
          const child = yield* Effect.try({
            catch: (cause) => new AudioCaptureError({ operation: "start", reason: describeCause(cause) }),
            try: () =>
              spawn("arecord", ["-q", "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "raw"], {
                stdio: ["ignore", "pipe", "pipe"]
              })
          })
          child.stdout.on("data", (chunk: Uint8Array) => {
            Effect.runFork(Queue.offer(frameQueue, { capturedAtMs: Date.now(), pcm: chunk.slice() }))
          })
          child.on("error", () => {
            Effect.runFork(stopRunning)
          })
          yield* Ref.set(running, Option.some(child))
        }),
        stop: stopRunning
      })
    })
  )
  static readonly Test = Layer.succeed(
    AudioCapture,
    AudioCapture.of({
      channels: captureChannels,
      frames: Stream.fromIterable<AudioFrame>([]),
      sampleRateHz: captureSampleRateHz,
      start: Effect.void,
      stop: Effect.void
    })
  )
}

export function makeAudioCaptureTestLayer(frameList: ReadonlyArray<AudioFrame>): Layer.Layer<AudioCapture> {
  return Layer.succeed(
    AudioCapture,
    AudioCapture.of({
      channels: captureChannels,
      frames: Stream.fromIterable(frameList),
      sampleRateHz: captureSampleRateHz,
      start: Effect.void,
      stop: Effect.void
    })
  )
}
