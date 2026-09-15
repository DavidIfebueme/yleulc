import { Config, Context, Effect, Layer } from "effect"
import {
  chatEventsFromOpenRouterSseText,
  fixtureTransport,
  liveTransport,
  makeOpenAICompatibleProvider
} from "./OpenAICompatible"
import { openrouterModelList } from "./fixtures/openrouterModelList"
import { openrouterTextStream } from "./fixtures/openrouterTextStream"
import type { Provider } from "./Provider"

export const openRouterDefaultBaseUrl = "https://openrouter.ai/api/v1"

export const openRouterCuratedModels: ReadonlyArray<string> = [
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-4o",
  "openai/gpt-4o-mini"
]

export const openRouterVisionModels: ReadonlyArray<string> = [
  "anthropic/claude-sonnet-4",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "openai/gpt-4o",
  "openai/gpt-4o-mini"
]

export class OpenRouterProvider extends Context.Service<OpenRouterProvider, Provider>()("OpenRouterProvider") {
  static readonly Live = Layer.effect(
    OpenRouterProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("OPENROUTER_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("OPENROUTER_BASE_URL"), openRouterDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: openRouterCuratedModels,
        displayName: "OpenRouter",
        parseSseText: chatEventsFromOpenRouterSseText,
        providerId: "openrouter",
        transport: liveTransport("openrouter", baseUrl, apiKey),
        visionModels: openRouterVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    OpenRouterProvider,
    makeOpenAICompatibleProvider({
      baseUrl: openRouterDefaultBaseUrl,
      curatedModels: openRouterCuratedModels,
      displayName: "OpenRouter",
      parseSseText: chatEventsFromOpenRouterSseText,
      providerId: "openrouter",
      transport: fixtureTransport(openrouterTextStream, openrouterModelList),
      visionModels: openRouterVisionModels
    })
  )
}
