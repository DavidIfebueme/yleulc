import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect, Option } from "effect"
import { describe, expect, it } from "vitest"
import { decodeMeetingNote } from "../shared/meeting"
import type { MeetingId, SaveMeetingInput } from "../shared/meeting"
import { makeMeetingStoreFileTestLayer, MeetingNotFound, MeetingStore } from "./MeetingStore"

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
    askCount: 3,
    assistCount: 2,
    endedAtMs: startedAtMs + 1800000,
    note: noteFixture,
    startedAtMs,
    title,
    transcript: transcriptFixture
  }
}

describe("MeetingStore", () => {
  it("saves a meeting on end with transcript and notes", async () => {
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      return yield* store.saveMeeting(saveInputAt("Pricing review", 0))
    })
    const saved = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(saved.title).toBe("Pricing review")
    expect(saved.transcript).toEqual(transcriptFixture)
    expect(saved.note).toEqual(noteFixture)
    expect(saved.askCount).toBe(3)
    expect(saved.assistCount).toBe(2)
  })
  it("lists saved meetings newest first", async () => {
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      yield* store.saveMeeting(saveInputAt("Morning standup", 0))
      yield* store.saveMeeting(saveInputAt("Pricing review", 3600000))
      return yield* store.listMeetings
    })
    const listed = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(listed.map((meeting) => meeting.title)).toEqual(["Pricing review", "Morning standup"])
  })
  it("reopens a meeting with full transcript and notes", async () => {
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      const saved = yield* store.saveMeeting(saveInputAt("Pricing review", 0))
      const reopened = yield* store.reopenMeeting(saved.id)
      const found = yield* store.getMeeting(saved.id)
      return { found, reopened, saved }
    })
    const result = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(result.reopened).toEqual(result.saved)
    expect(Option.isSome(result.found)).toBe(true)
  })
  it("updates notes with key questions plus action items plus follow-up draft", async () => {
    const nextNote = decodeMeetingNote({
      actionItems: ["Book the follow-up call"],
      followUpDraft: "Recap plus owners plus dates.",
      keyQuestions: ["Who owns the follow-up?"]
    })
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      const saved = yield* store.saveMeeting(saveInputAt("Pricing review", 0))
      return yield* store.updateMeetingNote(saved.id, nextNote)
    })
    const updated = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(updated.note).toEqual(nextNote)
    expect(updated.transcript).toEqual(transcriptFixture)
  })
  it("exports markdown for a saved meeting", async () => {
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      const saved = yield* store.saveMeeting(saveInputAt("Pricing review", 0))
      return yield* store.exportMeetingMarkdown(saved.id)
    })
    const markdown = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(markdown).toContain("# Pricing review")
    expect(markdown).toContain("## Key questions")
    expect(markdown).toContain("- [ ] Send the pricing follow-up")
  })
  it("deletes a meeting", async () => {
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      const saved = yield* store.saveMeeting(saveInputAt("Pricing review", 0))
      yield* store.deleteMeeting(saved.id)
      const found = yield* store.getMeeting(saved.id)
      const listed = yield* store.listMeetings
      return { found, listed }
    })
    const result = await Effect.runPromise(Effect.provide(program, MeetingStore.TestMemory))
    expect(Option.isNone(result.found)).toBe(true)
    expect(result.listed).toEqual([])
  })
  it("fails typed when reopening a missing meeting", async () => {
    const missing = "meeting-missing" as MeetingId
    const program = Effect.gen(function* () {
      const store = yield* MeetingStore
      return yield* store.reopenMeeting(missing)
    })
    const error = await Effect.runPromise(Effect.flip(Effect.provide(program, MeetingStore.TestMemory)))
    expect(error._tag).toBe("MeetingNotFound")
    expect((error as MeetingNotFound).id).toBe("meeting-missing")
  })
  it("persists meetings across file-backed layers inside temp dirs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "yleulc-meetings-"))
    const filename = join(dir, "meetings.db")
    const saved = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          return yield* store.saveMeeting(saveInputAt("Pricing review", 0))
        }),
        makeMeetingStoreFileTestLayer(filename)
      )
    )
    const reopened = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* MeetingStore
          return yield* store.reopenMeeting(saved.id)
        }),
        makeMeetingStoreFileTestLayer(filename)
      )
    )
    expect(reopened.title).toBe("Pricing review")
    expect(reopened.transcript).toEqual(transcriptFixture)
    await rm(dir, { force: true, recursive: true })
  })
})
