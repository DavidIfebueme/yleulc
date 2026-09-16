import { ConfigProvider, Context, Effect, Layer, Option, Redacted } from "effect"
import { Keychain } from "../Keychain"
import type { KeychainShape } from "../Keychain"
import { providerKeyAccount, providerKeyService } from "../ProviderKeyAccount"
import { AnthropicProvider } from "./AnthropicProvider"
import { CustomProvider } from "./CustomProvider"
import { DeepSeekProvider } from "./DeepSeekProvider"
import { GeminiProvider } from "./GeminiProvider"
import { GroqProvider } from "./GroqProvider"
import { MistralProvider } from "./MistralProvider"
import { OllamaProvider } from "./OllamaProvider"
import { OpenAIProvider } from "./OpenAIProvider"
import { OpenRouterProvider } from "./OpenRouterProvider"
import { TogetherProvider } from "./TogetherProvider"
import { XAIProvider } from "./XAIProvider"
import type { Provider, ProviderId } from "./Provider"

type ConfigProviderService = ReturnType<typeof ConfigProvider.fromEnvRecord>

export interface ProviderRegistryShape {
  readonly get: (id: ProviderId) => Option.Option<Provider>
  readonly missingKeys: ReadonlyArray<ProviderId>
  readonly providers: ReadonlyArray<Provider>
  readonly refresh: () => Effect.Effect<void>
}

export function makeProviderRegistry(providers: ReadonlyArray<Provider>): ProviderRegistryShape {
  return {
    get: (id) => Option.fromNullishOr(providers.find((provider) => provider.id === id)),
    missingKeys: [],
    providers,
    refresh: () => Effect.void
  }
}

export function makeProviderRegistryWithMissing(
  providers: ReadonlyArray<Provider>,
  missingKeys: ReadonlyArray<ProviderId>
): ProviderRegistryShape {
  return {
    get: (id) => Option.fromNullishOr(providers.find((provider) => provider.id === id)),
    missingKeys,
    providers,
    refresh: () => Effect.void
  }
}

export const providerKeyEnvVars: Record<ProviderId, string | undefined> = {
  anthropic: "ANTHROPIC_API_KEY",
  custom: undefined,
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  mistral: "MISTRAL_API_KEY",
  ollama: undefined,
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  together: "TOGETHER_API_KEY",
  xai: "XAI_API_KEY"
}

export function isProviderMissing(registry: ProviderRegistryShape, id: ProviderId): boolean {
  return registry.missingKeys.includes(id)
}

const collectStrictEntries = Effect.gen(function* () {
  const anthropic = yield* AnthropicProvider
  const custom = yield* CustomProvider
  const deepseek = yield* DeepSeekProvider
  const gemini = yield* GeminiProvider
  const groq = yield* GroqProvider
  const mistral = yield* MistralProvider
  const ollama = yield* OllamaProvider
  const openai = yield* OpenAIProvider
  const openrouter = yield* OpenRouterProvider
  const together = yield* TogetherProvider
  const xai = yield* XAIProvider
  return makeProviderRegistry([anthropic, custom, deepseek, gemini, groq, mistral, ollama, openai, openrouter, together, xai])
})

const collectTolerantEntries = Effect.gen(function* () {
  const anthropicOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(AnthropicProvider.Live), (context) => Context.get(context, AnthropicProvider)))
  )
  const customOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(CustomProvider.Live), (context) => Context.get(context, CustomProvider)))
  )
  const deepseekOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(DeepSeekProvider.Live), (context) => Context.get(context, DeepSeekProvider)))
  )
  const geminiOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(GeminiProvider.Live), (context) => Context.get(context, GeminiProvider)))
  )
  const groqOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(GroqProvider.Live), (context) => Context.get(context, GroqProvider)))
  )
  const mistralOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(MistralProvider.Live), (context) => Context.get(context, MistralProvider)))
  )
  const ollamaOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(OllamaProvider.Live), (context) => Context.get(context, OllamaProvider)))
  )
  const openaiOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(OpenAIProvider.Live), (context) => Context.get(context, OpenAIProvider)))
  )
  const openrouterOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(OpenRouterProvider.Live), (context) => Context.get(context, OpenRouterProvider)))
  )
  const togetherOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(TogetherProvider.Live), (context) => Context.get(context, TogetherProvider)))
  )
  const xaiOption = yield* Effect.option(
    Effect.scoped(Effect.map(Layer.build(XAIProvider.Live), (context) => Context.get(context, XAIProvider)))
  )
  const present: Array<Provider> = []
  const missing: Array<ProviderId> = []
  if (Option.isSome(anthropicOption)) {
    present.push(anthropicOption.value)
  } else {
    missing.push("anthropic")
  }
  if (Option.isSome(customOption)) {
    present.push(customOption.value)
  } else {
    missing.push("custom")
  }
  if (Option.isSome(deepseekOption)) {
    present.push(deepseekOption.value)
  } else {
    missing.push("deepseek")
  }
  if (Option.isSome(geminiOption)) {
    present.push(geminiOption.value)
  } else {
    missing.push("gemini")
  }
  if (Option.isSome(groqOption)) {
    present.push(groqOption.value)
  } else {
    missing.push("groq")
  }
  if (Option.isSome(mistralOption)) {
    present.push(mistralOption.value)
  } else {
    missing.push("mistral")
  }
  if (Option.isSome(ollamaOption)) {
    present.push(ollamaOption.value)
  } else {
    missing.push("ollama")
  }
  if (Option.isSome(openaiOption)) {
    present.push(openaiOption.value)
  } else {
    missing.push("openai")
  }
  if (Option.isSome(openrouterOption)) {
    present.push(openrouterOption.value)
  } else {
    missing.push("openrouter")
  }
  if (Option.isSome(togetherOption)) {
    present.push(togetherOption.value)
  } else {
    missing.push("together")
  }
  if (Option.isSome(xaiOption)) {
    present.push(xaiOption.value)
  } else {
    missing.push("xai")
  }
  return makeProviderRegistryWithMissing(present, missing)
})

function makeRefreshingProviderRegistry(
  initial: ProviderRegistryShape,
  reload: () => Effect.Effect<ProviderRegistryShape>
): ProviderRegistryShape {
  let current = initial
  return {
    get: (id) => current.get(id),
    get missingKeys() {
      return current.missingKeys
    },
    get providers() {
      return current.providers
    },
    refresh: () => Effect.map(reload(), (next) => {
      current = next
    })
  }
}

function keychainConfig(
  keychain: KeychainShape,
  fallback: ConfigProviderService
): Effect.Effect<ConfigProviderService> {
  return Effect.gen(function* () {
    const keys: Record<string, string | undefined> = {}
    for (const id of Object.keys(providerKeyEnvVars) as Array<ProviderId>) {
      const envVar = providerKeyEnvVars[id]
      if (envVar === undefined) {
        continue
      }
      const stored = yield* keychain.getPassword(providerKeyService, providerKeyAccount(id))
      if (Option.isSome(stored)) {
        keys[envVar] = Redacted.value(stored.value)
      }
    }
    return ConfigProvider.orElse(ConfigProvider.fromEnvRecord(keys), fallback)
  })
}

function collectKeychainEntries(
  keychain: KeychainShape,
  fallback: ConfigProviderService
): Effect.Effect<ProviderRegistryShape> {
  return Effect.flatMap(keychainConfig(keychain, fallback), (config) =>
    Effect.provide(collectTolerantEntries, ConfigProvider.layer(config))
  )
}

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "ProviderRegistry"
) {
  static readonly Live = Layer.effect(
    ProviderRegistry,
    Effect.gen(function* () {
      const keychain = yield* Keychain
      const fallback = yield* ConfigProvider.ConfigProvider
      const initial = yield* collectKeychainEntries(keychain, fallback)
      return makeRefreshingProviderRegistry(initial, () => collectKeychainEntries(keychain, fallback))
    })
  )
  static readonly Test = Layer.effect(ProviderRegistry, collectStrictEntries).pipe(
    Layer.provide(
      Layer.mergeAll(
        AnthropicProvider.Test,
        CustomProvider.Test,
        DeepSeekProvider.Test,
        GeminiProvider.Test,
        GroqProvider.Test,
        MistralProvider.Test,
        OllamaProvider.Test,
        OpenAIProvider.Test,
        OpenRouterProvider.Test,
        TogetherProvider.Test,
        XAIProvider.Test
      )
    )
  )
}
