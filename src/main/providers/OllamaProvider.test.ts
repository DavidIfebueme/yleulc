import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { OllamaProvider, ollamaVisionModels } from "./OllamaProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "llama3.1"
}

describe("OllamaProvider", () => {
  it("exposes ollama identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OllamaProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, OllamaProvider.Test))
    expect(provider.id).toBe("ollama")
    expect(provider.displayName).toBe("Ollama")
    expect(provider.defaultBaseUrl).toBe("http://localhost:11434")
    expect(provider.visionModels).toEqual(ollamaVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas with usage and done from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OllamaProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, OllamaProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded tags list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* OllamaProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, OllamaProvider.Test))
    expect(models).toEqual(["llama3.1:latest", "llama3.2-vision:latest"])
  })
})
