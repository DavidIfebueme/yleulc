import { ConfigProvider, Effect, Layer, Option, Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { Keychain } from "./Keychain"
import { makeProviderKeys, ProviderKeys } from "./ProviderKeys"
import { makeProviderRegistry } from "./providers/ProviderRegistry"
import { ProviderRegistry } from "./providers/ProviderRegistry"
import type { Provider } from "./providers/Provider"

function scriptedProvider(): Provider {
  return {
    completeChat: () => {
      throw new Error("unused")
    },
    defaultBaseUrl: "https://api.openai.com/v1",
    displayName: "OpenAI",
    id: "openai",
    listModels: () => Effect.succeed(["gpt-4o", "gpt-4o-mini"]),
    visionModels: ["gpt-4o"]
  }
}

describe("ProviderKeys", () => {
  it("saves and reads back through the test double with zero real keychain", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          yield* keys.saveKey("openai", Redacted.make("sk-test-openai"))
          const stored = yield* keys.getKey("openai")
          const present = yield* keys.hasKey("openai")
          const absent = yield* keys.hasKey("gemini")
          return { absent, present, stored }
        }),
        ProviderKeys.Test
      )
    )
    expect(result.present).toBe(true)
    expect(result.absent).toBe(false)
    expect(Option.isSome(result.stored)).toBe(true)
    if (Option.isSome(result.stored)) {
      expect(Redacted.value(result.stored.value)).toBe("sk-test-openai")
    }
  })
  it("rejects empty keys without touching the keychain", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const keys = yield* ProviderKeys
            yield* keys.saveKey("openai", Redacted.make("   "))
          }),
          ProviderKeys.Test
        )
      )
    )
    expect(error._tag).toBe("ProviderKeyError")
  })
  it("removes keys and reports status for the settings ui", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          yield* keys.saveKey("groq", Redacted.make("groq-key"))
          const before = yield* keys.status("groq")
          yield* keys.removeKey("groq")
          const after = yield* keys.status("groq")
          return { after, before }
        }),
        ProviderKeys.Test
      )
    )
    expect(result.before.hasKeychainKey).toBe(true)
    expect(result.before.registryMissing).toBe(false)
    expect(result.after.hasKeychainKey).toBe(false)
  })
  it("synchronizes saved and removed keys with the live provider registry", async () => {
    const registry = Layer.provide(
      ProviderRegistry.Live,
      Layer.mergeAll(Keychain.Test, ConfigProvider.layer(ConfigProvider.fromEnvRecord({})))
    )
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          const before = yield* keys.status("openai")
          yield* keys.saveKey("openai", Redacted.make("sk-test-openai"))
          const saved = yield* keys.status("openai")
          yield* keys.removeKey("openai")
          const removed = yield* keys.status("openai")
          return { before, removed, saved }
        }),
        ProviderKeys.Live.pipe(Layer.provide(Layer.mergeAll(Keychain.Test, registry)))
      )
    )
    expect(result.before.registryMissing).toBe(true)
    expect(result.saved.registryMissing).toBe(false)
    expect(result.removed.registryMissing).toBe(true)
  })
  it("tests a saved key against the fixture provider with no network", async () => {
    const models = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keys = yield* ProviderKeys
          yield* keys.saveKey("openai", Redacted.make("sk-test-openai"))
          return yield* keys.testKey("openai")
        }),
        ProviderKeys.Test
      )
    )
    expect(models.length).toBeGreaterThan(0)
  })
  it("fails test when the key is missing", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const keys = yield* ProviderKeys
            return yield* keys.testKey("mistral")
          }),
          ProviderKeys.Test
        )
      )
    )
    expect(error._tag).toBe("ProviderKeyError")
  })
  it("fails test when the registry entry is absent", async () => {
    const program = Effect.gen(function* () {
      const keychain = yield* Keychain
      const registry = makeProviderRegistry([scriptedProvider()])
      const keys = makeProviderKeys(keychain, registry)
      yield* keys.saveKey("openai", Redacted.make("sk-test-openai"))
      return yield* keys.testKey("mistral")
    })
    const error = await Effect.runPromise(
      Effect.flip(Effect.provide(program, Layer.mergeAll(Keychain.Test, ProviderRegistry.Test)))
    )
    expect(error._tag).toBe("ProviderKeyError")
  })
})
