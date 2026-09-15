import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { GroqProvider, groqVisionModels } from "./GroqProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "qwen/qwen3.6-27b"
}

describe("GroqProvider", () => {
  it("exposes groq identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* GroqProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, GroqProvider.Test))
    expect(provider.id).toBe("groq")
    expect(provider.displayName).toBe("Groq")
    expect(provider.defaultBaseUrl).toBe("https://api.groq.com/openai/v1")
    expect(provider.visionModels).toEqual(groqVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* GroqProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, GroqProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Groq says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* GroqProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, GroqProvider.Test))
    expect(models).toEqual(["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"])
  })
})
