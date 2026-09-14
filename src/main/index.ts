import { app, ipcMain } from "electron"
import { Effect } from "effect"
import { appVersionChannel } from "../shared/yleulcBridge"
import { AppConfig } from "./AppConfig"
import { createOverlayWindow } from "./overlay"

const program = Effect.gen(function* () {
  yield* Effect.sync(() => {
    app.on("window-all-closed", () => {
      app.quit()
    })
  })
  yield* Effect.promise(() => app.whenReady())
  const config = yield* AppConfig
  yield* Effect.sync(() => {
    ipcMain.handle(appVersionChannel, () => app.getVersion())
  })
  yield* Effect.sync(() => {
    createOverlayWindow(config)
  })
})

const main = Effect.catch(
  Effect.provide(program, AppConfig.Live),
  (error) =>
    Effect.sync(() => {
      console.error(error)
    })
)

void Effect.runPromise(main)
