import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { XAIProvider, xaiVisionModels } from "./XAIProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "grok-4.6"
}

describe("XAIProvider", () => {
  it("exposes xai identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* XAIProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, XAIProvider.Test))
    expect(provider.id).toBe("xai")
    expect(provider.displayName).toBe("xAI")
    expect(provider.defaultBaseUrl).toBe("https://api.x.ai/v1")
    expect(provider.visionModels).toEqual(xaiVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* XAIProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, XAIProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Grok says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* XAIProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, XAIProvider.Test))
    expect(models).toEqual(["grok-4.6", "grok-4.5"])
  })
})
