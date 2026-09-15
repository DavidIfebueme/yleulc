import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { TogetherProvider, togetherVisionModels } from "./TogetherProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "Qwen/Qwen3.5-9B"
}

describe("TogetherProvider", () => {
  it("exposes together identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* TogetherProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, TogetherProvider.Test))
    expect(provider.id).toBe("together")
    expect(provider.displayName).toBe("Together")
    expect(provider.defaultBaseUrl).toBe("https://api.together.ai/v1")
    expect(provider.visionModels).toEqual(togetherVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* TogetherProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, TogetherProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Together says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* TogetherProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, TogetherProvider.Test))
    expect(models).toEqual(["Qwen/Qwen3.5-9B", "google/gemma-4-31B-it"])
  })
})
