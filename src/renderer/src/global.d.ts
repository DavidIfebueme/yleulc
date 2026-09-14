import type { YleulcBridge } from "../../shared/yleulcBridge"

declare global {
  interface Window {
    readonly yleulc: YleulcBridge
  }
}

export {}
