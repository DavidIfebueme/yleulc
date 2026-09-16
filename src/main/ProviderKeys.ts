import { Context, Data, Effect, Layer, Option, Redacted } from "effect"
import { Keychain } from "./Keychain"
import type { KeychainShape } from "./Keychain"
import { providerKeyAccount, providerKeyService } from "./ProviderKeyAccount"
import { isProviderMissing, ProviderRegistry } from "./providers/ProviderRegistry"
import type { ProviderRegistryShape } from "./providers/ProviderRegistry"
import type { ProviderError } from "./providers/Provider"
import type { ProviderId } from "./providers/Provider"

export { providerKeyAccount, providerKeyService } from "./ProviderKeyAccount"

export class ProviderKeyError extends Data.TaggedError("ProviderKeyError")<{
  readonly kind: "invalid-key" | "keychain" | "missing-key" | "unknown-provider"
  readonly message: string
  readonly providerId: ProviderId
}> {}

export interface ProviderKeyStatus {
  readonly hasKeychainKey: boolean
  readonly registryMissing: boolean
}

export interface ProviderKeysShape {
  readonly getKey: (id: ProviderId) => Effect.Effect<Option.Option<Redacted.Redacted<string>>, never>
  readonly hasKey: (id: ProviderId) => Effect.Effect<boolean, never>
  readonly removeKey: (id: ProviderId) => Effect.Effect<void, ProviderKeyError>
  readonly saveKey: (id: ProviderId, key: Redacted.Redacted<string>) => Effect.Effect<void, ProviderKeyError>
  readonly status: (id: ProviderId) => Effect.Effect<ProviderKeyStatus, never>
  readonly testKey: (
    id: ProviderId
  ) => Effect.Effect<ReadonlyArray<string>, ProviderKeyError | ProviderError>
}

export function makeProviderKeys(
  keychain: KeychainShape,
  registry: ProviderRegistryShape
): ProviderKeysShape {
  const getKey = (id: ProviderId) => keychain.getPassword(providerKeyService, providerKeyAccount(id))
  const hasKey = (id: ProviderId) => Effect.map(getKey(id), Option.isSome)
  const saveKey = (id: ProviderId, key: Redacted.Redacted<string>) =>
    Effect.gen(function* () {
      const value = Redacted.value(key).trim()
      if (value.length === 0) {
        return yield* Effect.fail(
          new ProviderKeyError({ kind: "invalid-key", message: `key for ${id} is empty`, providerId: id })
        )
      }
      yield* Effect.mapError(
        keychain.setPassword(providerKeyService, providerKeyAccount(id), Redacted.make(value)),
        (cause) => new ProviderKeyError({ kind: "keychain", message: cause.message, providerId: id })
      )
      yield* registry.refresh()
    })
  const removeKey = (id: ProviderId) =>
    Effect.gen(function* () {
      yield* Effect.mapError(
        keychain.deletePassword(providerKeyService, providerKeyAccount(id)),
        (cause) => new ProviderKeyError({ kind: "keychain", message: cause.message, providerId: id })
      )
      yield* registry.refresh()
    })
  const status = (id: ProviderId) =>
    Effect.map(getKey(id), (stored) => ({
      hasKeychainKey: Option.isSome(stored),
      registryMissing: isProviderMissing(registry, id)
    }))
  const testKey = (id: ProviderId) =>
    Effect.gen(function* () {
      const stored = yield* getKey(id)
      if (Option.isNone(stored)) {
        return yield* Effect.fail(
          new ProviderKeyError({ kind: "missing-key", message: `key for ${id} is missing`, providerId: id })
        )
      }
      const entry = registry.get(id)
      if (Option.isNone(entry)) {
        return yield* Effect.fail(
          new ProviderKeyError({ kind: "unknown-provider", message: `provider ${id} is absent`, providerId: id })
        )
      }
      return yield* entry.value.listModels()
    })
  return { getKey, hasKey, removeKey, saveKey, status, testKey }
}

export class ProviderKeys extends Context.Service<ProviderKeys, ProviderKeysShape>()("ProviderKeys") {
  static readonly Live = Layer.effect(
    ProviderKeys,
    Effect.gen(function* () {
      const keychain = yield* Keychain
      const registry = yield* ProviderRegistry
      return makeProviderKeys(keychain, registry)
    })
  )
  static readonly Test = ProviderKeys.Live.pipe(Layer.provide(Layer.mergeAll(Keychain.Test, ProviderRegistry.Test)))
}
