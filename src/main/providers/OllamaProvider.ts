import { Config, Context, Effect, Layer } from "effect"
import { fixtureTransport, liveTransport, makeOllamaProvider } from "./OllamaChat"
import { ollamaChatStream } from "./fixtures/ollamaChatStream"
import { ollamaTagsList } from "./fixtures/ollamaTagsList"
import type { Provider } from "./Provider"

export const ollamaDefaultBaseUrl = "http://localhost:11434"

export const ollamaCuratedModels: ReadonlyArray<string> = ["llama3.1", "llama3.2-vision", "llava"]

export const ollamaVisionModels: ReadonlyArray<string> = ["llama3.2-vision", "llava"]

export class OllamaProvider extends Context.Service<OllamaProvider, Provider>()("OllamaProvider") {
  static readonly Live = Layer.effect(
    OllamaProvider,
    Effect.gen(function* () {
      const baseUrl = yield* Config.withDefault(Config.String("OLLAMA_BASE_URL"), ollamaDefaultBaseUrl)
      return makeOllamaProvider({
        baseUrl,
        curatedModels: ollamaCuratedModels,
        displayName: "Ollama",
        providerId: "ollama",
        transport: liveTransport("ollama", baseUrl),
        visionModels: ollamaVisionModels
      })
    })
  )
  static readonly Test = Layer.succeed(
    OllamaProvider,
    makeOllamaProvider({
      baseUrl: ollamaDefaultBaseUrl,
      curatedModels: ollamaCuratedModels,
      displayName: "Ollama",
      providerId: "ollama",
      transport: fixtureTransport(ollamaChatStream, ollamaTagsList),
      visionModels: ollamaVisionModels
    })
  )
}
