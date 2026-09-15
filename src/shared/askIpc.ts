import { Schema } from "effect"
import { ScreenshotImageSchema } from "./screenshot"
import { ProviderIdSchema, type ProviderId } from "./settingsIpc"

export const askRequestChannel = "yleulc:ask-request"

export const askEventChannel = "yleulc:ask-event"

export const askCancelChannel = "yleulc:ask-cancel"

export const defaultAskProviderId = "openai"

export const defaultAskModel = "gpt-4o"

export const emptyAskFallback = "No answer returned for this question."

export const AskProviderIdSchema = ProviderIdSchema

export type AskProviderId = ProviderId

export const AskTokenUsageSchema = Schema.Struct({
  completionTokens: Schema.Number,
  promptTokens: Schema.Number,
  totalTokens: Schema.Number
})

export type AskTokenUsage = typeof AskTokenUsageSchema.Type

export const AskRequestSchema = Schema.Struct({
  images: Schema.optional(Schema.Array(ScreenshotImageSchema)),
  model: Schema.optional(Schema.String),
  providerId: Schema.optional(AskProviderIdSchema),
  question: Schema.String,
  requestId: Schema.String,
  systemPrompt: Schema.optional(Schema.String)
})

export type AskRequest = typeof AskRequestSchema.Type

export const AskTextDeltaSchema = Schema.TaggedStruct("text-delta", {
  delta: Schema.String,
  requestId: Schema.String
})

export const AskUsageSchema = Schema.TaggedStruct("usage", {
  requestId: Schema.String,
  usage: AskTokenUsageSchema
})

export const AskDoneSchema = Schema.TaggedStruct("done", {
  finishReason: Schema.String,
  requestId: Schema.String
})

export const AskErrorSchema = Schema.TaggedStruct("error", {
  message: Schema.String,
  requestId: Schema.String
})

export const AskEventSchema = Schema.Union([
  AskTextDeltaSchema,
  AskUsageSchema,
  AskDoneSchema,
  AskErrorSchema
])

export type AskEvent = typeof AskEventSchema.Type

export const decodeAskRequest = Schema.decodeUnknownSync(AskRequestSchema)

export const decodeAskEvent = Schema.decodeUnknownSync(AskEventSchema)

export const encodeAskRequest = Schema.encodeSync(AskRequestSchema)

export const encodeAskEvent = Schema.encodeSync(AskEventSchema)

export function collectAskText(events: ReadonlyArray<AskEvent>): string {
  let text = ""
  for (const event of events) {
    if (event._tag === "text-delta") {
      text = `${text}${event.delta}`
    }
  }
  return text
}

export function hasAskText(events: ReadonlyArray<AskEvent>): boolean {
  for (const event of events) {
    if (event._tag === "text-delta" && event.delta.length > 0) {
      return true
    }
  }
  return false
}

export function toAskBullets(text: string): ReadonlyArray<string> {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  if (lines.length > 0) {
    return lines
  }
  const trimmed = text.trim()
  return trimmed.length > 0 ? [trimmed] : []
}
