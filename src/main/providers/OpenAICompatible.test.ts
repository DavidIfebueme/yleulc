import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { openaiErrorStream } from "./fixtures/openaiErrorStream"
import { openaiModelList } from "./fixtures/openaiModelList"
import { openaiTextStream } from "./fixtures/openaiTextStream"
import { openaiUsageStream } from "./fixtures/openaiUsageStream"
import { openrouterUsageStream } from "./fixtures/openrouterUsageStream"
import {
  buildMistralRequestBody,
  buildOpenAIRequestBody,
  chatEventsFromOpenRouterSseText,
  chatEventsFromSseText,
  failingTransport,
  fixtureTransport,
  makeOpenAICompatibleProvider,
  toMistralImagePart,
  toMistralMessage,
  toOpenAIImagePart,
  toOpenAIMessage
} from "./OpenAICompatible"
import { decodeChatEvent, decodeChatRequest, ProviderError, type ChatImage, type ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  maxTokens: 64,
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "gpt-4o",
  temperature: 0.2
}

const testProvider = (sseText: string, modelsJson: string) =>
  makeOpenAICompatibleProvider({
    baseUrl: "https://api.openai.com/v1",
    curatedModels: ["gpt-4o"],
    displayName: "OpenAI",
    providerId: "openai",
    transport: fixtureTransport(sseText, modelsJson),
    visionModels: ["gpt-4o"]
  })

describe("chatEventsFromSseText", () => {
  it("streams text deltas and done from the recorded text fixture", async () => {
    const events = await Effect.runPromise(chatEventsFromSseText("openai", openaiTextStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("emits usage frames from the recorded usage fixture", async () => {
    const events = await Effect.runPromise(chatEventsFromSseText("openai", openaiUsageStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Hi" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      }
    ])
  })
  it("turns a mid-stream error line into an error event and stops", async () => {
    const events = await Effect.runPromise(chatEventsFromSseText("openai", openaiErrorStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Partial" },
      { _tag: "error", message: "upstream overloaded" }
    ])
  })
  it("stops at the done terminator and ignores trailing lines", async () => {
    const sseText = "data: {\"choices\":[{\"delta\":{\"content\":\"kept\"}}]}\ndata: [DONE]\ndata: {not json}\n"
    const events = await Effect.runPromise(chatEventsFromSseText("openai", sseText))
    expect(events).toEqual([{ _tag: "text-delta", delta: "kept" }])
  })
  it("fails typed on an unparseable payload", async () => {
    const error = await Effect.runPromise(Effect.flip(chatEventsFromSseText("openai", "data: {not json}\n")))
    expect(error._tag).toBe("ProviderError")
    expect(error.kind).toBe("parse")
    expect(error.providerId).toBe("openai")
  })
})

describe("request body", () => {
  it("keeps the canonical image raw and adds the data prefix in the adapter", () => {
    const image: ChatImage = { base64: "aGVsbG8=", mimeType: "image/png" }
    expect(image.base64).not.toContain("data:")
    expect(toOpenAIImagePart(image)).toEqual({
      image_url: { url: "data:image/png;base64,aGVsbG8=" },
      type: "image_url"
    })
  })
  it("sends text-only messages as a plain string", () => {
    expect(toOpenAIMessage({ images: [], role: "user", text: "hi" })).toEqual({
      content: "hi",
      role: "user"
    })
  })
  it("sends image messages as text plus image parts", () => {
    const message = toOpenAIMessage({
      images: [{ base64: "aGVsbG8=", mimeType: "image/png" }],
      role: "user",
      text: "look"
    })
    expect(message).toEqual({
      content: [
        { text: "look", type: "text" },
        { image_url: { url: "data:image/png;base64,aGVsbG8=" }, type: "image_url" }
      ],
      role: "user"
    })
  })
  it("streams with usage requested and maps request options", () => {
    expect(buildOpenAIRequestBody(chatRequest)).toEqual({
      max_tokens: 64,
      messages: [{ content: "hello", role: "user" }],
      model: "gpt-4o",
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2
    })
  })
})

describe("makeOpenAICompatibleProvider", () => {
  it("streams chat events end to end from fixtures", async () => {
    const provider = testProvider(openaiUsageStream, openaiModelList)
    const events = await Effect.runPromise(Stream.runCollect(provider.completeChat(chatRequest)))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hi" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      }
    ])
  })
  it("surfaces transport failures as typed provider errors", async () => {
    const failure = new ProviderError({ kind: "network", message: "boom", providerId: "openai" })
    const provider = makeOpenAICompatibleProvider({
      baseUrl: "https://api.openai.com/v1",
      curatedModels: ["gpt-4o"],
      displayName: "OpenAI",
      providerId: "openai",
      transport: failingTransport(failure),
      visionModels: ["gpt-4o"]
    })
    const error = await Effect.runPromise(Effect.flip(Stream.runCollect(provider.completeChat(chatRequest))))
    expect(error).toBe(failure)
  })
  it("discovers models from the recorded model list", async () => {
    const provider = testProvider(openaiTextStream, openaiModelList)
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["gpt-4o", "gpt-4o-mini"])
  })
  it("falls back to curated models when discovery fails", async () => {
    const provider = makeOpenAICompatibleProvider({
      baseUrl: "https://api.openai.com/v1",
      curatedModels: ["gpt-4o"],
      displayName: "OpenAI",
      providerId: "openai",
      transport: failingTransport(new ProviderError({ kind: "network", message: "boom", providerId: "openai" })),
      visionModels: ["gpt-4o"]
    })
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["gpt-4o"])
  })
  it("falls back to curated models on malformed or empty payloads", async () => {
    const malformed = testProvider(openaiTextStream, "not json")
    const empty = testProvider(openaiTextStream, "{\"data\":[]}")
    expect(await Effect.runPromise(malformed.listModels())).toEqual(["gpt-4o"])
    expect(await Effect.runPromise(empty.listModels())).toEqual(["gpt-4o"])
  })
})

describe("provider schemas", () => {
  it("decodes a text-delta chat event", () => {
    expect(decodeChatEvent({ _tag: "text-delta", delta: "x" })).toEqual({ _tag: "text-delta", delta: "x" })
  })
  it("decodes a chat request", () => {
    expect(decodeChatRequest(chatRequest)).toEqual(chatRequest)
  })
})

describe("mistral string-form image_url", () => {
  it("encodes image parts as a plain string url", () => {
    const image: ChatImage = { base64: "aGVsbG8=", mimeType: "image/png" }
    expect(toMistralImagePart(image)).toEqual({
      image_url: "data:image/png;base64,aGVsbG8=",
      type: "image_url"
    })
  })
  it("sends text-only messages as a plain string", () => {
    expect(toMistralMessage({ images: [], role: "user", text: "hi" })).toEqual({
      content: "hi",
      role: "user"
    })
  })
  it("sends image messages with string-form image_url parts", () => {
    const message = toMistralMessage({
      images: [{ base64: "aGVsbG8=", mimeType: "image/png" }],
      role: "user",
      text: "look"
    })
    expect(message).toEqual({
      content: [
        { text: "look", type: "text" },
        { image_url: "data:image/png;base64,aGVsbG8=", type: "image_url" }
      ],
      role: "user"
    })
  })
  it("builds mistral request bodies with string-form messages", () => {
    expect(buildMistralRequestBody(chatRequest)).toEqual({
      max_tokens: 64,
      messages: [{ content: "hello", role: "user" }],
      model: "gpt-4o",
      stream: true,
      stream_options: { include_usage: true },
      temperature: 0.2
    })
  })
})

describe("openrouter usage accounting", () => {
  it("treats usage frames as accounting without a second completion", async () => {
    const events = await Effect.runPromise(chatEventsFromOpenRouterSseText("openrouter", openrouterUsageStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Hi" },
      { _tag: "done", finishReason: "stop" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      }
    ])
  })
  it("emits a single done for the standard parser on the same stream", async () => {
    const events = await Effect.runPromise(chatEventsFromSseText("openrouter", openrouterUsageStream))
    expect(events.filter((event) => event._tag === "done")).toEqual([
      { _tag: "done", finishReason: "stop" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
})
