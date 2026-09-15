import { describe, expect, it } from "vitest"
import {
  computeDownscaledSize,
  decodeScreenshotImage,
  isScreenshotImage,
  normalizeCropRect,
  screenshotLongEdgePx,
  screenshotMimeType,
  toScreenshotDataUrl
} from "../shared/screenshot"
import { fixtureScreenshotImage } from "./ScreenshotFixtures"

describe("computeDownscaledSize", () => {
  it("keeps images within the long edge limit unchanged", () => {
    expect(computeDownscaledSize({ height: 800, width: 1200 })).toEqual({ height: 800, width: 1200 })
  })
  it("downscales a wide capture to long edge 1568", () => {
    expect(computeDownscaledSize({ height: 2000, width: 3000 })).toEqual({ height: 1045, width: 1568 })
  })
  it("downscales a tall capture to long edge 1568", () => {
    expect(computeDownscaledSize({ height: 3000, width: 1000 })).toEqual({ height: 1568, width: 523 })
  })
  it("keeps an image exactly at the limit unchanged", () => {
    expect(computeDownscaledSize({ height: screenshotLongEdgePx, width: screenshotLongEdgePx })).toEqual({
      height: screenshotLongEdgePx,
      width: screenshotLongEdgePx
    })
  })
})

describe("normalizeCropRect", () => {
  it("keeps an interior rect unchanged", () => {
    expect(normalizeCropRect({ height: 1080, width: 1920 }, { height: 400, width: 600, x: 100, y: 100 })).toEqual({
      height: 400,
      width: 600,
      x: 100,
      y: 100
    })
  })
  it("clamps an overflowing rect to image bounds", () => {
    expect(normalizeCropRect({ height: 1080, width: 1920 }, { height: 500, width: 600, x: 1700, y: 900 })).toEqual({
      height: 180,
      width: 220,
      x: 1700,
      y: 900
    })
  })
  it("clamps negative origins to zero", () => {
    expect(normalizeCropRect({ height: 1080, width: 1920 }, { height: 200, width: 200, x: -50, y: -20 })).toEqual({
      height: 200,
      width: 200,
      x: 0,
      y: 0
    })
  })
})

describe("ScreenshotImage canonical form", () => {
  it("stores raw base64 plus mime type", () => {
    expect(fixtureScreenshotImage.mimeType).toBe(screenshotMimeType)
    expect(fixtureScreenshotImage.base64).not.toContain("data:")
    expect(fixtureScreenshotImage.base64).not.toContain(";base64,")
  })
  it("round-trips through the schema", () => {
    expect(decodeScreenshotImage({ base64: fixtureScreenshotImage.base64, mimeType: screenshotMimeType })).toEqual(
      fixtureScreenshotImage
    )
  })
  it("builds a data url only at render time", () => {
    expect(toScreenshotDataUrl(fixtureScreenshotImage)).toBe(
      `data:${screenshotMimeType};base64,${fixtureScreenshotImage.base64}`
    )
  })
  it("recognizes canonical images", () => {
    expect(isScreenshotImage(fixtureScreenshotImage)).toBe(true)
    expect(isScreenshotImage({ base64: 42 })).toBe(false)
  })
})
