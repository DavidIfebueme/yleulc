import { Context, Data, Effect, Layer, Stream } from "effect"
import { assistQuestion, type AssistRequest } from "../shared/assistIpc"
import type { AskRequest } from "../shared/askIpc"
import type { ListenTranscriptEntry } from "../shared/listenIpc"
import { AskService, type AskServiceError, type AskServiceShape } from "./AskService"
import { CaptureService, type CaptureServiceError, type CaptureServiceShape } from "./CaptureService"
import type { ChatEvent } from "./providers/Provider"
import type { ProviderError } from "./providers/Provider"

export const assistTranscriptMaxCharacters = 6000

export const assistTranscriptMaxEntries = 20

export class AssistServiceError extends Data.TaggedError("AssistServiceError")<{
  readonly message: string
}> {}

export interface AssistServiceShape {
  readonly streamAssist: (
    request: AskRequest
  ) => Stream.Stream<ChatEvent, AssistServiceError | AskServiceError | CaptureServiceError | ProviderError>
}

export function toAssistTranscriptContext(entries: ReadonlyArray<ListenTranscriptEntry>): string {
  const lines: Array<string> = []
  let size = 0
  for (const entry of entries.slice(-assistTranscriptMaxEntries).reverse()) {
    const text = entry.text.trim()
    if (entry.interim || text === "") {
      continue
    }
    const line = `[${String(Math.floor(entry.startMs / 1000))}s ${entry.channel}] ${text}`
    if (size + line.length > assistTranscriptMaxCharacters) {
      continue
    }
    lines.unshift(line)
    size = size + line.length
  }
  return lines.join("\n")
}

export function toAssistAskRequest(request: AssistRequest): AskRequest {
  const transcriptContext = toAssistTranscriptContext(request.transcript)
  return {
    activePromptModeId: request.activePromptModeId,
    question: assistQuestion,
    requestId: request.requestId,
    systemPrompt: request.systemPrompt,
    transcriptContext: transcriptContext === "" ? undefined : transcriptContext
  }
}

export function makeAssistService(capture: CaptureServiceShape, ask: AskServiceShape): AssistServiceShape {
  return {
    streamAssist: (request) =>
      Stream.unwrap(
        Effect.map(capture.captureFullscreen(), (image) => ask.streamAsk({ ...request, images: [image] }))
      )
  }
}

export class AssistService extends Context.Service<AssistService, AssistServiceShape>()("AssistService") {
  static readonly Live = Layer.effect(
    AssistService,
    Effect.gen(function* () {
      const ask = yield* AskService
      const capture = yield* CaptureService
      return makeAssistService(capture, ask)
    })
  )
}
