import { Effect, Option, Redacted } from "effect"
import { describe, expect, it } from "vitest"
import { Keychain } from "./Keychain"

describe("Keychain", () => {
  it("returns none for a missing entry", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keychain = yield* Keychain
          return yield* keychain.getPassword("yleulc", "openai")
        }),
        Keychain.Test
      )
    )
    expect(Option.isNone(result)).toBe(true)
  })
  it("saves and reads back without touching disk", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keychain = yield* Keychain
          yield* keychain.setPassword("yleulc", "openai", Redacted.make("sk-test-openai"))
          return yield* keychain.getPassword("yleulc", "openai")
        }),
        Keychain.Test
      )
    )
    expect(Option.isSome(result)).toBe(true)
    if (Option.isSome(result)) {
      expect(Redacted.value(result.value)).toBe("sk-test-openai")
    }
  })
  it("overwrites an existing entry", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keychain = yield* Keychain
          yield* keychain.setPassword("yleulc", "gemini", Redacted.make("first"))
          yield* keychain.setPassword("yleulc", "gemini", Redacted.make("second"))
          return yield* keychain.getPassword("yleulc", "gemini")
        }),
        Keychain.Test
      )
    )
    if (Option.isSome(result)) {
      expect(Redacted.value(result.value)).toBe("second")
    } else {
      expect.unreachable()
    }
  })
  it("removes an entry and isolates service and account", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const keychain = yield* Keychain
          yield* keychain.setPassword("yleulc", "groq", Redacted.make("groq-key"))
          yield* keychain.setPassword("yleulc", "xai", Redacted.make("xai-key"))
          yield* keychain.setPassword("other", "groq", Redacted.make("other-key"))
          yield* keychain.deletePassword("yleulc", "groq")
          const removed = yield* keychain.getPassword("yleulc", "groq")
          const kept = yield* keychain.getPassword("yleulc", "xai")
          const other = yield* keychain.getPassword("other", "groq")
          yield* keychain.deletePassword("yleulc", "missing")
          return { kept, other, removed }
        }),
        Keychain.Test
      )
    )
    expect(Option.isNone(result.removed)).toBe(true)
    expect(Option.isSome(result.kept)).toBe(true)
    expect(Option.isSome(result.other)).toBe(true)
  })
})
