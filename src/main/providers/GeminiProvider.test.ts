import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { GeminiProvider, geminiVisionModels } from "./GeminiProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "gemini-2.5-flash"
}

describe("GeminiProvider", () => {
  it("exposes gemini identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* GeminiProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, GeminiProvider.Test))
    expect(provider.id).toBe("gemini")
    expect(provider.displayName).toBe("Gemini")
    expect(provider.defaultBaseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai")
    expect(provider.visionModels).toEqual(geminiVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* GeminiProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, GeminiProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Gemini says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
})
