import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  decodeMeeting,
  decodeMeetingNote,
  decodeMeetingSummary,
  decodeMeetingTranscript,
  decodeSaveMeetingInput,
  encodeMeeting,
  exportMeetingMarkdown,
  formatMeetingDuration,
  formatMeetingUseCounts,
  formatSegmentTimestamp,
  groupMeetingsByDay,
  meetingDurationMs,
  MeetingIdSchema,
  toMeetingSummary,
  type Meeting,
  type MeetingId,
  type MeetingSummary
} from "../shared/meeting"

const decodeMeetingId = Schema.decodeUnknownSync(MeetingIdSchema)

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
  },
  {
    endMs: 75000,
    id: "seg-002",
    interim: false,
    language: "en",
    startMs: 42000,
    text: "Pricing question raised with a deadline attached."
  }
]

const meetingFixture: Meeting = {
  askCount: 3,
  assistCount: 2,
  endedAtMs: 1800000,
  id: decodeMeetingId("meeting-001"),
  note: noteFixture,
  startedAtMs: 0,
  title: "Pricing review",
  transcript: transcriptFixture
}

function summaryAt(rawId: string, startedAtMs: number): MeetingSummary {
  const id: MeetingId = decodeMeetingId(rawId)
  return {
    askCount: 1,
    assistCount: 0,
    endedAtMs: startedAtMs + 600000,
    id,
    startedAtMs,
    title: `Meeting ${id}`
  }
}

describe("MeetingSchema", () => {
  it("decodes a stored meeting fixture", () => {
    expect(decodeMeeting(meetingFixture)).toEqual(meetingFixture)
  })
  it("round-trips a meeting through encode and decode", () => {
    expect(decodeMeeting(encodeMeeting(meetingFixture))).toEqual(meetingFixture)
  })
  it("rejects a meeting missing its title", () => {
    expect(() =>
      decodeMeeting({
        askCount: 0,
        assistCount: 0,
        endedAtMs: 10,
        id: "meeting-bad",
        note: noteFixture,
        startedAtMs: 0,
        transcript: []
      })
    ).toThrow()
  })
  it("decodes note and transcript shapes", () => {
    expect(decodeMeetingNote(noteFixture)).toEqual(noteFixture)
    expect(decodeMeetingTranscript(transcriptFixture)).toEqual(transcriptFixture)
  })
  it("decodes a summary and derives it from a meeting", () => {
    const summary = toMeetingSummary(meetingFixture)
    expect(decodeMeetingSummary(summary)).toEqual(summary)
    expect(summary.title).toBe("Pricing review")
  })
  it("decodes save input with defaultable use counts", () => {
    const decoded = decodeSaveMeetingInput({
      endedAtMs: 1800000,
      note: noteFixture,
      startedAtMs: 0,
      title: "Pricing review",
      transcript: transcriptFixture
    })
    expect(decoded.askCount).toBeUndefined()
    expect(decoded.title).toBe("Pricing review")
  })
})

describe("meetingDurationMs", () => {
  it("computes duration from span bounds", () => {
    expect(meetingDurationMs({ endedAtMs: 1800000, startedAtMs: 0 })).toBe(1800000)
  })
  it("clamps a negative span to zero", () => {
    expect(meetingDurationMs({ endedAtMs: 0, startedAtMs: 1000 })).toBe(0)
  })
})

describe("formatMeetingDuration", () => {
  it("formats sub-minute durations in seconds", () => {
    expect(formatMeetingDuration(0)).toBe("0s")
    expect(formatMeetingDuration(30000)).toBe("30s")
  })
  it("formats minute durations without seconds", () => {
    expect(formatMeetingDuration(720000)).toBe("12m")
  })
  it("formats hour durations with padded minutes", () => {
    expect(formatMeetingDuration(3900000)).toBe("1h 05m")
  })
})

describe("formatMeetingUseCounts", () => {
  it("renders ask and assist counts", () => {
    expect(formatMeetingUseCounts(3, 2)).toBe("3 asks · 2 assists")
    expect(formatMeetingUseCounts(0, 0)).toBe("0 asks · 0 assists")
  })
})

describe("formatSegmentTimestamp", () => {
  it("renders segment starts as mm:ss", () => {
    expect(formatSegmentTimestamp(0)).toBe("00:00")
    expect(formatSegmentTimestamp(75000)).toBe("01:15")
  })
})

describe("exportMeetingMarkdown", () => {
  it("exports transcript plus notes plus follow-up draft", () => {
    const markdown = exportMeetingMarkdown(meetingFixture)
    expect(markdown).toContain("# Pricing review")
    expect(markdown).toContain("## Transcript")
    expect(markdown).toContain("Pricing question raised with a deadline attached.")
    expect(markdown).toContain("## Key questions")
    expect(markdown).toContain("What did we agree on pricing?")
    expect(markdown).toContain("## Action items")
    expect(markdown).toContain("- [ ] Send the pricing follow-up")
    expect(markdown).toContain("## Follow-up draft")
    expect(markdown).toContain("Thanks for the review, here is the pricing recap.")
  })
  it("renders placeholders for empty transcript and notes", () => {
    const markdown = exportMeetingMarkdown({
      ...meetingFixture,
      note: { actionItems: [], followUpDraft: "", keyQuestions: [] },
      transcript: []
    })
    expect(markdown).toContain("## Transcript\n- None")
    expect(markdown).toContain("## Key questions\n- None")
    expect(markdown).toContain("## Action items\n- None")
  })
})

describe("groupMeetingsByDay", () => {
  it("groups rows into today and yesterday", () => {
    const noon = new Date(2026, 8, 15, 12, 0, 0).getTime()
    const morning = new Date(2026, 8, 15, 9, 0, 0).getTime()
    const yesterdayMorning = new Date(2026, 8, 14, 9, 0, 0).getTime()
    const groups = groupMeetingsByDay(
      [summaryAt("meeting-yesterday", yesterdayMorning), summaryAt("meeting-today", morning)],
      noon
    )
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"])
    expect(groups[0]?.meetings.map((meeting) => meeting.id)).toEqual(["meeting-today"])
    expect(groups[1]?.meetings.map((meeting) => meeting.id)).toEqual(["meeting-yesterday"])
  })
  it("sorts each group newest first and keeps earlier history", () => {
    const noon = new Date(2026, 8, 15, 12, 0, 0).getTime()
    const early = new Date(2026, 8, 15, 8, 0, 0).getTime()
    const late = new Date(2026, 8, 15, 11, 0, 0).getTime()
    const old = new Date(2026, 8, 10, 11, 0, 0).getTime()
    const groups = groupMeetingsByDay(
      [summaryAt("meeting-early", early), summaryAt("meeting-old", old), summaryAt("meeting-late", late)],
      noon
    )
    expect(groups.map((group) => group.label)).toEqual(["Today", "Earlier"])
    expect(groups[0]?.meetings.map((meeting) => meeting.id)).toEqual(["meeting-late", "meeting-early"])
  })
  it("returns no groups for an empty history", () => {
    const noon = new Date(2026, 8, 15, 12, 0, 0).getTime()
    expect(groupMeetingsByDay([], noon)).toEqual([])
  })
})
