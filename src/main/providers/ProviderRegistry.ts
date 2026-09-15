import { Context, Effect, Layer, Option } from "effect"
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

export interface ProviderRegistryShape {
  readonly get: (id: ProviderId) => Option.Option<Provider>
  readonly missingKeys: ReadonlyArray<ProviderId>
  readonly providers: ReadonlyArray<Provider>
}

export function makeProviderRegistry(providers: ReadonlyArray<Provider>): ProviderRegistryShape {
  return {
    get: (id) => Option.fromNullishOr(providers.find((provider) => provider.id === id)),
    missingKeys: [],
    providers
  }
}

export function makeProviderRegistryWithMissing(
  providers: ReadonlyArray<Provider>,
  missingKeys: ReadonlyArray<ProviderId>
): ProviderRegistryShape {
  return {
    get: (id) => Option.fromNullishOr(providers.find((provider) => provider.id === id)),
    missingKeys,
    providers
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

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "ProviderRegistry"
) {
  static readonly Live = Layer.effect(ProviderRegistry, collectTolerantEntries)
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
