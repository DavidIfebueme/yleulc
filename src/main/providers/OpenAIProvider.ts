import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { openaiModelList } from "./fixtures/openaiModelList"
import { openaiTextStream } from "./fixtures/openaiTextStream"
import type { Provider } from "./Provider"

export const openAIDefaultBaseUrl = "https://api.openai.com/v1"

export const openAICuratedModels: ReadonlyArray<string> = [
  "gpt-3.5-turbo",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o4-mini"
]

export const openAIVisionModels: ReadonlyArray<string> = [
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "o4-mini"
]

export class OpenAIProvider extends Context.Service<OpenAIProvider, Provider>()("OpenAIProvider") {
  static readonly Live = Layer.effect(
    OpenAIProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("OPENAI_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("OPENAI_BASE_URL"), openAIDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: openAICuratedModels,
        displayName: "OpenAI",
        providerId: "openai",
        transport: liveTransport("openai", baseUrl, apiKey),
        visionModels: openAIVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    OpenAIProvider,
    makeOpenAICompatibleProvider({
      baseUrl: openAIDefaultBaseUrl,
      curatedModels: openAICuratedModels,
      displayName: "OpenAI",
      providerId: "openai",
      transport: fixtureTransport(openaiTextStream, openaiModelList),
      visionModels: openAIVisionModels
    })
  )
}
