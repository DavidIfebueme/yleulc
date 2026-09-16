import { describe, expect, it } from "vitest"
import { canRebindKeybind, defaultKeybinds } from "../shared/keybinds"
import { overlayHotkeyAction } from "../shared/overlayHotkeys"

describe("overlayHotkeyAction", () => {
  it("uses persisted keybinds instead of fixed shortcuts", () => {
    const keybinds = { ...defaultKeybinds, assist: "alt+g", submit: "ctrl+shift+s" }
    expect(overlayHotkeyAction(keybinds, { altKey: true, ctrlKey: false, key: "g", metaKey: false, shiftKey: false })).toBe(
      "assist"
    )
    expect(overlayHotkeyAction(keybinds, { altKey: false, ctrlKey: true, key: "s", metaKey: false, shiftKey: true })).toBe(
      "submit"
    )
    expect(overlayHotkeyAction(keybinds, { altKey: false, ctrlKey: true, key: "Enter", metaKey: false, shiftKey: false })).toBeUndefined()
  })

  it("rejects a rebind that duplicates another action", () => {
    expect(canRebindKeybind(defaultKeybinds, "submit", defaultKeybinds.assist)).toBe(false)
    expect(canRebindKeybind(defaultKeybinds, "submit", "ctrl+shift+s")).toBe(true)
  })
})
