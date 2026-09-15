import { Buffer } from "node:buffer"
import { Data, Effect } from "effect"
import {
  computeDownscaledSize,
  normalizeCropRect,
  screenshotJpegQuality,
  screenshotMimeType,
  type CropRect,
  type ScreenshotImage,
  type ScreenshotSize
} from "../shared/screenshot"

export const screenshotJpegQualityPercent = Math.round(screenshotJpegQuality * 100)

export const rawCaptureBytesPerPixel = 4

export interface RawCapture {
  readonly data: Uint8Array
  readonly height: number
  readonly width: number
}

export class ImagePipelineError extends Data.TaggedError("ImagePipelineError")<{
  readonly operation: string
  readonly reason: string
}> {}

export type JpegEncoder = (
  input: RawCapture,
  target: ScreenshotSize
) => Effect.Effect<Uint8Array, ImagePipelineError>

export function cropRawCapture(raw: RawCapture, rect: CropRect): RawCapture {
  const normalized = normalizeCropRect({ height: raw.height, width: raw.width }, rect)
  if (normalized.width === 0 || normalized.height === 0) {
    return { data: new Uint8Array(0), height: 0, width: 0 }
  }
  const cropped = new Uint8Array(normalized.width * normalized.height * rawCaptureBytesPerPixel)
  for (let row = 0; row < normalized.height; row = row + 1) {
    const sourceRow = normalized.y + row
    const sourceOffset = (sourceRow * raw.width + normalized.x) * rawCaptureBytesPerPixel
    const targetOffset = row * normalized.width * rawCaptureBytesPerPixel
    const rowBytes = normalized.width * rawCaptureBytesPerPixel
    cropped.set(raw.data.subarray(sourceOffset, sourceOffset + rowBytes), targetOffset)
  }
  return { data: cropped, height: normalized.height, width: normalized.width }
}

export function jpegBytesToScreenshotImage(bytes: Uint8Array): ScreenshotImage {
  return { base64: Buffer.from(bytes).toString("base64"), mimeType: screenshotMimeType }
}

export function rawToScreenshotImage(
  raw: RawCapture,
  encodeJpeg: JpegEncoder
): Effect.Effect<ScreenshotImage, ImagePipelineError> {
  const target = computeDownscaledSize({ height: raw.height, width: raw.width })
  return Effect.map(encodeJpeg(raw, target), jpegBytesToScreenshotImage)
}

export function croppedToScreenshotImage(
  raw: RawCapture,
  rect: CropRect,
  encodeJpeg: JpegEncoder
): Effect.Effect<ScreenshotImage, ImagePipelineError> {
  return rawToScreenshotImage(cropRawCapture(raw, rect), encodeJpeg)
}

export function makeJpegEncoderTestDouble(jpegBytes: Uint8Array): JpegEncoder {
  return () => Effect.succeed(jpegBytes.slice())
}

export function makeFailingJpegEncoder(reason: string): JpegEncoder {
  return () => Effect.fail(new ImagePipelineError({ operation: "encodeJpeg", reason }))
}
