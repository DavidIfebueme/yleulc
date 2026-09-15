import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { askCancelChannel, askEventChannel, askRequestChannel, type AskEvent } from "../shared/askIpc"
import { appVersionChannel, type YleulcBridge } from "../shared/yleulcBridge"

const yleulcBridge: YleulcBridge = {
  appVersion: () => ipcRenderer.invoke(appVersionChannel),
  askQuestion: (request) => ipcRenderer.invoke(askRequestChannel, request),
  cancelAsk: (requestId) => {
    ipcRenderer.send(askCancelChannel, requestId)
  },
  onAskEvent: (listener) => {
    const subscription = (_event: IpcRendererEvent, value: AskEvent): void => {
      listener(value)
    }
    ipcRenderer.on(askEventChannel, subscription)
    return () => {
      ipcRenderer.removeListener(askEventChannel, subscription)
    }
  }
}

contextBridge.exposeInMainWorld("yleulc", yleulcBridge)
