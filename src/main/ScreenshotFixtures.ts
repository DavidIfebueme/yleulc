import { screenshotMimeType, type ScreenshotImage } from "../shared/screenshot"

export const fixtureScreenshotBase64 = "dGVzdC1zY3JlZW5zaG90LWpVTl9maXh0dXJl"

export const fixtureScreenshotImage: ScreenshotImage = {
  base64: fixtureScreenshotBase64,
  mimeType: screenshotMimeType
}

export const fixtureScreenshotImageTwo: ScreenshotImage = {
  base64: "c2Vjb25kLWZpeHR1cmUtc2NyZWVuc2hvdA",
  mimeType: screenshotMimeType
}
