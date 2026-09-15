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
import { AppConfig } from "./AppConfig"
import { AskService, type AskServiceError } from "./AskService"
import { runAskRequest } from "./AskIpc"
import { createOverlayWindow } from "./overlay"

const decodeAskRequestResult = Schema.decodeUnknownResult(AskRequestSchema)

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
  yield* Effect.sync(() => {
    ipcMain.handle(appVersionChannel, () => app.getVersion())
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
      const task = runAskRequest(raw, askService, send).pipe(
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
    createOverlayWindow(config)
  })
})

const main = Effect.catch(
  Effect.provide(program, Layer.merge(AppConfig.Live, AskService.Test)),
  (error) =>
    Effect.sync(() => {
      console.error(error)
    })
)

void Effect.runPromise(main)
