import { BrowserWindow, shell } from "electron"
import { join } from "node:path"
import type { AppConfigShape } from "./AppConfig"

export function createOverlayWindow(config: AppConfigShape): BrowserWindow {
  const overlay = new BrowserWindow({
    width: config.overlayWidth,
    height: config.overlayHeight,
    title: config.overlayTitle,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false
    }
  })
  overlay.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: "deny" }
  })
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"]
  if (rendererUrl === undefined) {
    void overlay.loadFile(join(__dirname, "../renderer/index.html"))
  } else {
    void overlay.loadURL(rendererUrl)
  }
  return overlay
}
