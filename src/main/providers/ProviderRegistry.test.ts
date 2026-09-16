import { ConfigProvider, Effect, Layer, Option, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { Keychain } from "../Keychain"
import {
  isProviderMissing,
  makeProviderRegistryWithMissing,
  providerKeyEnvVars,
  ProviderRegistry
} from "./ProviderRegistry"
import type { ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "gpt-4o"
}

describe("ProviderRegistry", () => {
  it("resolves all eleven curated entries", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      return registry
    })
    const registry = await Effect.runPromise(Effect.provide(program, ProviderRegistry.Test))
    expect(registry.providers.map((provider) => provider.id)).toEqual([
      "anthropic",
      "custom",
      "deepseek",
      "gemini",
      "groq",
      "mistral",
      "ollama",
      "openai",
      "openrouter",
      "together",
      "xai"
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
    const groq = registry.get("groq")
    const openrouter = registry.get("openrouter")
    const together = registry.get("together")
    const deepseek = registry.get("deepseek")
    const xai = registry.get("xai")
    const mistral = registry.get("mistral")
    expect(Option.isSome(openai)).toBe(true)
    expect(Option.isSome(gemini)).toBe(true)
    expect(Option.isSome(ollama)).toBe(true)
    expect(Option.isSome(custom)).toBe(true)
    expect(Option.isSome(groq)).toBe(true)
    expect(Option.isSome(openrouter)).toBe(true)
    expect(Option.isSome(together)).toBe(true)
    expect(Option.isSome(deepseek)).toBe(true)
    expect(Option.isSome(xai)).toBe(true)
    expect(Option.isSome(mistral)).toBe(true)
    if (
      Option.isSome(anthropic) &&
      Option.isSome(openai) &&
      Option.isSome(gemini) &&
      Option.isSome(ollama) &&
      Option.isSome(custom) &&
      Option.isSome(groq) &&
      Option.isSome(openrouter) &&
      Option.isSome(together) &&
      Option.isSome(deepseek) &&
      Option.isSome(xai) &&
      Option.isSome(mistral)
    ) {
      expect(anthropic.value.displayName).toBe("Anthropic")
      expect(openai.value.displayName).toBe("OpenAI")
      expect(gemini.value.displayName).toBe("Gemini")
      expect(ollama.value.displayName).toBe("Ollama")
      expect(custom.value.displayName).toBe("Custom")
      expect(groq.value.displayName).toBe("Groq")
      expect(openrouter.value.displayName).toBe("OpenRouter")
      expect(together.value.displayName).toBe("Together")
      expect(deepseek.value.displayName).toBe("DeepSeek")
      expect(xai.value.displayName).toBe("xAI")
      expect(mistral.value.displayName).toBe("Mistral")
    }
  })
  it("exposes correct vision flags for curated entries", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      return registry
    })
    const registry = await Effect.runPromise(Effect.provide(program, ProviderRegistry.Test))
    const visionById = new Map(registry.providers.map((provider) => [provider.id, provider.visionModels] as const))
    expect(visionById.get("custom")).toEqual([])
    expect((visionById.get("groq") ?? []).length).toBeGreaterThan(0)
    expect((visionById.get("openrouter") ?? []).length).toBeGreaterThan(0)
    expect((visionById.get("together") ?? []).length).toBeGreaterThan(0)
    expect((visionById.get("deepseek") ?? []).length).toBeGreaterThan(0)
    expect((visionById.get("xai") ?? []).length).toBeGreaterThan(0)
    expect((visionById.get("mistral") ?? []).length).toBeGreaterThan(0)
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
  it("keeps test layers strict with no missing keys", async () => {
    const registry = await Effect.runPromise(
      Effect.provide(Effect.gen(function* () {
        return yield* ProviderRegistry
      }), ProviderRegistry.Test)
    )
    expect(registry.missingKeys).toEqual([])
    expect(registry.providers.length).toBe(11)
  })
  it("boots live with zero keys and exposes absence per provider", async () => {
    const configLayer = ConfigProvider.layer(ConfigProvider.fromEnvRecord({}))
    const live = Layer.provide(ProviderRegistry.Live, Layer.mergeAll(Keychain.Test, configLayer))
    const registry = await Effect.runPromise(
      Effect.provide(Effect.gen(function* () {
        return yield* ProviderRegistry
      }), live)
    )
    expect(registry.providers.map((provider) => provider.id)).toEqual(["custom", "ollama"])
    expect(registry.missingKeys).toEqual([
      "anthropic",
      "deepseek",
      "gemini",
      "groq",
      "mistral",
      "openai",
      "openrouter",
      "together",
      "xai"
    ])
    expect(Option.isNone(registry.get("openai"))).toBe(true)
    expect(Option.isNone(registry.get("anthropic"))).toBe(true)
    expect(Option.isSome(registry.get("ollama"))).toBe(true)
    expect(Option.isSome(registry.get("custom"))).toBe(true)
    expect(isProviderMissing(registry, "openai")).toBe(true)
    expect(isProviderMissing(registry, "ollama")).toBe(false)
    expect(providerKeyEnvVars["openai"]).toBe("OPENAI_API_KEY")
    expect(providerKeyEnvVars["ollama"]).toBeUndefined()
    expect(providerKeyEnvVars["custom"]).toBeUndefined()
  })
  it("boots live with all keys and resolves every entry", async () => {
    const configLayer = ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({
        ANTHROPIC_API_KEY: "test-anthropic",
        DEEPSEEK_API_KEY: "test-deepseek",
        GEMINI_API_KEY: "test-gemini",
        GROQ_API_KEY: "test-groq",
        MISTRAL_API_KEY: "test-mistral",
        OPENAI_API_KEY: "test-openai",
        OPENROUTER_API_KEY: "test-openrouter",
        TOGETHER_API_KEY: "test-together",
        XAI_API_KEY: "test-xai"
      })
    )
    const live = Layer.provide(ProviderRegistry.Live, Layer.mergeAll(Keychain.Test, configLayer))
    const registry = await Effect.runPromise(
      Effect.provide(Effect.gen(function* () {
        return yield* ProviderRegistry
      }), live)
    )
    expect(registry.providers.map((provider) => provider.id)).toEqual([
      "anthropic",
      "custom",
      "deepseek",
      "gemini",
      "groq",
      "mistral",
      "ollama",
      "openai",
      "openrouter",
      "together",
      "xai"
    ])
    expect(registry.missingKeys).toEqual([])
    expect(Option.isSome(registry.get("openai"))).toBe(true)
    expect(Option.isSome(registry.get("anthropic"))).toBe(true)
    expect(isProviderMissing(registry, "openai")).toBe(false)
  })
  it("builds absent registries through the missing constructor", () => {
    const registry = makeProviderRegistryWithMissing([], ["openai"])
    expect(Option.isNone(registry.get("openai"))).toBe(true)
    expect(isProviderMissing(registry, "openai")).toBe(true)
  })
})
