import { Context, Data, Effect, Layer, Option, Stream } from "effect"
import { defaultAskModel, defaultAskProviderId, type AskRequest } from "../shared/askIpc"
import { ProviderRegistry, type ProviderRegistryShape } from "./providers/ProviderRegistry"
import type { ChatEvent, ChatRequest, Provider, ProviderId } from "./providers/Provider"
import type { ProviderError } from "./providers/Provider"

export class AskServiceError extends Data.TaggedError("AskServiceError")<{
  readonly kind: "empty-question" | "invalid-request" | "unknown-provider"
  readonly message: string
}> {}

export interface AskServiceShape {
  readonly streamAsk: (request: AskRequest) => Stream.Stream<ChatEvent, ProviderError | AskServiceError>
}

export function toChatRequest(request: AskRequest): ChatRequest {
  const systemPrompt = request.systemPrompt?.trim()
  return {
    messages: [
      ...(systemPrompt === undefined || systemPrompt === "" ? [] : [{ images: [], role: "system" as const, text: systemPrompt }]),
      {
        images: (request.images ?? []).map((image) => ({ base64: image.base64, mimeType: image.mimeType })),
        role: "user",
        text: request.question
      }
    ],
    model: request.model ?? defaultAskModel
  }
}

export function resolveAskProviderId(request: AskRequest): ProviderId {
  return request.providerId ?? defaultAskProviderId
}

export function makeAskService(registry: ProviderRegistryShape): AskServiceShape {
  const streamAsk = (request: AskRequest): Stream.Stream<ChatEvent, ProviderError | AskServiceError> =>
    Stream.unwrap(
      Effect.gen(function* () {
        if (request.question.trim().length === 0) {
          return yield* Effect.fail(
            new AskServiceError({ kind: "empty-question", message: "question is empty" })
          )
        }
        const providerId = resolveAskProviderId(request)
        const selected = registry.get(providerId)
        if (Option.isNone(selected)) {
          return yield* Effect.fail(
            new AskServiceError({ kind: "unknown-provider", message: `unknown provider ${providerId}` })
          )
        }
        const provider: Provider = selected.value
        return provider.completeChat(toChatRequest(request))
      })
    )
  return { streamAsk }
}

export class AskService extends Context.Service<AskService, AskServiceShape>()("AskService") {
  static readonly Live = Layer.effect(
    AskService,
    Effect.gen(function* () {
      const registry = yield* ProviderRegistry
      return makeAskService(registry)
    })
  )
  static readonly Test = AskService.Live.pipe(Layer.provide(ProviderRegistry.Test))
}
