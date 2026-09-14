import { ConfigProvider, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import {
  buildDeepgramListenUrl,
  buildDeepgramSocketHarness,
  deepgramCloseStreamPayload,
  deepgramMessageToSegment,
  DeepgramError,
  DeepgramSessionFactory,
  makeDeepgramSessionFactoryTestLayer,
  parseDeepgramEvent,
  type DeepgramSessionShape
} from "./DeepgramBackend"

const finalMessage = {
  channel: {
    alternatives: [
      {
        confidence: 0.999,
        transcript: "Tell me more about this.",
        words: [
          { confidence: 0.99, end: 6.35, start: 6.07, word: "tell" },
          { confidence: 0.99, end: 7.27, start: 7.03, word: "this" }
        ]
      }
    ]
  },
  channel_index: [0],
  duration: 1.98,
  from_finalize: false,
  is_final: true,
  metadata: { request_id: "52cc0efe" },
  speech_final: true,
  start: 5.99,
  type: "Results"
}

const interimMessage = {
  channel: {
    alternatives: [
      {
        confidence: 0.8,
        languages: ["es"],
        transcript: "cuéntame",
        words: [{ confidence: 0.8, end: 1.2, start: 0.4, word: "cuéntame" }]
      }
    ]
  },
  channel_index: [0],
  duration: 1.2,
  is_final: false,
  speech_final: false,
  start: 0.4,
  type: "Results"
}

const utteranceEndMessage = { type: "UtteranceEnd" }

const contextFixture = { id: "dg-0", languageFallback: "en" }

function keyedProviderLayer() {
  return ConfigProvider.layer(ConfigProvider.fromEnvRecord({ DEEPGRAM_API_KEY: "test-key" }))
}

describe("buildDeepgramListenUrl", () => {
  it("targets nova-3 with sixteen kilohertz mono interim audio", () => {
    const url = buildDeepgramListenUrl("en")
    expect(url.startsWith("wss://api.deepgram.com/v1/listen?")).toBe(true)
    expect(url).toContain("model=nova-3")
    expect(url).toContain("encoding=linear16")
    expect(url).toContain("sample_rate=16000")
    expect(url).toContain("channels=1")
    expect(url).toContain("interim_results=true")
    expect(url).toContain("language=en")
  })
})

describe("parseDeepgramEvent", () => {
  it("parses event text as unknown json", async () => {
    const parsed = await Effect.runPromise(parseDeepgramEvent(JSON.stringify(finalMessage)))
    expect(parsed).toEqual(finalMessage)
  })
  it("fails malformed json on the error channel", async () => {
    const error = await Effect.runPromise(Effect.flip(parseDeepgramEvent("not json {")))
    expect(error).toBeInstanceOf(DeepgramError)
    expect(error.operation).toBe("parseMessage")
  })
})

describe("deepgramMessageToSegment", () => {
  it("maps a final result to a final segment", async () => {
    const segment = await Effect.runPromise(deepgramMessageToSegment(finalMessage, contextFixture))
    expect(segment).toEqual({
      endMs: 7270,
      id: "dg-0",
      interim: false,
      language: "en",
      startMs: 6070,
      text: "Tell me more about this."
    })
  })
  it("maps an interim result with its detected language", async () => {
    const segment = await Effect.runPromise(deepgramMessageToSegment(interimMessage, contextFixture))
    expect(segment?.interim).toBe(true)
    expect(segment?.language).toBe("es")
    expect(segment?.text).toBe("cuéntame")
  })
  it("skips utterance end and empty transcripts", async () => {
    expect(await Effect.runPromise(deepgramMessageToSegment(utteranceEndMessage, contextFixture))).toBeUndefined()
    const empty = {
      ...finalMessage,
      channel: { alternatives: [{ confidence: 0, transcript: "  ", words: [] }] }
    }
    expect(await Effect.runPromise(deepgramMessageToSegment(empty, contextFixture))).toBeUndefined()
  })
  it("fails results missing their channel", async () => {
    const error = await Effect.runPromise(Effect.flip(deepgramMessageToSegment({ type: "Results" }, contextFixture)))
    expect(error).toBeInstanceOf(DeepgramError)
    expect(error.operation).toBe("parseMessage")
  })
})

describe("DeepgramSessionFactory", () => {
  it("streams interim then final segments from a socket double", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildDeepgramSocketHarness([
          JSON.stringify(interimMessage),
          JSON.stringify(finalMessage),
          JSON.stringify(utteranceEndMessage)
        ])
        const factoryLayer = Layer.provide(
          DeepgramSessionFactory.Live,
          Layer.merge(harness.layer, keyedProviderLayer())
        )
        const inner = Effect.gen(function* () {
          const factory = yield* DeepgramSessionFactory
          const session = yield* factory.open
          const collected = yield* Stream.runCollect(session.segments)
          yield* session.sendAudio(new Uint8Array([9, 9]))
          yield* session.terminate
          return Array.from(collected)
        })
        const segments = yield* Effect.provide(inner, Layer.merge(factoryLayer, keyedProviderLayer()))
        const audio = yield* harness.audioSent
        const json = yield* harness.jsonSent
        const closed = yield* harness.closed
        return { audio, closed, json, segments }
      })
    )
    expect(outcome.segments.length).toBe(2)
    expect(outcome.segments[0]).toMatchObject({ id: "dg-0", interim: true, language: "es" })
    expect(outcome.segments[1]).toMatchObject({ id: "dg-1", interim: false, language: "en" })
    expect(outcome.audio.length).toBe(1)
    expect(outcome.json).toEqual([deepgramCloseStreamPayload])
    expect(outcome.closed).toBe(true)
  })
  it("opens a canned session from the test layer", async () => {
    const segments = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const factory = yield* DeepgramSessionFactory
          const session: DeepgramSessionShape = yield* factory.open
          const collected = yield* Stream.runCollect(session.segments)
          yield* session.sendAudio(new Uint8Array([1]))
          yield* session.terminate
          return Array.from(collected)
        }),
        DeepgramSessionFactory.Test
      )
    )
    expect(segments.map((segment) => segment.interim)).toEqual([true, false])
  })
  it("supports a function-driven double", async () => {
    const double = makeDeepgramSessionFactoryTestLayer(
      Effect.succeed({
        segments: Stream.fromIterable([
          { endMs: 100, id: "dg-x", interim: false, language: "en", startMs: 0, text: "double" }
        ]),
        sendAudio: () => Effect.void,
        sendJson: () => Effect.void,
        terminate: Effect.void
      })
    )
    const segments = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(DeepgramSessionFactory, (factory) =>
          Effect.flatMap(factory.open, (session) => Stream.runCollect(session.segments))
        ),
        double
      )
    )
    expect(Array.from(segments).length).toBe(1)
  })
  it("fails the live factory without an api key", async () => {
    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildDeepgramSocketHarness([])
        const factoryLayer = Layer.provide(DeepgramSessionFactory.Live, harness.layer)
        const inner = Effect.flatMap(DeepgramSessionFactory, (factory) => factory.open)
        return yield* Effect.flip(Effect.provide(inner, factoryLayer))
      })
    )
    expect(error).toBeInstanceOf(DeepgramError)
    expect(error.operation).toBe("readDeepgramKey")
  })
})
