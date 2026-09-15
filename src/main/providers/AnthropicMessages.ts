import { Effect, Redacted, Schema, Stream } from "effect"
import {
  ProviderError,
  type ChatEvent,
  type ChatImage,
  type ChatMessage,
  type ChatRequest,
  type Provider,
  type ProviderId
} from "./Provider"

export const AnthropicTextPartSchema = Schema.Struct({
  text: Schema.String,
  type: Schema.Literal("text")
})

export const AnthropicImageSourceSchema = Schema.Struct({
  data: Schema.String,
  media_type: Schema.String,
  type: Schema.Literal("base64")
})

export const AnthropicImagePartSchema = Schema.Struct({
  source: AnthropicImageSourceSchema,
  type: Schema.Literal("image")
})

export type AnthropicImagePart = typeof AnthropicImagePartSchema.Type

export const AnthropicContentPartSchema = Schema.Union([AnthropicImagePartSchema, AnthropicTextPartSchema])

export const AnthropicMessageSchema = Schema.Struct({
  content: Schema.Array(AnthropicContentPartSchema),
  role: Schema.Union([Schema.Literal("assistant"), Schema.Literal("user")])
})

export type AnthropicMessage = typeof AnthropicMessageSchema.Type

export const AnthropicChatRequestSchema = Schema.Struct({
  max_tokens: Schema.Number,
  messages: Schema.Array(AnthropicMessageSchema),
  model: Schema.String,
  stream: Schema.Literal(true),
  system: Schema.optional(Schema.String),
  temperature: Schema.optional(Schema.Number)
})

export type AnthropicChatRequest = typeof AnthropicChatRequestSchema.Type

export const AnthropicDeltaEventSchema = Schema.Struct({
  delta: Schema.Struct({
    text: Schema.optional(Schema.String)
  })
})

export const AnthropicStartEventSchema = Schema.Struct({
  message: Schema.Struct({
    usage: Schema.Struct({
      input_tokens: Schema.Number
    })
  })
})

export const AnthropicMessageDeltaSchema = Schema.Struct({
  delta: Schema.Struct({
    stop_reason: Schema.optional(Schema.Union([Schema.Null, Schema.String]))
  }),
  usage: Schema.optional(
    Schema.Struct({
      output_tokens: Schema.Number
    })
  )
})

export const AnthropicStreamErrorDetailSchema = Schema.Struct({
  message: Schema.String
})

export const AnthropicStreamErrorSchema = Schema.Struct({
  error: AnthropicStreamErrorDetailSchema
})

export const AnthropicModelEntrySchema = Schema.Struct({
  id: Schema.String
})

export const AnthropicModelListSchema = Schema.Struct({
  data: Schema.Array(AnthropicModelEntrySchema)
})

export type AnthropicModelList = typeof AnthropicModelListSchema.Type

export const anthropicSseEventPrefix = "event:"

export const anthropicSseDataPrefix = "data:"

export const anthropicMessageStopEvent = "message_stop"

export const anthropicErrorEvent = "error"

export const anthropicVersionHeader = "2023-06-01"

const decodeDeltaJson = Schema.decodeUnknownResult(Schema.fromJsonString(AnthropicDeltaEventSchema))

const decodeStartJson = Schema.decodeUnknownResult(Schema.fromJsonString(AnthropicStartEventSchema))

const decodeMessageDeltaJson = Schema.decodeUnknownResult(
  Schema.fromJsonString(AnthropicMessageDeltaSchema)
)

const decodeErrorJson = Schema.decodeUnknownResult(Schema.fromJsonString(AnthropicStreamErrorSchema))

const decodeModelListJson = Schema.decodeUnknownResult(Schema.fromJsonString(AnthropicModelListSchema))

export function toAnthropicImagePart(image: ChatImage): AnthropicImagePart {
  return {
    source: { data: image.base64, media_type: image.mimeType, type: "base64" },
    type: "image"
  }
}

export function toAnthropicMessage(message: ChatMessage): AnthropicMessage {
  return {
    content: [{ text: message.text, type: "text" }, ...message.images.map(toAnthropicImagePart)],
    role: message.role === "assistant" ? "assistant" : "user"
  }
}

export function buildAnthropicRequestBody(request: ChatRequest): AnthropicChatRequest {
  const systemTexts = request.messages.filter((message) => message.role === "system").map((
    message
  ) => message.text)
  const dialog = request.messages.filter((message) => message.role !== "system")
  return {
    max_tokens: request.maxTokens ?? 1024,
    messages: dialog.map(toAnthropicMessage),
    model: request.model,
    stream: true,
    system: systemTexts.length > 0 ? systemTexts.join("\n") : undefined,
    temperature: request.temperature
  }
}

export function chatEventsFromAnthropicSseText(
  providerId: ProviderId,
  sseText: string
): Effect.Effect<ReadonlyArray<ChatEvent>, ProviderError> {
  return Effect.gen(function* () {
    const events: Array<ChatEvent> = []
    let currentEvent = ""
    let inputTokens: number | undefined = undefined
    for (const rawLine of sseText.split("\n")) {
      const line = rawLine.trim()
      if (line.length === 0) {
        currentEvent = ""
        continue
      }
      if (line.startsWith(anthropicSseEventPrefix)) {
        currentEvent = line.slice(anthropicSseEventPrefix.length).trim()
        continue
      }
      if (!line.startsWith(anthropicSseDataPrefix)) {
        continue
      }
      const payload = line.slice(anthropicSseDataPrefix.length).trim()
      if (currentEvent === anthropicMessageStopEvent) {
        return events
      }
      if (currentEvent === anthropicErrorEvent) {
        const maybeError = decodeErrorJson(payload)
        if (maybeError._tag === "Failure") {
          return yield* Effect.fail(
            new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
          )
        }
        events.push({ _tag: "error", message: maybeError.success.error.message })
        return events
      }
      if (currentEvent === "message_start") {
        const maybeStart = decodeStartJson(payload)
        if (maybeStart._tag === "Failure") {
          return yield* Effect.fail(
            new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
          )
        }
        inputTokens = maybeStart.success.message.usage.input_tokens
        continue
      }
      if (currentEvent === "content_block_delta") {
        const maybeDelta = decodeDeltaJson(payload)
        if (maybeDelta._tag === "Failure") {
          return yield* Effect.fail(
            new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
          )
        }
        const text = maybeDelta.success.delta.text
        if (typeof text === "string" && text.length > 0) {
          events.push({ _tag: "text-delta", delta: text })
        }
        continue
      }
      if (currentEvent === "message_delta") {
        const maybeDelta = decodeMessageDeltaJson(payload)
        if (maybeDelta._tag === "Failure") {
          return yield* Effect.fail(
            new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
          )
        }
        const outputTokens = maybeDelta.success.usage?.output_tokens
        if (inputTokens !== undefined && outputTokens !== undefined) {
          events.push({
            _tag: "usage",
            usage: {
              completionTokens: outputTokens,
              promptTokens: inputTokens,
              totalTokens: inputTokens + outputTokens
            }
          })
        }
        const stopReason = maybeDelta.success.delta.stop_reason
        events.push({ _tag: "done", finishReason: typeof stopReason === "string" ? stopReason : "stop" })
      }
    }
    return events
  })
}

export interface AnthropicTransport {
  readonly getJsonText: (path: string) => Effect.Effect<string, ProviderError>
  readonly postSseText: (path: string, body: string) => Effect.Effect<string, ProviderError>
}

export interface AnthropicOptions {
  readonly baseUrl: string
  readonly curatedModels: ReadonlyArray<string>
  readonly displayName: string
  readonly providerId: ProviderId
  readonly transport: AnthropicTransport
  readonly visionModels: ReadonlyArray<string>
}

function unknownMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown failure"
}

export function liveTransport(
  providerId: ProviderId,
  baseUrl: string,
  apiKey: Redacted.Redacted<string>
): AnthropicTransport {
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
          headers: {
            "anthropic-version": anthropicVersionHeader,
            "Content-Type": "application/json",
            "x-api-key": Redacted.value(apiKey)
          },
          method
        })
    }).pipe(
      Effect.flatMap((response) => {
        if (response.status === 401 || response.status === 403) {
          return Effect.fail(
            new ProviderError({
              kind: "auth",
              message: `request rejected with status ${response.status}`,
              providerId
            })
          )
        }
        if (response.status === 429) {
          return Effect.fail(
            new ProviderError({ kind: "rate-limit", message: "request rejected with status 429", providerId })
          )
        }
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
    postSseText: (path, body) => requestText(path, "POST", body)
  }
}

export function fixtureTransport(sseText: string, modelsJson: string): AnthropicTransport {
  return {
    getJsonText: () => Effect.succeed(modelsJson),
    postSseText: () => Effect.succeed(sseText)
  }
}

export function failingTransport(error: ProviderError): AnthropicTransport {
  return {
    getJsonText: () => Effect.fail(error),
    postSseText: () => Effect.fail(error)
  }
}

export function makeAnthropicProvider(options: AnthropicOptions): Provider {
  const completeChat = (request: ChatRequest): Stream.Stream<ChatEvent, ProviderError> =>
    Stream.fromIterableEffect(
      Effect.gen(function* () {
        const body = buildAnthropicRequestBody(request)
        const sseText = yield* options.transport.postSseText("/messages", JSON.stringify(body))
        return yield* chatEventsFromAnthropicSseText(options.providerId, sseText)
      })
    )
  const listModels = (): Effect.Effect<ReadonlyArray<string>, ProviderError> =>
    Effect.catch(
      Effect.gen(function* () {
        const modelsJson = yield* options.transport.getJsonText("/models")
        const parsed = yield* Effect.fromResult(decodeModelListJson(modelsJson)).pipe(
          Effect.mapError(
            () =>
              new ProviderError({
                kind: "parse",
                message: "unparseable model list payload",
                providerId: options.providerId
              })
          )
        )
        const ids = parsed.data.map((entry) => entry.id)
        return ids.length > 0 ? ids : options.curatedModels
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
