import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import {
  AudioCapture,
  captureChannels,
  captureSampleRateHz,
  decodeAudioFrame,
  makeAudioCaptureTestLayer,
  type AudioFrame
} from "./AudioCapture"

function pcmFixture(length: number, seed: number): Uint8Array {
  const pcm = new Uint8Array(length)
  for (let index = 0; index < length; index = index + 1) {
    pcm[index] = (seed + index * 7) % 256
  }
  return pcm
}

const frameFixtures: ReadonlyArray<AudioFrame> = [
  { capturedAtMs: 0, pcm: pcmFixture(640, 1) },
  { capturedAtMs: 20, pcm: pcmFixture(640, 2) },
  { capturedAtMs: 40, pcm: pcmFixture(320, 3) }
]

describe("AudioCapture", () => {
  it("exposes sixteen kilohertz mono capture format", async () => {
    const program = Effect.gen(function* () {
      const capture = yield* AudioCapture
      return { channels: capture.channels, sampleRateHz: capture.sampleRateHz }
    })
    const format = await Effect.runPromise(Effect.provide(program, AudioCapture.Test))
    expect(format.sampleRateHz).toBe(16000)
    expect(format.channels).toBe(1)
    expect(captureSampleRateHz).toBe(16000)
    expect(captureChannels).toBe(1)
  })
  it("replays fixture frames in order from a test double", async () => {
    const program = Effect.gen(function* () {
      const capture = yield* AudioCapture
      return yield* Stream.runCollect(capture.frames)
    })
    const collected = await Effect.runPromise(
      Effect.provide(program, makeAudioCaptureTestLayer(frameFixtures))
    )
    const replayed = Array.from(collected)
    expect(replayed.length).toBe(3)
    expect(replayed[0]?.capturedAtMs).toBe(0)
    expect(replayed[1]?.capturedAtMs).toBe(20)
    expect(replayed[2]?.pcm.length).toBe(320)
    expect(replayed[0]?.pcm).toEqual(pcmFixture(640, 1))
  })
  it("starts and stops cleanly from a test double", async () => {
    const program = Effect.gen(function* () {
      const capture = yield* AudioCapture
      yield* capture.start
      yield* capture.stop
      return true
    })
    const done = await Effect.runPromise(Effect.provide(program, makeAudioCaptureTestLayer(frameFixtures)))
    expect(done).toBe(true)
  })
  it("builds the live layer without touching the microphone", async () => {
    const program = Effect.gen(function* () {
      const capture = yield* AudioCapture
      return capture.sampleRateHz
    })
    const sampleRateHz = await Effect.runPromise(Effect.provide(program, AudioCapture.Live))
    expect(sampleRateHz).toBe(16000)
  })
  it("decodes an audio frame fixture through the schema", () => {
    expect(decodeAudioFrame(frameFixtures[0])).toEqual(frameFixtures[0])
  })
})
