import { describe, expect, it } from "vitest"
import {
  captureAreaChannel,
  CaptureAreaRequestSchema,
  captureFullscreenChannel,
  decodeCaptureAreaRequest,
  isCaptureAreaRequest
} from "../shared/captureIpc"
import { Schema } from "effect"

const decodeAreaResult = Schema.decodeUnknownResult(CaptureAreaRequestSchema)

describe("capture ipc contract", () => {
  it("uses stable channels", () => {
    expect(captureFullscreenChannel).toBe("yleulc:capture-fullscreen")
    expect(captureAreaChannel).toBe("yleulc:capture-area")
  })
  it("decodes a valid area request", () => {
    expect(decodeCaptureAreaRequest({ rect: { height: 200, width: 300, x: 10, y: 20 } })).toEqual({
      rect: { height: 200, width: 300, x: 10, y: 20 }
    })
  })
  it("rejects an invalid area request without throwing", () => {
    expect(decodeAreaResult({ rect: { height: "tall", width: 300, x: 0, y: 0 } })._tag).toBe("Failure")
    expect(isCaptureAreaRequest({ rect: null })).toBe(false)
    expect(isCaptureAreaRequest({ rect: { height: 10, width: 10, x: 0, y: 0 } })).toBe(true)
  })
})
