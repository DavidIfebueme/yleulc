import { Config, Context, Effect, Layer, Redacted } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { customModelList } from "./fixtures/customModelList"
import { openaiTextStream } from "./fixtures/openaiTextStream"
import type { Provider } from "./Provider"

export const customDefaultBaseUrl = "http://localhost:11434/v1"

export const customCuratedModels: ReadonlyArray<string> = []

export const customVisionModels: ReadonlyArray<string> = []

export class CustomProvider extends Context.Service<CustomProvider, Provider>()("CustomProvider") {
  static readonly Live = Layer.effect(
    CustomProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.withDefault(Config.Redacted("CUSTOM_API_KEY"), Redacted.make(""))
      const baseUrl = yield* Config.withDefault(Config.String("CUSTOM_BASE_URL"), customDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: customCuratedModels,
        displayName: "Custom",
        providerId: "custom",
        transport: liveTransport("custom", baseUrl, apiKey),
        visionModels: customVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    CustomProvider,
    makeOpenAICompatibleProvider({
      baseUrl: customDefaultBaseUrl,
      curatedModels: customCuratedModels,
      displayName: "Custom",
      providerId: "custom",
      transport: fixtureTransport(openaiTextStream, customModelList),
      visionModels: customVisionModels
    })
  )
}
