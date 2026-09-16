import { describe, expect, it } from "vitest"
import {
  applyListenEvent,
  decodeListenEvent,
  encodeListenEvent,
  initialListenViewState,
  maxListenEntries,
  type ListenEvent,
  type ListenTranscriptEntry,
  type ListenViewState
} from "../shared/listenIpc"

function entryFixture(id: string, text: string, channel: ListenTranscriptEntry["channel"] = "mic"): ListenTranscriptEntry {
  return { channel, endMs: 2200, id, interim: false, language: "en", startMs: 1200, text }
}

describe("listen event contract", () => {
  it("round-trips segment, error, and status events through the schema", () => {
    const events: ReadonlyArray<ListenEvent> = [
      { _tag: "segment", entry: entryFixture("seg-001", "What should I say next?") },
      { _tag: "error", message: "start: device busy" },
      { _tag: "status", state: "started", systemAudio: "unsupported" },
      { _tag: "status", state: "stopped", systemAudio: "unsupported" }
    ]
    for (const event of events) {
      expect(decodeListenEvent(encodeListenEvent(event))).toEqual(event)
    }
  })
  it("rejects an unknown event shape", () => {
    expect(() => decodeListenEvent({ _tag: "waveform", level: 3 })).toThrow()
  })
})

describe("applyListenEvent", () => {
  it("appends live segments to the transcript bar state", () => {
    const first = applyListenEvent(initialListenViewState, {
      _tag: "segment",
      entry: entryFixture("seg-001", "Kickoff with scope review.")
    })
    const second = applyListenEvent(first, {
      _tag: "segment",
      entry: entryFixture("seg-002", "Can you share the pricing breakdown?", "system")
    })
    expect(second.entries.map((entry) => entry.id)).toEqual(["seg-001", "seg-002"])
    expect(second.entries.map((entry) => entry.channel)).toEqual(["mic", "system"])
  })
  it("rolls entries beyond the transcript cap", () => {
    let state: ListenViewState = initialListenViewState
    for (let index = 0; index < maxListenEntries + 2; index = index + 1) {
      state = applyListenEvent(state, {
        _tag: "segment",
        entry: entryFixture(`seg-${index}`, `Utterance ${index}`)
      })
    }
    expect(state.entries.length).toBe(maxListenEntries)
    expect(state.entries[0]?.id).toBe("seg-2")
  })
  it("surfaces engine failures for the error banner", () => {
    const state = applyListenEvent(initialListenViewState, {
      _tag: "error",
      message: "transcribeUtterance: binary missing"
    })
    expect(state.errorMessage).toBe("transcribeUtterance: binary missing")
    expect(state.entries).toEqual([])
  })
  it("tracks running state and honest system audio support from status events", () => {
    const started = applyListenEvent(initialListenViewState, {
      _tag: "status",
      state: "started",
      systemAudio: "unsupported"
    })
    expect(started.running).toBe(true)
    expect(started.systemAudio).toBe("unsupported")
    const stopped = applyListenEvent(started, {
      _tag: "status",
      state: "stopped",
      systemAudio: "unsupported"
    })
    expect(stopped.running).toBe(false)
  })
})
