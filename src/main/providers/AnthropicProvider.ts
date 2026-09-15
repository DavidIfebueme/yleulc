import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeAnthropicProvider } from "./AnthropicMessages"
import { anthropicModelList } from "./fixtures/anthropicModelList"
import { anthropicTextStream } from "./fixtures/anthropicTextStream"
import type { Provider } from "./Provider"

export const anthropicDefaultBaseUrl = "https://api.anthropic.com/v1"

export const anthropicCuratedModels: ReadonlyArray<string> = [
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514"
]

export const anthropicVisionModels: ReadonlyArray<string> = [
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514"
]

export class AnthropicProvider extends Context.Service<AnthropicProvider, Provider>()(
  "AnthropicProvider"
) {
  static readonly Live = Layer.effect(
    AnthropicProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("ANTHROPIC_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("ANTHROPIC_BASE_URL"), anthropicDefaultBaseUrl)
      return makeAnthropicProvider({
        baseUrl,
        curatedModels: anthropicCuratedModels,
        displayName: "Anthropic",
        providerId: "anthropic",
        transport: liveTransport("anthropic", baseUrl, apiKey),
        visionModels: anthropicVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    AnthropicProvider,
    makeAnthropicProvider({
      baseUrl: anthropicDefaultBaseUrl,
      curatedModels: anthropicCuratedModels,
      displayName: "Anthropic",
      providerId: "anthropic",
      transport: fixtureTransport(anthropicTextStream, anthropicModelList),
      visionModels: anthropicVisionModels
    })
  )
}
