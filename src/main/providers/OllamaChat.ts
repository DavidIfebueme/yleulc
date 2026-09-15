import { Effect, Schema, Stream } from "effect"
import {
  ChatRoleSchema,
  ProviderError,
  type ChatEvent,
  type ChatImage,
  type ChatMessage,
  type ChatRequest,
  type Provider,
  type ProviderId
} from "./Provider"

export const OllamaMessageSchema = Schema.Struct({
  content: Schema.String,
  images: Schema.optional(Schema.Array(Schema.String)),
  role: ChatRoleSchema
})

export type OllamaMessage = typeof OllamaMessageSchema.Type

export const OllamaOptionsSchema = Schema.Struct({
  num_predict: Schema.optional(Schema.Number),
  temperature: Schema.optional(Schema.Number)
})

export const OllamaChatRequestSchema = Schema.Struct({
  messages: Schema.Array(OllamaMessageSchema),
  model: Schema.String,
  options: Schema.optional(OllamaOptionsSchema),
  stream: Schema.Literal(true)
})

export type OllamaChatRequest = typeof OllamaChatRequestSchema.Type

export const OllamaChatLineSchema = Schema.Struct({
  done: Schema.Boolean,
  done_reason: Schema.optional(Schema.Union([Schema.Null, Schema.String])),
  eval_count: Schema.optional(Schema.Number),
  message: Schema.optional(
    Schema.Struct({
      content: Schema.optional(Schema.String)
    })
  ),
  prompt_eval_count: Schema.optional(Schema.Number)
})

export type OllamaChatLine = typeof OllamaChatLineSchema.Type

export const OllamaTagsEntrySchema = Schema.Struct({
  name: Schema.String
})

export const OllamaTagsSchema = Schema.Struct({
  models: Schema.Array(OllamaTagsEntrySchema)
})

export type OllamaTags = typeof OllamaTagsSchema.Type

const decodeLineJson = Schema.decodeUnknownResult(Schema.fromJsonString(OllamaChatLineSchema))

const decodeTagsJson = Schema.decodeUnknownResult(Schema.fromJsonString(OllamaTagsSchema))

export function toOllamaImage(image: ChatImage): string {
  return image.base64
}

export function toOllamaMessage(message: ChatMessage): OllamaMessage {
  return {
    content: message.text,
    images: message.images.length > 0 ? message.images.map(toOllamaImage) : undefined,
    role: message.role
  }
}

export function buildOllamaRequestBody(request: ChatRequest): OllamaChatRequest {
  return {
    messages: request.messages.map(toOllamaMessage),
    model: request.model,
    options: request.maxTokens === undefined && request.temperature === undefined
      ? undefined
      : { num_predict: request.maxTokens, temperature: request.temperature },
    stream: true
  }
}

export function chatEventsFromOllamaNdjson(
  providerId: ProviderId,
  ndjsonText: string
): Effect.Effect<ReadonlyArray<ChatEvent>, ProviderError> {
  return Effect.gen(function* () {
    const events: Array<ChatEvent> = []
    for (const rawLine of ndjsonText.split("\n")) {
      const line = rawLine.trim()
      if (line.length === 0) {
        continue
      }
      const maybeLine = decodeLineJson(line)
      if (maybeLine._tag === "Failure") {
        return yield* Effect.fail(
          new ProviderError({ kind: "parse", message: `unparseable stream payload: ${line}`, providerId })
        )
      }
      const content = maybeLine.success.message?.content
      if (typeof content === "string" && content.length > 0) {
        events.push({ _tag: "text-delta", delta: content })
      }
      if (maybeLine.success.done) {
        const promptCount = maybeLine.success.prompt_eval_count
        const completionCount = maybeLine.success.eval_count
        if (promptCount !== undefined && completionCount !== undefined) {
          events.push({
            _tag: "usage",
            usage: {
              completionTokens: completionCount,
              promptTokens: promptCount,
              totalTokens: promptCount + completionCount
            }
          })
        }
        const doneReason = maybeLine.success.done_reason
        events.push({ _tag: "done", finishReason: typeof doneReason === "string" ? doneReason : "stop" })
        return events
      }
    }
    return events
  })
}

export interface OllamaTransport {
  readonly getJsonText: (path: string) => Effect.Effect<string, ProviderError>
  readonly postChatText: (path: string, body: string) => Effect.Effect<string, ProviderError>
}

export interface OllamaOptions {
  readonly baseUrl: string
  readonly curatedModels: ReadonlyArray<string>
  readonly displayName: string
  readonly providerId: ProviderId
  readonly transport: OllamaTransport
  readonly visionModels: ReadonlyArray<string>
}

function unknownMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown failure"
}

export function liveTransport(providerId: ProviderId, baseUrl: string): OllamaTransport {
  const readBody = (response: Response): Effect.Effect<string, ProviderError> =>
    Effect.tryPromise({
      catch: (cause) => new ProviderError({ kind: "network", message: unknownMessage(cause), providerId }),
      try: () => response.text()
    })
  const requestText = (path: string, method: string, body: string | undefined): Effect.Effect<string, ProviderError> =>
    Effect.tryPromise({
      catch: (cause) => new ProviderError({ kind: "network", message: unknownMessage(cause), providerId }),
      try: () =>
        fetch(`${baseUrl}${path}`, {
          body,
          headers: { "Content-Type": "application/json" },
          method
        })
    }).pipe(
      Effect.flatMap((response) => {
        if (!response.ok) {
          return Effect.fail(
            new ProviderError({
              kind: "upstream",
              message: `request failed with status ${response.status}`,
              providerId
            })
          )
        }
        return readBody(response)
      })
    )
  return {
    getJsonText: (path) => requestText(path, "GET", undefined),
    postChatText: (path, body) => requestText(path, "POST", body)
  }
}

export function fixtureTransport(ndjsonText: string, tagsJson: string): OllamaTransport {
  return {
    getJsonText: () => Effect.succeed(tagsJson),
    postChatText: () => Effect.succeed(ndjsonText)
  }
}

export function failingTransport(error: ProviderError): OllamaTransport {
  return {
    getJsonText: () => Effect.fail(error),
    postChatText: () => Effect.fail(error)
  }
}

export function makeOllamaProvider(options: OllamaOptions): Provider {
  const completeChat = (request: ChatRequest): Stream.Stream<ChatEvent, ProviderError> =>
    Stream.fromIterableEffect(
      Effect.gen(function* () {
        const body = buildOllamaRequestBody(request)
        const ndjsonText = yield* options.transport.postChatText("/api/chat", JSON.stringify(body))
        return yield* chatEventsFromOllamaNdjson(options.providerId, ndjsonText)
      })
    )
  const listModels = (): Effect.Effect<ReadonlyArray<string>, ProviderError> =>
    Effect.catch(
      Effect.gen(function* () {
        const tagsJson = yield* options.transport.getJsonText("/api/tags")
        const parsed = yield* Effect.fromResult(decodeTagsJson(tagsJson)).pipe(
          Effect.mapError(
            () =>
              new ProviderError({
                kind: "parse",
                message: "unparseable model list payload",
                providerId: options.providerId
              })
          )
        )
        const names = parsed.models.map((entry) => entry.name)
        return names.length > 0 ? names : options.curatedModels
      }),
      () => Effect.succeed(options.curatedModels)
    )
  return {
    completeChat,
    defaultBaseUrl: options.baseUrl,
    displayName: options.displayName,
    id: options.providerId,
    listModels,
    visionModels: options.visionModels
  }
}
