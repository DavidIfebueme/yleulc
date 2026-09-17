import { ConfigProvider, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import {
  assemblyaiTerminatePayload,
  assemblyaiMessageToSegment,
  AssemblyaiError,
  AssemblyaiSessionFactory,
  buildAssemblyaiListenUrl,
  buildAssemblyaiSocketHarness,
  makeAssemblyaiSessionFactoryTestLayer,
  mintAssemblyaiToken,
  parseAssemblyaiEvent,
  type AssemblyaiSessionShape
} from "./AssemblyaiBackend"
import { Redacted } from "effect"

const partialMessage = {
  end_of_turn: false,
  transcript: "note the",
  turn_is_formatted: false,
  turn_order: 0,
  type: "Turn"
}

const finalMessage = {
  end_of_turn: true,
  language_code: "es",
  transcript: "note the action item",
  turn_is_formatted: true,
  turn_order: 0,
  type: "Turn"
}

const beginMessage = { type: "Begin" }

const contextFixture = { id: "aa-0", languageFallback: "en", receivedAtMs: 42000 }

function keyedProviderLayer() {
  return ConfigProvider.layer(ConfigProvider.fromEnvRecord({ ASSEMBLYAI_API_KEY: "test-key" }))
}

describe("buildAssemblyaiListenUrl", () => {
  it("targets the v3 websocket with sample rate speech model and token", () => {
    const url = buildAssemblyaiListenUrl({ sampleRateHz: 16000, speechModel: "universal-3-5-pro", token: "tok-123" })
    expect(url.startsWith("wss://streaming.assemblyai.com/v3/ws?")).toBe(true)
    expect(url).toContain("sample_rate=16000")
    expect(url).toContain("speech_model=universal-3-5-pro")
    expect(url).toContain("token=tok-123")
  })
})

describe("parseAssemblyaiEvent", () => {
  it("parses event text as unknown json", async () => {
    const parsed = await Effect.runPromise(parseAssemblyaiEvent(JSON.stringify(finalMessage)))
    expect(parsed).toEqual(finalMessage)
  })
  it("fails malformed json on the error channel", async () => {
    const error = await Effect.runPromise(Effect.flip(parseAssemblyaiEvent("not json {")))
    expect(error).toBeInstanceOf(AssemblyaiError)
    expect(error.operation).toBe("parseMessage")
  })
})

describe("assemblyaiMessageToSegment", () => {
  it("maps a final turn to a final segment with its detected language", async () => {
    const segment = await Effect.runPromise(assemblyaiMessageToSegment(finalMessage, contextFixture))
    expect(segment).toEqual({
      endMs: 42000,
      id: "aa-0",
      interim: false,
      language: "es",
      startMs: 42000,
      text: "note the action item"
    })
  })
  it("maps a partial turn with the language fallback", async () => {
    const segment = await Effect.runPromise(assemblyaiMessageToSegment(partialMessage, contextFixture))
    expect(segment?.interim).toBe(true)
    expect(segment?.language).toBe("en")
    expect(segment?.text).toBe("note the")
  })
  it("skips begin messages and empty transcripts", async () => {
    expect(await Effect.runPromise(assemblyaiMessageToSegment(beginMessage, contextFixture))).toBeUndefined()
    const empty = { ...finalMessage, transcript: "  " }
    expect(await Effect.runPromise(assemblyaiMessageToSegment(empty, contextFixture))).toBeUndefined()
  })
  it("fails turns missing their transcript", async () => {
    const error = await Effect.runPromise(Effect.flip(assemblyaiMessageToSegment({ type: "Turn" }, contextFixture)))
    expect(error).toBeInstanceOf(AssemblyaiError)
    expect(error.operation).toBe("parseMessage")
  })
})

describe("mintAssemblyaiToken", () => {
  it("returns the token from the streaming token endpoint", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: () =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ token: "tok-123" }) })
    })
    const token = await Effect.runPromise(
      Effect.ensuring(
        mintAssemblyaiToken(Redacted.make("test-key")),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(token).toBe("tok-123")
  })
  it("fails when the token endpoint rejects the key", async () => {
    const originalFetch = globalThis.fetch
    Object.assign(globalThis, {
      fetch: () => Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({}) })
    })
    const error = await Effect.runPromise(
      Effect.ensuring(
        Effect.flip(mintAssemblyaiToken(Redacted.make("bad-key"))),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(error).toBeInstanceOf(AssemblyaiError)
    expect(error.operation).toBe("mintToken")
  })
})

describe("AssemblyaiSessionFactory", () => {
  it("streams partial then final segments from a socket double", async () => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const harness = yield* buildAssemblyaiSocketHarness([
          JSON.stringify(partialMessage),
          JSON.stringify(finalMessage),
          JSON.stringify(beginMessage)
        ])
        const factoryLayer = Layer.provide(
          AssemblyaiSessionFactory.Live,
          Layer.merge(harness.layer, keyedProviderLayer())
        )
        const inner = Effect.gen(function* () {
          const factory = yield* AssemblyaiSessionFactory
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
    expect(outcome.segments[0]).toMatchObject({ id: "aa-0", interim: true, language: "en" })
    expect(outcome.segments[1]).toMatchObject({ id: "aa-1", interim: false, language: "es" })
    expect(outcome.audio.length).toBe(1)
    expect(outcome.json).toEqual([assemblyaiTerminatePayload])
    expect(outcome.closed).toBe(true)
  })
  it("opens a canned session from the test layer", async () => {
    const segments = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const factory = yield* AssemblyaiSessionFactory
          const session: AssemblyaiSessionShape = yield* factory.open
          const collected = yield* Stream.runCollect(session.segments)
          yield* session.sendAudio(new Uint8Array([1]))
          yield* session.terminate
          return Array.from(collected)
        }),
        AssemblyaiSessionFactory.Test
      )
    )
    expect(segments.map((segment) => segment.interim)).toEqual([true, false])
  })
  it("supports a function-driven double", async () => {
    const double = makeAssemblyaiSessionFactoryTestLayer(
      Effect.succeed({
        segments: Stream.fromIterable([
          { endMs: 100, id: "aa-x", interim: false, language: "en", startMs: 0, text: "double" }
        ]),
        sendAudio: () => Effect.void,
        sendJson: () => Effect.void,
        terminate: Effect.void
      })
    )
    const segments = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(AssemblyaiSessionFactory, (factory) =>
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
        const harness = yield* buildAssemblyaiSocketHarness([])
        const factoryLayer = Layer.provide(AssemblyaiSessionFactory.Live, harness.layer)
        const inner = Effect.flatMap(AssemblyaiSessionFactory, (factory) => factory.open)
        return yield* Effect.flip(Effect.provide(inner, factoryLayer))
      })
    )
    expect(error).toBeInstanceOf(AssemblyaiError)
    expect(error.operation).toBe("readAssemblyaiKey")
  })
})
