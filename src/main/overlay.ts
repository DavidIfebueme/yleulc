import { BrowserWindow, shell } from "electron"
import { join } from "node:path"

const overlayWidth = 420
const overlayHeight = 320
const overlayTitle = "yleulc overlay"

export function createOverlayWindow(): BrowserWindow {
  const overlay = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    title: overlayTitle,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
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
