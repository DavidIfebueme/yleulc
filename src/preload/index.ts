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
import {
  protectionGetChannel,
  protectionProtectAllChannel,
  protectionRelaunchChannel,
  protectionUnwrappedChannel,
  type ProtectionApp
} from "../shared/protectionIpc"

export function makeYleulcBridge(renderer: Pick<typeof ipcRenderer, "invoke" | "on" | "removeListener" | "send">): YleulcBridge {
  return {
    appVersion: () => renderer.invoke(appVersionChannel),
    askAssist: (request) => renderer.invoke(assistRequestChannel, request),
    askQuestion: (request) => renderer.invoke(askRequestChannel, request),
    cancelAsk: (requestId) => {
      renderer.send(askCancelChannel, requestId)
    },
    captureArea: (rect: CropRect) => renderer.invoke(captureAreaChannel, { rect }),
    captureFullscreen: () => renderer.invoke(captureFullscreenChannel),
    getSettings: () => renderer.invoke(settingsGetChannel),
    onAskEvent: (listener) => {
      const subscription = (_event: IpcRendererEvent, value: AskEvent): void => {
        listener(value)
      }
      renderer.on(askEventChannel, subscription)
      return () => {
        renderer.removeListener(askEventChannel, subscription)
      }
    },
    onAssistHotkey: (listener) => {
      const subscription = (): void => listener()
      renderer.on(assistHotkeyChannel, subscription)
      return () => renderer.removeListener(assistHotkeyChannel, subscription)
    },
    saveSettings: (snapshot) => renderer.invoke(settingsSaveChannel, snapshot),
    listMeetings: () => renderer.invoke(meetingsListChannel),
    saveMeeting: (input) => renderer.invoke(meetingSaveChannel, input),
    getMeeting: (request) => renderer.invoke(meetingGetChannel, request),
    exportMeetingMarkdown: (request) => renderer.invoke(meetingExportChannel, request),
    deleteMeeting: (request) => renderer.invoke(meetingDeleteChannel, request),
    startListen: (request: ListenStartRequest) => renderer.invoke(listenStartChannel, request),
    stopListen: (request: ListenStartRequest) => {
      renderer.send(listenStopChannel, request)
    },
    onListenEvent: (listener) => {
      const subscription = (_event: IpcRendererEvent, value: ListenEvent): void => {
        listener(value)
      }
      renderer.on(listenEventChannel, subscription)
      return () => {
        renderer.removeListener(listenEventChannel, subscription)
      }
    },
    getProtectionDashboard: () => renderer.invoke(protectionGetChannel),
    relaunchProtectedApp: (id) => renderer.invoke(protectionRelaunchChannel, { id }),
    protectAllApps: () => renderer.invoke(protectionProtectAllChannel),
    onProtectionUnwrapped: (listener) => {
      const subscription = (_event: IpcRendererEvent, value: ProtectionApp): void => listener(value)
      renderer.on(protectionUnwrappedChannel, subscription)
      return () => renderer.removeListener(protectionUnwrappedChannel, subscription)
    }
  }
}

const yleulcBridge = makeYleulcBridge(ipcRenderer)

if (process.type === "renderer") {
  contextBridge.exposeInMainWorld("yleulc", yleulcBridge)
}
