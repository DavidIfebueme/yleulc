import { Context, Effect, Layer, Option } from "effect"
import { CustomProvider } from "./CustomProvider"
import { GeminiProvider } from "./GeminiProvider"
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
  const custom = yield* CustomProvider
  const gemini = yield* GeminiProvider
  const openai = yield* OpenAIProvider
  return makeProviderRegistry([custom, gemini, openai])
})

export class ProviderRegistry extends Context.Service<ProviderRegistry, ProviderRegistryShape>()(
  "ProviderRegistry"
) {
  static readonly Live = Layer.effect(ProviderRegistry, collectEntries).pipe(
    Layer.provide(Layer.mergeAll(CustomProvider.Live, GeminiProvider.Live, OpenAIProvider.Live))
  )
  static readonly Test = Layer.effect(ProviderRegistry, collectEntries).pipe(
    Layer.provide(Layer.mergeAll(CustomProvider.Test, GeminiProvider.Test, OpenAIProvider.Test))
  )
}
