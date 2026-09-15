import { app, ipcMain } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import { Effect, Fiber, Layer, Schema } from "effect"
import {
  AskRequestSchema,
  askCancelChannel,
  askEventChannel,
  askRequestChannel,
  type AskEvent
} from "../shared/askIpc"
import { appVersionChannel } from "../shared/yleulcBridge"
import { settingsGetChannel, settingsSaveChannel } from "../shared/settingsIpc"
import {
  CaptureAreaRequestSchema,
  captureAreaChannel,
  captureFullscreenChannel
} from "../shared/captureIpc"
import type { ScreenshotImage } from "../shared/screenshot"
import { AppConfig } from "./AppConfig"
import { AskService, type AskServiceError } from "./AskService"
import { applySettingsToAskRequest, runAskRequest } from "./AskIpc"
import { CaptureService } from "./CaptureService"
import { getSettings, saveSettings } from "./SettingsIpc"
import { SettingsStore } from "./SettingsStore"
import { createOverlayWindow } from "./overlay"

const decodeAskRequestResult = Schema.decodeUnknownResult(AskRequestSchema)

const decodeCaptureAreaResult = Schema.decodeUnknownResult(CaptureAreaRequestSchema)

const runningAsks = new Map<string, Fiber.Fiber<void, AskServiceError>>()

const program = Effect.gen(function* () {
  yield* Effect.sync(() => {
    app.on("window-all-closed", () => {
      app.quit()
    })
  })
  yield* Effect.promise(() => app.whenReady())
  const config = yield* AppConfig
  const askService = yield* AskService
  const captureService = yield* CaptureService
  const settingsStore = yield* SettingsStore
  yield* Effect.sync(() => {
    ipcMain.handle(appVersionChannel, () => app.getVersion())
  })
  yield* Effect.sync(() => {
    ipcMain.handle(settingsGetChannel, (): Promise<unknown> => Effect.runPromise(getSettings(settingsStore)))
  })
  yield* Effect.sync(() => {
    ipcMain.handle(settingsSaveChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(saveSettings(raw, settingsStore))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(askRequestChannel, (event: IpcMainInvokeEvent, raw: unknown): Promise<void> => {
      const decoded = decodeAskRequestResult(raw)
      if (decoded._tag === "Failure") {
        return Promise.reject(new Error("invalid ask request"))
      }
      const requestId = decoded.success.requestId
      const sender = event.sender
      const send = (askEvent: AskEvent): Effect.Effect<void> =>
        Effect.sync(() => {
          sender.send(askEventChannel, askEvent)
        })
      const task = Effect.flatMap(settingsStore.getSnapshot(), (settings) =>
        runAskRequest(applySettingsToAskRequest(decoded.success, settings), askService, send)
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            runningAsks.delete(requestId)
          })
        )
      )
      const fiber = Effect.runFork(task)
      runningAsks.set(requestId, fiber)
      return Promise.resolve()
    })
  })
  yield* Effect.sync(() => {
    ipcMain.on(askCancelChannel, (_event: IpcMainEvent, requestId: unknown): void => {
      if (typeof requestId !== "string") {
        return
      }
      const fiber = runningAsks.get(requestId)
      if (fiber === undefined) {
        return
      }
      runningAsks.delete(requestId)
      Effect.runFork(Fiber.interrupt(fiber))
    })
  })
  yield* Effect.sync(() => {
    ipcMain.handle(captureFullscreenChannel, (): Promise<ScreenshotImage> =>
      Effect.runPromise(
        Effect.mapError(
          captureService.captureFullscreen(),
          (cause) => new Error(cause.reason)
        )
      )
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(captureAreaChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<ScreenshotImage> => {
      const decoded = decodeCaptureAreaResult(raw)
      if (decoded._tag === "Failure") {
        return Promise.reject(new Error("invalid capture area request"))
      }
      return Effect.runPromise(
        Effect.mapError(
          captureService.captureArea(decoded.success.rect),
          (cause) => new Error(cause.reason)
        )
      )
    })
  })
  yield* Effect.sync(() => {
    createOverlayWindow(config)
  })
})

const main = Effect.catch(
  Effect.provide(program, Layer.mergeAll(AppConfig.Live, AskService.Test, CaptureService.Live, SettingsStore.Live)),
  (error) =>
    Effect.sync(() => {
      console.error(error)
    })
)

void Effect.runPromise(main)
