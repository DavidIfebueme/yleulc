import { Schema } from "effect"

export const maxListenEntries = 50

export const ListenChannelSchema = Schema.Union([Schema.Literal("mic"), Schema.Literal("system")])

export type ListenChannel = typeof ListenChannelSchema.Type

export const ListenTranscriptEntrySchema = Schema.Struct({
  channel: ListenChannelSchema,
  endMs: Schema.Number,
  id: Schema.String,
  interim: Schema.Boolean,
  language: Schema.String,
  startMs: Schema.Number,
  text: Schema.String
})

export type ListenTranscriptEntry = typeof ListenTranscriptEntrySchema.Type

export const decodeListenTranscriptEntry = Schema.decodeUnknownSync(ListenTranscriptEntrySchema)

export const encodeListenTranscriptEntry = Schema.encodeSync(ListenTranscriptEntrySchema)

const questionLeadPattern = /^(are|can|could|did|do|does|has|have|how|is|may|should|was|were|what|when|where|which|who|whom|whose|why|will|would)\b/i

export function listenChannelLabel(channel: ListenChannel): string {
  return channel === "mic" ? "Mic" : "System"
}

export function isAutoAnswerIntent(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return false
  }
  if (trimmed.endsWith("?")) {
    return true
  }
  return questionLeadPattern.test(trimmed)
}

export function shouldAutoAnswer(entry: ListenTranscriptEntry): boolean {
  if (entry.interim) {
    return false
  }
  if (entry.text.trim().length === 0) {
    return false
  }
  return isAutoAnswerIntent(entry.text)
}

export function appendListenEntry(
  entries: ReadonlyArray<ListenTranscriptEntry>,
  entry: ListenTranscriptEntry,
  cap: number = maxListenEntries
): ReadonlyArray<ListenTranscriptEntry> {
  const next = [...entries, entry]
  if (next.length <= cap) {
    return next
  }
  return next.slice(next.length - cap)
}

export function toAutoAnswerQuestion(entry: ListenTranscriptEntry): string {
  return entry.text.trim()
}
