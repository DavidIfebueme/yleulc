import { ConfigProvider, Effect, Layer, Stream } from "effect"
import { describe, expect, it } from "vitest"
import { AskService } from "./AskService"
import { AssistService } from "./AssistService"
import { CaptureService } from "./CaptureService"
import { Keychain } from "./Keychain"
import { ListenSession, toListenEntry, type ListenInput } from "./ListenSession"
import { makeAskServiceLive } from "./ProviderServices"

const emptyConfig = ConfigProvider.layer(ConfigProvider.fromEnvRecord({}))

const askLive = makeAskServiceLive(Keychain.Test)

const askRequest = { model: "gpt-4o", providerId: "openai" as const, question: "What should I say next?", requestId: "ask-live-1" }

const listenInput: ListenInput = {
  channel: "mic",
  segment: { endMs: 1000, id: "live-1", interim: false, language: "en", startMs: 0, text: "What should I say next?" }
}

describe("production provider services", () => {
  it("returns provider configuration errors instead of fixture answers in Ask, Assist, and Listen", async () => {
    const askError = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* AskService
            return yield* Stream.runCollect(service.streamAsk(askRequest))
          }),
          Layer.merge(askLive, emptyConfig)
        )
      )
    )
    const assistError = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const service = yield* AssistService
            return yield* Stream.runCollect(service.streamAssist(askRequest))
          }),
          Layer.merge(
            AssistService.Live.pipe(Layer.provide(Layer.merge(askLive, CaptureService.Test))),
            emptyConfig
          )
        )
      )
    )
    const listenError = await Effect.runPromise(
      Effect.flip(
        Effect.provide(
          Effect.gen(function* () {
            const session = yield* ListenSession
            return yield* Stream.runCollect(session.streamAutoAnswer(toListenEntry(listenInput), "listen-live-1", true))
          }),
          Layer.merge(ListenSession.Live.pipe(Layer.provide(askLive)), emptyConfig)
        )
      )
    )
    expect(askError.message).toBe("unknown provider openai")
    expect(assistError.message).toBe("unknown provider openai")
    expect(listenError.message).toBe("unknown provider openai")
  })
})
