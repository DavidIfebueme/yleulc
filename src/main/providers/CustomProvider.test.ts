import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { CustomProvider } from "./CustomProvider"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "llama3.1"
}

describe("CustomProvider", () => {
  it("exposes custom identity with no assumed vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* CustomProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, CustomProvider.Test))
    expect(provider.id).toBe("custom")
    expect(provider.displayName).toBe("Custom")
    expect(provider.defaultBaseUrl).toBe("http://localhost:11434/v1")
    expect(provider.visionModels).toEqual([])
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* CustomProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, CustomProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* CustomProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, CustomProvider.Test))
    expect(models).toEqual(["llama3.1"])
  })
})
