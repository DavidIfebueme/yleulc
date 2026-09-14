import { execFile } from "node:child_process"
import { randomUUID } from "node:crypto"
import { tmpdir } from "node:os"
import { unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Context, Effect, Layer } from "effect"
import { captureSampleRateHz } from "./AudioCapture"
import type { SegmentSpan } from "./SegmentationPolicy"
import { TranscriptionError, type Utterance } from "./Transcription"
import { WhisperBootstrap } from "./WhisperBootstrap"
import type { BootstrapError } from "./WhisperBootstrap"

export interface WhisperLine {
  readonly endMs: number
  readonly startMs: number
  readonly text: string
}

const whisperLinePattern = /\[(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\]\s*(.*)/

export function parseWhisperTimestamp(stamp: string): number | undefined {
  const parts = stamp.split(":")
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  const seconds = Number(parts[2])
  if (parts.length !== 3 || Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds)) {
    return undefined
  }
  return Math.round(hours * 3600000 + minutes * 60000 + seconds * 1000)
}

export function parseWhisperLines(stdout: string): ReadonlyArray<WhisperLine> {
  const lines: Array<WhisperLine> = []
  for (const raw of stdout.split("\n")) {
    const match = whisperLinePattern.exec(raw.trim())
    if (match === null) {
      continue
    }
    const startMs = parseWhisperTimestamp(match[1] ?? "")
    const endMs = parseWhisperTimestamp(match[2] ?? "")
    const text = (match[3] ?? "").trim()
    if (startMs === undefined || endMs === undefined || text.length === 0) {
      continue
    }
    lines.push({ endMs, startMs, text })
  }
  return lines
}

export function wrapPcmInWav(pcm: Uint8Array, sampleRateHz: number): Uint8Array {
  const header = new ArrayBuffer(44)
  const view = new DataView(header)
  const writeAscii = (offset: number, value: string): void => {
    for (let index = 0; index < value.length; index = index + 1) {
      view.setUint8(offset + index, value.charCodeAt(index))
    }
  }
  writeAscii(0, "RIFF")
  view.setUint32(4, 36 + pcm.length, true)
  writeAscii(8, "WAVE")
  writeAscii(12, "fmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRateHz, true)
  view.setUint32(28, sampleRateHz * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(36, "data")
  view.setUint32(40, pcm.length, true)
  const wav = new Uint8Array(44 + pcm.length)
  wav.set(new Uint8Array(header), 0)
  wav.set(pcm, 44)
  return wav
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

function runWhisperFile(binaryPath: string, args: ReadonlyArray<string>): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(binaryPath, [...args], { maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(String(stdout))
    })
  })
}

export interface WhisperRunInput {
  readonly binaryPath: string
  readonly language: string
  readonly modelPath: string
  readonly pcm: Uint8Array
}

export interface WhisperRunnerShape {
  readonly runSegment: (input: WhisperRunInput) => Effect.Effect<string, TranscriptionError>
}

export class WhisperRunner extends Context.Service<WhisperRunner, WhisperRunnerShape>()("WhisperRunner") {
  static readonly Live = Layer.succeed(
    WhisperRunner,
    WhisperRunner.of({
      runSegment: (input) =>
        Effect.tryPromise({
          catch: (cause) => new TranscriptionError({ operation: "runSegment", reason: describeCause(cause) }),
          try: () => {
            const path = join(tmpdir(), `yleulc-${randomUUID()}.wav`)
            const wav = wrapPcmInWav(input.pcm, captureSampleRateHz)
            return writeFile(path, wav)
              .then(() =>
                runWhisperFile(input.binaryPath, ["-m", input.modelPath, "-f", path, "-l", input.language])
              )
              .finally(() =>
                unlink(path).then(
                  () => undefined,
                  () => undefined
                )
              )
          }
        })
    })
  )
  static readonly Test = Layer.succeed(
    WhisperRunner,
    WhisperRunner.of({
      runSegment: () => Effect.succeed("[00:00:00.000 --> 00:00:01.000]  hello world\n")
    })
  )
}

export function makeWhisperRunnerTestLayer(
  run: (input: WhisperRunInput) => Effect.Effect<string, TranscriptionError>
): Layer.Layer<WhisperRunner> {
  return Layer.succeed(WhisperRunner, WhisperRunner.of({ runSegment: run }))
}

export interface WhisperTranscribeInput {
  readonly id: string
  readonly language: string
  readonly pcm: Uint8Array
  readonly span: SegmentSpan
}

export interface WhisperBackendShape {
  readonly transcribeSegment: (
    input: WhisperTranscribeInput
  ) => Effect.Effect<Utterance, TranscriptionError | BootstrapError>
}

export function joinWhisperText(lines: ReadonlyArray<WhisperLine>): string {
  return lines
    .map((line) => line.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
}

export class WhisperBackend extends Context.Service<WhisperBackend, WhisperBackendShape>()("WhisperBackend") {
  static readonly Live = Layer.effect(
    WhisperBackend,
    Effect.gen(function* () {
      const bootstrap = yield* WhisperBootstrap
      const runner = yield* WhisperRunner
      return WhisperBackend.of({
        transcribeSegment: (input) =>
          Effect.gen(function* () {
            const paths = yield* bootstrap.ensureReady
            const stdout = yield* runner.runSegment({
              binaryPath: paths.binaryPath,
              language: input.language,
              modelPath: paths.modelPath,
              pcm: input.pcm
            })
            const text = joinWhisperText(parseWhisperLines(stdout))
            if (text.length === 0) {
              return yield* Effect.fail(
                new TranscriptionError({ operation: "transcribeSegment", reason: "empty transcript" })
              )
            }
            return {
              endMs: input.span.endMs,
              id: input.id,
              interim: false as const,
              language: input.language,
              startMs: input.span.startMs,
              text
            }
          })
      })
    })
  )
  static readonly Test = Layer.succeed(
    WhisperBackend,
    WhisperBackend.of({
      transcribeSegment: (input) =>
        Effect.succeed({
          endMs: input.span.endMs,
          id: input.id,
          interim: false as const,
          language: input.language,
          startMs: input.span.startMs,
          text: "test utterance"
        })
    })
  )
}

export function makeWhisperBackendTestLayer(
  transcribe: (input: WhisperTranscribeInput) => Effect.Effect<Utterance, TranscriptionError>
): Layer.Layer<WhisperBackend> {
  return Layer.succeed(WhisperBackend, WhisperBackend.of({ transcribeSegment: transcribe }))
}
