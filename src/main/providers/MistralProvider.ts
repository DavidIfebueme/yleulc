import { Config, Context, Effect, Layer } from "effect"
import {
  buildMistralRequestBody,
  fixtureTransport,
  liveTransport,
  makeOpenAICompatibleProvider
} from "./OpenAICompatible"
import { mistralModelList } from "./fixtures/mistralModelList"
import { mistralTextStream } from "./fixtures/mistralTextStream"
import type { Provider } from "./Provider"

export const mistralDefaultBaseUrl = "https://api.mistral.ai/v1"

export const mistralCuratedModels: ReadonlyArray<string> = [
  "ministral-14b-latest",
  "ministral-3b-latest",
  "ministral-8b-latest",
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-small-latest"
]

export const mistralVisionModels: ReadonlyArray<string> = [
  "ministral-14b-latest",
  "ministral-3b-latest",
  "ministral-8b-latest",
  "mistral-large-latest",
  "mistral-medium-latest",
  "mistral-small-latest"
]

export class MistralProvider extends Context.Service<MistralProvider, Provider>()("MistralProvider") {
  static readonly Live = Layer.effect(
    MistralProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("MISTRAL_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("MISTRAL_BASE_URL"), mistralDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        buildRequestBody: buildMistralRequestBody,
        curatedModels: mistralCuratedModels,
        displayName: "Mistral",
        providerId: "mistral",
        transport: liveTransport("mistral", baseUrl, apiKey),
        visionModels: mistralVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    MistralProvider,
    makeOpenAICompatibleProvider({
      baseUrl: mistralDefaultBaseUrl,
      buildRequestBody: buildMistralRequestBody,
      curatedModels: mistralCuratedModels,
      displayName: "Mistral",
      providerId: "mistral",
      transport: fixtureTransport(mistralTextStream, mistralModelList),
      visionModels: mistralVisionModels
    })
  )
}
