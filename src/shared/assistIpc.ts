import { Schema } from "effect"
import { ListenTranscriptEntrySchema } from "./listenIpc"

export const assistRequestChannel = "yleulc:assist-request"

export const assistHotkeyChannel = "yleulc:assist-hotkey"

export const assistQuestion = "Analyze the current screen and give the user the answer they need."

export const AssistRequestSchema = Schema.Struct({
  activePromptModeId: Schema.optional(Schema.String),
  requestId: Schema.String,
  systemPrompt: Schema.optional(Schema.String),
  transcript: Schema.Array(ListenTranscriptEntrySchema)
})

export type AssistRequest = typeof AssistRequestSchema.Type
