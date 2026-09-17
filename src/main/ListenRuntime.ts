import { Effect, Layer } from "effect"
import type { ConfigError } from "effect/Config"
import type { ListenEvent } from "../shared/listenIpc"
import { AskService } from "./AskService"
import { AudioCapture } from "./AudioCapture"
import { DeepgramSessionFactory, DeepgramSocketFactory } from "./DeepgramBackend"
import { AssemblyaiSessionFactory, AssemblyaiSocketFactory } from "./AssemblyaiBackend"
import { ListenIpcError, runListenSession } from "./ListenIpc"
import { describeListenFailure, ListenSession } from "./ListenSession"
import { systemAudioSupport } from "./SystemAudio"
import { TranscriptionEngine, VadScorer } from "./TranscriptionEngine"
import { WhisperBackend, WhisperRunner } from "./WhisperBackend"
import { BootstrapError, WhisperBootstrap, WhisperFileSystem } from "./WhisperBootstrap"

const WhisperBackendLive = WhisperBackend.Live.pipe(
  Layer.provide(
    Layer.mergeAll(WhisperBootstrap.Live.pipe(Layer.provide(WhisperFileSystem.Live)), WhisperRunner.Live)
  )
)

const DeepgramFactoryLive = DeepgramSessionFactory.Live.pipe(Layer.provide(DeepgramSocketFactory.Live))

const AssemblyaiFactoryLive = AssemblyaiSessionFactory.Live.pipe(Layer.provide(AssemblyaiSocketFactory.Live))

const TranscriptionEngineLive = TranscriptionEngine.Live.pipe(
  Layer.provide(Layer.mergeAll(WhisperBackendLive, DeepgramFactoryLive, AssemblyaiFactoryLive, VadScorer.Live))
)

export const ListenLive = Layer.mergeAll(
  AudioCapture.Live,
  TranscriptionEngineLive,
  ListenSession.Live.pipe(Layer.provide(AskService.Test))
)

export function describeListenBootFailure(cause: ListenIpcError | BootstrapError | ConfigError): string {
  if (cause instanceof ListenIpcError) {
    return cause.message
  }
  if (cause instanceof BootstrapError) {
    return describeListenFailure(cause)
  }
  return "listen is not configured"
}

export function runListenLive(
  raw: unknown,
  send: (event: ListenEvent) => Effect.Effect<void>
): Effect.Effect<void, never> {
  const program = Effect.gen(function* () {
    const capture = yield* AudioCapture
    const engine = yield* TranscriptionEngine
    const session = yield* ListenSession
    const support = yield* systemAudioSupport
    yield* runListenSession(raw, { capture, engine, session }, send, support)
  })
  return Effect.provide(program, ListenLive).pipe(
    Effect.catch((cause) => send({ _tag: "error", message: describeListenBootFailure(cause) }))
  )
}
