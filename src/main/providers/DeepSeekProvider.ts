import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { deepseekModelList } from "./fixtures/deepseekModelList"
import { deepseekTextStream } from "./fixtures/deepseekTextStream"
import type { Provider } from "./Provider"

export const deepseekDefaultBaseUrl = "https://api.deepseek.com"

export const deepseekCuratedModels: ReadonlyArray<string> = ["deepseek-flash"]

export const deepseekVisionModels: ReadonlyArray<string> = ["deepseek-flash"]

export class DeepSeekProvider extends Context.Service<DeepSeekProvider, Provider>()("DeepSeekProvider") {
  static readonly Live = Layer.effect(
    DeepSeekProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("DEEPSEEK_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("DEEPSEEK_BASE_URL"), deepseekDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: deepseekCuratedModels,
        displayName: "DeepSeek",
        providerId: "deepseek",
        transport: liveTransport("deepseek", baseUrl, apiKey),
        visionModels: deepseekVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    DeepSeekProvider,
    makeOpenAICompatibleProvider({
      baseUrl: deepseekDefaultBaseUrl,
      curatedModels: deepseekCuratedModels,
      displayName: "DeepSeek",
      providerId: "deepseek",
      transport: fixtureTransport(deepseekTextStream, deepseekModelList),
      visionModels: deepseekVisionModels
    })
  )
}
