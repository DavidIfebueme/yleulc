import { app, globalShortcut, ipcMain } from "electron"
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron"
import { Effect, Fiber, Layer, Schema } from "effect"
import {
  AskRequestSchema,
  askCancelChannel,
  askEventChannel,
  askRequestChannel,
  type AskEvent
} from "../shared/askIpc"
import { AssistRequestSchema, assistHotkeyChannel, assistRequestChannel } from "../shared/assistIpc"
import { appVersionChannel } from "../shared/yleulcBridge"
import { protectionGetChannel, protectionProtectAllChannel, protectionRelaunchChannel, protectionUnwrappedChannel } from "../shared/protectionIpc"
import {
  ListenStartRequestSchema,
  listenEventChannel,
  listenStartChannel,
  listenStopChannel,
  type ListenEvent
} from "../shared/listenIpc"
import { settingsGetChannel, settingsSaveChannel, type SettingsSnapshot } from "../shared/settingsIpc"
import {
  meetingDeleteChannel,
  meetingExportChannel,
  meetingGetChannel,
  meetingSaveChannel,
  meetingsListChannel
} from "../shared/meetingIpc"
import {
  CaptureAreaRequestSchema,
  captureAreaChannel,
  captureFullscreenChannel
} from "../shared/captureIpc"
import type { ScreenshotImage } from "../shared/screenshot"
import { AppConfig } from "./AppConfig"
import { AskService, type AskServiceError } from "./AskService"
import { AssistService, type AssistServiceError } from "./AssistService"
import { applySettingsToAskRequest, runAskRequest, runAssistRequest } from "./AskIpc"
import { CaptureService } from "./CaptureService"
import { runListenLive } from "./ListenRuntime"
import { getSettings, saveSettings } from "./SettingsIpc"
import { deleteMeeting, exportMeetingMarkdown, getMeeting, listMeetings, saveMeeting } from "./MeetingIpc"
import { MeetingStore } from "./MeetingStore"
import { SettingsStore } from "./SettingsStore"
import { ProtectionService, ProtectionSystem, ProtectionTicker } from "./ProtectionService"
import { getProtectionDashboard, protectAllApps, relaunchProtectedApp } from "./ProtectionIpc"
import { WrapperRegistry } from "./WrapperRegistry"
import { createOverlayWindow } from "./overlay"
import { makeGlobalAssistHotkey } from "./GlobalAssistHotkey"

const decodeAskRequestResult = Schema.decodeUnknownResult(AskRequestSchema)

const decodeAssistRequestResult = Schema.decodeUnknownResult(AssistRequestSchema)

const decodeCaptureAreaResult = Schema.decodeUnknownResult(CaptureAreaRequestSchema)

const decodeListenStartResult = Schema.decodeUnknownResult(ListenStartRequestSchema)

const runningAsks = new Map<string, Fiber.Fiber<void, AskServiceError>>()

const runningAssists = new Map<string, Fiber.Fiber<void, AssistServiceError>>()

const runningListens = new Map<string, Fiber.Fiber<void, never>>()

const program = Effect.gen(function* () {
  yield* Effect.sync(() => {
    app.on("window-all-closed", () => {
      app.quit()
    })
  })
  yield* Effect.promise(() => app.whenReady())
  const config = yield* AppConfig
  const askService = yield* AskService
  const assistService = yield* AssistService
  const captureService = yield* CaptureService
  const settingsStore = yield* SettingsStore
  const meetingStore = yield* MeetingStore
  const protectionService = yield* ProtectionService
  let registerAssistHotkey: (settings: SettingsSnapshot) => void = () => {}
  yield* Effect.sync(() => {
    ipcMain.handle(appVersionChannel, () => app.getVersion())
  })
  yield* Effect.sync(() => {
    ipcMain.handle(settingsGetChannel, (): Promise<unknown> => Effect.runPromise(getSettings(settingsStore)))
  })
  yield* Effect.sync(() => {
    ipcMain.handle(settingsSaveChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(
        Effect.map(saveSettings(raw, settingsStore), (settings) => {
          registerAssistHotkey(settings)
          return settings
        })
      )
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(meetingsListChannel, (): Promise<unknown> => Effect.runPromise(listMeetings(meetingStore)))
  })
  yield* Effect.sync(() => {
    ipcMain.handle(assistRequestChannel, (event: IpcMainInvokeEvent, raw: unknown): Promise<void> => {
      const decoded = decodeAssistRequestResult(raw)
      if (decoded._tag === "Failure") {
        return Promise.reject(new Error("invalid assist request"))
      }
      const requestId = decoded.success.requestId
      const sender = event.sender
      const send = (askEvent: AskEvent): Effect.Effect<void> =>
        Effect.sync(() => {
          sender.send(askEventChannel, askEvent)
        })
      const task = Effect.flatMap(settingsStore.getSnapshot(), (settings) =>
        runAssistRequest(decoded.success, settings, assistService, send)
      ).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            runningAssists.delete(requestId)
          })
        )
      )
      const fiber = Effect.runFork(task)
      runningAssists.set(requestId, fiber)
      return Promise.resolve()
    })
  })
  yield* Effect.sync(() => {
    ipcMain.handle(meetingSaveChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(saveMeeting(raw, meetingStore))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(meetingGetChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(getMeeting(raw, meetingStore))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(meetingExportChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(exportMeetingMarkdown(raw, meetingStore))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(meetingDeleteChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(deleteMeeting(raw, meetingStore))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(protectionGetChannel, (): Promise<unknown> => Effect.runPromise(getProtectionDashboard(protectionService)))
  })
  yield* Effect.sync(() => {
    ipcMain.handle(protectionRelaunchChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<unknown> =>
      Effect.runPromise(relaunchProtectedApp(raw, protectionService))
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(protectionProtectAllChannel, (): Promise<unknown> => Effect.runPromise(protectAllApps(protectionService)))
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
      const task = Effect.flatMap(settingsStore.getSnapshot(), (settings) =>
        runAskRequest(applySettingsToAskRequest(decoded.success, settings), askService, send)
      ).pipe(
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
      const askFiber = runningAsks.get(requestId)
      const assistFiber = runningAssists.get(requestId)
      if (askFiber === undefined && assistFiber === undefined) {
        return
      }
      runningAsks.delete(requestId)
      runningAssists.delete(requestId)
      if (askFiber !== undefined) {
        Effect.runFork(Fiber.interrupt(askFiber))
        return
      }
      if (assistFiber !== undefined) {
        Effect.runFork(Fiber.interrupt(assistFiber))
      }
    })
  })
  yield* Effect.sync(() => {
    ipcMain.handle(captureFullscreenChannel, (): Promise<ScreenshotImage> =>
      Effect.runPromise(
        Effect.mapError(
          captureService.captureFullscreen(),
          (cause) => new Error(cause.reason)
        )
      )
    )
  })
  yield* Effect.sync(() => {
    ipcMain.handle(captureAreaChannel, (_event: IpcMainInvokeEvent, raw: unknown): Promise<ScreenshotImage> => {
      const decoded = decodeCaptureAreaResult(raw)
      if (decoded._tag === "Failure") {
        return Promise.reject(new Error("invalid capture area request"))
      }
      return Effect.runPromise(
        Effect.mapError(
          captureService.captureArea(decoded.success.rect),
          (cause) => new Error(cause.reason)
        )
      )
    })
  })
  yield* Effect.sync(() => {
    ipcMain.handle(listenStartChannel, (event: IpcMainInvokeEvent, raw: unknown): Promise<void> => {
      const decoded = decodeListenStartResult(raw)
      if (decoded._tag === "Failure") {
        return Promise.reject(new Error("invalid listen start request"))
      }
      const sessionId = decoded.success.sessionId
      if (runningListens.has(sessionId)) {
        return Promise.resolve()
      }
      const sender = event.sender
      const send = (listenEvent: ListenEvent): Effect.Effect<void> =>
        Effect.sync(() => {
          sender.send(listenEventChannel, listenEvent)
        })
      const task = runListenLive(raw, send).pipe(
        Effect.ensuring(
          Effect.sync(() => {
            runningListens.delete(sessionId)
          })
        )
      )
      const fiber = Effect.runFork(task)
      runningListens.set(sessionId, fiber)
      return Promise.resolve()
    })
  })
  yield* Effect.sync(() => {
    ipcMain.on(listenStopChannel, (_event: IpcMainEvent, raw: unknown): void => {
      const decoded = decodeListenStartResult(raw)
      if (decoded._tag === "Failure") {
        return
      }
      const fiber = runningListens.get(decoded.success.sessionId)
      if (fiber === undefined) {
        return
      }
      runningListens.delete(decoded.success.sessionId)
      Effect.runFork(Fiber.interrupt(fiber))
    })
  })
  yield* Effect.sync(() => {
    const overlay = createOverlayWindow(config)
    const stopWatcher = Effect.runSync(
      protectionService.watchUnwrapped((protectedApp) =>
        Effect.sync(() => {
          overlay.webContents.send(protectionUnwrappedChannel, protectedApp)
        })
      )
    )
    const hotkey = makeGlobalAssistHotkey(globalShortcut, () => {
      overlay.webContents.send(assistHotkeyChannel)
    })
    registerAssistHotkey = (settings) => {
      hotkey.register(settings.keybinds.assist)
    }
    Effect.runFork(
      Effect.map(settingsStore.getKeybinds(), (keybinds) => {
        hotkey.register(keybinds.assist)
      })
    )
    app.on("before-quit", () => {
      hotkey.unregister()
      stopWatcher()
    })
  })
})

const main = Effect.catch(
  Effect.provide(
    program,
    Layer.mergeAll(
      AppConfig.Live,
      AskService.Test,
      CaptureService.Live,
      AssistService.Live.pipe(Layer.provide(Layer.merge(AskService.Test, CaptureService.Live))),
      SettingsStore.Live,
      MeetingStore.Live,
      WrapperRegistry.Live,
      ProtectionSystem.Live,
      ProtectionTicker.Live,
      Layer.provide(ProtectionService.Live, Layer.mergeAll(WrapperRegistry.Live, ProtectionSystem.Live, ProtectionTicker.Live))
    )
  ),
  (error) =>
    Effect.sync(() => {
      console.error(error)
    })
)

void Effect.runPromise(main)
