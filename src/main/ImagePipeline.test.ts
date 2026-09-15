import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { screenshotMimeType } from "../shared/screenshot"
import {
  croppedToScreenshotImage,
  cropRawCapture,
  jpegBytesToScreenshotImage,
  makeFailingJpegEncoder,
  makeJpegEncoderTestDouble,
  rawToScreenshotImage,
  type RawCapture
} from "./ImagePipeline"

function makeStripedRaw(width: number, height: number): RawCapture {
  const data = new Uint8Array(width * height * 4)
  for (let index = 0; index < data.length; index = index + 1) {
    data[index] = index % 256
  }
  return { data, height, width }
}

describe("cropRawCapture", () => {
  it("copies the selected rgba rows", () => {
    const raw = makeStripedRaw(4, 2)
    const cropped = cropRawCapture(raw, { height: 1, width: 2, x: 1, y: 0 })
    expect(cropped.width).toBe(2)
    expect(cropped.height).toBe(1)
    expect(Array.from(cropped.data)).toEqual(Array.from(raw.data.subarray(4, 12)))
  })
  it("clamps an overflowing rect to bounds", () => {
    const raw = makeStripedRaw(4, 2)
    const cropped = cropRawCapture(raw, { height: 10, width: 10, x: 3, y: 1 })
    expect(cropped.width).toBe(1)
    expect(cropped.height).toBe(1)
    expect(cropped.data.length).toBe(4)
  })
  it("returns empty pixels for a zero-area rect", () => {
    const raw = makeStripedRaw(4, 2)
    const cropped = cropRawCapture(raw, { height: 0, width: 0, x: 1, y: 1 })
    expect(cropped.data.length).toBe(0)
  })
})

describe("rawToScreenshotImage", () => {
  it("requests the downscaled long edge from the encoder", async () => {
    const raw = makeStripedRaw(3000, 2000)
    let observed: { height: number; width: number } | undefined = undefined
    const encoder = (_input: RawCapture, target: { height: number; width: number }) => {
      observed = target
      return Effect.succeed(new Uint8Array([7, 8, 9]))
    }
    const image = await Effect.runPromise(rawToScreenshotImage(raw, encoder))
    expect(observed).toEqual({ height: 1045, width: 1568 })
    expect(image.mimeType).toBe(screenshotMimeType)
    expect(image.base64).not.toContain("data:")
  })
  it("keeps small captures at native size", async () => {
    const raw = makeStripedRaw(320, 200)
    let observed: { height: number; width: number } | undefined = undefined
    const encoder = (_input: RawCapture, target: { height: number; width: number }) => {
      observed = target
      return Effect.succeed(new Uint8Array([1]))
    }
    await Effect.runPromise(rawToScreenshotImage(raw, encoder))
    expect(observed).toEqual({ height: 200, width: 320 })
  })
  it("emits canonical raw base64 jpeg form via the test double", async () => {
    const raw = makeStripedRaw(8, 6)
    const image = await Effect.runPromise(rawToScreenshotImage(raw, makeJpegEncoderTestDouble(new Uint8Array([1, 2, 3]))))
    expect(image).toEqual(jpegBytesToScreenshotImage(new Uint8Array([1, 2, 3])))
    expect(image.mimeType).toBe(screenshotMimeType)
  })
  it("crops before encoding for area selects", async () => {
    const raw = makeStripedRaw(8, 6)
    const image = await Effect.runPromise(
      croppedToScreenshotImage(raw, { height: 2, width: 4, x: 0, y: 0 }, makeJpegEncoderTestDouble(new Uint8Array([9])))
    )
    expect(image.mimeType).toBe(screenshotMimeType)
  })
  it("propagates encoder failures typed", async () => {
    const raw = makeStripedRaw(8, 6)
    const error = await Effect.runPromise(Effect.flip(rawToScreenshotImage(raw, makeFailingJpegEncoder("no encoder"))))
    expect(error._tag).toBe("ImagePipelineError")
  })
})
