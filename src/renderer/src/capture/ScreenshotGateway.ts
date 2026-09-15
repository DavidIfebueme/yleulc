import type { CropRect, ScreenshotImage } from "../../../shared/screenshot"

export function isScreenshotBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "yleulc" in window &&
    typeof window.yleulc.captureFullscreen === "function"
  )
}

export function requestFullscreenCapture(): Promise<ScreenshotImage> {
  if (!isScreenshotBridgeAvailable()) {
    return Promise.reject(new Error("screenshot bridge unavailable"))
  }
  return window.yleulc.captureFullscreen()
}

export function requestAreaCapture(rect: CropRect): Promise<ScreenshotImage> {
  if (!isScreenshotBridgeAvailable()) {
    return Promise.reject(new Error("screenshot bridge unavailable"))
  }
  return window.yleulc.captureArea(rect)
}
