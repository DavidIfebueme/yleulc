import { Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import {
  appendListenEntry,
  isAutoAnswerIntent,
  listenChannelLabel,
  maxListenEntries,
  shouldAutoAnswer,
  type ListenTranscriptEntry
} from "../shared/listenIpc"
import { makeAudioCaptureTestLayer, type AudioFrame } from "./AudioCapture"
import { AudioCapture } from "./AudioCapture"
import { AskService, makeAskService } from "./AskService"
import {
  describeListenFailure,
  listenAnswerRequestId,
  ListenSession,
  toAutoAnswerRequest,
  toListenEntry,
  type ListenInput
} from "./ListenSession"
import { makeProviderRegistry } from "./providers/ProviderRegistry"
import type { ChatEvent, Provider } from "./providers/Provider"
import { TranscriptionError, type TranscriptSegment } from "./Transcription"
import { TranscriptionEngine } from "./TranscriptionEngine"

function pcmBytes(length: number, seed: number): Uint8Array {
  const pcm = new Uint8Array(length)
  for (let index = 0; index < length; index = index + 1) {
    pcm[index] = (seed + index) % 256
  }
  return pcm
}

function audioFixtures(count: number): ReadonlyArray<AudioFrame> {
  const frames: Array<AudioFrame> = []
  for (let index = 0; index < count; index = index + 1) {
    frames.push({ capturedAtMs: index * 20, pcm: pcmBytes(640, index) })
  }
  return frames
}

function segmentFixture(id: string, text: string, interim: boolean): TranscriptSegment {
  return { endMs: 2400, id, interim, language: "en", startMs: 1200, text }
}

const micQuestion: ListenInput = {
  channel: "mic",
  segment: segmentFixture("seg-001", "What should I say next?", false)
}

const systemStatement: ListenInput = {
  channel: "system",
  segment: segmentFixture("seg-002", "Pricing review moved to Friday.", false)
}

const micInterim: ListenInput = {
  channel: "mic",
  segment: segmentFixture("seg-003", "What should I", true)
}

const fixtureInputs: ReadonlyArray<ListenInput> = [micQuestion, systemStatement, micInterim]

function scriptedProvider(events: ReadonlyArray<ChatEvent>): Provider {
  return {
    completeChat: () => Stream.fromIterable(events),
    defaultBaseUrl: "https://api.openai.com/v1",
    displayName: "OpenAI",
    id: "openai",
    listModels: () => Effect.succeed(["gpt-4o"]),
    visionModels: ["gpt-4o"]
  }
}

function scriptedSessionLayer(events: ReadonlyArray<ChatEvent>): Layer.Layer<ListenSession> {
  const registry = makeProviderRegistry([scriptedProvider(events)])
  return ListenSession.Live.pipe(Layer.provide(Layer.succeed(AskService, makeAskService(registry))))
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

describe("toListenEntry", () => {
  it("tags engine segments with the capture channel", () => {
    expect(toListenEntry(micQuestion)).toEqual({
      channel: "mic",
      endMs: 2400,
      id: "seg-001",
      interim: false,
      language: "en",
      startMs: 1200,
      text: "What should I say next?"
    })
    expect(toListenEntry(systemStatement).channel).toBe("system")
  })
  it("labels mic and system channels", () => {
    expect(listenChannelLabel("mic")).toBe("Mic")
    expect(listenChannelLabel("system")).toBe("System")
  })
})

describe("isAutoAnswerIntent", () => {
  it("treats questions as intents", () => {
    expect(isAutoAnswerIntent("What should I say next?")).toBe(true)
    expect(isAutoAnswerIntent("how do we price this")).toBe(true)
    expect(isAutoAnswerIntent("Pricing review moved to Friday.")).toBe(false)
    expect(isAutoAnswerIntent("   ")).toBe(false)
  })
  it("never answers interim or empty entries", () => {
    expect(shouldAutoAnswer({ ...toListenEntry(micQuestion), interim: true })).toBe(false)
    expect(shouldAutoAnswer({ ...toListenEntry(micQuestion), text: "  " })).toBe(false)
    expect(shouldAutoAnswer(toListenEntry(micQuestion))).toBe(true)
    expect(shouldAutoAnswer(toListenEntry(systemStatement))).toBe(false)
  })
})

describe("appendListenEntry", () => {
  it("rolls the transcript bar with a cap", () => {
    const first = toListenEntry(micQuestion)
    const second = toListenEntry(systemStatement)
    expect(appendListenEntry([], first)).toEqual([first])
    expect(appendListenEntry([first], second, 1)).toEqual([second])
  })
  it("drops the oldest entries beyond the default cap", () => {
    let entries: ReadonlyArray<ListenTranscriptEntry> = []
    for (let index = 0; index < maxListenEntries + 5; index = index + 1) {
      entries = appendListenEntry(entries, { ...toListenEntry(micQuestion), id: `seg-${index}` })
    }
    expect(entries.length).toBe(maxListenEntries)
    expect(entries[0]?.id).toBe("seg-5")
  })
})

describe("ListenSession.observe", () => {
  it("streams transcript segments into the bar from fixtures", async () => {
    const entries = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const session = yield* ListenSession
          return yield* Stream.runCollect(session.observe(Stream.fromIterable(fixtureInputs)))
        }),
        ListenSession.Test
      )
    )
    const list = Array.from(entries)
    expect(list.map((entry) => entry.channel)).toEqual(["mic", "system", "mic"])
    expect(list.map((entry) => entry.text)).toEqual([
      "What should I say next?",
      "Pricing review moved to Friday.",
      "What should I"
    ])
  })
  it("streams segments from a scripted engine double with zero audio hardware", async () => {
    const entries = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const engine = yield* TranscriptionEngine
          const capture = yield* AudioCapture
          const session = yield* ListenSession
          const tagged = Stream.map(engine.listen(capture.frames), (segment): ListenInput => ({
            channel: "mic",
            segment
          }))
          return yield* Stream.runCollect(session.observe(tagged))
        }),
        Layer.mergeAll(
          scriptedEngineLayer(["What should I say next?", "Pricing review moved to Friday."]),
          makeAudioCaptureTestLayer(audioFixtures(2)),
          ListenSession.Test
        )
      )
    )
    const list = Array.from(entries)
    expect(list.map((entry) => entry.id)).toEqual(["scripted-0", "scripted-1"])
    expect(list.map((entry) => entry.channel)).toEqual(["mic", "mic"])
    expect(list[0]?.text).toBe("What should I say next?")
  })
  it("surfaces engine failures for status banners", async () => {
    const failure = new TranscriptionError({ operation: "transcribeUtterance", reason: "binary missing" })
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const session = yield* ListenSession
          return yield* Effect.flip(Stream.runCollect(session.observe(Stream.fail(failure))))
        }),
        ListenSession.Test
      )
    )
    expect(outcome._tag).toBe("TranscriptionError")
    expect(describeListenFailure(failure)).toBe("transcribeUtterance: binary missing")
  })
})

describe("ListenSession auto-answer", () => {
  it("builds an ask request keyed by the utterance", () => {
    const entry = toListenEntry(micQuestion)
    expect(toAutoAnswerRequest(entry, "listen-seg-001")).toEqual({
      question: "What should I say next?",
      requestId: "listen-seg-001"
    })
    expect(listenAnswerRequestId(entry)).toBe("listen-seg-001")
  })
  it("produces streamed replies through the provider registry", async () => {
    const events = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const session = yield* ListenSession
          return yield* Stream.runCollect(
            session.streamAutoAnswer(toListenEntry(micQuestion), "listen-seg-001")
          )
        }),
        ListenSession.Test
      )
    )
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("stays silent for statements and interim segments", async () => {
    const collected = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const session = yield* ListenSession
          const statement = yield* Stream.runCollect(
            session.streamAutoAnswer(toListenEntry(systemStatement), "listen-seg-002")
          )
          const interim = yield* Stream.runCollect(
            session.streamAutoAnswer(toListenEntry(micInterim), "listen-seg-003")
          )
          return { interim: Array.from(interim), statement: Array.from(statement) }
        }),
        ListenSession.Test
      )
    )
    expect(collected.statement).toEqual([])
    expect(collected.interim).toEqual([])
  })
  it("answers only intent entries end to end over fixture streams", async () => {
    const answers = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const session = yield* ListenSession
          return yield* Stream.runCollect(session.streamAnswers(Stream.fromIterable(fixtureInputs)))
        }),
        scriptedSessionLayer([
          { _tag: "text-delta", delta: "Lead with the conclusion." },
          { _tag: "done", finishReason: "stop" }
        ])
      )
    )
    const list = Array.from(answers)
    expect(list.map((answer) => answer.entryId)).toEqual(["seg-001", "seg-001"])
    expect(list[0]?.requestId).toBe("listen-seg-001")
    expect(list[0]?.question).toBe("What should I say next?")
    expect(list.map((answer) => answer.event)).toEqual([
      { _tag: "text-delta", delta: "Lead with the conclusion." },
      { _tag: "done", finishReason: "stop" }
    ])
  })
})
