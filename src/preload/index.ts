import { contextBridge, ipcRenderer } from "electron"
import type { IpcRendererEvent } from "electron"
import { askCancelChannel, askEventChannel, askRequestChannel, type AskEvent } from "../shared/askIpc"
import { assistHotkeyChannel, assistRequestChannel } from "../shared/assistIpc"
import { captureAreaChannel, captureFullscreenChannel } from "../shared/captureIpc"
import {
  listenEventChannel,
  listenStartChannel,
  listenStopChannel,
  type ListenEvent,
  type ListenStartRequest
} from "../shared/listenIpc"
import type { CropRect } from "../shared/screenshot"
import {
  meetingDeleteChannel,
  meetingExportChannel,
  meetingGetChannel,
  meetingSaveChannel,
  meetingsListChannel
} from "../shared/meetingIpc"
import { settingsGetChannel, settingsSaveChannel } from "../shared/settingsIpc"
import { appVersionChannel, type YleulcBridge } from "../shared/yleulcBridge"

const yleulcBridge: YleulcBridge = {
  appVersion: () => ipcRenderer.invoke(appVersionChannel),
  askAssist: (request) => ipcRenderer.invoke(assistRequestChannel, request),
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
  onAssistHotkey: (listener) => {
    const subscription = (): void => {
      listener()
    }
    ipcRenderer.on(assistHotkeyChannel, subscription)
    return () => {
      ipcRenderer.removeListener(assistHotkeyChannel, subscription)
    }
  },
  saveSettings: (snapshot) => ipcRenderer.invoke(settingsSaveChannel, snapshot),
  listMeetings: () => ipcRenderer.invoke(meetingsListChannel),
  saveMeeting: (input) => ipcRenderer.invoke(meetingSaveChannel, input),
  getMeeting: (request) => ipcRenderer.invoke(meetingGetChannel, request),
  exportMeetingMarkdown: (request) => ipcRenderer.invoke(meetingExportChannel, request),
  deleteMeeting: (request) => ipcRenderer.invoke(meetingDeleteChannel, request),
  startListen: (request: ListenStartRequest) => ipcRenderer.invoke(listenStartChannel, request),
  stopListen: (request: ListenStartRequest) => {
    ipcRenderer.send(listenStopChannel, request)
  },
  onListenEvent: (listener) => {
    const subscription = (_event: IpcRendererEvent, value: ListenEvent): void => {
      listener(value)
    }
    ipcRenderer.on(listenEventChannel, subscription)
    return () => {
      ipcRenderer.removeListener(listenEventChannel, subscription)
    }
  }
}

contextBridge.exposeInMainWorld("yleulc", yleulcBridge)
