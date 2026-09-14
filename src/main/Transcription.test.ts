import { describe, expect, it } from "vitest"
import {
  decodeTranscriptSegment,
  decodeUtterance,
  encodeTranscriptSegment,
  finalizeSegment,
  TranscriptionError,
  type TranscriptSegment
} from "./Transcription"

const finalFixture: TranscriptSegment = {
  endMs: 2400,
  id: "seg-001",
  interim: false,
  language: "en",
  startMs: 1200,
  text: "hello from the meeting"
}

const interimFixture: TranscriptSegment = {
  endMs: 1800,
  id: "seg-002",
  interim: true,
  language: "en",
  startMs: 1200,
  text: "hello from"
}

describe("TranscriptSegment", () => {
  it("decodes a final segment fixture", () => {
    expect(decodeTranscriptSegment(finalFixture)).toEqual(finalFixture)
  })
  it("decodes an interim segment fixture", () => {
    expect(decodeTranscriptSegment(interimFixture)).toEqual(interimFixture)
  })
  it("rejects a segment missing language", () => {
    expect(() =>
      decodeTranscriptSegment({
        endMs: 2400,
        id: "seg-003",
        interim: false,
        startMs: 1200,
        text: "no language"
      })
    ).toThrow()
  })
  it("round-trips through encode and decode", () => {
    const encoded = encodeTranscriptSegment(finalFixture)
    expect(decodeTranscriptSegment(encoded)).toEqual(finalFixture)
  })
})

describe("Utterance", () => {
  it("decodes a finalized segment", () => {
    const utterance = finalizeSegment(finalFixture)
    expect(utterance).toBeDefined()
    if (utterance !== undefined) {
      expect(decodeUtterance(utterance)).toEqual({ ...finalFixture, interim: false as const })
    }
  })
  it("rejects interim segments", () => {
    expect(finalizeSegment(interimFixture)).toBeUndefined()
  })
  it("rejects empty final text", () => {
    expect(finalizeSegment({ ...finalFixture, text: "" })).toBeUndefined()
  })
  it("rejects an utterance payload marked interim", () => {
    expect(() => decodeUtterance(interimFixture)).toThrow()
  })
})

describe("TranscriptionError", () => {
  it("carries operation and reason on the error channel", () => {
    const error = new TranscriptionError({ operation: "transcribeUtterance", reason: "binary missing" })
    expect(error._tag).toBe("TranscriptionError")
    expect(error.operation).toBe("transcribeUtterance")
    expect(error.reason).toBe("binary missing")
  })
})
