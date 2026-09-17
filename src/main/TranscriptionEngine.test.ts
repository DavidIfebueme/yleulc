import { ConfigProvider, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { makeAudioCaptureTestLayer, type AudioFrame } from "./AudioCapture"
import { AudioCapture } from "./AudioCapture"
import {
  buildAssemblyaiSocketHarness,
  assemblyaiTerminatePayload,
  AssemblyaiSessionFactory
} from "./AssemblyaiBackend"
import {
  buildDeepgramSocketHarness,
  deepgramCloseStreamPayload,
  deepgramFinalizePayload,
  DeepgramSessionFactory
} from "./DeepgramBackend"
import {
  makeVadScorerTestLayer,
  sliceSpanPcm,
  TranscriptionEngine,
  VadScorer,
  type TranscribeUtteranceInput
} from "./TranscriptionEngine"
import { makeWhisperBackendTestLayer, WhisperBackend } from "./WhisperBackend"

function pcmBytes(length: number, seed: number): Uint8Array {
  const pcm = new Uint8Array(length)
  for (let index = 0; index < length; index = index + 1) {
    pcm[index] = (seed + index) % 256
  }
  return pcm
}

function frameFixtures(count: number): ReadonlyArray<AudioFrame> {
  const frames: Array<AudioFrame> = []
  for (let index = 0; index < count; index = index + 1) {
    frames.push({ capturedAtMs: index * 20, pcm: pcmBytes(640, index) })
  }
  return frames
}

const utteranceInput: TranscribeUtteranceInput = {
  id: "utt-007",
  language: "en",
  pcm: pcmBytes(640, 9),
  span: { endMs: 2500, startMs: 1200 }
}

const finalEvent = JSON.stringify({
  channel: {
    alternatives: [
      {
        confidence: 0.99,
        transcript: "note the action item",
        words: [
          { confidence: 0.99, end: 2.5, start: 1.2, word: "note" },
          { confidence: 0.99, end: 3.1, start: 2.5, word: "item" }
        ]
      }
    ]
  },
  channel_index: [0],
  duration: 1.9,
  is_final: true,
  speech_final: true,
  start: 1.2,
  type: "Results"
})

const interimEvent = JSON.stringify({
  channel: {
    alternatives: [
      {
        confidence: 0.7,
        transcript: "note the",
        words: [{ confidence: 0.7, end: 2.0, start: 1.2, word: "note" }]
      }
    ]
  },
  channel_index: [0],
  duration: 0.8,
  is_final: false,
  speech_final: false,
  start: 1.2,
  type: "Results"
})

const assemblyaiFinalEvent = JSON.stringify({
  end_of_turn: true,
  transcript: "note the action item",
  turn_is_formatted: true,
  turn_order: 0,
  type: "Turn"
})

const assemblyaiInterimEvent = JSON.stringify({
  end_of_turn: false,
  transcript: "note the",
  turn_is_formatted: false,
  turn_order: 0,
  type: "Turn"
})

function localEngineLayer(
  transcribeText: (input: TranscribeUtteranceInput) => string,
  score: number
) {
  const backend = makeWhisperBackendTestLayer((input) =>
    Effect.succeed({
      endMs: input.span.endMs,
      id: input.id,
      interim: false as const,
      language: input.language,
      startMs: input.span.startMs,
      text: transcribeText(input)
    })
  )
  const scorer = makeVadScorerTestLayer(() => Effect.succeed(score))
  return Layer.provide(
    TranscriptionEngine.Live,
    Layer.mergeAll(backend, DeepgramSessionFactory.Test, AssemblyaiSessionFactory.Test, scorer)
  )
}

function deepgramProviderLayer() {
  return ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ DEEPGRAM_API_KEY: "test-key", YLEULC_TRANSCRIPTION_ENGINE: "deepgram" })
  )
}

function assemblyaiProviderLayer() {
  return ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ ASSEMBLYAI_API_KEY: "test-key", YLEULC_TRANSCRIPTION_ENGINE: "assemblyai" })
  )
}

describe("sliceSpanPcm", () => {
  it("slices bytes proportional to the span overlap", () => {
    const sliced = sliceSpanPcm(frameFixtures(3), { endMs: 30, startMs: 10 })
    expect(sliced.length).toBe(640)
    expect(Array.from(sliced.slice(0, 320))).toEqual(Array.from(pcmBytes(640, 0).slice(320)))
    expect(Array.from(sliced.slice(320))).toEqual(Array.from(pcmBytes(640, 1).slice(0, 320)))
  })
  it("returns empty audio without overlap", () => {
    expect(sliceSpanPcm(frameFixtures(2), { endMs: 200, startMs: 100 }).length).toBe(0)
  })
})

describe("VadScorer", () => {
  it("scores speech from the test double", async () => {
    const score = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(VadScorer, (scorer) => scorer.scoreFrame(pcmBytes(16, 0))),
        VadScorer.Test
      )
    )
    expect(score).toBe(0.9)
  })
  it("supports scripted scores", async () => {
    const score = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(VadScorer, (scorer) => scorer.scoreFrame(pcmBytes(16, 0))),
        makeVadScorerTestLayer(() => Effect.succeed(0.12))
      )
    )
    expect(score).toBe(0.12)
  })
  it("scores silence near zero with the live energy scorer", async () => {
    const score = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(VadScorer, (scorer) => scorer.scoreFrame(new Uint8Array(640))),
        VadScorer.Live
      )
    )
    expect(score).toBe(0)
  })
  it("scores loud frames above silence with the live energy scorer", async () => {
    const loud = new Uint8Array(640)
    for (let index = 0; index < loud.length; index = index + 2) {
      loud[index] = 255
      loud[index + 1] = 127
    }
    const program = Effect.flatMap(VadScorer, (scorer) =>
      Effect.gen(function* () {
        const silence = yield* scorer.scoreFrame(new Uint8Array(640))
        const speech = yield* scorer.scoreFrame(loud)
        return { silence, speech }
      })
    )
    const outcome = await Effect.runPromise(Effect.provide(program, VadScorer.Live))
    expect(outcome.silence).toBe(0)
    expect(outcome.speech).toBeGreaterThan(0.5)
    expect(outcome.speech).toBeLessThanOrEqual(1)
  })
  it("scores empty frames as zero with the live energy scorer", async () => {
    const score = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(VadScorer, (scorer) => scorer.scoreFrame(new Uint8Array(0))),
        VadScorer.Live
      )
    )
    expect(score).toBe(0)
  })
})

describe("TranscriptionEngine", () => {
  it("transcribes an utterance through the default local backend", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const utterance = yield* engine.transcribeUtterance(utteranceInput)
          return { kind: engine.backendKind, utterance }
        }),
        Layer.provide(
          TranscriptionEngine.Live,
          Layer.mergeAll(WhisperBackend.Test, DeepgramSessionFactory.Test, AssemblyaiSessionFactory.Test, VadScorer.Test)
        )
      )
    )
    expect(outcome.kind).toBe("local")
    expect(outcome.utterance).toMatchObject({ id: "utt-007", language: "en", startMs: 1200, endMs: 2500 })
  })
  it("segments captured frames into utterances on the local backend", async () => {
    const segments = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const capture = yield* AudioCapture
          const collected = yield* Stream.runCollect(engine.listen(capture.frames))
          return Array.from(collected)
        }),
        Layer.merge(
          localEngineLayer((input) => `text:${input.id}`, 0.95),
          makeAudioCaptureTestLayer(frameFixtures(20))
        )
      )
    )
    expect(segments.length).toBe(1)
    expect(segments[0]).toMatchObject({
      endMs: 380,
      id: "local-0",
      interim: false,
      language: "en",
      startMs: 0,
      text: "text:local-0"
    })
  })
  it("transcribes one utterance through a deepgram session", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildDeepgramSocketHarness([finalEvent])
        const factoryLayer = Layer.provide(DeepgramSessionFactory.Live, harness.layer)
        const engineLayer = Layer.provide(
          TranscriptionEngine.Live,
          Layer.mergeAll(
            WhisperBackend.Test,
            factoryLayer,
            AssemblyaiSessionFactory.Test,
            VadScorer.Test,
            deepgramProviderLayer()
          )
        )
        const inner = Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const utterance = yield* engine.transcribeUtterance(utteranceInput)
          return { kind: engine.backendKind, utterance }
        })
        const result = yield* Effect.provide(inner, Layer.merge(engineLayer, deepgramProviderLayer()))
        const json = yield* harness.jsonSent
        const closed = yield* harness.closed
        return { ...result, closed, json }
      })
    )
    expect(outcome.kind).toBe("deepgram")
    expect(outcome.utterance).toMatchObject({
      id: "utt-007",
      interim: false,
      language: "en",
      text: "note the action item"
    })
    expect(outcome.json).toEqual([deepgramFinalizePayload, deepgramCloseStreamPayload])
    expect(outcome.closed).toBe(true)
  })
  it("streams interim and final segments from deepgram", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildDeepgramSocketHarness([interimEvent, finalEvent])
        const factoryLayer = Layer.provide(DeepgramSessionFactory.Live, harness.layer)
        const engineLayer = Layer.provide(
          TranscriptionEngine.Live,
          Layer.mergeAll(
            WhisperBackend.Test,
            factoryLayer,
            AssemblyaiSessionFactory.Test,
            VadScorer.Test,
            deepgramProviderLayer()
          )
        )
        const inner = Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const capture = yield* AudioCapture
          const collected = yield* Stream.runCollect(engine.listen(capture.frames))
          return Array.from(collected)
        })
        const segments = yield* Effect.provide(
          inner,
          Layer.mergeAll(engineLayer, makeAudioCaptureTestLayer(frameFixtures(2)), deepgramProviderLayer())
        )
        const audio = yield* harness.audioSent
        const closed = yield* harness.closed
        return { audio, closed, segments }
      })
    )
    expect(outcome.segments.map((segment) => segment.interim)).toEqual([true, false])
    expect(outcome.audio.length).toBe(2)
    expect(outcome.closed).toBe(true)
  })
  it("transcribes one utterance through an assemblyai session", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildAssemblyaiSocketHarness([assemblyaiFinalEvent])
        const factoryLayer = Layer.provide(AssemblyaiSessionFactory.Live, harness.layer)
        const engineLayer = Layer.provide(
          TranscriptionEngine.Live,
          Layer.mergeAll(
            WhisperBackend.Test,
            DeepgramSessionFactory.Test,
            factoryLayer,
            VadScorer.Test,
            assemblyaiProviderLayer()
          )
        )
        const inner = Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const utterance = yield* engine.transcribeUtterance(utteranceInput)
          return { kind: engine.backendKind, utterance }
        })
        const result = yield* Effect.provide(inner, Layer.merge(engineLayer, assemblyaiProviderLayer()))
        const json = yield* harness.jsonSent
        const closed = yield* harness.closed
        return { ...result, closed, json }
      })
    )
    expect(outcome.kind).toBe("assemblyai")
    expect(outcome.utterance).toMatchObject({
      endMs: 2500,
      id: "utt-007",
      interim: false,
      startMs: 1200,
      text: "note the action item"
    })
    expect(outcome.json).toEqual([assemblyaiTerminatePayload, assemblyaiTerminatePayload])
    expect(outcome.closed).toBe(true)
  })
  it("streams interim and final segments from assemblyai", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildAssemblyaiSocketHarness([assemblyaiInterimEvent, assemblyaiFinalEvent])
        const factoryLayer = Layer.provide(AssemblyaiSessionFactory.Live, harness.layer)
        const engineLayer = Layer.provide(
          TranscriptionEngine.Live,
          Layer.mergeAll(
            WhisperBackend.Test,
            DeepgramSessionFactory.Test,
            factoryLayer,
            VadScorer.Test,
            assemblyaiProviderLayer()
          )
        )
        const inner = Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const capture = yield* AudioCapture
          const collected = yield* Stream.runCollect(engine.listen(capture.frames))
          return Array.from(collected)
        })
        const segments = yield* Effect.provide(
          inner,
          Layer.mergeAll(engineLayer, makeAudioCaptureTestLayer(frameFixtures(2)), assemblyaiProviderLayer())
        )
        const audio = yield* harness.audioSent
        const closed = yield* harness.closed
        return { audio, closed, segments }
      })
    )
    expect(outcome.segments.map((segment) => segment.interim)).toEqual([true, false])
    expect(outcome.audio.length).toBe(2)
    expect(outcome.closed).toBe(true)
  })
  it("serves canned results from the test layer", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const utterance = yield* engine.transcribeUtterance(utteranceInput)
          const capture = yield* AudioCapture
          const collected = yield* Stream.runCollect(engine.listen(capture.frames))
          return { utterance, heard: Array.from(collected) }
        }),
        Layer.merge(TranscriptionEngine.Test, makeAudioCaptureTestLayer(frameFixtures(1)))
      )
    )
    expect(outcome.utterance.text).toBe("test utterance")
    expect(outcome.heard.length).toBe(1)
  })
})
