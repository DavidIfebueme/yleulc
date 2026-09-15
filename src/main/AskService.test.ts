import { Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { collectAskText, hasAskText, toAskBullets, type AskRequest } from "../shared/askIpc"
import { AskService, makeAskService, resolveAskProviderId, toChatRequest } from "./AskService"
import { makeProviderRegistry } from "./providers/ProviderRegistry"
import { ProviderRegistry } from "./providers/ProviderRegistry"
import type { ChatEvent, Provider } from "./providers/Provider"

const askRequest: AskRequest = {
  model: "gpt-4o",
  providerId: "openai",
  question: "What should I say next?",
  requestId: "ask-001"
}

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

function scriptedLayer(events: ReadonlyArray<ChatEvent>): Layer.Layer<AskService, never, never> {
  const registry = makeProviderRegistry([scriptedProvider(events)])
  return AskService.Live.pipe(Layer.provide(Layer.succeed(ProviderRegistry, registry)))
}

describe("AskService", () => {
  it("streams a typed answer end to end against the mock provider layer", async () => {
    const program = Effect.gen(function* () {
      const service = yield* AskService
      return yield* Stream.runCollect(service.streamAsk(askRequest))
    })
    const events = await Effect.runPromise(Effect.provide(program, AskService.Test))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("maps an ask request to a single user chat message", () => {
    expect(toChatRequest(askRequest)).toEqual({
      messages: [{ images: [], role: "user", text: "What should I say next?" }],
      model: "gpt-4o"
    })
  })
  it("defaults the provider to openai when unspecified", () => {
    expect(resolveAskProviderId({ question: "hi", requestId: "ask-002" })).toBe("openai")
  })
  it("fails typed on an empty question", async () => {
    const program = Effect.gen(function* () {
      const service = yield* AskService
      return yield* Stream.runCollect(service.streamAsk({ question: "   ", requestId: "ask-empty" }))
    })
    const error = await Effect.runPromise(Effect.flip(Effect.provide(program, AskService.Test)))
    expect(error._tag).toBe("AskServiceError")
  })
  it("supports cancel by taking only the first streamed event", async () => {
    const events: ReadonlyArray<ChatEvent> = [
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ]
    const program = Effect.gen(function* () {
      const service = yield* AskService
      return yield* Stream.runCollect(service.streamAsk(askRequest).pipe(Stream.take(1)))
    })
    const taken = await Effect.runPromise(Effect.provide(program, scriptedLayer(events)))
    expect(Array.from(taken)).toEqual([{ _tag: "text-delta", delta: "Hello" }])
  })
  it("forwards a mid-stream error event and stops", async () => {
    const events: ReadonlyArray<ChatEvent> = [
      { _tag: "text-delta", delta: "Partial" },
      { _tag: "error", message: "upstream overloaded" }
    ]
    const program = Effect.gen(function* () {
      const service = yield* AskService
      return yield* Stream.runCollect(service.streamAsk(askRequest))
    })
    const collected = await Effect.runPromise(Effect.provide(program, scriptedLayer(events)))
    expect(Array.from(collected)).toEqual(events)
  })
  it("covers the empty-content case with done and no deltas", async () => {
    const events: ReadonlyArray<ChatEvent> = [{ _tag: "done", finishReason: "stop" }]
    const program = Effect.gen(function* () {
      const service = yield* AskService
      return yield* Stream.runCollect(service.streamAsk(askRequest))
    })
    const collected = await Effect.runPromise(Effect.provide(program, scriptedLayer(events)))
    const list = Array.from(collected)
    expect(list).toEqual(events)
    expect(hasAskText([])).toBe(false)
    expect(collectAskText([])).toBe("")
    expect(toAskBullets("")).toEqual([])
  })
  it("builds the service directly from a registry", async () => {
    const registry = makeProviderRegistry([
      scriptedProvider([{ _tag: "done", finishReason: "stop" }])
    ])
    const service = makeAskService(registry)
    const events = await Effect.runPromise(Stream.runCollect(service.streamAsk(askRequest)))
    expect(Array.from(events)).toEqual([{ _tag: "done", finishReason: "stop" }])
  })
})
