import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { AnthropicProvider, anthropicVisionModels } from "./AnthropicProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "claude-sonnet-4-20250514"
}

describe("AnthropicProvider", () => {
  it("exposes anthropic identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AnthropicProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, AnthropicProvider.Test))
    expect(provider.id).toBe("anthropic")
    expect(provider.displayName).toBe("Anthropic")
    expect(provider.defaultBaseUrl).toBe("https://api.anthropic.com/v1")
    expect(provider.visionModels).toEqual(anthropicVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas with usage and done from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AnthropicProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, AnthropicProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 7, promptTokens: 14, totalTokens: 21 }
      },
      { _tag: "done", finishReason: "end_turn" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* AnthropicProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, AnthropicProvider.Test))
    expect(models).toEqual(["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"])
  })
})
