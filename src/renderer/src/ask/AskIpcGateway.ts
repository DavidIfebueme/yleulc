import type { AskEvent, AskRequest } from "../../../shared/askIpc"
import type { AssistRequest } from "../../../shared/assistIpc"

export function isAskBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" && "yleulc" in window && typeof window.yleulc.askQuestion === "function"
  )
}

export function sendAskRequest(request: AskRequest): Promise<void> {
  if (!isAskBridgeAvailable()) {
    return Promise.reject(new Error("ask bridge unavailable"))
  }
  return window.yleulc.askQuestion(request)
}

export function sendAssistRequest(request: AssistRequest): Promise<void> {
  if (!isAskBridgeAvailable()) {
    return Promise.reject(new Error("assist bridge unavailable"))
  }
  return window.yleulc.askAssist(request)
}

export function cancelAskRequest(requestId: string): void {
  if (!isAskBridgeAvailable()) {
    return
  }
  window.yleulc.cancelAsk(requestId)
}

export function subscribeAskEvents(listener: (event: AskEvent) => void): () => void {
  if (!isAskBridgeAvailable()) {
    return () => {}
  }
  return window.yleulc.onAskEvent(listener)
}

export function subscribeAssistHotkey(listener: () => void): () => void {
  if (typeof window === "undefined" || !("yleulc" in window)) {
    return () => {}
  }
  return window.yleulc.onAssistHotkey(listener)
}
