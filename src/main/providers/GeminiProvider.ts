import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { geminiTextStream } from "./fixtures/geminiTextStream"
import { openaiModelList } from "./fixtures/openaiModelList"
import type { Provider } from "./Provider"

export const geminiDefaultBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai"

export const geminiCuratedModels: ReadonlyArray<string> = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro"
]

export const geminiVisionModels: ReadonlyArray<string> = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-flash",
  "gemini-3-pro"
]

export class GeminiProvider extends Context.Service<GeminiProvider, Provider>()("GeminiProvider") {
  static readonly Live = Layer.effect(
    GeminiProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("GEMINI_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("GEMINI_BASE_URL"), geminiDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: geminiCuratedModels,
        displayName: "Gemini",
        providerId: "gemini",
        transport: liveTransport("gemini", baseUrl, apiKey),
        visionModels: geminiVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    GeminiProvider,
    makeOpenAICompatibleProvider({
      baseUrl: geminiDefaultBaseUrl,
      curatedModels: geminiCuratedModels,
      displayName: "Gemini",
      providerId: "gemini",
      transport: fixtureTransport(geminiTextStream, openaiModelList),
      visionModels: geminiVisionModels
    })
  )
}
