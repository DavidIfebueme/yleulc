import type { SettingsMode } from "./settingsIpc"

export function initialOverlayState(defaultMode: SettingsMode): { transcriptOpen: boolean } {
  return { transcriptOpen: defaultMode === "listen" }
}
