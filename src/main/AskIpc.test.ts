import { Effect, Ref, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { hasAskText, type AskEvent, type AskRequest } from "../shared/askIpc"
import { runAskRequest, streamAskEvents, toAskEvent } from "./AskIpc"
import { makeAskService } from "./AskService"
import { makeProviderRegistry } from "./providers/ProviderRegistry"
import { ProviderError, type ChatEvent, type Provider } from "./providers/Provider"

const askRequest: AskRequest = {
  model: "gpt-4o",
  providerId: "openai",
  question: "What should I say next?",
  requestId: "ask-007"
}

function scriptedProvider(completeChat: Provider["completeChat"]): Provider {
  return {
    completeChat,
    defaultBaseUrl: "https://api.openai.com/v1",
    displayName: "OpenAI",
    id: "openai",
    listModels: () => Effect.succeed(["gpt-4o"]),
    visionModels: ["gpt-4o"]
  }
}

function serviceWithEvents(events: ReadonlyArray<ChatEvent>) {
  const registry = makeProviderRegistry([scriptedProvider(() => Stream.fromIterable(events))])
  return makeAskService(registry)
}

describe("toAskEvent", () => {
  it("tags text deltas with the request id", () => {
    expect(toAskEvent("ask-1", { _tag: "text-delta", delta: "Hello" })).toEqual({
      _tag: "text-delta",
      delta: "Hello",
      requestId: "ask-1"
    })
  })
  it("tags usage with the request id", () => {
    expect(
      toAskEvent("ask-1", {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      })
    ).toEqual({
      _tag: "usage",
      requestId: "ask-1",
      usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
    })
  })
  it("tags done with the request id", () => {
    expect(toAskEvent("ask-1", { _tag: "done", finishReason: "stop" })).toEqual({
      _tag: "done",
      finishReason: "stop",
      requestId: "ask-1"
    })
  })
  it("tags error with the request id", () => {
    expect(toAskEvent("ask-1", { _tag: "error", message: "boom" })).toEqual({
      _tag: "error",
      message: "boom",
      requestId: "ask-1"
    })
  })
})

describe("runAskRequest", () => {
  it("validates the request and streams typed events end to end", async () => {
    const service = serviceWithEvents([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
    const program = Effect.gen(function* () {
      const sent = yield* Ref.make<ReadonlyArray<AskEvent>>([])
      const send = (event: AskEvent): Effect.Effect<void> =>
        Ref.update(sent, (previous) => [...previous, event])
      yield* runAskRequest(askRequest, service, send)
      return yield* Ref.get(sent)
    })
    const sent = await Effect.runPromise(program)
    expect(sent).toEqual([
      { _tag: "text-delta", delta: "Hello", requestId: "ask-007" },
      { _tag: "text-delta", delta: " from the meeting", requestId: "ask-007" },
      { _tag: "done", finishReason: "stop", requestId: "ask-007" }
    ])
  })
  it("rejects an invalid request without sending", async () => {
    const service = serviceWithEvents([{ _tag: "done", finishReason: "stop" }])
    const program = Effect.gen(function* () {
      const sent = yield* Ref.make<ReadonlyArray<AskEvent>>([])
      const send = (event: AskEvent): Effect.Effect<void> =>
        Ref.update(sent, (previous) => [...previous, event])
      const outcome = yield* Effect.flip(runAskRequest({ question: 42 }, service, send))
      const events = yield* Ref.get(sent)
      return { error: outcome, events }
    })
    const result = await Effect.runPromise(program)
    expect(result.error._tag).toBe("AskServiceError")
    expect(result.events).toEqual([])
  })
  it("turns a stream failure into an error event", async () => {
    const failure = new ProviderError({ kind: "network", message: "socket broke", providerId: "openai" })
    const registry = makeProviderRegistry([scriptedProvider(() => Stream.fail(failure))])
    const service = makeAskService(registry)
    const program = Effect.gen(function* () {
      const sent = yield* Ref.make<ReadonlyArray<AskEvent>>([])
      const send = (event: AskEvent): Effect.Effect<void> =>
        Ref.update(sent, (previous) => [...previous, event])
      yield* runAskRequest(askRequest, service, send)
      return yield* Ref.get(sent)
    })
    const sent = await Effect.runPromise(program)
    expect(sent).toEqual([{ _tag: "error", message: "socket broke", requestId: "ask-007" }])
  })
  it("covers the empty-content case with done only", async () => {
    const service = serviceWithEvents([{ _tag: "done", finishReason: "stop" }])
    const program = Effect.gen(function* () {
      const collected = yield* Stream.runCollect(streamAskEvents(service, askRequest))
      return Array.from(collected)
    })
    const events = await Effect.runPromise(program)
    expect(events).toEqual([{ _tag: "done", finishReason: "stop", requestId: "ask-007" }])
    expect(hasAskText(events)).toBe(false)
  })
  it("forwards a mid-stream error event", async () => {
    const service = serviceWithEvents([
      { _tag: "text-delta", delta: "Partial" },
      { _tag: "error", message: "upstream overloaded" }
    ])
    const program = Effect.gen(function* () {
      const collected = yield* Stream.runCollect(streamAskEvents(service, askRequest))
      return Array.from(collected)
    })
    const events = await Effect.runPromise(program)
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Partial", requestId: "ask-007" },
      { _tag: "error", message: "upstream overloaded", requestId: "ask-007" }
    ])
  })
})
