import { Data, Schema } from "effect"

export const TranscriptSegmentSchema = Schema.Struct({
  endMs: Schema.Number,
  id: Schema.String,
  interim: Schema.Boolean,
  language: Schema.String,
  startMs: Schema.Number,
  text: Schema.String
})

export type TranscriptSegment = typeof TranscriptSegmentSchema.Type

export const UtteranceSchema = Schema.Struct({
  endMs: Schema.Number,
  id: Schema.String,
  interim: Schema.Literal(false),
  language: Schema.String,
  startMs: Schema.Number,
  text: Schema.String
})

export type Utterance = typeof UtteranceSchema.Type

export const decodeTranscriptSegment = Schema.decodeUnknownSync(TranscriptSegmentSchema)

export const decodeUtterance = Schema.decodeUnknownSync(UtteranceSchema)

export const encodeTranscriptSegment = Schema.encodeSync(TranscriptSegmentSchema)

export function finalizeSegment(segment: TranscriptSegment): Utterance | undefined {
  if (segment.interim || segment.text.length === 0) {
    return undefined
  }
  return { ...segment, interim: false as const }
}

export class TranscriptionError extends Data.TaggedError("TranscriptionError")<{
  readonly operation: string
  readonly reason: string
}> {}
