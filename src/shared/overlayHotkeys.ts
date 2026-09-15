import { keybindActions, normalizeKeybind } from "./keybinds"
import type { KeybindAction, KeybindMap } from "./keybinds"

export interface OverlayKeyEvent {
  readonly altKey: boolean
  readonly ctrlKey: boolean
  readonly key: string
  readonly metaKey: boolean
  readonly shiftKey: boolean
}

export function overlayHotkeyAction(keybinds: KeybindMap, event: OverlayKeyEvent): KeybindAction | undefined {
  const key = event.key === " " ? "space" : event.key.toLowerCase()
  if (["alt", "control", "meta", "shift"].includes(key)) {
    return undefined
  }
  const pressed = normalizeKeybind(
    [event.altKey ? "alt" : "", event.ctrlKey ? "ctrl" : "", event.metaKey ? "meta" : "", event.shiftKey ? "shift" : "", key]
      .filter((part) => part !== "")
      .join("+")
  )
  return keybindActions.find((action) => normalizeKeybind(keybinds[action]) === pressed)
}
