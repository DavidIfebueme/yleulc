import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { anthropicErrorStream } from "./fixtures/anthropicErrorStream"
import { anthropicModelList } from "./fixtures/anthropicModelList"
import { anthropicTextStream } from "./fixtures/anthropicTextStream"
import {
  buildAnthropicRequestBody,
  chatEventsFromAnthropicSseText,
  failingTransport,
  fixtureTransport,
  makeAnthropicProvider,
  toAnthropicImagePart,
  toAnthropicMessage
} from "./AnthropicMessages"
import { ProviderError, type ChatImage, type ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  maxTokens: 64,
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "claude-sonnet-4-20250514",
  temperature: 0.2
}

const testProvider = (sseText: string, modelsJson: string) =>
  makeAnthropicProvider({
    baseUrl: "https://api.anthropic.com/v1",
    curatedModels: ["claude-sonnet-4-20250514"],
    displayName: "Anthropic",
    providerId: "anthropic",
    transport: fixtureTransport(sseText, modelsJson),
    visionModels: ["claude-sonnet-4-20250514"]
  })

describe("chatEventsFromAnthropicSseText", () => {
  it("streams text deltas with usage and done from the recorded text fixture", async () => {
    const events = await Effect.runPromise(chatEventsFromAnthropicSseText("anthropic", anthropicTextStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 7, promptTokens: 14, totalTokens: 21 }
      },
      { _tag: "done", finishReason: "end_turn" }
    ])
  })
  it("turns a mid-stream error event into an error event and stops", async () => {
    const events = await Effect.runPromise(chatEventsFromAnthropicSseText("anthropic", anthropicErrorStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Partial" },
      { _tag: "error", message: "upstream overloaded" }
    ])
  })
  it("stops at the message_stop terminator and ignores trailing lines", async () => {
    const sseText =
      "event: content_block_delta\ndata: {\"delta\":{\"text\":\"kept\"}}\nevent: message_stop\ndata: {\"type\":\"message_stop\"}\nevent: content_block_delta\ndata: {not json}\n"
    const events = await Effect.runPromise(chatEventsFromAnthropicSseText("anthropic", sseText))
    expect(events).toEqual([{ _tag: "text-delta", delta: "kept" }])
  })
  it("fails typed on an unparseable named payload", async () => {
    const error = await Effect.runPromise(
      Effect.flip(chatEventsFromAnthropicSseText("anthropic", "event: content_block_delta\ndata: {not json}\n"))
    )
    expect(error._tag).toBe("ProviderError")
    expect(error.kind).toBe("parse")
    expect(error.providerId).toBe("anthropic")
  })
})

describe("request body", () => {
  it("keeps the canonical image raw with a typed base64 source and no data prefix", () => {
    const image: ChatImage = { base64: "aGVsbG8=", mimeType: "image/png" }
    expect(image.base64).not.toContain("data:")
    expect(toAnthropicImagePart(image)).toEqual({
      source: { data: "aGVsbG8=", media_type: "image/png", type: "base64" },
      type: "image"
    })
  })
  it("sends messages as content blocks with wire roles", () => {
    expect(toAnthropicMessage({ images: [], role: "user", text: "hi" })).toEqual({
      content: [{ text: "hi", type: "text" }],
      role: "user"
    })
  })
  it("sends image messages as text plus image blocks", () => {
    const message = toAnthropicMessage({
      images: [{ base64: "aGVsbG8=", mimeType: "image/png" }],
      role: "user",
      text: "look"
    })
    expect(message).toEqual({
      content: [
        { text: "look", type: "text" },
        { source: { data: "aGVsbG8=", media_type: "image/png", type: "base64" }, type: "image" }
      ],
      role: "user"
    })
  })
  it("lifts system messages to the top-level system field", () => {
    expect(
      buildAnthropicRequestBody({
        messages: [
          { images: [], role: "system", text: "be brief" },
          { images: [], role: "user", text: "hello" }
        ],
        model: "claude-sonnet-4-20250514"
      })
    ).toEqual({
      max_tokens: 1024,
      messages: [{ content: [{ text: "hello", type: "text" }], role: "user" }],
      model: "claude-sonnet-4-20250514",
      stream: true,
      system: "be brief",
      temperature: undefined
    })
  })
  it("streams with mapped request options", () => {
    expect(buildAnthropicRequestBody(chatRequest)).toEqual({
      max_tokens: 64,
      messages: [{ content: [{ text: "hello", type: "text" }], role: "user" }],
      model: "claude-sonnet-4-20250514",
      stream: true,
      system: undefined,
      temperature: 0.2
    })
  })
})

describe("makeAnthropicProvider", () => {
  it("streams chat events end to end from fixtures", async () => {
    const provider = testProvider(anthropicTextStream, anthropicModelList)
    const events = await Effect.runPromise(Stream.runCollect(provider.completeChat(chatRequest)))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 7, promptTokens: 14, totalTokens: 21 }
      },
      { _tag: "done", finishReason: "end_turn" }
    ])
  })
  it("surfaces transport failures as typed provider errors", async () => {
    const failure = new ProviderError({ kind: "network", message: "boom", providerId: "anthropic" })
    const provider = makeAnthropicProvider({
      baseUrl: "https://api.anthropic.com/v1",
      curatedModels: ["claude-sonnet-4-20250514"],
      displayName: "Anthropic",
      providerId: "anthropic",
      transport: failingTransport(failure),
      visionModels: ["claude-sonnet-4-20250514"]
    })
    const error = await Effect.runPromise(Effect.flip(Stream.runCollect(provider.completeChat(chatRequest))))
    expect(error).toBe(failure)
  })
  it("discovers models from the recorded model list", async () => {
    const provider = testProvider(anthropicTextStream, anthropicModelList)
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"])
  })
  it("falls back to curated models when discovery fails", async () => {
    const provider = makeAnthropicProvider({
      baseUrl: "https://api.anthropic.com/v1",
      curatedModels: ["claude-sonnet-4-20250514"],
      displayName: "Anthropic",
      providerId: "anthropic",
      transport: failingTransport(
        new ProviderError({ kind: "network", message: "boom", providerId: "anthropic" })
      ),
      visionModels: ["claude-sonnet-4-20250514"]
    })
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["claude-sonnet-4-20250514"])
  })
  it("falls back to curated models on malformed or empty payloads", async () => {
    const malformed = testProvider(anthropicTextStream, "not json")
    const empty = testProvider(anthropicTextStream, "{\"data\":[]}")
    expect(await Effect.runPromise(malformed.listModels())).toEqual(["claude-sonnet-4-20250514"])
    expect(await Effect.runPromise(empty.listModels())).toEqual(["claude-sonnet-4-20250514"])
  })
})
