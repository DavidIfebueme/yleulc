import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigProvider, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import type { ListenTranscriptEntry } from "../shared/listenIpc"
import { toMeetingTranscript, type SaveMeetingInput } from "../shared/meeting"
import {
  deleteMeeting,
  exportMeetingMarkdown,
  getMeeting,
  listMeetings,
  saveMeeting
} from "./MeetingIpc"
import { MeetingStore } from "./MeetingStore"

const noteFixture = {
  actionItems: ["Send the pricing follow-up"],
  followUpDraft: "Thanks for the review, here is the pricing recap.",
  keyQuestions: ["What did we agree on pricing?"]
}

const transcriptFixture = [
  {
    endMs: 42000,
    id: "seg-001",
    interim: false,
    language: "en",
    startMs: 1000,
    text: "Kickoff with scope and timeline review."
  }
]

function saveInputAt(title: string, startedAtMs: number): SaveMeetingInput {
  return {
    askCount: 1,
    assistCount: 0,
    endedAtMs: startedAtMs + 1800000,
    note: noteFixture,
    startedAtMs,
    title,
    transcript: transcriptFixture
  }
}

describe("MeetingIpc", () => {
  it("round-trips save then list then reopen then export then delete", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          const saved = yield* saveMeeting(saveInputAt("Pricing review", 0), store)
          const listed = yield* listMeetings(store)
          const reopened = yield* getMeeting({ id: saved.id }, store)
          const markdown = yield* exportMeetingMarkdown({ id: saved.id }, store)
          yield* deleteMeeting({ id: saved.id }, store)
          const after = yield* listMeetings(store)
          return { after, listed, markdown, reopened, saved }
        }),
        MeetingStore.TestMemory
      )
    )
    expect(result.saved.title).toBe("Pricing review")
    expect(result.listed.map((meeting) => meeting.title)).toEqual(["Pricing review"])
    expect(result.reopened).toEqual(result.saved)
    expect(result.markdown).toContain("# Pricing review")
    expect(result.markdown).toContain("Kickoff with scope and timeline review.")
    expect(result.after).toEqual([])
  })

  it("rejects invalid save input with no row written", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          const error = yield* Effect.flip(saveMeeting({ title: 123 }, store))
          const listed = yield* listMeetings(store)
          return { error, listed }
        }),
        MeetingStore.TestMemory
      )
    )
    expect(result.error.message).toBe("invalid save meeting input")
    expect(result.listed).toEqual([])
  })

  it("fails export and reopen for an unknown id with a meeting-not-found error", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          const getError = yield* Effect.flip(getMeeting({ id: "meeting-missing" }, store))
          const exportError = yield* Effect.flip(exportMeetingMarkdown({ id: "meeting-missing" }, store))
          return { exportError, getError }
        }),
        MeetingStore.TestMemory
      )
    )
    expect(result.getError.message).toBe("meeting not found: meeting-missing")
    expect(result.exportError.message).toBe("meeting not found: meeting-missing")
  })

  it("rejects a malformed id shape", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          const getError = yield* Effect.flip(getMeeting({}, store))
          const exportError = yield* Effect.flip(exportMeetingMarkdown({ id: 12 }, store))
          const deleteError = yield* Effect.flip(deleteMeeting({ id: null }, store))
          return { deleteError, exportError, getError }
        }),
        MeetingStore.TestMemory
      )
    )
    expect(result.getError.message).toBe("invalid meeting id request")
    expect(result.exportError.message).toBe("invalid meeting id request")
    expect(result.deleteError.message).toBe("invalid meeting id request")
  })

  it("saves and re-reads across two live layer builds pointed at a temp file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yleulc-meetings-ipc-"))
    const filename = join(directory, "meetings.db")
    const firstLive = Layer.provide(
      MeetingStore.Live,
      ConfigProvider.layer(ConfigProvider.fromEnvRecord({ YLEULC_MEETINGS_DB: filename }))
    )
    const secondLive = Layer.provide(
      MeetingStore.Live,
      ConfigProvider.layer(ConfigProvider.fromEnvRecord({ YLEULC_MEETINGS_DB: filename }))
    )
    const saved = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          return yield* saveMeeting(saveInputAt("Pricing review", 0), store)
        }),
        firstLive
      )
    )
    const reopened = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          return yield* getMeeting({ id: saved.id }, store)
        }),
        secondLive
      )
    )
    expect(reopened.title).toBe("Pricing review")
    expect(reopened.transcript).toEqual(transcriptFixture)
    await rm(directory, { force: true, recursive: true })
  })

  it("strips the listen channel when converting to a meeting transcript", () => {
    const entries: ReadonlyArray<ListenTranscriptEntry> = [
      {
        channel: "mic",
        endMs: 42000,
        id: "seg-001",
        interim: false,
        language: "en",
        startMs: 1000,
        text: "Kickoff with scope and timeline review."
      },
      {
        channel: "system",
        endMs: 75000,
        id: "seg-002",
        interim: true,
        language: "de",
        startMs: 42000,
        text: "Pricing question raised."
      }
    ]
    const transcript = toMeetingTranscript(entries)
    expect(transcript).toEqual([
      {
        endMs: 42000,
        id: "seg-001",
        interim: false,
        language: "en",
        startMs: 1000,
        text: "Kickoff with scope and timeline review."
      },
      {
        endMs: 75000,
        id: "seg-002",
        interim: true,
        language: "de",
        startMs: 42000,
        text: "Pricing question raised."
      }
    ])
    expect(transcript[0]).not.toHaveProperty("channel")
  })
})
