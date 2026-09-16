import { Schema } from "effect"
import type { ListenTranscriptEntry } from "./listenIpc"

export const MeetingIdSchema = Schema.String.pipe(Schema.brand("MeetingId"))

export type MeetingId = typeof MeetingIdSchema.Type

export const MeetingTranscriptSegmentSchema = Schema.Struct({
  endMs: Schema.Number,
  id: Schema.String,
  interim: Schema.Boolean,
  language: Schema.String,
  startMs: Schema.Number,
  text: Schema.String
})

export type MeetingTranscriptSegment = typeof MeetingTranscriptSegmentSchema.Type

export const MeetingTranscriptSchema = Schema.Array(MeetingTranscriptSegmentSchema)

export type MeetingTranscript = typeof MeetingTranscriptSchema.Type

export const MeetingNoteSchema = Schema.Struct({
  actionItems: Schema.Array(Schema.String),
  followUpDraft: Schema.String,
  keyQuestions: Schema.Array(Schema.String)
})

export type MeetingNote = typeof MeetingNoteSchema.Type

export const MeetingSchema = Schema.Struct({
  askCount: Schema.Number,
  assistCount: Schema.Number,
  endedAtMs: Schema.Number,
  id: MeetingIdSchema,
  note: MeetingNoteSchema,
  startedAtMs: Schema.Number,
  title: Schema.String,
  transcript: MeetingTranscriptSchema
})

export type Meeting = typeof MeetingSchema.Type

export const MeetingSummarySchema = Schema.Struct({
  askCount: Schema.Number,
  assistCount: Schema.Number,
  endedAtMs: Schema.Number,
  id: MeetingIdSchema,
  startedAtMs: Schema.Number,
  title: Schema.String
})

export type MeetingSummary = typeof MeetingSummarySchema.Type

export const SaveMeetingInputSchema = Schema.Struct({
  askCount: Schema.optional(Schema.Number),
  assistCount: Schema.optional(Schema.Number),
  endedAtMs: Schema.Number,
  note: MeetingNoteSchema,
  startedAtMs: Schema.Number,
  title: Schema.String,
  transcript: MeetingTranscriptSchema
})

export type SaveMeetingInput = typeof SaveMeetingInputSchema.Type

export const MeetingDayLabelSchema = Schema.Union([
  Schema.Literal("Today"),
  Schema.Literal("Yesterday"),
  Schema.Literal("Earlier")
])

export type MeetingDayLabel = typeof MeetingDayLabelSchema.Type

export interface MeetingDayGroup {
  readonly label: MeetingDayLabel
  readonly meetings: ReadonlyArray<MeetingSummary>
}

export interface MeetingSpan {
  readonly endedAtMs: number
  readonly startedAtMs: number
}

export const decodeMeeting = Schema.decodeUnknownSync(MeetingSchema)

export const decodeMeetingSummary = Schema.decodeUnknownSync(MeetingSummarySchema)

export const decodeMeetingNote = Schema.decodeUnknownSync(MeetingNoteSchema)

export const decodeMeetingTranscript = Schema.decodeUnknownSync(MeetingTranscriptSchema)

export const decodeSaveMeetingInput = Schema.decodeUnknownSync(SaveMeetingInputSchema)

export const encodeMeeting = Schema.encodeSync(MeetingSchema)

export const encodeMeetingNote = Schema.encodeSync(MeetingNoteSchema)

export function toMeetingSummary(meeting: Meeting): MeetingSummary {
  return {
    askCount: meeting.askCount,
    assistCount: meeting.assistCount,
    endedAtMs: meeting.endedAtMs,
    id: meeting.id,
    startedAtMs: meeting.startedAtMs,
    title: meeting.title
  }
}

export function toMeetingTranscript(entries: ReadonlyArray<ListenTranscriptEntry>): MeetingTranscript {
  return entries.map((entry) => ({
    endMs: entry.endMs,
    id: entry.id,
    interim: entry.interim,
    language: entry.language,
    startMs: entry.startMs,
    text: entry.text
  }))
}

export function meetingDurationMs(span: MeetingSpan): number {
  const duration = span.endedAtMs - span.startedAtMs
  return duration < 0 ? 0 : duration
}

export function formatMeetingDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000)
  const clamped = totalSeconds < 0 ? 0 : totalSeconds
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped - hours * 3600) / 60)
  if (hours > 0) {
    return `${String(hours)}h ${String(minutes).padStart(2, "0")}m`
  }
  if (minutes > 0) {
    return `${String(minutes)}m`
  }
  const seconds = clamped - hours * 3600 - minutes * 60
  return `${String(seconds)}s`
}

export function formatMeetingUseCounts(askCount: number, assistCount: number): string {
  return `${String(askCount)} asks · ${String(assistCount)} assists`
}

export function formatSegmentTimestamp(valueMs: number): string {
  const totalSeconds = Math.floor(valueMs / 1000)
  const clamped = totalSeconds < 0 ? 0 : totalSeconds
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function appendBullets(lines: Array<string>, items: ReadonlyArray<string>): void {
  if (items.length === 0) {
    lines.push("- None")
    return
  }
  for (const item of items) {
    lines.push(`- ${item}`)
  }
}

function startOfDayMs(valueMs: number): number {
  const date = new Date(valueMs)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayLabelFor(meetingStartMs: number, nowStartMs: number): MeetingDayLabel {
  const diffDays = Math.round((nowStartMs - meetingStartMs) / 86400000)
  if (diffDays <= 0) {
    return "Today"
  }
  if (diffDays === 1) {
    return "Yesterday"
  }
  return "Earlier"
}

export function groupMeetingsByDay(
  meetings: ReadonlyArray<MeetingSummary>,
  nowMs: number
): ReadonlyArray<MeetingDayGroup> {
  const nowStart = startOfDayMs(nowMs)
  const today: Array<MeetingSummary> = []
  const yesterday: Array<MeetingSummary> = []
  const earlier: Array<MeetingSummary> = []
  const sorted = [...meetings].sort((left, right) => right.startedAtMs - left.startedAtMs)
  for (const meeting of sorted) {
    const label = dayLabelFor(startOfDayMs(meeting.startedAtMs), nowStart)
    if (label === "Today") {
      today.push(meeting)
    } else if (label === "Yesterday") {
      yesterday.push(meeting)
    } else {
      earlier.push(meeting)
    }
  }
  const groups: Array<MeetingDayGroup> = []
  if (today.length > 0) {
    groups.push({ label: "Today", meetings: today })
  }
  if (yesterday.length > 0) {
    groups.push({ label: "Yesterday", meetings: yesterday })
  }
  if (earlier.length > 0) {
    groups.push({ label: "Earlier", meetings: earlier })
  }
  return groups
}

export function exportMeetingMarkdown(meeting: Meeting): string {
  const lines: Array<string> = []
  lines.push(`# ${meeting.title}`)
  lines.push("")
  lines.push(`- Date: ${new Date(meeting.startedAtMs).toISOString()}`)
  lines.push(`- Duration: ${formatMeetingDuration(meetingDurationMs(meeting))}`)
  lines.push(`- Uses: ${formatMeetingUseCounts(meeting.askCount, meeting.assistCount)}`)
  lines.push("")
  lines.push("## Transcript")
  if (meeting.transcript.length === 0) {
    lines.push("- None")
  }
  for (const segment of meeting.transcript) {
    lines.push(`- [${formatSegmentTimestamp(segment.startMs)}] ${segment.text}`)
  }
  lines.push("")
  lines.push("## Key questions")
  appendBullets(lines, meeting.note.keyQuestions)
  lines.push("")
  lines.push("## Action items")
  if (meeting.note.actionItems.length === 0) {
    lines.push("- None")
  }
  for (const item of meeting.note.actionItems) {
    lines.push(`- [ ] ${item}`)
  }
  lines.push("")
  lines.push("## Follow-up draft")
  lines.push(meeting.note.followUpDraft)
  return lines.join("\n")
}
