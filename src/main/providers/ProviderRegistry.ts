import { Context, Effect, Layer, Option } from "effect"
import { AnthropicProvider } from "./AnthropicProvider"
import { CustomProvider } from "./CustomProvider"
import { GeminiProvider } from "./GeminiProvider"
import { OllamaProvider } from "./OllamaProvider"
import { OpenAIProvider } from "./OpenAIProvider"
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
  const gemini = yield* GeminiProvider
  const ollama = yield* OllamaProvider
  const openai = yield* OpenAIProvider
  return makeProviderRegistry([anthropic, custom, gemini, ollama, openai])
})

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "ProviderRegistry"
) {
  static readonly Live = Layer.effect(ProviderRegistry, collectEntries).pipe(
    Layer.provide(
      Layer.mergeAll(
        AnthropicProvider.Live,
        CustomProvider.Live,
        GeminiProvider.Live,
        OllamaProvider.Live,
        OpenAIProvider.Live
      )
    )
  )
  static readonly Test = Layer.effect(ProviderRegistry, collectEntries).pipe(
    Layer.provide(
      Layer.mergeAll(
        AnthropicProvider.Test,
        CustomProvider.Test,
        GeminiProvider.Test,
        OllamaProvider.Test,
        OpenAIProvider.Test
      )
    )
  )
}
