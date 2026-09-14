import { contextBridge, ipcRenderer } from "electron"
import { appVersionChannel, type YleulcBridge } from "../shared/yleulcBridge"

const yleulcBridge: YleulcBridge = {
  appVersion: () => ipcRenderer.invoke(appVersionChannel)
}

contextBridge.exposeInMainWorld("yleulc", yleulcBridge)
