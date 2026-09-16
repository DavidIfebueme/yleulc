import { Effect, Layer, Ref, Stream } from "effect"
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
import {
  AudioCapture,
  AudioCaptureError,
  makeAudioCaptureTestLayer,
  type AudioFrame
} from "./AudioCapture"
import { ListenIpcError, runListenSession, stopListenSession } from "./ListenIpc"
import { ListenSession } from "./ListenSession"
import { resolveSystemAudioSupport } from "./SystemAudio"
import { TranscriptionError, type TranscriptSegment } from "./Transcription"
import { TranscriptionEngine } from "./TranscriptionEngine"

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

function pcmFixture(length: number, seed: number): Uint8Array {
  const pcm = new Uint8Array(length)
  for (let index = 0; index < length; index = index + 1) {
    pcm[index] = (seed + index) % 256
  }
  return pcm
}

function audioFixtures(count: number): ReadonlyArray<AudioFrame> {
  const frames: Array<AudioFrame> = []
  for (let index = 0; index < count; index = index + 1) {
    frames.push({ capturedAtMs: index * 20, pcm: pcmFixture(640, index) })
  }
  return frames
}

function scriptedEngineLayer(texts: ReadonlyArray<string>): Layer.Layer<TranscriptionEngine> {
  return Layer.succeed(
    TranscriptionEngine,
    TranscriptionEngine.of({
      backendKind: "local",
      listen: (frames) =>
        Stream.map(Stream.zipWithIndex(frames), ([frame, index]): TranscriptSegment => ({
          endMs: frame.capturedAtMs + 20,
          id: `scripted-${index}`,
          interim: false,
          language: "en",
          startMs: frame.capturedAtMs,
          text: texts[index] ?? "scripted utterance"
        })),
      transcribeUtterance: (input) =>
        Effect.succeed({
          endMs: input.span.endMs,
          id: input.id,
          interim: false as const,
          language: input.language,
          startMs: input.span.startMs,
          text: texts[0] ?? "scripted utterance"
        })
    })
  )
}

function failingEngineLayer(): Layer.Layer<TranscriptionEngine> {
  const failure = new TranscriptionError({ operation: "transcribeUtterance", reason: "binary missing" })
  return Layer.succeed(
    TranscriptionEngine,
    TranscriptionEngine.of({
      backendKind: "local",
      listen: () => Stream.fail(failure),
      transcribeUtterance: () => Effect.fail(failure)
    })
  )
}

function failingCaptureLayer(): Layer.Layer<AudioCapture> {
  return Layer.succeed(
    AudioCapture,
    AudioCapture.of({
      channels: 1,
      frames: Stream.fromIterable<AudioFrame>([]),
      sampleRateHz: 16000,
      start: Effect.fail(new AudioCaptureError({ operation: "start", reason: "device busy" })),
      stop: Effect.void
    })
  )
}

function collectSessionEvents(
  raw: unknown,
  layers: Layer.Layer<AudioCapture | TranscriptionEngine | ListenSession>
): Promise<ReadonlyArray<ListenEvent>> {
  return Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const capture = yield* AudioCapture
        const engine = yield* TranscriptionEngine
        const session = yield* ListenSession
        const sent = yield* Ref.make<ReadonlyArray<ListenEvent>>([])
        const send = (event: ListenEvent): Effect.Effect<void> =>
          Ref.update(sent, (previous) => [...previous, event])
        yield* runListenSession(raw, { capture, engine, session }, send, "unsupported")
        return yield* Ref.get(sent)
      }),
      layers
    )
  )
}

describe("runListenSession", () => {
  it("streams scripted engine segments after the started status", async () => {
    const events = await collectSessionEvents(
      { sessionId: "listen-session-1" },
      Layer.mergeAll(
        scriptedEngineLayer(["What should I say next?", "Pricing review moved to Friday."]),
        makeAudioCaptureTestLayer(audioFixtures(2)),
        ListenSession.Test
      )
    )
    expect(events[0]).toEqual({ _tag: "status", state: "started", systemAudio: "unsupported" })
    expect(events.slice(1)).toEqual([
      {
        _tag: "segment",
        entry: {
          channel: "mic",
          endMs: 20,
          id: "scripted-0",
          interim: false,
          language: "en",
          startMs: 0,
          text: "What should I say next?"
        }
      },
      {
        _tag: "segment",
        entry: {
          channel: "mic",
          endMs: 40,
          id: "scripted-1",
          interim: false,
          language: "en",
          startMs: 20,
          text: "Pricing review moved to Friday."
        }
      }
    ])
  })
  it("reduces the streamed events into transcript bar state end to end", async () => {
    const events = await collectSessionEvents(
      { sessionId: "listen-session-2" },
      Layer.mergeAll(
        scriptedEngineLayer(["Owner assigned for the follow-up draft."]),
        makeAudioCaptureTestLayer(audioFixtures(1)),
        ListenSession.Test
      )
    )
    let state = initialListenViewState
    for (const event of events) {
      state = applyListenEvent(state, event)
    }
    expect(state.running).toBe(true)
    expect(state.entries.map((entry) => entry.text)).toEqual(["Owner assigned for the follow-up draft."])
    expect(state.errorMessage).toBeUndefined()
  })
  it("feeds engine failures to the error banner as error events", async () => {
    const events = await collectSessionEvents(
      { sessionId: "listen-session-3" },
      Layer.mergeAll(failingEngineLayer(), makeAudioCaptureTestLayer(audioFixtures(1)), ListenSession.Test)
    )
    expect(events).toEqual([
      { _tag: "status", state: "started", systemAudio: "unsupported" },
      { _tag: "error", message: "transcribeUtterance: binary missing" }
    ])
  })
  it("reports capture start failures without streaming phantom segments", async () => {
    const events = await collectSessionEvents(
      { sessionId: "listen-session-4" },
      Layer.mergeAll(scriptedEngineLayer(["Never streamed"]), failingCaptureLayer(), ListenSession.Test)
    )
    expect(events).toEqual([
      { _tag: "status", state: "started", systemAudio: "unsupported" },
      { _tag: "error", message: "start: device busy" }
    ])
  })
  it("rejects an invalid start request without sending", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capture = yield* AudioCapture
          const engine = yield* TranscriptionEngine
          const session = yield* ListenSession
          const sent = yield* Ref.make<ReadonlyArray<ListenEvent>>([])
          const send = (event: ListenEvent): Effect.Effect<void> =>
            Ref.update(sent, (previous) => [...previous, event])
          const error = yield* Effect.flip(runListenSession({}, { capture, engine, session }, send, "unsupported"))
          const events = yield* Ref.get(sent)
          return { error, events }
        }),
        Layer.mergeAll(
          scriptedEngineLayer(["Never streamed"]),
          makeAudioCaptureTestLayer(audioFixtures(1)),
          ListenSession.Test
        )
      )
    )
    expect(outcome.error).toBeInstanceOf(ListenIpcError)
    expect(outcome.events).toEqual([])
  })
  it("stops capture through the stop path", async () => {
    const stopped = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const capture = yield* AudioCapture
          const engine = yield* TranscriptionEngine
          const session = yield* ListenSession
          yield* stopListenSession({ capture, engine, session })
          return true
        }),
        Layer.mergeAll(
          scriptedEngineLayer(["Never streamed"]),
          makeAudioCaptureTestLayer(audioFixtures(1)),
          ListenSession.Test
        )
      )
    )
    expect(stopped).toBe(true)
  })
})

describe("resolveSystemAudioSupport", () => {
  it("reports unsupported without a configured loopback source", () => {
    expect(resolveSystemAudioSupport(undefined)).toBe("unsupported")
    expect(resolveSystemAudioSupport("")).toBe("unsupported")
    expect(resolveSystemAudioSupport("   ")).toBe("unsupported")
  })
  it("reports supported with a configured loopback source", () => {
    expect(resolveSystemAudioSupport("alsa_output.monitor")).toBe("supported")
  })
})
