import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { xaiModelList } from "./fixtures/xaiModelList"
import { xaiTextStream } from "./fixtures/xaiTextStream"
import type { Provider } from "./Provider"

export const xaiDefaultBaseUrl = "https://api.x.ai/v1"

export const xaiCuratedModels: ReadonlyArray<string> = ["grok-4.3", "grok-4.5", "grok-4.6"]

export const xaiVisionModels: ReadonlyArray<string> = ["grok-4.3", "grok-4.5", "grok-4.6"]

export class XAIProvider extends Context.Service<XAIProvider, Provider>()("XAIProvider") {
  static readonly Live = Layer.effect(
    XAIProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("XAI_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("XAI_BASE_URL"), xaiDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: xaiCuratedModels,
        displayName: "xAI",
        providerId: "xai",
        transport: liveTransport("xai", baseUrl, apiKey),
        visionModels: xaiVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    XAIProvider,
    makeOpenAICompatibleProvider({
      baseUrl: xaiDefaultBaseUrl,
      curatedModels: xaiCuratedModels,
      displayName: "xAI",
      providerId: "xai",
      transport: fixtureTransport(xaiTextStream, xaiModelList),
      visionModels: xaiVisionModels
    })
  )
}
