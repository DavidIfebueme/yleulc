import { Effect, Layer, Ref, Stream } from "effect"
import { describe, expect, it } from "vitest"
import type { AskEvent } from "../shared/askIpc"
import type { AssistRequest } from "../shared/assistIpc"
import { defaultSettingsSnapshot } from "../shared/settingsIpc"
import { AskService, makeAskService } from "./AskService"
import { runAssistRequest } from "./AskIpc"
import { AssistService } from "./AssistService"
import { CaptureService, CaptureServiceError, makeCaptureServiceTestLayer } from "./CaptureService"
import { fixtureScreenshotImage } from "./ScreenshotFixtures"
import { ProviderError, type ChatEvent, type ChatRequest, type Provider } from "./providers/Provider"
import { makeProviderRegistry } from "./providers/ProviderRegistry"

const transcript = Array.from({ length: 22 }, (_value, index) => ({
  channel: index % 2 === 0 ? ("mic" as const) : ("system" as const),
  endMs: index * 1000 + 500,
  id: `entry-${String(index)}`,
  interim: index === 21,
  language: "en",
  startMs: index * 1000,
  text: `Transcript entry ${String(index)}`
}))

const assistRequest: AssistRequest = {
  activePromptModeId: "sales",
  requestId: "assist-001",
  systemPrompt: "Prioritize coding assistance.",
  transcript
}

function providerWith(
  completeChat: (request: ChatRequest) => Stream.Stream<ChatEvent, ProviderError>
): Provider {
  return {
    completeChat,
    defaultBaseUrl: "https://api.openai.com/v1",
    displayName: "OpenAI",
    id: "openai",
    listModels: () => Effect.succeed(["gpt-4o"]),
    visionModels: ["gpt-4o"]
  }
}

function assistLayer(provider: Provider, capture = CaptureService.Test): Layer.Layer<AssistService> {
  const ask = Layer.succeed(AskService, AskService.of(makeAskService(makeProviderRegistry([provider]))))
  return AssistService.Live.pipe(Layer.provide(Layer.merge(capture, ask)))
}

describe("AssistService", () => {
  it("captures, sends bounded transcript context once, and streams into overlay state", async () => {
    let received: ChatRequest | undefined
    const provider = providerWith((request) => {
      received = request
      return Stream.fromIterable([
        { _tag: "text-delta", delta: "Say this" },
        { _tag: "text-delta", delta: " next" },
        { _tag: "done", finishReason: "stop" }
      ])
    })
    const program = Effect.gen(function* () {
      const service = yield* AssistService
      const overlayAnswer = yield* Ref.make("")
      const send = (event: AskEvent): Effect.Effect<void> =>
        event._tag === "text-delta"
          ? Ref.update(overlayAnswer, (answer) => `${answer}${event.delta}`)
          : Effect.void
      yield* runAssistRequest(assistRequest, defaultSettingsSnapshot, service, send)
      return yield* Ref.get(overlayAnswer)
    })
    const answer = await Effect.runPromise(Effect.provide(program, assistLayer(provider, makeCaptureServiceTestLayer(fixtureScreenshotImage))))
    expect(answer).toBe("Say this next")
    expect(received?.messages[0]?.text).toBe(
      "Coach the user through this sales conversation. Give concise, practical next steps they can say aloud.\n\nPrioritize coding assistance."
    )
    expect(received?.messages[1]).toMatchObject({
      images: [fixtureScreenshotImage],
      text: expect.stringContaining("[2s mic] Transcript entry 2")
    })
    expect(received?.messages[1]?.text).not.toContain("Transcript entry 0")
    expect(received?.messages[1]?.text).not.toContain("Transcript entry 21")
    expect(received?.messages[1]?.text.match(/Transcript:/g)).toHaveLength(1)
  })

  it("streams a capture failure into an overlay error event", async () => {
    const capture = Layer.succeed(
      CaptureService,
      CaptureService.of({
        captureArea: () => Effect.fail(new CaptureServiceError({ operation: "captureArea", reason: "unavailable" })),
        captureFullscreen: () => Effect.fail(new CaptureServiceError({ operation: "captureFullscreen", reason: "unavailable" }))
      })
    )
    const provider = providerWith(() => Stream.empty)
    const program = Effect.gen(function* () {
      const service = yield* AssistService
      const events = yield* Ref.make<ReadonlyArray<AskEvent>>([])
      yield* runAssistRequest(assistRequest, defaultSettingsSnapshot, service, (event) =>
        Ref.update(events, (previous) => [...previous, event])
      )
      return yield* Ref.get(events)
    })
    const events = await Effect.runPromise(Effect.provide(program, assistLayer(provider, capture)))
    expect(events).toEqual([{ _tag: "error", message: "unavailable", requestId: "assist-001" }])
  })

  it("streams a provider failure into an overlay error event", async () => {
    const provider = providerWith(() =>
      Stream.fail(new ProviderError({ kind: "network", message: "provider unavailable", providerId: "openai" }))
    )
    const program = Effect.gen(function* () {
      const service = yield* AssistService
      const events = yield* Ref.make<ReadonlyArray<AskEvent>>([])
      yield* runAssistRequest(assistRequest, defaultSettingsSnapshot, service, (event) =>
        Ref.update(events, (previous) => [...previous, event])
      )
      return yield* Ref.get(events)
    })
    const events = await Effect.runPromise(Effect.provide(program, assistLayer(provider)))
    expect(events).toEqual([{ _tag: "error", message: "provider unavailable", requestId: "assist-001" }])
  })
})
