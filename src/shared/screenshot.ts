import { Schema } from "effect"

export const screenshotLongEdgePx = 1568

export const screenshotJpegQuality = 0.8

export const screenshotMimeType = "image/jpeg"

export const screenshotMaxAttachments = 4

export const ScreenshotImageSchema = Schema.Struct({
  base64: Schema.String,
  mimeType: Schema.String
})

export type ScreenshotImage = typeof ScreenshotImageSchema.Type

export const ScreenshotSizeSchema = Schema.Struct({
  height: Schema.Number,
  width: Schema.Number
})

export type ScreenshotSize = typeof ScreenshotSizeSchema.Type

export const CropRectSchema = Schema.Struct({
  height: Schema.Number,
  width: Schema.Number,
  x: Schema.Number,
  y: Schema.Number
})

export type CropRect = typeof CropRectSchema.Type

export const decodeScreenshotImage = Schema.decodeUnknownSync(ScreenshotImageSchema)

export const encodeScreenshotImage = Schema.encodeSync(ScreenshotImageSchema)

const decodeScreenshotResult = Schema.decodeUnknownResult(ScreenshotImageSchema)

export function isScreenshotImage(value: unknown): value is ScreenshotImage {
  return decodeScreenshotResult(value)._tag === "Success"
}

export function computeDownscaledSize(input: ScreenshotSize): ScreenshotSize {
  const longEdge = Math.max(input.width, input.height)
  if (longEdge <= screenshotLongEdgePx) {
    return { height: input.height, width: input.width }
  }
  const scale = screenshotLongEdgePx / longEdge
  const width = Math.max(1, Math.round(input.width * scale))
  const height = Math.max(1, Math.round(input.height * scale))
  return { height, width }
}

export function normalizeCropRect(image: ScreenshotSize, rect: CropRect): CropRect {
  const x = Math.min(Math.max(Math.round(rect.x), 0), image.width)
  const y = Math.min(Math.max(Math.round(rect.y), 0), image.height)
  const width = Math.min(Math.max(Math.round(rect.width), 0), image.width - x)
  const height = Math.min(Math.max(Math.round(rect.height), 0), image.height - y)
  return { height, width, x, y }
}

export function toScreenshotDataUrl(image: ScreenshotImage): string {
  return `data:${image.mimeType};base64,${image.base64}`
}
