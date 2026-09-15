import { Effect, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { decodeAskRequest, type AskRequest } from "../shared/askIpc"
import { screenshotMimeType } from "../shared/screenshot"
import { makeAskService, toChatRequest } from "./AskService"
import { makeProviderRegistry } from "./providers/ProviderRegistry"
import type { ChatRequest, Provider } from "./providers/Provider"
import { fixtureScreenshotImage, fixtureScreenshotImageTwo } from "./ScreenshotFixtures"

describe("ask image attachments", () => {
  it("maps attached screenshots into the chat message in canonical form", () => {
    const request: AskRequest = {
      images: [fixtureScreenshotImage, fixtureScreenshotImageTwo],
      question: "What is on screen?",
      requestId: "ask-img-001"
    }
    expect(toChatRequest(request)).toEqual({
      messages: [
        {
          images: [
            { base64: fixtureScreenshotImage.base64, mimeType: screenshotMimeType },
            { base64: fixtureScreenshotImageTwo.base64, mimeType: screenshotMimeType }
          ],
          role: "user",
          text: "What is on screen?"
        }
      ],
      model: "gpt-4o"
    })
  })
  it("defaults to no images when unspecified", () => {
    expect(toChatRequest({ question: "hi", requestId: "ask-img-002" }).messages[0]?.images).toEqual([])
  })
  it("round-trips attached images through the ask request schema", () => {
    const request: AskRequest = {
      images: [fixtureScreenshotImage],
      question: "Describe this",
      requestId: "ask-img-003"
    }
    expect(decodeAskRequest({ ...request })).toEqual(request)
  })
  it("delivers attached images to the provider request", async () => {
    const seen: { current: ChatRequest | undefined } = { current: undefined }
    const capturing: Provider = {
      completeChat: (request) => {
        seen.current = request
        return Stream.fromIterable([{ _tag: "done", finishReason: "stop" }])
      },
      defaultBaseUrl: "https://api.openai.com/v1",
      displayName: "OpenAI",
      id: "openai",
      listModels: () => Effect.succeed(["gpt-4o"]),
      visionModels: ["gpt-4o"]
    }
    const service = makeAskService(makeProviderRegistry([capturing]))
    await Effect.runPromise(
      Stream.runCollect(
        service.streamAsk({ images: [fixtureScreenshotImage], question: "What?", requestId: "ask-img-004" })
      )
    )
    expect(seen.current?.messages[0]?.images).toEqual([
      { base64: fixtureScreenshotImage.base64, mimeType: screenshotMimeType }
    ])
  })
})
