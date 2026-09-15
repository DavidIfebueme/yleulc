import { Schema } from "effect"
import { CropRectSchema } from "./screenshot"

export const captureFullscreenChannel = "yleulc:capture-fullscreen"

export const captureAreaChannel = "yleulc:capture-area"

export const CaptureAreaRequestSchema = Schema.Struct({
  rect: CropRectSchema
})

export type CaptureAreaRequest = typeof CaptureAreaRequestSchema.Type

export const decodeCaptureAreaRequest = Schema.decodeUnknownSync(CaptureAreaRequestSchema)

const decodeCaptureAreaResult = Schema.decodeUnknownResult(CaptureAreaRequestSchema)

export function isCaptureAreaRequest(value: unknown): value is CaptureAreaRequest {
  return decodeCaptureAreaResult(value)._tag === "Success"
}
