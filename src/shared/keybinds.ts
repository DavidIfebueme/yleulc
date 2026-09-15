export const keybindActions = ["assist", "submit", "toggleListen", "toggleTranscript", "toggleVisibility"] as const

export type KeybindAction = (typeof keybindActions)[number]

export type KeybindMap = Record<KeybindAction, string>

export const defaultKeybinds: KeybindMap = {
  assist: "ctrl+shift+a",
  submit: "ctrl+enter",
  toggleListen: "ctrl+shift+l",
  toggleTranscript: "ctrl+shift+t",
  toggleVisibility: "ctrl+shift+space"
}

export function normalizeKeybind(combo: string): string {
  const parts = combo
    .toLowerCase()
    .split("+")
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map((part) => (part === " " ? "space" : part))
  return [...parts].sort().join("+")
}

export interface KeybindConflict {
  readonly actions: ReadonlyArray<KeybindAction>
  readonly combo: string
}

export function detectKeybindConflicts(keybinds: KeybindMap): ReadonlyArray<KeybindConflict> {
  const byCombo = new Map<string, Array<KeybindAction>>()
  for (const action of keybindActions) {
    const combo = normalizeKeybind(keybinds[action] ?? "")
    const existing = byCombo.get(combo)
    if (existing === undefined) {
      byCombo.set(combo, [action])
    } else {
      existing.push(action)
    }
  }
  const conflicts: Array<KeybindConflict> = []
  for (const [combo, actions] of byCombo) {
    if (actions.length > 1 && combo.length > 0) {
      conflicts.push({ actions: [...actions].sort(), combo })
    }
  }
  return [...conflicts].sort((first, second) => (first.combo < second.combo ? -1 : 1))
}

export function isKeybindConflicted(keybinds: KeybindMap, action: KeybindAction): boolean {
  const target = normalizeKeybind(keybinds[action] ?? "")
  if (target.length === 0) {
    return false
  }
  for (const other of keybindActions) {
    if (other === action) {
      continue
    }
    if (normalizeKeybind(keybinds[other] ?? "") === target) {
      return true
    }
  }
  return false
}

export function rebindKeybind(keybinds: KeybindMap, action: KeybindAction, combo: string): KeybindMap {
  return { ...keybinds, [action]: combo.trim().toLowerCase() }
}
