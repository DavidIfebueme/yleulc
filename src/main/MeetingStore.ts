import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { app } from "electron"
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-node"
import { Config, Context, Data, Effect, Layer, Option, Schema } from "effect"
import type { ConfigError } from "effect/Config"
import { SqlClient } from "effect/unstable/sql"
import type { MigrationError } from "effect/unstable/sql/Migrator"
import type { SqlError } from "effect/unstable/sql/SqlError"
import {
  exportMeetingMarkdown as renderMeetingMarkdown,
  MeetingIdSchema,
  MeetingNoteSchema,
  MeetingSummarySchema,
  MeetingTranscriptSchema,
  type Meeting,
  type MeetingId,
  type MeetingNote,
  type MeetingSummary,
  type SaveMeetingInput
} from "../shared/meeting"

export class MeetingStoreError extends Data.TaggedError("MeetingStoreError")<{
  readonly operation: string
  readonly reason: string
}> {}

export class MeetingNotFound extends Data.TaggedError("MeetingNotFound")<{
  readonly id: string
}> {}

export interface MeetingStoreShape {
  readonly deleteMeeting: (id: MeetingId) => Effect.Effect<void, MeetingStoreError>
  readonly exportMeetingMarkdown: (
    id: MeetingId
  ) => Effect.Effect<string, MeetingStoreError | MeetingNotFound>
  readonly getMeeting: (id: MeetingId) => Effect.Effect<Option.Option<Meeting>, MeetingStoreError>
  readonly listMeetings: Effect.Effect<ReadonlyArray<MeetingSummary>, MeetingStoreError>
  readonly reopenMeeting: (id: MeetingId) => Effect.Effect<Meeting, MeetingStoreError | MeetingNotFound>
  readonly saveMeeting: (input: SaveMeetingInput) => Effect.Effect<Meeting, MeetingStoreError>
  readonly updateMeetingNote: (
    id: MeetingId,
    note: MeetingNote
  ) => Effect.Effect<Meeting, MeetingStoreError | MeetingNotFound>
}

const defaultMeetingsDbFilename = "yleulc-meetings.db"

const MeetingRowSchema = Schema.Struct({
  askCount: Schema.Number,
  assistCount: Schema.Number,
  endedAtMs: Schema.Number,
  id: MeetingIdSchema,
  noteJson: Schema.fromJsonString(MeetingNoteSchema),
  startedAtMs: Schema.Number,
  title: Schema.String,
  transcriptJson: Schema.fromJsonString(MeetingTranscriptSchema)
})

type MeetingRow = typeof MeetingRowSchema.Type

const decodeMeetingIdEffect = Schema.decodeUnknownEffect(MeetingIdSchema)

const decodeMeetingRowEffect = Schema.decodeUnknownEffect(MeetingRowSchema)

const decodeMeetingSummaryEffect = Schema.decodeUnknownEffect(MeetingSummarySchema)

const encodeTranscriptJson = Schema.encodeSync(Schema.fromJsonString(MeetingTranscriptSchema))

const encodeNoteJson = Schema.encodeSync(Schema.fromJsonString(MeetingNoteSchema))

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

function withStoreError<A, E>(operation: string) {
  return (effect: Effect.Effect<A, E>): Effect.Effect<A, MeetingStoreError> =>
    effect.pipe(
      Effect.mapError(
        (cause) => new MeetingStoreError({ operation, reason: describeCause(cause) })
      )
    )
}

function rowToMeeting(row: MeetingRow): Meeting {
  return {
    askCount: row.askCount,
    assistCount: row.assistCount,
    endedAtMs: row.endedAtMs,
    id: row.id,
    note: row.noteJson,
    startedAtMs: row.startedAtMs,
    title: row.title,
    transcript: row.transcriptJson
  }
}

const meetingMigrations = {
  "0001_create_meetings": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        startedAtMs INTEGER NOT NULL,
        endedAtMs INTEGER NOT NULL,
        transcriptJson TEXT NOT NULL,
        noteJson TEXT NOT NULL,
        askCount INTEGER NOT NULL DEFAULT 0,
        assistCount INTEGER NOT NULL DEFAULT 0
      )
    `
  }),
  "0002_create_meetings_started_index": Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    yield* sql`
      CREATE INDEX IF NOT EXISTS idx_meetings_started_at ON meetings (startedAtMs DESC)
    `
  })
}

const MeetingMigratorLive = SqliteMigrator.layer({
  loader: SqliteMigrator.fromRecord(meetingMigrations)
})

const makeMeetingStore: Effect.Effect<MeetingStoreShape, never, SqlClient.SqlClient> = Effect.gen(
  function* () {
    const sql = yield* SqlClient.SqlClient

    const saveMeeting = (input: SaveMeetingInput): Effect.Effect<Meeting, MeetingStoreError> =>
      Effect.gen(function* () {
        const rawId = yield* Effect.sync(() => randomUUID())
        const id = yield* decodeMeetingIdEffect(rawId).pipe(withStoreError("saveMeeting"))
        const askCount = input.askCount ?? 0
        const assistCount = input.assistCount ?? 0
        const transcriptJson = yield* Effect.try({
          catch: (cause) => new MeetingStoreError({ operation: "saveMeeting", reason: describeCause(cause) }),
          try: () => encodeTranscriptJson(input.transcript)
        })
        const noteJson = yield* Effect.try({
          catch: (cause) => new MeetingStoreError({ operation: "saveMeeting", reason: describeCause(cause) }),
          try: () => encodeNoteJson(input.note)
        })
        yield* sql`
          INSERT INTO meetings (id, title, startedAtMs, endedAtMs, transcriptJson, noteJson, askCount, assistCount)
          VALUES (${id}, ${input.title}, ${input.startedAtMs}, ${input.endedAtMs}, ${transcriptJson}, ${noteJson}, ${askCount}, ${assistCount})
        `.pipe(withStoreError("saveMeeting"))
        return {
          askCount,
          assistCount,
          endedAtMs: input.endedAtMs,
          id,
          note: input.note,
          startedAtMs: input.startedAtMs,
          title: input.title,
          transcript: input.transcript
        }
      })

    const listMeetings: Effect.Effect<ReadonlyArray<MeetingSummary>, MeetingStoreError> = Effect.gen(
      function* () {
        const rows = yield* sql`
          SELECT id, title, startedAtMs, endedAtMs, askCount, assistCount
          FROM meetings
          ORDER BY startedAtMs DESC
        `.pipe(withStoreError("listMeetings"))
        return yield* Effect.forEach(rows, (row) =>
          decodeMeetingSummaryEffect(row).pipe(withStoreError("listMeetings"))
        )
      }
    )

    const getMeeting = (
      id: MeetingId
    ): Effect.Effect<Option.Option<Meeting>, MeetingStoreError> =>
      Effect.gen(function* () {
        const rows = yield* sql`
          SELECT id, title, startedAtMs, endedAtMs, transcriptJson, noteJson, askCount, assistCount
          FROM meetings
          WHERE id = ${id}
        `.pipe(withStoreError("getMeeting"))
        const first = rows[0]
        if (first === undefined) {
          return Option.none()
        }
        const row = yield* decodeMeetingRowEffect(first).pipe(withStoreError("getMeeting"))
        return Option.some(rowToMeeting(row))
      })

    const reopenMeeting = (
      id: MeetingId
    ): Effect.Effect<Meeting, MeetingStoreError | MeetingNotFound> =>
      Effect.gen(function* () {
        const found = yield* getMeeting(id)
        if (Option.isNone(found)) {
          return yield* Effect.fail(new MeetingNotFound({ id }))
        }
        return found.value
      })

    const updateMeetingNote = (
      id: MeetingId,
      note: MeetingNote
    ): Effect.Effect<Meeting, MeetingStoreError | MeetingNotFound> =>
      Effect.gen(function* () {
        const current = yield* reopenMeeting(id)
        const noteJson = yield* Effect.try({
          catch: (cause) =>
            new MeetingStoreError({ operation: "updateMeetingNote", reason: describeCause(cause) }),
          try: () => encodeNoteJson(note)
        })
        yield* sql`
          UPDATE meetings SET noteJson = ${noteJson} WHERE id = ${id}
        `.pipe(withStoreError("updateMeetingNote"))
        return { ...current, note }
      })

    const deleteMeeting = (id: MeetingId): Effect.Effect<void, MeetingStoreError> =>
      Effect.gen(function* () {
        yield* sql`
          DELETE FROM meetings WHERE id = ${id}
        `.pipe(withStoreError("deleteMeeting"))
      })

    const exportMeetingMarkdown = (
      id: MeetingId
    ): Effect.Effect<string, MeetingStoreError | MeetingNotFound> =>
      Effect.gen(function* () {
        const meeting = yield* reopenMeeting(id)
        return renderMeetingMarkdown(meeting)
      })

    return {
      deleteMeeting,
      exportMeetingMarkdown,
      getMeeting,
      listMeetings,
      reopenMeeting,
      saveMeeting,
      updateMeetingNote
    }
  }
)

export class MeetingStore extends Context.Service<MeetingStore, MeetingStoreShape>()("MeetingStore") {
  static readonly Live: Layer.Layer<MeetingStore, MigrationError | SqlError | ConfigError> = Layer.unwrap(
    Effect.gen(function* () {
      const configured = yield* Config.option(Config.String("YLEULC_MEETINGS_DB"))
      const filename = Option.getOrElse(configured, () => join(app.getPath("userData"), defaultMeetingsDbFilename))
      const sqlLive = MeetingMigratorLive.pipe(Layer.provideMerge(SqliteClient.layer({ filename })))
      return Layer.effect(MeetingStore, makeMeetingStore).pipe(Layer.provide(sqlLive))
    })
  )

  static readonly TestMemory: Layer.Layer<MeetingStore, MigrationError | SqlError> = Layer.effect(
    MeetingStore,
    makeMeetingStore
  ).pipe(
    Layer.provide(
      MeetingMigratorLive.pipe(Layer.provideMerge(SqliteClient.layer({ filename: ":memory:" })))
    )
  )
}

export function makeMeetingStoreFileTestLayer(
  filename: string
): Layer.Layer<MeetingStore, MigrationError | SqlError> {
  return Layer.effect(MeetingStore, makeMeetingStore).pipe(
    Layer.provide(MeetingMigratorLive.pipe(Layer.provideMerge(SqliteClient.layer({ filename }))))
  )
}
