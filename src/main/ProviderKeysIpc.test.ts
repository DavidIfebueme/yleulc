import { ConfigProvider, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { Keychain } from "./Keychain"
import { ProviderKeys } from "./ProviderKeys"
import { getProviderSettings, removeProviderKey, saveProviderKey, testProviderKey } from "./ProviderKeysIpc"
import { ProviderRegistry } from "./providers/ProviderRegistry"

const providerRegistryLive = ProviderRegistry.Live.pipe(
  Layer.provideMerge(Layer.mergeAll(Keychain.Test, ConfigProvider.layer(ConfigProvider.fromEnvRecord({}))))
)

const providerKeysLive = ProviderKeys.Live.pipe(Layer.provide(providerRegistryLive))

describe("provider key IPC", () => {
  it("discovers every supported provider without exposing key values", async () => {
    const providers = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          return yield* getProviderSettings(keys)
        }),
        providerKeysLive
      )
    )
    expect(providers.map((provider) => provider.id)).toEqual([
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
    expect(JSON.stringify(providers)).not.toContain("test-key")
  })

  it("saves and removes keys through the keychain double and refreshes availability", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          const saved = yield* saveProviderKey({ key: "test-key", providerId: "openai" }, keys)
          const removed = yield* removeProviderKey({ providerId: "openai" }, keys)
          return { removed, saved }
        }),
        providerKeysLive
      )
    )
    expect(result.saved.find((provider) => provider.id === "openai")).toMatchObject({
      hasKeychainKey: true,
      registryMissing: false
    })
    expect(result.removed.find((provider) => provider.id === "openai")).toMatchObject({
      hasKeychainKey: false,
      registryMissing: true
    })
    expect(JSON.stringify(result)).not.toContain("test-key")
  })

  it("tests a stored key against fixture models without network access", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          yield* saveProviderKey({ key: "test-key", providerId: "openai" }, keys)
          return yield* testProviderKey({ providerId: "openai" }, keys)
        }),
        ProviderKeys.Test
      )
    )
    expect(result).toEqual({ models: ["gpt-4o", "gpt-4o-mini"], providerId: "openai" })
  })

  it("rejects invalid payloads and missing provider keys", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          const invalid = yield* Effect.flip(saveProviderKey({ key: 3, providerId: "openai" }, keys))
          const missing = yield* Effect.flip(testProviderKey({ providerId: "mistral" }, keys))
          const providers = yield* getProviderSettings(keys)
          return { invalid, missing, providers }
        }),
        ProviderKeys.Test
      )
    )
    expect(result.invalid.message).toBe("invalid provider key request")
    expect(result.missing.message).toBe("provider key could not be tested")
    expect(result.providers.find((provider) => provider.id === "openai")?.hasKeychainKey).toBe(false)
  })
})
