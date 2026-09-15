import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { ollamaChatStream } from "./fixtures/ollamaChatStream"
import { ollamaTagsList } from "./fixtures/ollamaTagsList"
import {
  buildOllamaRequestBody,
  chatEventsFromOllamaNdjson,
  failingTransport,
  fixtureTransport,
  makeOllamaProvider,
  toOllamaImage,
  toOllamaMessage
} from "./OllamaChat"
import { ProviderError, type ChatImage, type ChatRequest } from "./Provider"

const chatRequest: ChatRequest = {
  maxTokens: 64,
  messages: [{ images: [], role: "user", text: "hello" }],
  model: "llama3.1",
  temperature: 0.2
}

const testProvider = (ndjsonText: string, tagsJson: string) =>
  makeOllamaProvider({
    baseUrl: "http://localhost:11434",
    curatedModels: ["llama3.1"],
    displayName: "Ollama",
    providerId: "ollama",
    transport: fixtureTransport(ndjsonText, tagsJson),
    visionModels: ["llama3.2-vision"]
  })

describe("chatEventsFromOllamaNdjson", () => {
  it("streams text deltas with usage and done from the recorded chat fixture", async () => {
    const events = await Effect.runPromise(chatEventsFromOllamaNdjson("ollama", ollamaChatStream))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("stops at done:true and ignores trailing lines", async () => {
    const ndjsonText =
      "{\"message\":{\"content\":\"kept\"},\"done\":false}\n{\"done\":true,\"done_reason\":\"stop\"}\n{not json}\n"
    const events = await Effect.runPromise(chatEventsFromOllamaNdjson("ollama", ndjsonText))
    expect(events).toEqual([
      { _tag: "text-delta", delta: "kept" },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("fails typed on an unparseable line", async () => {
    const error = await Effect.runPromise(Effect.flip(chatEventsFromOllamaNdjson("ollama", "{not json}\n")))
    expect(error._tag).toBe("ProviderError")
    expect(error.kind).toBe("parse")
    expect(error.providerId).toBe("ollama")
  })
})

describe("request body", () => {
  it("keeps the canonical image raw with no data prefix", () => {
    const image: ChatImage = { base64: "aGVsbG8=", mimeType: "image/png" }
    expect(image.base64).not.toContain("data:")
    expect(toOllamaImage(image)).toBe("aGVsbG8=")
  })
  it("sends text-only messages without an images field", () => {
    expect(toOllamaMessage({ images: [], role: "user", text: "hi" })).toEqual({
      content: "hi",
      images: undefined,
      role: "user"
    })
  })
  it("sends image messages as an images array of raw base64", () => {
    const message = toOllamaMessage({
      images: [{ base64: "aGVsbG8=", mimeType: "image/png" }],
      role: "user",
      text: "look"
    })
    expect(message).toEqual({
      content: "look",
      images: ["aGVsbG8="],
      role: "user"
    })
  })
  it("maps request options to ollama options", () => {
    expect(buildOllamaRequestBody(chatRequest)).toEqual({
      messages: [{ content: "hello", images: undefined, role: "user" }],
      model: "llama3.1",
      options: { num_predict: 64, temperature: 0.2 },
      stream: true
    })
  })
  it("omits options when no request options are set", () => {
    expect(
      buildOllamaRequestBody({ messages: [{ images: [], role: "user", text: "hi" }], model: "llama3.1" })
    ).toEqual({
      messages: [{ content: "hi", images: undefined, role: "user" }],
      model: "llama3.1",
      options: undefined,
      stream: true
    })
  })
})

describe("makeOllamaProvider", () => {
  it("streams chat events end to end from fixtures", async () => {
    const provider = testProvider(ollamaChatStream, ollamaTagsList)
    const events = await Effect.runPromise(Stream.runCollect(provider.completeChat(chatRequest)))
    expect(Array.from(events)).toEqual([
      { _tag: "text-delta", delta: "Hello" },
      { _tag: "text-delta", delta: " from the meeting" },
      {
        _tag: "usage",
        usage: { completionTokens: 3, promptTokens: 12, totalTokens: 15 }
      },
      { _tag: "done", finishReason: "stop" }
    ])
  })
  it("surfaces transport failures as typed provider errors", async () => {
    const failure = new ProviderError({ kind: "network", message: "boom", providerId: "ollama" })
    const provider = makeOllamaProvider({
      baseUrl: "http://localhost:11434",
      curatedModels: ["llama3.1"],
      displayName: "Ollama",
      providerId: "ollama",
      transport: failingTransport(failure),
      visionModels: ["llama3.2-vision"]
    })
    const error = await Effect.runPromise(Effect.flip(Stream.runCollect(provider.completeChat(chatRequest))))
    expect(error).toBe(failure)
  })
  it("discovers models from the recorded tags list", async () => {
    const provider = testProvider(ollamaChatStream, ollamaTagsList)
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["llama3.1:latest", "llama3.2-vision:latest"])
  })
  it("falls back to curated models when offline", async () => {
    const provider = makeOllamaProvider({
      baseUrl: "http://localhost:11434",
      curatedModels: ["llama3.1"],
      displayName: "Ollama",
      providerId: "ollama",
      transport: failingTransport(new ProviderError({ kind: "network", message: "boom", providerId: "ollama" })),
      visionModels: ["llama3.2-vision"]
    })
    const models = await Effect.runPromise(provider.listModels())
    expect(models).toEqual(["llama3.1"])
  })
  it("falls back to curated models on malformed or empty payloads", async () => {
    const malformed = testProvider(ollamaChatStream, "not json")
    const empty = testProvider(ollamaChatStream, "{\"models\":[]}")
    expect(await Effect.runPromise(malformed.listModels())).toEqual(["llama3.1"])
    expect(await Effect.runPromise(empty.listModels())).toEqual(["llama3.1"])
  })
})
