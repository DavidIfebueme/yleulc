import type { AskEvent, AskRequest } from "./askIpc"
import type { CropRect, ScreenshotImage } from "./screenshot"
import type { SettingsSnapshot } from "./settingsIpc"

export const appVersionChannel = "yleulc:app-version"

export interface YleulcBridge {
  readonly appVersion: () => Promise<string>
  readonly askQuestion: (request: AskRequest) => Promise<void>
  readonly cancelAsk: (requestId: string) => void
  readonly captureArea: (rect: CropRect) => Promise<ScreenshotImage>
  readonly captureFullscreen: () => Promise<ScreenshotImage>
  readonly onAskEvent: (listener: (event: AskEvent) => void) => () => void
  readonly getSettings: () => Promise<SettingsSnapshot>
  readonly saveSettings: (snapshot: SettingsSnapshot) => Promise<SettingsSnapshot>
}
