import { Effect, Redacted, Schema, Stream } from "effect"
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

export const OpenAITextPartSchema = Schema.Struct({
  text: Schema.String,
  type: Schema.Literal("text")
})

export const OpenAIImageUrlSchema = Schema.Struct({
  url: Schema.String
})

export const OpenAIImagePartSchema = Schema.Struct({
  image_url: OpenAIImageUrlSchema,
  type: Schema.Literal("image_url")
})

export type OpenAIImagePart = typeof OpenAIImagePartSchema.Type

export const OpenAIContentPartSchema = Schema.Union([OpenAIImagePartSchema, OpenAITextPartSchema])

export const OpenAIMessageSchema = Schema.Struct({
  content: Schema.Union([Schema.String, Schema.Array(OpenAIContentPartSchema)]),
  role: ChatRoleSchema
})

export type OpenAIMessage = typeof OpenAIMessageSchema.Type

export const OpenAIStreamOptionsSchema = Schema.Struct({
  include_usage: Schema.Literal(true)
})

export const OpenAIChatCompletionRequestSchema = Schema.Struct({
  max_tokens: Schema.optional(Schema.Number),
  messages: Schema.Array(OpenAIMessageSchema),
  model: Schema.String,
  stream: Schema.Literal(true),
  stream_options: Schema.optional(OpenAIStreamOptionsSchema),
  temperature: Schema.optional(Schema.Number)
})

export type OpenAIChatCompletionRequest = typeof OpenAIChatCompletionRequestSchema.Type

export const MistralImagePartSchema = Schema.Struct({
  image_url: Schema.String,
  type: Schema.Literal("image_url")
})

export type MistralImagePart = typeof MistralImagePartSchema.Type

export const MistralContentPartSchema = Schema.Union([MistralImagePartSchema, OpenAITextPartSchema])

export const MistralMessageSchema = Schema.Struct({
  content: Schema.Union([Schema.String, Schema.Array(MistralContentPartSchema)]),
  role: ChatRoleSchema
})

export type MistralMessage = typeof MistralMessageSchema.Type

export const MistralChatCompletionRequestSchema = Schema.Struct({
  max_tokens: Schema.optional(Schema.Number),
  messages: Schema.Array(MistralMessageSchema),
  model: Schema.String,
  stream: Schema.Literal(true),
  stream_options: Schema.optional(OpenAIStreamOptionsSchema),
  temperature: Schema.optional(Schema.Number)
})

export type MistralChatCompletionRequest = typeof MistralChatCompletionRequestSchema.Type

export const OpenAIStreamDeltaSchema = Schema.Struct({
  content: Schema.optional(Schema.Union([Schema.Null, Schema.String]))
})

export const OpenAIStreamChoiceSchema = Schema.Struct({
  delta: Schema.optional(OpenAIStreamDeltaSchema),
  finish_reason: Schema.optional(Schema.Union([Schema.Null, Schema.String]))
})

export const OpenAIStreamUsageSchema = Schema.Struct({
  completion_tokens: Schema.Number,
  prompt_tokens: Schema.Number,
  total_tokens: Schema.Number
})

export const OpenAIStreamChunkSchema = Schema.Struct({
  choices: Schema.optional(Schema.Array(OpenAIStreamChoiceSchema)),
  usage: Schema.optional(OpenAIStreamUsageSchema)
})

export type OpenAIStreamChunk = typeof OpenAIStreamChunkSchema.Type

export const OpenAIStreamErrorDetailSchema = Schema.Struct({
  code: Schema.optional(Schema.Union([Schema.Null, Schema.String])),
  message: Schema.String,
  type: Schema.optional(Schema.String)
})

export const OpenAIStreamErrorSchema = Schema.Struct({
  error: OpenAIStreamErrorDetailSchema
})

export const OpenAIModelEntrySchema = Schema.Struct({
  id: Schema.String
})

export const OpenAIModelListSchema = Schema.Struct({
  data: Schema.Array(OpenAIModelEntrySchema)
})

export type OpenAIModelList = typeof OpenAIModelListSchema.Type

export const sseDataPrefix = "data:"

export const sseDoneTerminator = "[DONE]"

const decodeChunkJson = Schema.decodeUnknownResult(Schema.fromJsonString(OpenAIStreamChunkSchema))

const decodeErrorJson = Schema.decodeUnknownResult(Schema.fromJsonString(OpenAIStreamErrorSchema))

const decodeModelListJson = Schema.decodeUnknownResult(Schema.fromJsonString(OpenAIModelListSchema))

export function toOpenAIImagePart(image: ChatImage): OpenAIImagePart {
  return {
    image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
    type: "image_url"
  }
}

export function toOpenAIMessage(message: ChatMessage): OpenAIMessage {
  if (message.images.length === 0) {
    return { content: message.text, role: message.role }
  }
  return {
    content: [{ text: message.text, type: "text" }, ...message.images.map(toOpenAIImagePart)],
    role: message.role
  }
}

export function buildOpenAIRequestBody(request: ChatRequest): OpenAIChatCompletionRequest {
  return {
    max_tokens: request.maxTokens,
    messages: request.messages.map(toOpenAIMessage),
    model: request.model,
    stream: true,
    stream_options: { include_usage: true },
    temperature: request.temperature
  }
}

export function toMistralImagePart(image: ChatImage): MistralImagePart {
  return {
    image_url: `data:${image.mimeType};base64,${image.base64}`,
    type: "image_url"
  }
}

export function toMistralMessage(message: ChatMessage): MistralMessage {
  if (message.images.length === 0) {
    return { content: message.text, role: message.role }
  }
  return {
    content: [{ text: message.text, type: "text" }, ...message.images.map(toMistralImagePart)],
    role: message.role
  }
}

export function buildMistralRequestBody(request: ChatRequest): MistralChatCompletionRequest {
  return {
    max_tokens: request.maxTokens,
    messages: request.messages.map(toMistralMessage),
    model: request.model,
    stream: true,
    stream_options: { include_usage: true },
    temperature: request.temperature
  }
}

export function chatEventsFromSseText(
  providerId: ProviderId,
  sseText: string
): Effect.Effect<ReadonlyArray<ChatEvent>, ProviderError> {
  return Effect.gen(function* () {
    const events: Array<ChatEvent> = []
    const lines = sseText.split("\n")
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith(":") || !line.startsWith(sseDataPrefix)) {
        continue
      }
      const payload = line.slice(sseDataPrefix.length).trim()
      if (payload === sseDoneTerminator) {
        return events
      }
      const maybeError = decodeErrorJson(payload)
      if (maybeError._tag === "Success") {
        events.push({ _tag: "error", message: maybeError.success.error.message })
        return events
      }
      const maybeChunk = decodeChunkJson(payload)
      if (maybeChunk._tag === "Failure") {
        return yield* Effect.fail(
          new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
        )
      }
      for (const choice of maybeChunk.success.choices ?? []) {
        const content = choice.delta?.content
        if (typeof content === "string" && content.length > 0) {
          events.push({ _tag: "text-delta", delta: content })
        }
        const finishReason = choice.finish_reason
        if (typeof finishReason === "string" && finishReason.length > 0) {
          events.push({ _tag: "done", finishReason })
        }
      }
      const usage = maybeChunk.success.usage
      if (usage !== undefined) {
        events.push({
          _tag: "usage",
          usage: {
            completionTokens: usage.completion_tokens,
            promptTokens: usage.prompt_tokens,
            totalTokens: usage.total_tokens
          }
        })
      }
    }
    return events
  })
}

export function chatEventsFromOpenRouterSseText(
  providerId: ProviderId,
  sseText: string
): Effect.Effect<ReadonlyArray<ChatEvent>, ProviderError> {
  return Effect.gen(function* () {
    const events: Array<ChatEvent> = []
    const lines = sseText.split("\n")
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith(":") || !line.startsWith(sseDataPrefix)) {
        continue
      }
      const payload = line.slice(sseDataPrefix.length).trim()
      if (payload === sseDoneTerminator) {
        return events
      }
      const maybeError = decodeErrorJson(payload)
      if (maybeError._tag === "Success") {
        events.push({ _tag: "error", message: maybeError.success.error.message })
        return events
      }
      const maybeChunk = decodeChunkJson(payload)
      if (maybeChunk._tag === "Failure") {
        return yield* Effect.fail(
          new ProviderError({ kind: "parse", message: `unparseable stream payload: ${payload}`, providerId })
        )
      }
      const usage = maybeChunk.success.usage
      if (usage !== undefined) {
        events.push({
          _tag: "usage",
          usage: {
            completionTokens: usage.completion_tokens,
            promptTokens: usage.prompt_tokens,
            totalTokens: usage.total_tokens
          }
        })
        continue
      }
      for (const choice of maybeChunk.success.choices ?? []) {
        const content = choice.delta?.content
        if (typeof content === "string" && content.length > 0) {
          events.push({ _tag: "text-delta", delta: content })
        }
        const finishReason = choice.finish_reason
        if (typeof finishReason === "string" && finishReason.length > 0) {
          events.push({ _tag: "done", finishReason })
        }
      }
    }
    return events
  })
}

export interface OpenAICompatibleTransport {
  readonly getJsonText: (path: string) => Effect.Effect<string, ProviderError>
  readonly postSseText: (path: string, body: string) => Effect.Effect<string, ProviderError>
}

export interface OpenAICompatibleOptions {
  readonly baseUrl: string
  readonly buildRequestBody?: (request: ChatRequest) => MistralChatCompletionRequest | OpenAIChatCompletionRequest
  readonly curatedModels: ReadonlyArray<string>
  readonly displayName: string
  readonly parseSseText?: (
    providerId: ProviderId,
    sseText: string
  ) => Effect.Effect<ReadonlyArray<ChatEvent>, ProviderError>
  readonly providerId: ProviderId
  readonly transport: OpenAICompatibleTransport
  readonly visionModels: ReadonlyArray<string>
}

function unknownMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "unknown failure"
}

export function liveTransport(
  providerId: ProviderId,
  baseUrl: string,
  apiKey: Redacted.Redacted<string>
): OpenAICompatibleTransport {
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
            Authorization: `Bearer ${Redacted.value(apiKey)}`,
            "Content-Type": "application/json"
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

export function fixtureTransport(sseText: string, modelsJson: string): OpenAICompatibleTransport {
  return {
    getJsonText: () => Effect.succeed(modelsJson),
    postSseText: () => Effect.succeed(sseText)
  }
}

export function failingTransport(error: ProviderError): OpenAICompatibleTransport {
  return {
    getJsonText: () => Effect.fail(error),
    postSseText: () => Effect.fail(error)
  }
}

export function makeOpenAICompatibleProvider(options: OpenAICompatibleOptions): Provider {
  const buildBody = options.buildRequestBody ?? buildOpenAIRequestBody
  const parseText = options.parseSseText ?? chatEventsFromSseText
  const completeChat = (request: ChatRequest): Stream.Stream<ChatEvent, ProviderError> =>
    Stream.fromIterableEffect(
      Effect.gen(function* () {
        const body = buildBody(request)
        const sseText = yield* options.transport.postSseText("/chat/completions", JSON.stringify(body))
        return yield* parseText(options.providerId, sseText)
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
