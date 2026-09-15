import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOpenAICompatibleProvider } from "./OpenAICompatible"
import { groqModelList } from "./fixtures/groqModelList"
import { groqTextStream } from "./fixtures/groqTextStream"
import type { Provider } from "./Provider"

export const groqDefaultBaseUrl = "https://api.groq.com/openai/v1"

export const groqCuratedModels: ReadonlyArray<string> = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.6-27b",
  "qwen/qwen3.8-27b"
]

export const groqVisionModels: ReadonlyArray<string> = ["qwen/qwen3.6-27b", "qwen/qwen3.8-27b"]

export class GroqProvider extends Context.Service<GroqProvider, Provider>()("GroqProvider") {
  static readonly Live = Layer.effect(
    GroqProvider,
    Effect.gen(function* () {
      const apiKey = yield* Config.Redacted("GROQ_API_KEY")
      const baseUrl = yield* Config.withDefault(Config.String("GROQ_BASE_URL"), groqDefaultBaseUrl)
      return makeOpenAICompatibleProvider({
        baseUrl,
        curatedModels: groqCuratedModels,
        displayName: "Groq",
        providerId: "groq",
        transport: liveTransport("groq", baseUrl, apiKey),
        visionModels: groqVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    GroqProvider,
    makeOpenAICompatibleProvider({
      baseUrl: groqDefaultBaseUrl,
      curatedModels: groqCuratedModels,
      displayName: "Groq",
      providerId: "groq",
      transport: fixtureTransport(groqTextStream, groqModelList),
      visionModels: groqVisionModels
    })
  )
}
