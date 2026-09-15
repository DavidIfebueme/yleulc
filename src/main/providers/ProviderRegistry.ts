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
  readonly providers: ReadonlyArray<Provider>
}

export function makeProviderRegistry(providers: ReadonlyArray<Provider>): ProviderRegistryShape {
  return {
    get: (id) => Option.fromNullishOr(providers.find((provider) => provider.id === id)),
    providers
  }
}

const collectEntries = Effect.gen(function* () {
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

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "ProviderRegistry"
) {
  static readonly Live = Layer.effect(ProviderRegistry, collectEntries).pipe(
    Layer.provide(
      Layer.mergeAll(
        AnthropicProvider.Live,
        CustomProvider.Live,
        DeepSeekProvider.Live,
        GeminiProvider.Live,
        GroqProvider.Live,
        MistralProvider.Live,
        OllamaProvider.Live,
        OpenAIProvider.Live,
        OpenRouterProvider.Live,
        TogetherProvider.Live,
        XAIProvider.Live
      )
    )
  )
  static readonly Test = Layer.effect(ProviderRegistry, collectEntries).pipe(
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
