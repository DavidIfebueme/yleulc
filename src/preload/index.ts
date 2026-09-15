import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { askCancelChannel, askEventChannel, askRequestChannel, type AskEvent } from "../shared/askIpc"
import { captureAreaChannel, captureFullscreenChannel } from "../shared/captureIpc"
import type { CropRect } from "../shared/screenshot"
import { settingsGetChannel, settingsSaveChannel } from "../shared/settingsIpc"
import { appVersionChannel, type YleulcBridge } from "../shared/yleulcBridge"

const yleulcBridge: YleulcBridge = {
  appVersion: () => ipcRenderer.invoke(appVersionChannel),
  askQuestion: (request) => ipcRenderer.invoke(askRequestChannel, request),
  cancelAsk: (requestId) => {
    ipcRenderer.send(askCancelChannel, requestId)
  },
  captureArea: (rect: CropRect) => ipcRenderer.invoke(captureAreaChannel, { rect }),
  captureFullscreen: () => ipcRenderer.invoke(captureFullscreenChannel),
  getSettings: () => ipcRenderer.invoke(settingsGetChannel),
  onAskEvent: (listener) => {
    const subscription = (_event: IpcRendererEvent, value: AskEvent): void => {
      listener(value)
    }
    ipcRenderer.on(askEventChannel, subscription)
    return () => {
      ipcRenderer.removeListener(askEventChannel, subscription)
    }
  },
  saveSettings: (snapshot) => ipcRenderer.invoke(settingsSaveChannel, snapshot)
}

contextBridge.exposeInMainWorld("yleulc", yleulcBridge)
