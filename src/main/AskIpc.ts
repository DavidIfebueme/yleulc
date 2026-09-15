import { Effect, Schema, Stream } from "effect"
import {
  AskRequestSchema,
  type AskEvent,
  type AskRequest
} from "../shared/askIpc"
import type { SettingsSnapshot } from "../shared/settingsIpc"
import { AskServiceError, type AskServiceShape } from "./AskService"
import type { ChatEvent } from "./providers/Provider"
import type { ProviderError } from "./providers/Provider"

const decodeAskRequestEffect = Schema.decodeUnknownEffect(AskRequestSchema)

export function toAskEvent(requestId: string, event: ChatEvent): AskEvent {
  switch (event._tag) {
    case "done":
      return { _tag: "done", finishReason: event.finishReason, requestId }
    case "error":
      return { _tag: "error", message: event.message, requestId }
    case "text-delta":
      return { _tag: "text-delta", delta: event.delta, requestId }
    case "usage":
      return { _tag: "usage", requestId, usage: event.usage }
  }
}

export function streamAskEvents(
  service: AskServiceShape,
  request: AskRequest
): Stream.Stream<AskEvent, ProviderError | AskServiceError> {
  return Stream.map(service.streamAsk(request), (event) => toAskEvent(request.requestId, event))
}

export function describeAskFailure(cause: ProviderError | AskServiceError): string {
  return cause.message
}

export function applySettingsToAskRequest(request: AskRequest, settings: SettingsSnapshot): AskRequest {
  const activePromptModeId = request.activePromptModeId ?? settings.modesPrompts.activePromptModeId
  const mode = settings.modesPrompts.promptModes.find((entry) => entry.id === activePromptModeId)
  const systemPrompt = [settings.modesPrompts.systemPrompt, mode?.prompt ?? "", request.systemPrompt ?? ""]
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt.length > 0)
    .join("\n\n")
  return {
    ...request,
    model: request.model ?? settings.modesPrompts.defaultModel,
    providerId: request.providerId ?? settings.modesPrompts.defaultProviderId,
    systemPrompt: systemPrompt === "" ? undefined : systemPrompt
  }
}

export function runAskRequest(
  raw: unknown,
  service: AskServiceShape,
  send: (event: AskEvent) => Effect.Effect<void>
): Effect.Effect<void, AskServiceError> {
  return Effect.gen(function* () {
    const request = yield* decodeAskRequestEffect(raw).pipe(
      Effect.mapError(() => new AskServiceError({ kind: "invalid-request", message: "invalid ask request" }))
    )
    yield* Stream.runForEach(streamAskEvents(service, request), (event) => send(event)).pipe(
      Effect.catch((cause) =>
        send({ _tag: "error", message: describeAskFailure(cause), requestId: request.requestId })
      )
    )
  })
}
