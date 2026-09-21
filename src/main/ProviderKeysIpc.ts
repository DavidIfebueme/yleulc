import { Effect, Redacted, Schema } from "effect"
import {
  ProviderKeyRequestSchema,
  ProviderKeySaveRequestSchema,
  type ProviderKeyTestResult,
  type ProviderSettingsProvider
} from "../shared/providerIpc"
import type { ProviderId } from "../shared/settingsIpc"
import type { ProviderKeysShape } from "./ProviderKeys"

const decodeProviderKeyRequest = Schema.decodeUnknownEffect(ProviderKeyRequestSchema)

const decodeProviderKeySaveRequest = Schema.decodeUnknownEffect(ProviderKeySaveRequestSchema)

const providerDisplayNames: Record<ProviderId, string> = {
  anthropic: "Anthropic",
  custom: "Custom",
  deepseek: "DeepSeek",
  gemini: "Gemini",
  groq: "Groq",
  mistral: "Mistral",
  ollama: "Ollama",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  together: "Together",
  xai: "xAI"
}

function providerSettings(keys: ProviderKeysShape): Effect.Effect<ReadonlyArray<ProviderSettingsProvider>> {
  return Effect.forEach(Object.keys(providerDisplayNames) as Array<ProviderId>, (id) =>
    Effect.map(keys.status(id), (status) => ({
      displayName: providerDisplayNames[id],
      hasKeychainKey: status.hasKeychainKey,
      id,
      registryMissing: status.registryMissing
    }))
  )
}

export function getProviderSettings(keys: ProviderKeysShape): Effect.Effect<ReadonlyArray<ProviderSettingsProvider>> {
  return providerSettings(keys)
}

export function saveProviderKey(raw: unknown, keys: ProviderKeysShape): Effect.Effect<ReadonlyArray<ProviderSettingsProvider>, Error> {
  return Effect.gen(function* () {
    const request = yield* decodeProviderKeySaveRequest(raw).pipe(
      Effect.mapError(() => new Error("invalid provider key request"))
    )
    yield* keys.saveKey(request.providerId, Redacted.make(request.key)).pipe(
      Effect.mapError(() => new Error("provider key could not be saved"))
    )
    return yield* providerSettings(keys)
  })
}

export function removeProviderKey(raw: unknown, keys: ProviderKeysShape): Effect.Effect<ReadonlyArray<ProviderSettingsProvider>, Error> {
  return Effect.gen(function* () {
    const request = yield* decodeProviderKeyRequest(raw).pipe(
      Effect.mapError(() => new Error("invalid provider key request"))
    )
    yield* keys.removeKey(request.providerId).pipe(
      Effect.mapError(() => new Error("provider key could not be removed"))
    )
    return yield* providerSettings(keys)
  })
}

export function testProviderKey(raw: unknown, keys: ProviderKeysShape): Effect.Effect<ProviderKeyTestResult, Error> {
  return Effect.gen(function* () {
    const request = yield* decodeProviderKeyRequest(raw).pipe(
      Effect.mapError(() => new Error("invalid provider key request"))
    )
    const models = yield* keys.testKey(request.providerId).pipe(
      Effect.mapError(() => new Error("provider key could not be tested"))
    )
    return { models, providerId: request.providerId }
  })
}
