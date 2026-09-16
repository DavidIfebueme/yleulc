import { describe, expect, it } from "vitest"
import { isCaptureAreaRequest } from "../shared/captureIpc"
import {
  decodeScreenshotImage,
  isScreenshotImage,
  type CropRect
} from "../shared/screenshot"
import { selectionToCropRect } from "../shared/areaSelect"
import type { YleulcBridge } from "../shared/yleulcBridge"
import { fixtureScreenshotImage } from "./ScreenshotFixtures"
import {
  appendScreenshotAttachments,
  attachmentImages,
  createScreenshotAttachment
} from "../renderer/src/capture/screenshotAttachments"

const desktop = { height: 1080, width: 1920 }

function stubBridge(image: typeof fixtureScreenshotImage): Pick<YleulcBridge, "captureArea"> {
  return {
    captureArea: (rect: CropRect) =>
      isCaptureAreaRequest({ rect }) ? Promise.resolve(image) : Promise.reject(new Error("invalid rect"))
  }
}

describe("selectionToCropRect", () => {
  it("maps an interior drag to global coordinates", () => {
    expect(
      selectionToCropRect({ currentX: 310, currentY: 220, startX: 10, startY: 20 }, desktop)
    ).toEqual({ height: 200, width: 300, x: 10, y: 20 })
  })
  it("maps a reverse drag to the same rect", () => {
    expect(
      selectionToCropRect({ currentX: 10, currentY: 20, startX: 310, startY: 220 }, desktop)
    ).toEqual({ height: 200, width: 300, x: 10, y: 20 })
  })
  it("clamps an overflowing drag to window bounds", () => {
    expect(
      selectionToCropRect({ currentX: 2100, currentY: 1300, startX: 1700, startY: 900 }, desktop)
    ).toEqual({ height: 180, width: 220, x: 1700, y: 900 })
  })
  it("clamps negative origins to zero", () => {
    expect(
      selectionToCropRect({ currentX: 150, currentY: 180, startX: -50, startY: -20 }, desktop)
    ).toEqual({ height: 200, width: 200, x: 0, y: 0 })
  })
  it("rejects an empty click", () => {
    expect(selectionToCropRect({ currentX: 100, currentY: 100, startX: 100, startY: 100 }, desktop)).toBeNull()
  })
  it("rejects a sub-pixel drag", () => {
    expect(
      selectionToCropRect({ currentX: 100.4, currentY: 100, startX: 100, startY: 100 }, desktop)
    ).toBeNull()
  })
  it("rejects a drag clamped to empty outside the window", () => {
    expect(
      selectionToCropRect({ currentX: 2100, currentY: 1300, startX: 2000, startY: 1200 }, desktop)
    ).toBeNull()
  })
  it("rejects zero window bounds", () => {
    expect(
      selectionToCropRect({ currentX: 10, currentY: 10, startX: 0, startY: 0 }, { height: 0, width: 0 })
    ).toBeNull()
  })
  it("rejects non-finite coordinates", () => {
    expect(
      selectionToCropRect(
        { currentX: Number.NaN, currentY: 10, startX: 0, startY: 0 },
        desktop
      )
    ).toBeNull()
  })
})

describe("area select capture contract", () => {
  it("validates a mapped rect through the shared capture-area schema", () => {
    const rect = selectionToCropRect({ currentX: 310, currentY: 220, startX: 10, startY: 20 }, desktop)
    expect(rect).not.toBeNull()
    if (rect === null) {
      return
    }
    expect(isCaptureAreaRequest({ rect })).toBe(true)
  })
  it("rejects malformed rects without throwing", () => {
    expect(isCaptureAreaRequest({ rect: { height: 10, width: 10, x: 0 } })).toBe(false)
    expect(isCaptureAreaRequest({ rect: null })).toBe(false)
  })
  it("delivers a mapped selection to an attached image through a stubbed bridge", async () => {
    const rect = selectionToCropRect({ currentX: 310, currentY: 220, startX: 10, startY: 20 }, desktop)
    expect(rect).not.toBeNull()
    if (rect === null) {
      return
    }
    const bridge = stubBridge(fixtureScreenshotImage)
    const image = await bridge.captureArea(rect)
    expect(isScreenshotImage(image)).toBe(true)
    expect(decodeScreenshotImage(image)).toEqual(fixtureScreenshotImage)
    const attachment = createScreenshotAttachment("area-1", image)
    const attached = appendScreenshotAttachments([], [attachment])
    expect(attachmentImages(attached)).toEqual([fixtureScreenshotImage])
  })
  it("surfaces bridge failures as rejections for inline error state", async () => {
    const bridge: Pick<YleulcBridge, "captureArea"> = {
      captureArea: () => Promise.reject(new Error("capture failed"))
    }
    const rect = selectionToCropRect({ currentX: 60, currentY: 60, startX: 10, startY: 10 }, desktop)
    expect(rect).not.toBeNull()
    if (rect === null) {
      return
    }
    const failure = await bridge.captureArea(rect).then(
      () => null,
      (cause: unknown) => (cause instanceof Error ? cause.message : "unknown")
    )
    expect(failure).toBe("capture failed")
  })
  it("never forwards an empty selection to the bridge", async () => {
    let calls = 0
    const bridge: Pick<YleulcBridge, "captureArea"> = {
      captureArea: () => {
        calls = calls + 1
        return Promise.resolve(fixtureScreenshotImage)
      }
    }
    const rect = selectionToCropRect({ currentX: 50, currentY: 50, startX: 50, startY: 50 }, desktop)
    expect(rect).toBeNull()
    if (rect !== null) {
      await bridge.captureArea(rect)
    }
    expect(calls).toBe(0)
  })
})
