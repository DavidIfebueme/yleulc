import { Buffer } from "node:buffer"
import { Context, Data, Effect, Layer } from "effect"
import {
  croppedToScreenshotImage,
  ImagePipelineError,
  rawToScreenshotImage,
  screenshotJpegQualityPercent,
  type JpegEncoder,
  type RawCapture
} from "./ImagePipeline"
import { type CropRect, type ScreenshotImage } from "../shared/screenshot"
import { fixtureScreenshotImage } from "./ScreenshotFixtures"

export class CaptureServiceError extends Data.TaggedError("CaptureServiceError")<{
  readonly operation: "captureArea" | "captureFullscreen" | "encodeJpeg"
  readonly reason: string
}> {}

export type RawCapturer = () => Effect.Effect<RawCapture, CaptureServiceError>

export interface CaptureServiceShape {
  readonly captureArea: (rect: CropRect) => Effect.Effect<ScreenshotImage, CaptureServiceError>
  readonly captureFullscreen: () => Effect.Effect<ScreenshotImage, CaptureServiceError>
}

function describeCause(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message
  }
  return String(cause)
}

function toCaptureError(operation: CaptureServiceError["operation"]) {
  return (cause: unknown): CaptureServiceError => {
    if (cause instanceof CaptureServiceError) {
      return cause
    }
    return new CaptureServiceError({ operation, reason: describeCause(cause) })
  }
}

export function makeCaptureService(input: { readonly captureRaw: RawCapturer; readonly encodeJpeg: JpegEncoder }): CaptureServiceShape {
  const captureFullscreen = (): Effect.Effect<ScreenshotImage, CaptureServiceError> =>
    Effect.flatMap(input.captureRaw(), (raw) =>
      rawToScreenshotImage(raw, input.encodeJpeg).pipe(Effect.mapError(toCaptureError("encodeJpeg")))
    ).pipe(Effect.mapError(toCaptureError("captureFullscreen")))
  const captureArea = (rect: CropRect): Effect.Effect<ScreenshotImage, CaptureServiceError> =>
    Effect.flatMap(input.captureRaw(), (raw) =>
      croppedToScreenshotImage(raw, rect, input.encodeJpeg).pipe(Effect.mapError(toCaptureError("encodeJpeg")))
    ).pipe(Effect.mapError(toCaptureError("captureArea")))
  return { captureArea, captureFullscreen }
}

const captureRawLive: RawCapturer = () =>
  Effect.tryPromise({
    catch: (cause) => new CaptureServiceError({ operation: "captureFullscreen", reason: describeCause(cause) }),
    try: () =>
      import("electron").then((electron) => {
        const displaySize = electron.screen.getPrimaryDisplay().size
        return electron.desktopCapturer
          .getSources({ thumbnailSize: displaySize, types: ["screen"] })
          .then((sources) => {
            const source = sources[0]
            if (source === undefined) {
              throw new Error("no screen source available")
            }
            const size = source.thumbnail.getSize()
            const bitmap = source.thumbnail.toBitmap()
            return { data: new Uint8Array(bitmap), height: size.height, width: size.width }
          })
      })
  })

const encodeJpegLive: JpegEncoder = (input, target) =>
  Effect.tryPromise({
    catch: (cause) => new ImagePipelineError({ operation: "encodeJpeg", reason: describeCause(cause) }),
    try: () =>
      import("electron").then((electron) => {
        const image = electron.nativeImage.createFromBitmap(Buffer.from(input.data), {
          height: input.height,
          width: input.width
        })
        const resized =
          target.height === input.height && target.width === input.width
            ? image
            : image.resize({ height: target.height, quality: "good", width: target.width })
        return new Uint8Array(resized.toJPEG(screenshotJpegQualityPercent))
      })
  })

export class CaptureService extends Context.Service<CaptureService, CaptureServiceShape>()("CaptureService") {
  static readonly Live = Layer.effect(CaptureService, Effect.sync(() => makeCaptureService({ captureRaw: captureRawLive, encodeJpeg: encodeJpegLive })))
  static readonly Test = Layer.succeed(
    CaptureService,
    CaptureService.of({
      captureArea: () => Effect.succeed(fixtureScreenshotImage),
      captureFullscreen: () => Effect.succeed(fixtureScreenshotImage)
    })
  )
}

export function makeCaptureServiceTestLayer(fullscreen: ScreenshotImage, area?: ScreenshotImage): Layer.Layer<CaptureService> {
  const areaImage = area ?? fullscreen
  return Layer.succeed(
    CaptureService,
    CaptureService.of({
      captureArea: () => Effect.succeed(areaImage),
      captureFullscreen: () => Effect.succeed(fullscreen)
    })
  )
}

export function makeCaptureServiceLayer(input: {
  readonly captureRaw: RawCapturer
  readonly encodeJpeg: JpegEncoder
}): Layer.Layer<CaptureService> {
  return Layer.succeed(CaptureService, CaptureService.of(makeCaptureService(input)))
}
