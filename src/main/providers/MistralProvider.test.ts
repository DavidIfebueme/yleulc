import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { MistralProvider, mistralVisionModels } from "./MistralProvider"
import { buildMistralRequestBody } from "./OpenAICompatible"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "mistral-small-latest"
}

describe("MistralProvider", () => {
  it("exposes mistral identity and curated vision models", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* MistralProvider
      return provider
    })
    const provider = await Effect.runPromise(Effect.provide(program, MistralProvider.Test))
    expect(provider.id).toBe("mistral")
    expect(provider.displayName).toBe("Mistral")
    expect(provider.defaultBaseUrl).toBe("https://api.mistral.ai/v1")
    expect(provider.visionModels).toEqual(mistralVisionModels)
    expect(provider.visionModels.length).toBeGreaterThan(0)
  })
  it("streams text deltas from the recorded fixture", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* MistralProvider
      return yield* Stream.runCollect(provider.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, MistralProvider.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Mistral says hi" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("discovers models from the recorded model list", async () => {
    const program = Effect.gen(function* () {
      const provider = yield* MistralProvider
      return yield* provider.listModels()
    })
    const models = await Effect.runPromise(Effect.provide(program, MistralProvider.Test))
    expect(models).toEqual(["mistral-large-latest", "mistral-small-latest"])
  })
  it("encodes image parts with string-form image_url", () => {
    const body = buildMistralRequestBody({
      messages: [
        {
          images: [{ base64: "aGVsbG8=", mimeType: "image/png" }],
          role: "user",
          text: "look"
        }
      ],
      model: "mistral-small-latest"
    })
    expect(body.messages).toEqual([
      {
        content: [
          { text: "look", type: "text" },
          { image_url: "data:image/png;base64,aGVsbG8=", type: "image_url" }
        ],
        role: "user"
      }
    ])
  })
})
