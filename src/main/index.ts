import { app, ipcMain } from "electron"
import { appVersionChannel } from "../shared/yleulcBridge"
import { createOverlayWindow } from "./overlay"

function registerBridgeHandlers(): void {
  ipcMain.handle(appVersionChannel, () => app.getVersion())
}

function startup(): void {
  registerBridgeHandlers()
  createOverlayWindow()
}

void app.whenReady().then(() => {
  startup()
})

app.on("window-all-closed", () => {
  app.quit()
})
