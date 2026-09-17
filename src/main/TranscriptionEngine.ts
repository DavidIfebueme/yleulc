import { Config, Context, Effect, Fiber, Layer, Schema, Stream } from "effect"
import { captureChannels, captureSampleBytes, captureSampleRateHz } from "./AudioCapture"
import type { AudioCaptureError, AudioFrame } from "./AudioCapture"
import { defaultSegmentationConfig, planSegments } from "./SegmentationPolicy"
import type { SegmentSpan } from "./SegmentationPolicy"
import { TranscriptionError, type TranscriptSegment, type Utterance } from "./Transcription"
import { AssemblyaiError, AssemblyaiSessionFactory, assemblyaiTerminatePayload } from "./AssemblyaiBackend"
import { WhisperBackend } from "./WhisperBackend"
import type { BootstrapError } from "./WhisperBootstrap"
import { DeepgramError, DeepgramSessionFactory, deepgramFinalizePayload } from "./DeepgramBackend"

export const TranscriptionEngineKindSchema = Schema.Union([
  Schema.Literal("local"),
  Schema.Literal("deepgram"),
  Schema.Literal("assemblyai")
])

export type TranscriptionEngineKind = typeof TranscriptionEngineKindSchema.Type

export interface VadScorerShape {
  readonly scoreFrame: (pcm: Uint8Array) => Effect.Effect<number, TranscriptionError>
}

export class VadScorer extends Context.Service<VadScorer, VadScorerShape>()("VadScorer") {
  static readonly Live = Layer.succeed(
    VadScorer,
    VadScorer.of({
      scoreFrame: (pcm) => Effect.succeed(scoreVadRms(pcm))
    })
  )
  static readonly Test = Layer.succeed(
    VadScorer,
    VadScorer.of({
      scoreFrame: () => Effect.succeed(0.9)
    })
  )
}

export function makeVadScorerTestLayer(
  scoreFrame: (pcm: Uint8Array) => Effect.Effect<number, TranscriptionError>
): Layer.Layer<VadScorer> {
  return Layer.succeed(VadScorer, VadScorer.of({ scoreFrame }))
}

export function scoreVadRms(pcm: Uint8Array): number {
  const samples = Math.floor(pcm.length / 2)
  if (samples === 0) {
    return 0
  }
  let energy = 0
  for (let index = 0; index + 1 < pcm.length; index = index + 2) {
    const low = pcm[index] ?? 0
    const high = pcm[index + 1] ?? 0
    let sample = ((high << 8) | low) & 0xffff
    if (sample >= 32768) {
      sample = sample - 65536
    }
    const normalized = sample / 32768
    energy = energy + normalized * normalized
  }
  return Math.min(1, Math.sqrt(energy / samples) * 4)
}

const pcmBytesPerSecond = captureSampleRateHz * captureChannels * captureSampleBytes

export function sliceSpanPcm(
  frames: ReadonlyArray<AudioFrame>,
  span: SegmentSpan
): Uint8Array {
  const parts: Array<Uint8Array> = []
  let total = 0
  for (const frame of frames) {
    const frameEndMs = frame.capturedAtMs + (frame.pcm.length / pcmBytesPerSecond) * 1000
    const overlapStartMs = Math.max(frame.capturedAtMs, span.startMs)
    const overlapEndMs = Math.min(frameEndMs, span.endMs)
    if (overlapEndMs <= overlapStartMs) {
      continue
    }
    const startByte = Math.floor(((overlapStartMs - frame.capturedAtMs) / 1000) * pcmBytesPerSecond)
    const endByte = Math.floor(((overlapEndMs - frame.capturedAtMs) / 1000) * pcmBytesPerSecond)
    const part = frame.pcm.subarray(startByte, Math.min(endByte, frame.pcm.length))
    parts.push(part)
    total = total + part.length
  }
  const pcm = new Uint8Array(total)
  let offset = 0
  for (const part of parts) {
    pcm.set(part, offset)
    offset = offset + part.length
  }
  return pcm
}

export interface TranscribeUtteranceInput {
  readonly id: string
  readonly language: string
  readonly pcm: Uint8Array
  readonly span: SegmentSpan
}

export type TranscriptionEngineError = TranscriptionError | BootstrapError | DeepgramError | AssemblyaiError

export interface TranscriptionEngineShape {
  readonly backendKind: TranscriptionEngineKind
  readonly listen: (
    frames: Stream.Stream<AudioFrame, AudioCaptureError>
  ) => Stream.Stream<TranscriptSegment, TranscriptionEngineError | AudioCaptureError>
  readonly transcribeUtterance: (
    input: TranscribeUtteranceInput
  ) => Effect.Effect<Utterance, TranscriptionEngineError>
}

export class TranscriptionEngine extends Context.Service<TranscriptionEngine, TranscriptionEngineShape>()(
  "TranscriptionEngine"
) {
  static readonly Live = Layer.effect(
    TranscriptionEngine,
    Effect.gen(function* () {
      const backendKind: TranscriptionEngineKind = yield* Config.withDefault(
        Config.schema(TranscriptionEngineKindSchema, "YLEULC_TRANSCRIPTION_ENGINE"),
        "local"
      )
      const localLanguage = yield* Config.withDefault(Config.String("YLEULC_WHISPER_LANGUAGE"), "en")
      const whisper = yield* WhisperBackend
      const sessions = yield* DeepgramSessionFactory
      const assemblyaiSessions = yield* AssemblyaiSessionFactory
      const scorer = yield* VadScorer
      const transcribeLocal = (
        input: TranscribeUtteranceInput
      ): Effect.Effect<Utterance, TranscriptionError | BootstrapError> =>
        whisper.transcribeSegment({ id: input.id, language: input.language, pcm: input.pcm, span: input.span })
      const transcribeDeepgram = (
        input: TranscribeUtteranceInput
      ): Effect.Effect<Utterance, DeepgramError> =>
        Effect.gen(function* () {
          const session = yield* sessions.open
          yield* session.sendAudio(input.pcm)
          yield* session.sendJson(deepgramFinalizePayload)
          const first = yield* Stream.runCollect(
            session.segments.pipe(
              Stream.filter((segment) => !segment.interim),
              Stream.take(1)
            )
          ).pipe(Effect.ensuring(Effect.ignore(session.terminate)))
          const segment = Array.from(first)[0]
          if (segment === undefined) {
            return yield* Effect.fail(
              new DeepgramError({ operation: "transcribeUtterance", reason: "no final transcript" })
            )
          }
          return {
            endMs: segment.endMs,
            id: input.id,
            interim: false as const,
            language: segment.language,
            startMs: segment.startMs,
            text: segment.text
          }
        })
      const listenLocal = (
        frames: Stream.Stream<AudioFrame, AudioCaptureError>
      ): Stream.Stream<TranscriptSegment, TranscriptionError | BootstrapError | AudioCaptureError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const collected = yield* Stream.runCollect(frames)
            const list = Array.from(collected)
            const probabilities = yield* Effect.forEach(list, (frame) => scorer.scoreFrame(frame.pcm))
            const vadFrames = list.map((frame, index) => ({
              speechProbability: probabilities[index] ?? 0,
              timeMs: frame.capturedAtMs
            }))
            const spans = planSegments(vadFrames, defaultSegmentationConfig)
            const utterances = yield* Effect.forEach(spans, (span, index) =>
              transcribeLocal({ id: `local-${index}`, language: localLanguage, pcm: sliceSpanPcm(list, span), span })
            )
            return Stream.fromIterable(utterances)
          })
        )
      const listenDeepgram = (
        frames: Stream.Stream<AudioFrame, AudioCaptureError>
      ): Stream.Stream<TranscriptSegment, DeepgramError | AudioCaptureError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const session = yield* sessions.open
            const pump = Stream.runDrain(
              Stream.mapEffect(
                Stream.map(frames, (frame) => frame.pcm),
                (pcm) => session.sendAudio(pcm)
              )
            )
            const pumpFiber = Effect.runFork(Effect.ensuring(pump, Effect.ignore(session.terminate)))
            const pumpOutcome = Stream.fromEffect(Fiber.join(pumpFiber)).pipe(
              Stream.flatMap(() => Stream.empty)
            )
            return Stream.merge(session.segments, pumpOutcome).pipe(
              Stream.ensuring(
                Effect.ignore(
                  Effect.flatMap(Fiber.interrupt(pumpFiber), () => session.terminate)
                )
              )
            )
          })
        )
      const transcribeAssemblyai = (
        input: TranscribeUtteranceInput
      ): Effect.Effect<Utterance, AssemblyaiError> =>
        Effect.gen(function* () {
          const session = yield* assemblyaiSessions.open
          yield* session.sendAudio(input.pcm)
          yield* session.sendJson(assemblyaiTerminatePayload)
          const first = yield* Stream.runCollect(
            session.segments.pipe(
              Stream.filter((segment) => !segment.interim),
              Stream.take(1)
            )
          ).pipe(Effect.ensuring(Effect.ignore(session.terminate)))
          const segment = Array.from(first)[0]
          if (segment === undefined) {
            return yield* Effect.fail(
              new AssemblyaiError({ operation: "transcribeUtterance", reason: "no final transcript" })
            )
          }
          return {
            endMs: input.span.endMs,
            id: input.id,
            interim: false as const,
            language: segment.language,
            startMs: input.span.startMs,
            text: segment.text
          }
        })
      const listenAssemblyai = (
        frames: Stream.Stream<AudioFrame, AudioCaptureError>
      ): Stream.Stream<TranscriptSegment, AssemblyaiError | AudioCaptureError> =>
        Stream.unwrap(
          Effect.gen(function* () {
            const session = yield* assemblyaiSessions.open
            const pump = Stream.runDrain(
              Stream.mapEffect(
                Stream.map(frames, (frame) => frame.pcm),
                (pcm) => session.sendAudio(pcm)
              )
            )
            const pumpFiber = Effect.runFork(Effect.ensuring(pump, Effect.ignore(session.terminate)))
            const pumpOutcome = Stream.fromEffect(Fiber.join(pumpFiber)).pipe(
              Stream.flatMap(() => Stream.empty)
            )
            return Stream.merge(session.segments, pumpOutcome).pipe(
              Stream.ensuring(
                Effect.ignore(
                  Effect.flatMap(Fiber.interrupt(pumpFiber), () => session.terminate)
                )
              )
            )
          })
        )
      return TranscriptionEngine.of({
        backendKind,
        listen: (frames) =>
          backendKind === "assemblyai"
            ? listenAssemblyai(frames)
            : backendKind === "deepgram"
              ? listenDeepgram(frames)
              : listenLocal(frames),
        transcribeUtterance: (input) =>
          backendKind === "assemblyai"
            ? transcribeAssemblyai(input)
            : backendKind === "deepgram"
              ? transcribeDeepgram(input)
              : transcribeLocal(input)
      })
    })
  )
  static readonly Test = Layer.succeed(
    TranscriptionEngine,
    TranscriptionEngine.of({
      backendKind: "local",
      listen: (frames) =>
        Stream.map(
          frames,
          (frame): TranscriptSegment => ({
            endMs: frame.capturedAtMs + 20,
            id: `test-${frame.capturedAtMs}`,
            interim: false,
            language: "en",
            startMs: frame.capturedAtMs,
            text: "test utterance"
          })
        ),
      transcribeUtterance: (input) =>
        Effect.succeed({
          endMs: input.span.endMs,
          id: input.id,
          interim: false as const,
          language: input.language,
          startMs: input.span.startMs,
          text: "test utterance"
        })
    })
  )
}
