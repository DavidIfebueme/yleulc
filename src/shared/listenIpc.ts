import { Schema } from "effect"

export const listenStartChannel = "yleulc:listen-start"

export const listenStopChannel = "yleulc:listen-stop"

export const listenEventChannel = "yleulc:listen-event"

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

export const ListenStartRequestSchema = Schema.Struct({
  sessionId: Schema.String
})

export type ListenStartRequest = typeof ListenStartRequestSchema.Type

export const decodeListenStartRequest = Schema.decodeUnknownSync(ListenStartRequestSchema)

export const encodeListenStartRequest = Schema.encodeSync(ListenStartRequestSchema)

export const SystemAudioSupportSchema = Schema.Union([
  Schema.Literal("supported"),
  Schema.Literal("unsupported")
])

export type SystemAudioSupport = typeof SystemAudioSupportSchema.Type

export const ListenSegmentEventSchema = Schema.TaggedStruct("segment", {
  entry: ListenTranscriptEntrySchema
})

export const ListenErrorEventSchema = Schema.TaggedStruct("error", {
  message: Schema.String
})

export const ListenStatusEventSchema = Schema.TaggedStruct("status", {
  state: Schema.Union([Schema.Literal("started"), Schema.Literal("stopped")]),
  systemAudio: SystemAudioSupportSchema
})

export const ListenEventSchema = Schema.Union([
  ListenSegmentEventSchema,
  ListenErrorEventSchema,
  ListenStatusEventSchema
])

export type ListenEvent = typeof ListenEventSchema.Type

export const decodeListenEvent = Schema.decodeUnknownSync(ListenEventSchema)

export const encodeListenEvent = Schema.encodeSync(ListenEventSchema)

export interface ListenViewState {
  readonly entries: ReadonlyArray<ListenTranscriptEntry>
  readonly errorMessage: string | undefined
  readonly running: boolean
  readonly systemAudio: SystemAudioSupport
}

export const initialListenViewState: ListenViewState = {
  entries: [],
  errorMessage: undefined,
  running: false,
  systemAudio: "unsupported"
}

export function applyListenEvent(
  state: ListenViewState,
  event: ListenEvent,
  cap: number = maxListenEntries
): ListenViewState {
  switch (event._tag) {
    case "segment":
      return { ...state, entries: appendListenEntry(state.entries, event.entry, cap) }
    case "error":
      return { ...state, errorMessage: event.message }
    case "status":
      return { ...state, running: event.state === "started", systemAudio: event.systemAudio }
  }
}
