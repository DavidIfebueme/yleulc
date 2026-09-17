import { Config, Context, Data, Effect, Layer, Redacted, Schema } from "effect"
import { captureSampleRateHz } from "./AudioCapture"
import type { SegmentSpan } from "./SegmentationPolicy"
import { TranscriptionError, type Utterance } from "./Transcription"
import { wrapPcmInWav } from "./WhisperBackend"

export const azureDefaultLanguage = "en-US"

export function buildAzureRecognitionUrl(region: string, language: string): string {
  const params = new URLSearchParams({
    format: "detailed",
    language
  })
  return `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?${params.toString()}`
}

export const AzureRecognitionSchema = Schema.Struct({
  DisplayText: Schema.String,
  RecognitionStatus: Schema.String
})

export type AzureRecognition = typeof AzureRecognitionSchema.Type

export class AzureError extends Data.TaggedError("AzureError")<{
  readonly operation: string
  readonly reason: string
}> {}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

const decodeRecognition = Schema.decodeUnknownEffect(AzureRecognitionSchema)

function toAzureError(operation: string) {
  return (cause: unknown): AzureError => new AzureError({ operation, reason: describeCause(cause) })
}

export interface AzureTranscribeInput {
  readonly id: string
  readonly language: string
  readonly pcm: Uint8Array
  readonly span: SegmentSpan
}

export interface AzureBackendShape {
  readonly transcribeSegment: (
    input: AzureTranscribeInput
  ) => Effect.Effect<Utterance, AzureError | TranscriptionError>
}

export class AzureBackend extends Context.Service<AzureBackend, AzureBackendShape>()("AzureBackend") {
  static readonly Live = Layer.succeed(
    AzureBackend,
    AzureBackend.of({
      transcribeSegment: (input) =>
        Effect.gen(function* () {
          const apiKey = yield* Effect.mapError(
            Config.Redacted("AZURE_SPEECH_KEY"),
            (cause) => new AzureError({ operation: "readAzureKey", reason: describeCause(cause) })
          )
          const region = yield* Effect.mapError(
            Config.String("AZURE_SPEECH_REGION"),
            (cause) => new AzureError({ operation: "readAzureConfig", reason: describeCause(cause) })
          )
          const language = yield* Effect.mapError(
            Config.withDefault(Config.String("YLEULC_AZURE_LANGUAGE"), azureDefaultLanguage),
            toAzureError("readAzureConfig")
          )
          if (Redacted.value(apiKey).trim().length === 0) {
            return yield* Effect.fail(
              new AzureError({ operation: "readAzureKey", reason: "azure speech key is empty" })
            )
          }
          if (region.trim().length === 0) {
            return yield* Effect.fail(
              new AzureError({ operation: "readAzureConfig", reason: "azure speech region is empty" })
            )
          }
          const wav = wrapPcmInWav(input.pcm, captureSampleRateHz)
          const response = yield* Effect.tryPromise({
            catch: (cause) => new AzureError({ operation: "requestRecognition", reason: describeCause(cause) }),
            try: () =>
              fetch(buildAzureRecognitionUrl(region, language), {
                body: wav,
                headers: {
                  "Content-Type": "audio/wav",
                  "Ocp-Apim-Subscription-Key": Redacted.value(apiKey)
                },
                method: "POST"
              })
          })
          if (!response.ok) {
            return yield* Effect.fail(
              new AzureError({
                operation: "requestRecognition",
                reason: `recognition request failed with status ${response.status}`
              })
            )
          }
          const json: unknown = yield* Effect.tryPromise({
            catch: (cause) => new AzureError({ operation: "parseRecognition", reason: describeCause(cause) }),
            try: () => response.json()
          })
          const recognition = yield* decodeRecognition(json).pipe(Effect.mapError(toAzureError("parseRecognition")))
          if (recognition.RecognitionStatus !== "Success") {
            return yield* Effect.fail(
              new AzureError({
                operation: "transcribeSegment",
                reason: `recognition ended with status ${recognition.RecognitionStatus}`
              })
            )
          }
          const text = recognition.DisplayText.trim()
          if (text.length === 0) {
            return yield* Effect.fail(
              new TranscriptionError({ operation: "transcribeSegment", reason: "empty transcript" })
            )
          }
          return {
            endMs: input.span.endMs,
            id: input.id,
            interim: false as const,
            language: input.language,
            startMs: input.span.startMs,
            text
          }
        })
    })
  )
  static readonly Test = Layer.succeed(
    AzureBackend,
    AzureBackend.of({
      transcribeSegment: (input) =>
        Effect.succeed({
          endMs: input.span.endMs,
          id: input.id,
          interim: false as const,
          language: input.language,
          startMs: input.span.startMs,
          text: "test utterance"
        })
    })
  )
}

export function makeAzureBackendTestLayer(
  transcribe: (input: AzureTranscribeInput) => Effect.Effect<Utterance, AzureError | TranscriptionError>
): Layer.Layer<AzureBackend> {
  return Layer.succeed(AzureBackend, AzureBackend.of({ transcribeSegment: transcribe }))
}
