import type { ListenEvent, ListenStartRequest } from "../../../shared/listenIpc"

export function isListenBridgeAvailable(): boolean {
  return (
    typeof window !== "undefined" && "yleulc" in window && typeof window.yleulc.startListen === "function"
  )
}

export function startListenSession(request: ListenStartRequest): Promise<void> {
  if (!isListenBridgeAvailable()) {
    return Promise.reject(new Error("listen bridge unavailable"))
  }
  return window.yleulc.startListen(request)
}

export function stopListenSession(request: ListenStartRequest): void {
  if (!isListenBridgeAvailable()) {
    return
  }
  window.yleulc.stopListen(request)
}

export function subscribeListenEvents(listener: (event: ListenEvent) => void): () => void {
  if (!isListenBridgeAvailable()) {
    return () => {}
  }
  return window.yleulc.onListenEvent(listener)
}
