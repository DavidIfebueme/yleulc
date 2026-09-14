import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import {
  joinWhisperText,
  makeWhisperBackendTestLayer,
  makeWhisperRunnerTestLayer,
  parseWhisperLines,
  parseWhisperTimestamp,
  WhisperBackend,
  wrapPcmInWav,
  type WhisperTranscribeInput
} from "./WhisperBackend"
import { WhisperBootstrap } from "./WhisperBootstrap"

const stdoutFixture = [
  "whisper_init_from_file: loading model",
  "[00:00:00.000 --> 00:00:01.240]  hello from the meeting",
  "[00:00:01.240 --> 00:00:02.500]  action items follow",
  ""
].join("\n")

const inputFixture: WhisperTranscribeInput = {
  id: "utt-001",
  language: "en",
  pcm: new Uint8Array([1, 2, 3, 4]),
  span: { endMs: 2500, startMs: 0 }
}

describe("parseWhisperTimestamp", () => {
  it("converts hour minute second millisecond stamps", () => {
    expect(parseWhisperTimestamp("00:00:01.240")).toBe(1240)
    expect(parseWhisperTimestamp("00:02:03.456")).toBe(123456)
    expect(parseWhisperTimestamp("01:00:00.000")).toBe(3600000)
  })
  it("rejects malformed stamps", () => {
    expect(parseWhisperTimestamp("garbage")).toBeUndefined()
    expect(parseWhisperTimestamp("00:aa:01.000")).toBeUndefined()
  })
})

describe("parseWhisperLines", () => {
  it("extracts timestamped lines and skips log noise", () => {
    expect(parseWhisperLines(stdoutFixture)).toEqual([
      { endMs: 1240, startMs: 0, text: "hello from the meeting" },
      { endMs: 2500, startMs: 1240, text: "action items follow" }
    ])
  })
  it("returns no lines for empty output", () => {
    expect(parseWhisperLines("")).toEqual([])
  })
})

describe("joinWhisperText", () => {
  it("joins line texts with single spacing", () => {
    const lines = parseWhisperLines(stdoutFixture)
    expect(joinWhisperText(lines)).toBe("hello from the meeting action items follow")
  })
})

describe("wrapPcmInWav", () => {
  it("wraps mono pcm in a valid header", () => {
    const pcm = new Uint8Array([10, 20, 30, 40])
    const wav = wrapPcmInWav(pcm, 16000)
    expect(wav.length).toBe(48)
    const ascii = (offset: number, length: number): string =>
      Array.from(wav.slice(offset, offset + length))
        .map((byte) => String.fromCharCode(byte ?? 0))
        .join("")
    expect(ascii(0, 4)).toBe("RIFF")
    expect(ascii(8, 4)).toBe("WAVE")
    expect(ascii(36, 4)).toBe("data")
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint32(40, true)).toBe(4)
    expect(wav.slice(44)).toEqual(pcm)
  })
})

describe("WhisperBackend.transcribeSegment", () => {
  it("transcribes a segment through bootstrap and runner doubles", async () => {
    const runnerLayer = makeWhisperRunnerTestLayer(() => Effect.succeed(stdoutFixture))
    const backendLayer = Layer.provide(WhisperBackend.Live, Layer.merge(WhisperBootstrap.Test, runnerLayer))
    const utterance = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(WhisperBackend, (backend) => backend.transcribeSegment(inputFixture)),
        backendLayer
      )
    )
    expect(utterance).toEqual({
      endMs: 2500,
      id: "utt-001",
      interim: false,
      language: "en",
      startMs: 0,
      text: "hello from the meeting action items follow"
    })
  })
  it("fails empty transcripts on the error channel", async () => {
    const runnerLayer = makeWhisperRunnerTestLayer(() => Effect.succeed("no segments here\n"))
    const backendLayer = Layer.provide(WhisperBackend.Live, Layer.merge(WhisperBootstrap.Test, runnerLayer))
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.flatMap(WhisperBackend, (backend) => backend.transcribeSegment(inputFixture)),
          backendLayer
        )
      )
    )
    expect(error.operation).toBe("transcribeSegment")
  })
  it("resolves a canned utterance from the test layer", async () => {
    const utterance = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(WhisperBackend, (backend) => backend.transcribeSegment(inputFixture)),
        WhisperBackend.Test
      )
    )
    expect(utterance.text).toBe("test utterance")
    expect(utterance.startMs).toBe(0)
    expect(utterance.endMs).toBe(2500)
  })
  it("supports a function-driven double", async () => {
    const double = makeWhisperBackendTestLayer((input) =>
      Effect.succeed({
        endMs: input.span.endMs,
        id: input.id,
        interim: false as const,
        language: input.language,
        startMs: input.span.startMs,
        text: `echo:${input.id}`
      })
    )
    const utterance = await Effect.runPromise(
      Effect.provide(
        Effect.flatMap(WhisperBackend, (backend) => backend.transcribeSegment(inputFixture)),
        double
      )
    )
    expect(utterance.text).toBe("echo:utt-001")
  })
})
