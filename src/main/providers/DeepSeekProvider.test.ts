import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { DeepSeekProvider, deepseekVisionModels } from "./DeepSeekProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "deepseek-flash"
}

describe("DeepSeekProvider", () => {
  it("exposes deepseek identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* DeepSeekProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, DeepSeekProvider.Test))
    expect(provider.id).toBe("deepseek")
    expect(provider.displayName).toBe("DeepSeek")
    expect(provider.defaultBaseUrl).toBe("https://api.deepseek.com")
    expect(provider.visionModels).toEqual(deepseekVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* DeepSeekProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, DeepSeekProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "DeepSeek says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* DeepSeekProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, DeepSeekProvider.Test))
    expect(models).toEqual(["deepseek-flash"])
  })
})
