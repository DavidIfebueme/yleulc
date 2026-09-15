import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { screenshotMimeType } from "../shared/screenshot"
import {
  CaptureService,
  makeCaptureService,
  makeCaptureServiceLayer,
  makeCaptureServiceTestLayer
} from "./CaptureService"
import { makeFailingJpegEncoder, makeJpegEncoderTestDouble } from "./ImagePipeline"
import { fixtureScreenshotImage, fixtureScreenshotImageTwo } from "./ScreenshotFixtures"

const fixtureRaw = { data: new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]), height: 2, width: 2 }

describe("CaptureService", () => {
  it("captures fullscreen through injected doubles in canonical form", async () => {
    const service = makeCaptureService({
      captureRaw: () => Effect.succeed(fixtureRaw),
      encodeJpeg: makeJpegEncoderTestDouble(new Uint8Array([10, 20, 30]))
    })
    const image = await Effect.runPromise(service.captureFullscreen())
    expect(image.mimeType).toBe(screenshotMimeType)
    expect(image.base64).not.toContain("data:")
  })
  it("crops area selects before encoding", async () => {
    let encodedWidth = 0
    const service = makeCaptureService({
      captureRaw: () => Effect.succeed(fixtureRaw),
      encodeJpeg: (input) => {
        encodedWidth = input.width
        return Effect.succeed(new Uint8Array([1]))
      }
    })
    await Effect.runPromise(service.captureArea({ height: 1, width: 1, x: 0, y: 0 }))
    expect(encodedWidth).toBe(1)
  })
  it("maps encoder failures to typed capture errors", async () => {
    const service = makeCaptureService({
      captureRaw: () => Effect.succeed(fixtureRaw),
      encodeJpeg: makeFailingJpegEncoder("encoder down")
    })
    const error = await Effect.runPromise(Effect.flip(service.captureFullscreen()))
    expect(error._tag).toBe("CaptureServiceError")
  })
  it("maps raw capture failures to typed capture errors", async () => {
    const { CaptureServiceError } = await import("./CaptureService")
    const service = makeCaptureService({
      captureRaw: () => Effect.fail(new CaptureServiceError({ operation: "captureFullscreen", reason: "no display" })),
      encodeJpeg: makeJpegEncoderTestDouble(new Uint8Array([1]))
    })
    const error = await Effect.runPromise(Effect.flip(service.captureArea({ height: 1, width: 1, x: 0, y: 0 })))
    expect(error._tag).toBe("CaptureServiceError")
  })
  it("resolves scripted images from the test layer", async () => {
    const program = Effect.gen(function* () {
      const service = yield* CaptureService
      const fullscreen = yield* service.captureFullscreen()
      const area = yield* service.captureArea({ height: 10, width: 10, x: 0, y: 0 })
      return { area, fullscreen }
    })
    const result = await Effect.runPromise(
      Effect.provide(program, makeCaptureServiceTestLayer(fixtureScreenshotImage, fixtureScreenshotImageTwo))
    )
    expect(result.fullscreen).toEqual(fixtureScreenshotImage)
    expect(result.area).toEqual(fixtureScreenshotImageTwo)
  })
  it("resolves the default test layer without a display", async () => {
    const program = Effect.gen(function* () {
      const service = yield* CaptureService
      return yield* service.captureFullscreen()
    })
    const image = await Effect.runPromise(Effect.provide(program, CaptureService.Test))
    expect(image).toEqual(fixtureScreenshotImage)
  })
  it("builds a layer from injected doubles", async () => {
    const program = Effect.gen(function* () {
      const service = yield* CaptureService
      return yield* service.captureFullscreen()
    })
    const image = await Effect.runPromise(
      Effect.provide(
        program,
        makeCaptureServiceLayer({
          captureRaw: () => Effect.succeed(fixtureRaw),
          encodeJpeg: makeJpegEncoderTestDouble(new Uint8Array([5, 6]))
        })
      )
    )
    expect(image.mimeType).toBe(screenshotMimeType)
  })
})
