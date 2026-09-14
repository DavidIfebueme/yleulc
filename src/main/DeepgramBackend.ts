import { Config, Context, Data, Effect, Layer, Queue, Redacted, Ref, Schema, Stream } from "effect"
import type { TranscriptSegment } from "./Transcription"

export const deepgramListenHost = "wss://api.deepgram.com"
export const deepgramCloseStreamPayload = "{\"type\":\"CloseStream\"}"
export const deepgramFinalizePayload = "{\"type\":\"Finalize\"}"

export function buildDeepgramListenUrl(language: string): string {
  const params = new URLSearchParams({
    channels: "1",
    encoding: "linear16",
    endpointing: "300",
    interim_results: "true",
    language,
    model: "nova-3",
    sample_rate: "16000",
    smart_format: "true"
  })
  return `${deepgramListenHost}/v1/listen?${params.toString()}`
}

export const DeepgramWordSchema = Schema.Struct({
  confidence: Schema.Number,
  end: Schema.Number,
  start: Schema.Number,
  word: Schema.String
})

export type DeepgramWord = typeof DeepgramWordSchema.Type

export const DeepgramAlternativeSchema = Schema.Struct({
  confidence: Schema.Number,
  languages: Schema.optional(Schema.Array(Schema.String)),
  transcript: Schema.String,
  words: Schema.Array(DeepgramWordSchema)
})

export type DeepgramAlternative = typeof DeepgramAlternativeSchema.Type

export const DeepgramChannelSchema = Schema.Struct({
  alternatives: Schema.Array(DeepgramAlternativeSchema)
})

export const DeepgramEnvelopeSchema = Schema.Struct({
  type: Schema.String
})

export const DeepgramResultsSchema = Schema.Struct({
  channel: DeepgramChannelSchema,
  is_final: Schema.Boolean,
  speech_final: Schema.optional(Schema.Boolean),
  start: Schema.Number,
  type: Schema.Literal("Results")
})

export type DeepgramResults = typeof DeepgramResultsSchema.Type

export class DeepgramError extends Data.TaggedError("DeepgramError")<{
  readonly operation: string
  readonly reason: string
}> {}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

export interface DeepgramSegmentContext {
  readonly id: string
  readonly languageFallback: string
}

const decodeEnvelope = Schema.decodeUnknownEffect(DeepgramEnvelopeSchema)

const decodeResults = Schema.decodeUnknownEffect(DeepgramResultsSchema)

function toDeepgramError(operation: string) {
  return (cause: unknown): DeepgramError => new DeepgramError({ operation, reason: describeCause(cause) })
}

function firstAlternative(results: DeepgramResults) {
  return results.channel.alternatives[0]
}

export function deepgramMessageToSegment(
  message: unknown,
  context: DeepgramSegmentContext
): Effect.Effect<TranscriptSegment | undefined, DeepgramError> {
  return Effect.gen(function* () {
    const envelope = yield* decodeEnvelope(message).pipe(Effect.mapError(toDeepgramError("parseMessage")))
    if (envelope.type !== "Results") {
      return undefined
    }
    const results = yield* decodeResults(message).pipe(Effect.mapError(toDeepgramError("parseMessage")))
    const alternative = firstAlternative(results)
    if (alternative === undefined || alternative.transcript.trim().length === 0) {
      return undefined
    }
    const words = alternative.words
    const startSeconds = words[0]?.start ?? results.start
    const lastWord = words[words.length - 1]
    const endSeconds = lastWord?.end ?? results.start
    const languages = alternative.languages ?? []
    return {
      endMs: Math.round(endSeconds * 1000),
      id: context.id,
      interim: !results.is_final,
      language: languages[0] ?? context.languageFallback,
      startMs: Math.round(startSeconds * 1000),
      text: alternative.transcript
    }
  })
}

export interface DeepgramSocketShape {
  readonly close: Effect.Effect<void, DeepgramError>
  readonly events: Stream.Stream<string, DeepgramError>
  readonly sendAudio: (pcm: Uint8Array) => Effect.Effect<void, DeepgramError>
  readonly sendJson: (text: string) => Effect.Effect<void, DeepgramError>
}

export interface DeepgramSocketFactoryShape {
  readonly connect: (
    apiKey: Redacted.Redacted<string>
  ) => Effect.Effect<DeepgramSocketShape, DeepgramError>
}

function openSocket(url: string, apiKey: Redacted.Redacted<string>, inbound: Queue.Queue<string>): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url, ["token", Redacted.value(apiKey)])
    socket.binaryType = "arraybuffer"
    socket.onopen = () => {
      resolve(socket)
    }
    socket.onerror = () => {
      reject(new Error(`deepgram websocket failed for ${url}`))
    }
    socket.onmessage = (event) => {
      Effect.runFork(Queue.offer(inbound, String(event.data)))
    }
    socket.onclose = () => {
      Effect.runFork(Queue.shutdown(inbound))
    }
  })
}

export class DeepgramSocketFactory extends Context.Service<DeepgramSocketFactory, DeepgramSocketFactoryShape>()(
  "DeepgramSocketFactory"
) {
  static readonly Live = Layer.succeed(
    DeepgramSocketFactory,
    DeepgramSocketFactory.of({
      connect: (apiKey) =>
        Effect.gen(function* () {
          const inbound = yield* Queue.unbounded<string>()
          const language = yield* Effect.mapError(
            Config.withDefault(Config.String("YLEULC_DEEPGRAM_DEFAULT_LANGUAGE"), "en"),
            toDeepgramError("readDeepgramConfig")
          )
          const socket = yield* Effect.tryPromise({
            catch: (cause) => new DeepgramError({ operation: "connect", reason: describeCause(cause) }),
            try: () => openSocket(buildDeepgramListenUrl(language), apiKey, inbound)
          })
          const sendGuarded = (operation: string, send: () => void): Effect.Effect<void, DeepgramError> =>
            Effect.gen(function* () {
              if (socket.readyState !== WebSocket.OPEN) {
                return yield* Effect.fail(
                  new DeepgramError({ operation, reason: "socket is closed" })
                )
              }
              yield* Effect.try({
                catch: (cause) => new DeepgramError({ operation, reason: describeCause(cause) }),
                try: send
              })
            })
          return {
            close: Effect.sync(() => {
              socket.close()
            }),
            events: Stream.fromQueue(inbound),
            sendAudio: (pcm) =>
              sendGuarded("sendAudio", () => {
                socket.send(pcm)
              }),
            sendJson: (text) =>
              sendGuarded("sendJson", () => {
                socket.send(text)
              })
          }
        })
    })
  )
  static readonly Test = Layer.succeed(
    DeepgramSocketFactory,
    DeepgramSocketFactory.of({
      connect: () =>
        Effect.succeed({
          close: Effect.void,
          events: Stream.fromIterable<string>([]),
          sendAudio: () => Effect.void,
          sendJson: () => Effect.void
        })
    })
  )
}

export interface DeepgramSocketHarness {
  readonly audioSent: Effect.Effect<ReadonlyArray<Uint8Array>>
  readonly closed: Effect.Effect<boolean>
  readonly jsonSent: Effect.Effect<ReadonlyArray<string>>
  readonly layer: Layer.Layer<DeepgramSocketFactory>
}

export function buildDeepgramSocketHarness(events: ReadonlyArray<string>): Effect.Effect<DeepgramSocketHarness> {
  return Effect.gen(function* () {
    const audio = yield* Ref.make<ReadonlyArray<Uint8Array>>([])
    const json = yield* Ref.make<ReadonlyArray<string>>([])
    const done = yield* Ref.make(false)
    return {
      audioSent: Ref.get(audio),
      closed: Ref.get(done),
      jsonSent: Ref.get(json),
      layer: Layer.succeed(
        DeepgramSocketFactory,
        DeepgramSocketFactory.of({
          connect: () =>
            Effect.succeed({
              close: Ref.set(done, true).pipe(Effect.asVoid),
              events: Stream.fromIterable(events),
              sendAudio: (pcm) => Ref.update(audio, (sent) => [...sent, pcm]).pipe(Effect.asVoid),
              sendJson: (text) => Ref.update(json, (sent) => [...sent, text]).pipe(Effect.asVoid)
            })
        })
      )
    }
  })
}

export interface DeepgramSessionShape {
  readonly segments: Stream.Stream<TranscriptSegment, DeepgramError>
  readonly sendAudio: (pcm: Uint8Array) => Effect.Effect<void, DeepgramError>
  readonly sendJson: (text: string) => Effect.Effect<void, DeepgramError>
  readonly terminate: Effect.Effect<void, DeepgramError>
}

export interface DeepgramSessionFactoryShape {
  readonly open: Effect.Effect<DeepgramSessionShape, DeepgramError>
}

export function parseDeepgramEvent(text: string): Effect.Effect<unknown, DeepgramError> {
  return Effect.try({
    catch: (cause) => new DeepgramError({ operation: "parseMessage", reason: describeCause(cause) }),
    try: (): unknown => JSON.parse(text) as unknown
  })
}

export class DeepgramSessionFactory extends Context.Service<DeepgramSessionFactory, DeepgramSessionFactoryShape>()(
  "DeepgramSessionFactory"
) {
  static readonly Live = Layer.effect(
    DeepgramSessionFactory,
    Effect.gen(function* () {
      const sockets = yield* DeepgramSocketFactory
      return DeepgramSessionFactory.of({
        open: Effect.gen(function* () {
          const apiKey = yield* Effect.mapError(
            Config.Redacted("DEEPGRAM_API_KEY"),
            (cause) => new DeepgramError({ operation: "readDeepgramKey", reason: describeCause(cause) })
          )
          const languageFallback = yield* Effect.mapError(
            Config.withDefault(Config.String("YLEULC_DEEPGRAM_DEFAULT_LANGUAGE"), "en"),
            toDeepgramError("readDeepgramConfig")
          )
          const socket = yield* sockets.connect(apiKey)
          const sequence = yield* Ref.make(0)
          return {
            segments: socket.events.pipe(
              Stream.mapEffect((text) =>
                Effect.gen(function* () {
                  const serial = yield* Ref.getAndUpdate(sequence, (current) => current + 1)
                  const message = yield* parseDeepgramEvent(text)
                  return yield* deepgramMessageToSegment(message, {
                    id: `dg-${serial}`,
                    languageFallback
                  })
                })
              ),
              Stream.flatMap((segment) => (segment === undefined ? Stream.empty : Stream.succeed(segment)))
            ),
            sendAudio: socket.sendAudio,
            sendJson: socket.sendJson,
            terminate: Effect.andThen(socket.sendJson(deepgramCloseStreamPayload), socket.close)
          }
        })
      })
    })
  )
  static readonly Test = Layer.succeed(
    DeepgramSessionFactory,
    DeepgramSessionFactory.of({
      open: Effect.succeed({
        segments: Stream.fromIterable<TranscriptSegment>([
          { endMs: 1200, id: "dg-test-0", interim: true, language: "en", startMs: 0, text: "hello" },
          { endMs: 2400, id: "dg-test-1", interim: false, language: "en", startMs: 0, text: "hello world" }
        ]),
        sendAudio: () => Effect.void,
        sendJson: () => Effect.void,
        terminate: Effect.void
      })
    })
  )
}

export function makeDeepgramSessionFactoryTestLayer(
  open: Effect.Effect<DeepgramSessionShape, DeepgramError>
): Layer.Layer<DeepgramSessionFactory> {
  return Layer.succeed(DeepgramSessionFactory, DeepgramSessionFactory.of({ open }))
}
