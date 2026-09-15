import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { togetherModelList } from "./fixtures/togetherModelList"
import { togetherTextStream } from "./fixtures/togetherTextStream"
import type { Provider } from "./Provider"

export const togetherDefaultBaseUrl = "https://api.together.ai/v1"

export const togetherCuratedModels: ReadonlyArray<string> = [
  "MiniMaxAI/MiniMax-M3",
  "Qwen/Qwen3.5-9B",
  "Qwen/Qwen3.6-27B",
  "google/gemma-4-31B-it",
  "moonshotai/Kimi-K3"
]

export const togetherVisionModels: ReadonlyArray<string> = [
  "MiniMaxAI/MiniMax-M3",
  "Qwen/Qwen3.5-9B",
  "Qwen/Qwen3.6-27B",
  "google/gemma-4-31B-it",
  "moonshotai/Kimi-K3"
]

export class TogetherProvider extends Context.Service<TogetherProvider, Provider>()("TogetherProvider") {
  static readonly Live = Layer.effect(
    TogetherProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("TOGETHER_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("TOGETHER_BASE_URL"), togetherDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: togetherCuratedModels,
        displayName: "Together",
        providerId: "together",
        transport: liveTransport("together", baseUrl, apiKey),
        visionModels: togetherVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    TogetherProvider,
    makeOpenAICompatibleProvider({
      baseUrl: togetherDefaultBaseUrl,
      curatedModels: togetherCuratedModels,
      displayName: "Together",
      providerId: "together",
      transport: fixtureTransport(togetherTextStream, togetherModelList),
      visionModels: togetherVisionModels
    })
  )
}
