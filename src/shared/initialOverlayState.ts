import type { SettingsMode } from "./settingsIpc"

export function initialOverlayState(defaultMode: SettingsMode): { listening: boolean; transcriptOpen: boolean } {
  return { listening: true, transcriptOpen: defaultMode === "listen" }
}
