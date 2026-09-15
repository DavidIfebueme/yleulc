import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { openrouterUsageStream } from "./fixtures/openrouterUsageStream"
import {
  OpenRouterProvider,
  openRouterVisionModels
} from "./OpenRouterProvider"
import {
  chatEventsFromOpenRouterSseText,
  fixtureTransport,
  makeOpenAICompatibleProvider
} from "./OpenAICompatible"
import { openrouterModelList } from "./fixtures/openrouterModelList"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "openai/gpt-4o"
}

describe("OpenRouterProvider", () => {
  it("exposes openrouter identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenRouterProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, OpenRouterProvider.Test))
    expect(provider.id).toBe("openrouter")
    expect(provider.displayName).toBe("OpenRouter")
    expect(provider.defaultBaseUrl).toBe("https://openrouter.ai/api/v1")
    expect(provider.visionModels).toEqual(openRouterVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenRouterProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, OpenRouterProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "OpenRouter says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenRouterProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, OpenRouterProvider.Test))
    expect(models).toEqual(["openai/gpt-4o", "google/gemini-2.5-flash"])
  })
  it("treats usage frames as accounting without a second completion", async () => {
    const provider = makeOpenAICompatibleProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      curatedModels: ["openai/gpt-4o"],
      displayName: "OpenRouter",
      parseSseText: chatEventsFromOpenRouterSseText,
      providerId: "openrouter",
      transport: fixtureTransport(openrouterUsageStream, openrouterModelList),
      visionModels: ["openai/gpt-4o"]
    })
    const events = await Effect.runPromise(Stream.runCollect(provider.completeChat(chatRequest)))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hi" },
      { _tag: "done", finishReason: "stop" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      }
    ])
  })
})
