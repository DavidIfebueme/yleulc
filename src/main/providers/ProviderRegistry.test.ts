import { Effect, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { ProviderRegistry } from "./ProviderRegistry"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "gpt-4o"
}

describe("ProviderRegistry", () => {
  it("resolves anthropic, custom, gemini, ollama, and openai entries", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      return registry
    })
    const registry = await Effect.runPromise(Effect.provide(program, ProviderRegistry.Test))
    expect(registry.providers.map((provider) => provider.id)).toEqual([
      "anthropic",
      "custom",
      "gemini",
      "ollama",
      "openai"
    ])
  })
  it("looks up each entry by id", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      return registry
    })
    const registry = await Effect.runPromise(Effect.provide(program, ProviderRegistry.Test))
    const anthropic = registry.get("anthropic")
    const openai = registry.get("openai")
    const gemini = registry.get("gemini")
    const ollama = registry.get("ollama")
    const custom = registry.get("custom")
    expect(Option.isSome(anthropic)).toBe(true)
    expect(Option.isSome(openai)).toBe(true)
    expect(Option.isSome(gemini)).toBe(true)
    expect(Option.isSome(ollama)).toBe(true)
    expect(Option.isSome(custom)).toBe(true)
    if (
      Option.isSome(anthropic) &&
      Option.isSome(openai) &&
      Option.isSome(gemini) &&
      Option.isSome(ollama) &&
      Option.isSome(custom)
    ) {
      expect(anthropic.value.displayName).toBe("Anthropic")
      expect(openai.value.displayName).toBe("OpenAI")
      expect(gemini.value.displayName).toBe("Gemini")
      expect(ollama.value.displayName).toBe("Ollama")
      expect(custom.value.displayName).toBe("Custom")
    }
  })
  it("streams chat through a registry entry", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      const entry = registry.get("openai")
      if (Option.isNone(entry)) {
        return yield* Effect.fail(new Error("openai entry missing"))
      }
      return yield* Stream.runCollect(entry.value.completeChat(chatRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, ProviderRegistry.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
})
