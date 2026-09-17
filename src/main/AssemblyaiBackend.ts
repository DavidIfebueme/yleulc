import { Config, Context, Data, Effect, Layer, Queue, Redacted, Ref, Schema, Stream } from "effect"
import type { TranscriptSegment } from "./Transcription"

export const assemblyaiListenHost = "wss://streaming.assemblyai.com"
export const assemblyaiTokenUrl = "https://streaming.assemblyai.com/v3/token?expires_in_seconds=60"
export const assemblyaiTerminatePayload = "{\"type\":\"Terminate\"}"
export const assemblyaiDefaultSpeechModel = "universal-3-5-pro"
export const assemblyaiDefaultSampleRateHz = 16000

export interface AssemblyaiListenUrlInput {
  readonly sampleRateHz: number
  readonly speechModel: string
  readonly token: string
}

export function buildAssemblyaiListenUrl(input: AssemblyaiListenUrlInput): string {
  const params = new URLSearchParams({
    sample_rate: String(input.sampleRateHz),
    speech_model: input.speechModel,
    token: input.token
  })
  return `${assemblyaiListenHost}/v3/ws?${params.toString()}`
}

export const AssemblyaiEnvelopeSchema = Schema.Struct({
  type: Schema.String
})

export const AssemblyaiTurnSchema = Schema.Struct({
  end_of_turn: Schema.Boolean,
  language_code: Schema.optional(Schema.String),
  transcript: Schema.String,
  type: Schema.Literal("Turn")
})

export type AssemblyaiTurn = typeof AssemblyaiTurnSchema.Type

export const AssemblyaiTokenSchema = Schema.Struct({
  token: Schema.String
})

export class AssemblyaiError extends Data.TaggedError("AssemblyaiError")<{
  readonly operation: string
  readonly reason: string
}> {}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

export interface AssemblyaiSegmentContext {
  readonly id: string
  readonly languageFallback: string
  readonly receivedAtMs: number
}

const decodeEnvelope = Schema.decodeUnknownEffect(AssemblyaiEnvelopeSchema)

const decodeTurn = Schema.decodeUnknownEffect(AssemblyaiTurnSchema)

const decodeToken = Schema.decodeUnknownEffect(AssemblyaiTokenSchema)

function toAssemblyaiError(operation: string) {
  return (cause: unknown): AssemblyaiError => new AssemblyaiError({ operation, reason: describeCause(cause) })
}

export function assemblyaiMessageToSegment(
  message: unknown,
  context: AssemblyaiSegmentContext
): Effect.Effect<TranscriptSegment | undefined, AssemblyaiError> {
  return Effect.gen(function* () {
    const envelope = yield* decodeEnvelope(message).pipe(Effect.mapError(toAssemblyaiError("parseMessage")))
    if (envelope.type !== "Turn") {
      return undefined
    }
    const turn = yield* decodeTurn(message).pipe(Effect.mapError(toAssemblyaiError("parseMessage")))
    if (turn.transcript.trim().length === 0) {
      return undefined
    }
    return {
      endMs: context.receivedAtMs,
      id: context.id,
      interim: !turn.end_of_turn,
      language: turn.language_code ?? context.languageFallback,
      startMs: context.receivedAtMs,
      text: turn.transcript
    }
  })
}

export function mintAssemblyaiToken(
  apiKey: Redacted.Redacted<string>
): Effect.Effect<string, AssemblyaiError> {
  return Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      catch: (cause) => new AssemblyaiError({ operation: "mintToken", reason: describeCause(cause) }),
      try: () =>
        fetch(assemblyaiTokenUrl, {
          headers: { Authorization: Redacted.value(apiKey) }
        })
    })
    if (!response.ok) {
      return yield* Effect.fail(
        new AssemblyaiError({ operation: "mintToken", reason: `token request failed with status ${response.status}` })
      )
    }
    const json: unknown = yield* Effect.tryPromise({
      catch: (cause) => new AssemblyaiError({ operation: "mintToken", reason: describeCause(cause) }),
      try: () => response.json()
    })
    const decoded = yield* decodeToken(json).pipe(Effect.mapError(toAssemblyaiError("mintToken")))
    return decoded.token
  })
}

export interface AssemblyaiSocketShape {
  readonly close: Effect.Effect<void, AssemblyaiError>
  readonly events: Stream.Stream<string, AssemblyaiError>
  readonly sendAudio: (pcm: Uint8Array) => Effect.Effect<void, AssemblyaiError>
  readonly sendJson: (text: string) => Effect.Effect<void, AssemblyaiError>
}

export interface AssemblyaiSocketFactoryShape {
  readonly connect: (
    apiKey: Redacted.Redacted<string>
  ) => Effect.Effect<AssemblyaiSocketShape, AssemblyaiError>
}

function openSocket(url: string, inbound: Queue.Queue<string>): Promise<WebSocket> {
  return new Promise<WebSocket>((resolve, reject) => {
    const socket = new WebSocket(url)
    socket.binaryType = "arraybuffer"
    socket.onopen = () => {
      resolve(socket)
    }
    socket.onerror = () => {
      reject(new Error(`assemblyai websocket failed for ${assemblyaiListenHost}/v3/ws`))
    }
    socket.onmessage = (event) => {
      Effect.runFork(Queue.offer(inbound, String(event.data)))
    }
    socket.onclose = () => {
      Effect.runFork(Queue.shutdown(inbound))
    }
  })
}

export class AssemblyaiSocketFactory extends Context.Service<AssemblyaiSocketFactory, AssemblyaiSocketFactoryShape>()(
  "AssemblyaiSocketFactory"
) {
  static readonly Live = Layer.succeed(
    AssemblyaiSocketFactory,
    AssemblyaiSocketFactory.of({
      connect: (apiKey) =>
        Effect.gen(function* () {
          const token = yield* mintAssemblyaiToken(apiKey)
          const speechModel = yield* Effect.mapError(
            Config.withDefault(Config.String("YLEULC_ASSEMBLYAI_SPEECH_MODEL"), assemblyaiDefaultSpeechModel),
            toAssemblyaiError("readAssemblyaiConfig")
          )
          const sampleRateHz = yield* Effect.mapError(
            Config.withDefault(Config.Number("YLEULC_ASSEMBLYAI_SAMPLE_RATE"), assemblyaiDefaultSampleRateHz),
            toAssemblyaiError("readAssemblyaiConfig")
          )
          const inbound = yield* Queue.unbounded<string>()
          const socket = yield* Effect.tryPromise({
            catch: (cause) => new AssemblyaiError({ operation: "connect", reason: describeCause(cause) }),
            try: () => openSocket(buildAssemblyaiListenUrl({ sampleRateHz, speechModel, token }), inbound)
          })
          const sendGuarded = (operation: string, send: () => void): Effect.Effect<void, AssemblyaiError> =>
            Effect.gen(function* () {
              if (socket.readyState !== WebSocket.OPEN) {
                return yield* Effect.fail(
                  new AssemblyaiError({ operation, reason: "socket is closed" })
                )
              }
              yield* Effect.try({
                catch: (cause) => new AssemblyaiError({ operation, reason: describeCause(cause) }),
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
    AssemblyaiSocketFactory,
    AssemblyaiSocketFactory.of({
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

export interface AssemblyaiSocketHarness {
  readonly audioSent: Effect.Effect<ReadonlyArray<Uint8Array>>
  readonly closed: Effect.Effect<boolean>
  readonly jsonSent: Effect.Effect<ReadonlyArray<string>>
  readonly layer: Layer.Layer<AssemblyaiSocketFactory>
}

export function buildAssemblyaiSocketHarness(events: ReadonlyArray<string>): Effect.Effect<AssemblyaiSocketHarness> {
  return Effect.gen(function* () {
    const audio = yield* Ref.make<ReadonlyArray<Uint8Array>>([])
    const json = yield* Ref.make<ReadonlyArray<string>>([])
    const done = yield* Ref.make(false)
    return {
      audioSent: Ref.get(audio),
      closed: Ref.get(done),
      jsonSent: Ref.get(json),
      layer: Layer.succeed(
        AssemblyaiSocketFactory,
        AssemblyaiSocketFactory.of({
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

export interface AssemblyaiSessionShape {
  readonly segments: Stream.Stream<TranscriptSegment, AssemblyaiError>
  readonly sendAudio: (pcm: Uint8Array) => Effect.Effect<void, AssemblyaiError>
  readonly sendJson: (text: string) => Effect.Effect<void, AssemblyaiError>
  readonly terminate: Effect.Effect<void, AssemblyaiError>
}

export interface AssemblyaiSessionFactoryShape {
  readonly open: Effect.Effect<AssemblyaiSessionShape, AssemblyaiError>
}

export function parseAssemblyaiEvent(text: string): Effect.Effect<unknown, AssemblyaiError> {
  return Effect.try({
    catch: (cause) => new AssemblyaiError({ operation: "parseMessage", reason: describeCause(cause) }),
    try: (): unknown => JSON.parse(text) as unknown
  })
}

export class AssemblyaiSessionFactory extends Context.Service<AssemblyaiSessionFactory, AssemblyaiSessionFactoryShape>()(
  "AssemblyaiSessionFactory"
) {
  static readonly Live = Layer.effect(
    AssemblyaiSessionFactory,
    Effect.gen(function* () {
      const sockets = yield* AssemblyaiSocketFactory
      return AssemblyaiSessionFactory.of({
        open: Effect.gen(function* () {
          const apiKey = yield* Effect.mapError(
            Config.Redacted("ASSEMBLYAI_API_KEY"),
            (cause) => new AssemblyaiError({ operation: "readAssemblyaiKey", reason: describeCause(cause) })
          )
          const languageFallback = yield* Effect.mapError(
            Config.withDefault(Config.String("YLEULC_ASSEMBLYAI_LANGUAGE"), "en"),
            toAssemblyaiError("readAssemblyaiConfig")
          )
          const socket = yield* sockets.connect(apiKey)
          const sequence = yield* Ref.make(0)
          return {
            segments: socket.events.pipe(
              Stream.mapEffect((text) =>
                Effect.gen(function* () {
                  const serial = yield* Ref.getAndUpdate(sequence, (current) => current + 1)
                  const message = yield* parseAssemblyaiEvent(text)
                  return yield* assemblyaiMessageToSegment(message, {
                    id: `aa-${serial}`,
                    languageFallback,
                    receivedAtMs: Date.now()
                  })
                })
              ),
              Stream.flatMap((segment) => (segment === undefined ? Stream.empty : Stream.succeed(segment)))
            ),
            sendAudio: socket.sendAudio,
            sendJson: socket.sendJson,
            terminate: Effect.andThen(socket.sendJson(assemblyaiTerminatePayload), socket.close)
          }
        })
      })
    })
  )
  static readonly Test = Layer.succeed(
    AssemblyaiSessionFactory,
    AssemblyaiSessionFactory.of({
      open: Effect.succeed({
        segments: Stream.fromIterable<TranscriptSegment>([
          { endMs: 1200, id: "aa-test-0", interim: true, language: "en", startMs: 0, text: "hello" },
          { endMs: 2400, id: "aa-test-1", interim: false, language: "en", startMs: 0, text: "hello world" }
        ]),
        sendAudio: () => Effect.void,
        sendJson: () => Effect.void,
        terminate: Effect.void
      })
    })
  )
}

export function makeAssemblyaiSessionFactoryTestLayer(
  open: Effect.Effect<AssemblyaiSessionShape, AssemblyaiError>
): Layer.Layer<AssemblyaiSessionFactory> {
  return Layer.succeed(AssemblyaiSessionFactory, AssemblyaiSessionFactory.of({ open }))
}
