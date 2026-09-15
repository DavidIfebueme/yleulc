import { overlayHotkeyAction } from "../../../shared/overlayHotkeys"
import type { KeybindMap } from "../../../shared/keybinds"

export interface OverlayHotkeyHandlers {
  readonly onGetAnswer: () => void
  readonly onSubmit: () => void
  readonly onToggleListen: () => void
  readonly onToggleTranscript: () => void
  readonly onToggleVisibility: () => void
}

export function registerOverlayHotkeys(keybinds: KeybindMap, handlers: OverlayHotkeyHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const action = overlayHotkeyAction(keybinds, event)
    if (action === undefined) {
      return
    }
    event.preventDefault()
    switch (action) {
      case "assist":
        handlers.onGetAnswer()
        return
      case "submit":
        handlers.onSubmit()
        return
      case "toggleListen":
        handlers.onToggleListen()
        return
      case "toggleTranscript":
        handlers.onToggleTranscript()
        return
      case "toggleVisibility":
        handlers.onToggleVisibility()
    }
  }
  window.addEventListener("keydown", onKeyDown)
  return () => {
    window.removeEventListener("keydown", onKeyDown)
  }
}
