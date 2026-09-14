export const overlayToggleVisibilityKey = "ctrl+shift+space"
export const overlaySubmitKey = "ctrl+enter"

export interface OverlayHotkeyHandlers {
  readonly onToggleVisibility: () => void
  readonly onSubmit: () => void
}

export function registerOverlayHotkeys(handlers: OverlayHotkeyHandlers): () => void {
  const onKeyDown = (event: KeyboardEvent): void => {
    const pressed = event.key.toLowerCase()
    if (event.ctrlKey && event.shiftKey && pressed === " ") {
      event.preventDefault()
      handlers.onToggleVisibility()
      return
    }
    if (event.ctrlKey && !event.shiftKey && pressed === "enter") {
      event.preventDefault()
      handlers.onSubmit()
    }
  }
  window.addEventListener("keydown", onKeyDown)
  return () => {
    window.removeEventListener("keydown", onKeyDown)
  }
}
