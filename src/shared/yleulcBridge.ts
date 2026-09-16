import type { AskEvent, AskRequest } from "./askIpc"
import type { AssistRequest } from "./assistIpc"
import type { ListenEvent, ListenStartRequest } from "./listenIpc"
import type { Meeting, MeetingSummary, SaveMeetingInput } from "./meeting"
import type { MeetingIdRequest } from "./meetingIpc"
import type { CropRect, ScreenshotImage } from "./screenshot"
import type { SettingsSnapshot } from "./settingsIpc"
import type { ProtectionDashboard } from "./protectionIpc"

export const appVersionChannel = "yleulc:app-version"

export interface YleulcBridge {
  readonly appVersion: () => Promise<string>
  readonly askAssist: (request: AssistRequest) => Promise<void>
  readonly askQuestion: (request: AskRequest) => Promise<void>
  readonly cancelAsk: (requestId: string) => void
  readonly captureArea: (rect: CropRect) => Promise<ScreenshotImage>
  readonly captureFullscreen: () => Promise<ScreenshotImage>
  readonly onAskEvent: (listener: (event: AskEvent) => void) => () => void
  readonly onAssistHotkey: (listener: () => void) => () => void
  readonly startListen: (request: ListenStartRequest) => Promise<void>
  readonly stopListen: (request: ListenStartRequest) => void
  readonly onListenEvent: (listener: (event: ListenEvent) => void) => () => void
  readonly getSettings: () => Promise<SettingsSnapshot>
  readonly saveSettings: (snapshot: SettingsSnapshot) => Promise<SettingsSnapshot>
  readonly listMeetings: () => Promise<Array<MeetingSummary>>
  readonly saveMeeting: (input: SaveMeetingInput) => Promise<Meeting>
  readonly getMeeting: (request: MeetingIdRequest) => Promise<Meeting>
  readonly exportMeetingMarkdown: (request: MeetingIdRequest) => Promise<string>
  readonly deleteMeeting: (request: MeetingIdRequest) => Promise<void>
  readonly getProtectionDashboard: () => Promise<ProtectionDashboard>
  readonly relaunchProtectedApp: (id: ProtectionDashboard["apps"][number]["id"]) => Promise<ProtectionDashboard>
  readonly protectAllApps: () => Promise<ProtectionDashboard>
  readonly onProtectionUnwrapped: (listener: (app: ProtectionDashboard["apps"][number]) => void) => () => void
}
