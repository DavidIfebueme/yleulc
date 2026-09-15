import { Data, Schema, type Effect, type Stream } from "effect"

export const ProviderIdSchema = Schema.Union([
  Schema.Literal("anthropic"),
  Schema.Literal("custom"),
  Schema.Literal("gemini"),
  Schema.Literal("ollama"),
  Schema.Literal("openai")
])

export type ProviderId = typeof ProviderIdSchema.Type

export const ChatRoleSchema = Schema.Union([
  Schema.Literal("assistant"),
  Schema.Literal("system"),
  Schema.Literal("user")
])

export type ChatRole = typeof ChatRoleSchema.Type

export const ChatImageSchema = Schema.Struct({
  base64: Schema.String,
  mimeType: Schema.String
})

export type ChatImage = typeof ChatImageSchema.Type

export const ChatMessageSchema = Schema.Struct({
  images: Schema.Array(ChatImageSchema),
  role: ChatRoleSchema,
  text: Schema.String
})

export type ChatMessage = typeof ChatMessageSchema.Type

export const ChatRequestSchema = Schema.Struct({
  maxTokens: Schema.optional(Schema.Number),
  messages: Schema.Array(ChatMessageSchema),
  model: Schema.String,
  temperature: Schema.optional(Schema.Number)
})

export type ChatRequest = typeof ChatRequestSchema.Type

export const TokenUsageSchema = Schema.Struct({
  completionTokens: Schema.Number,
  promptTokens: Schema.Number,
  totalTokens: Schema.Number
})

export type TokenUsage = typeof TokenUsageSchema.Type

export const TextDeltaEventSchema = Schema.TaggedStruct("text-delta", {
  delta: Schema.String
})

export const UsageEventSchema = Schema.TaggedStruct("usage", {
  usage: TokenUsageSchema
})

export const DoneEventSchema = Schema.TaggedStruct("done", {
  finishReason: Schema.String
})

export const ErrorEventSchema = Schema.TaggedStruct("error", {
  message: Schema.String
})

export const ChatEventSchema = Schema.Union([
  DoneEventSchema,
  ErrorEventSchema,
  TextDeltaEventSchema,
  UsageEventSchema
])

export type ChatEvent = typeof ChatEventSchema.Type

export const decodeChatRequest = Schema.decodeUnknownSync(ChatRequestSchema)

export const decodeChatEvent = Schema.decodeUnknownSync(ChatEventSchema)

export class ProviderError extends Data.TaggedError("ProviderError")<{
  readonly kind: "auth" | "network" | "parse" | "rate-limit" | "upstream"
  readonly message: string
  readonly providerId: ProviderId
}> {}

export interface Provider {
  readonly completeChat: (request: ChatRequest) => Stream.Stream<ChatEvent, ProviderError>
  readonly defaultBaseUrl: string
  readonly displayName: string
  readonly id: ProviderId
  readonly listModels: () => Effect.Effect<ReadonlyArray<string>, ProviderError>
  readonly visionModels: ReadonlyArray<string>
}
