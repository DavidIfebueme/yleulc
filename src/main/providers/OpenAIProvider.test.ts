import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { OpenAIProvider, openAIVisionModels } from "./OpenAIProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "gpt-4o"
}

describe("OpenAIProvider", () => {
  it("exposes openai identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenAIProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, OpenAIProvider.Test))
    expect(provider.id).toBe("openai")
    expect(provider.displayName).toBe("OpenAI")
    expect(provider.defaultBaseUrl).toBe("https://api.openai.com/v1")
    expect(provider.visionModels).toEqual(openAIVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenAIProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, OpenAIProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OpenAIProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, OpenAIProvider.Test))
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"])
  })
})
