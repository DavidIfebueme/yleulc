import { ConfigProvider, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  AzureBackend,
  buildAzureRecognitionUrl,
  makeAzureBackendTestLayer
} from "./AzureBackend"
import { TranscriptionError } from "./Transcription"

const inputFixture = {
  id: "az-007",
  language: "en",
  pcm: new Uint8Array([1, 2, 3, 4]),
  span: { endMs: 2500, startMs: 1200 }
}

function keyedProviderLayer() {
  return ConfigProvider.layer(
    ConfigProvider.fromEnvRecord({ AZURE_SPEECH_KEY: "test-key", AZURE_SPEECH_REGION: "eastus" })
  )
}

function stubFetch(response: unknown, seen: Array<unknown>) {
  Object.assign(globalThis, {
    fetch: (...args: Array<unknown>) => {
      seen.push(args)
      return Promise.resolve(response)
    }
  })
}

describe("buildAzureRecognitionUrl", () => {
  it("targets the regional short-audio endpoint with language and detailed format", () => {
    const url = buildAzureRecognitionUrl("eastus", "en-US")
    expect(url.startsWith("https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?")).toBe(true)
    expect(url).toContain("language=en-US")
    expect(url).toContain("format=detailed")
  })
})

describe("AzureBackend", () => {
  it("posts wav audio and maps a successful recognition to the input span", async () => {
    const originalFetch = globalThis.fetch
    const seen: Array<unknown> = []
    stubFetch(
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ DisplayText: "note the action item", Duration: 13000000, Offset: 6600000, RecognitionStatus: "Success" })
      },
      seen
    )
    const outcome = await Effect.runPromise(
      Effect.ensuring(
        Effect.gen(function* () {
          const backend = yield* AzureBackend
          return yield* backend.transcribeSegment(inputFixture)
        }).pipe(Effect.provide(Layer.merge(AzureBackend.Live, keyedProviderLayer()))),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(outcome).toEqual({
      endMs: 2500,
      id: "az-007",
      interim: false,
      language: "en",
      startMs: 1200,
      text: "note the action item"
    })
    expect(String(JSON.stringify(seen))).toContain("eastus.stt.speech.microsoft.com")
    expect(String(JSON.stringify(seen))).toContain("audio/wav")
  })
  it("fails recognition that ends without success", async () => {
    const originalFetch = globalThis.fetch
    const seen: Array<unknown> = []
    stubFetch(
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ DisplayText: "", RecognitionStatus: "NoMatch" })
      },
      seen
    )
    const error = await Effect.runPromise(
      Effect.ensuring(
        Effect.flip(
          Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)).pipe(
            Effect.provide(Layer.merge(AzureBackend.Live, keyedProviderLayer()))
          )
        ),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(error.operation).toBe("transcribeSegment")
  })
  it("fails empty display text on the transcription channel", async () => {
    const originalFetch = globalThis.fetch
    const seen: Array<unknown> = []
    stubFetch(
      {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ DisplayText: "  ", RecognitionStatus: "Success" })
      },
      seen
    )
    const error = await Effect.runPromise(
      Effect.ensuring(
        Effect.flip(
          Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)).pipe(
            Effect.provide(Layer.merge(AzureBackend.Live, keyedProviderLayer()))
          )
        ),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(error).toBeInstanceOf(TranscriptionError)
  })
  it("fails http rejections on the request channel", async () => {
    const originalFetch = globalThis.fetch
    const seen: Array<unknown> = []
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({}) }, seen)
    const error = await Effect.runPromise(
      Effect.ensuring(
        Effect.flip(
          Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)).pipe(
            Effect.provide(Layer.merge(AzureBackend.Live, keyedProviderLayer()))
          )
        ),
        Effect.sync(() => {
          Object.assign(globalThis, { fetch: originalFetch })
        })
      )
    )
    expect(error.operation).toBe("requestRecognition")
  })
  it("fails without a speech key", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)).pipe(
          Effect.provide(
            Layer.merge(
              AzureBackend.Live,
              ConfigProvider.layer(ConfigProvider.fromEnvRecord({ AZURE_SPEECH_REGION: "eastus" }))
            )
          )
        )
      )
    )
    expect(error.operation).toBe("readAzureKey")
  })
  it("fails without a speech region", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)).pipe(
          Effect.provide(
            Layer.merge(
              AzureBackend.Live,
              ConfigProvider.layer(ConfigProvider.fromEnvRecord({ AZURE_SPEECH_KEY: "test-key" }))
            )
          )
        )
      )
    )
    expect(error.operation).toBe("readAzureConfig")
  })
  it("serves canned results from the test layer", async () => {
    const utterance = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)),
        AzureBackend.Test
      )
    )
    expect(utterance.text).toBe("test utterance")
  })
  it("supports a function-driven double", async () => {
    const double = makeAzureBackendTestLayer((input) =>
      Effect.succeed({
        endMs: input.span.endMs,
        id: input.id,
        interim: false as const,
        language: input.language,
        startMs: input.span.startMs,
        text: "double"
      })
    )
    const utterance = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(AzureBackend, (backend) => backend.transcribeSegment(inputFixture)),
        double
      )
    )
    expect(utterance.text).toBe("double")
  })
})
