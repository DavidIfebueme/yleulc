import { Effect, Schema } from "effect"
import {
  SaveMeetingInputSchema,
  type Meeting,
  type MeetingSummary
} from "../shared/meeting"
import { MeetingIdRequestSchema } from "../shared/meetingIpc"
import { MeetingStoreError, type MeetingStoreShape } from "./MeetingStore"

const decodeSaveMeetingInputEffect = Schema.decodeUnknownEffect(SaveMeetingInputSchema)

const decodeMeetingIdRequestEffect = Schema.decodeUnknownEffect(MeetingIdRequestSchema)

export function listMeetings(
  store: MeetingStoreShape
): Effect.Effect<ReadonlyArray<MeetingSummary>, MeetingStoreError> {
  return store.listMeetings
}

export function saveMeeting(
  raw: unknown,
  store: MeetingStoreShape
): Effect.Effect<Meeting, Error | MeetingStoreError> {
  return Effect.gen(function* () {
    const input = yield* decodeSaveMeetingInputEffect(raw).pipe(
      Effect.mapError(() => new Error("invalid save meeting input"))
    )
    return yield* store.saveMeeting(input)
  })
}

export function getMeeting(
  raw: unknown,
  store: MeetingStoreShape
): Effect.Effect<Meeting, Error | MeetingStoreError> {
  return Effect.gen(function* () {
    const request = yield* decodeMeetingIdRequestEffect(raw).pipe(
      Effect.mapError(() => new Error("invalid meeting id request"))
    )
    return yield* store.reopenMeeting(request.id).pipe(
      Effect.mapError((cause) =>
        cause._tag === "MeetingNotFound" ? new Error(`meeting not found: ${cause.id}`) : cause
      )
    )
  })
}

export function exportMeetingMarkdown(
  raw: unknown,
  store: MeetingStoreShape
): Effect.Effect<string, Error | MeetingStoreError> {
  return Effect.gen(function* () {
    const request = yield* decodeMeetingIdRequestEffect(raw).pipe(
      Effect.mapError(() => new Error("invalid meeting id request"))
    )
    return yield* store.exportMeetingMarkdown(request.id).pipe(
      Effect.mapError((cause) =>
        cause._tag === "MeetingNotFound" ? new Error(`meeting not found: ${cause.id}`) : cause
      )
    )
  })
}

export function deleteMeeting(
  raw: unknown,
  store: MeetingStoreShape
): Effect.Effect<void, Error | MeetingStoreError> {
  return Effect.gen(function* () {
    const request = yield* decodeMeetingIdRequestEffect(raw).pipe(
      Effect.mapError(() => new Error("invalid meeting id request"))
    )
    return yield* store.deleteMeeting(request.id)
  })
}
