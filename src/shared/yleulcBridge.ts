import type { AskEvent, AskRequest } from "./askIpc"

export const appVersionChannel = "yleulc:app-version"

export interface YleulcBridge {
  readonly appVersion: () => Promise<string>
  readonly askQuestion: (request: AskRequest) => Promise<void>
  readonly cancelAsk: (requestId: string) => void
  readonly onAskEvent: (listener: (event: AskEvent) => void) => () => void
}
