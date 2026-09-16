import { describe, expect, it } from "vitest"
import { makeGlobalAssistHotkey } from "./GlobalAssistHotkey"

describe("GlobalAssistHotkey", () => {
  it("rebinds the saved assist key without registering a separate shortcut", () => {
    const registered: Array<string> = []
    const unregistered: Array<string> = []
    let callback: (() => void) | undefined
    const hotkey = makeGlobalAssistHotkey(
      {
        register: (accelerator, next) => {
          registered.push(accelerator)
          callback = next
          return true
        },
        unregister: (accelerator) => {
          unregistered.push(accelerator)
        }
      },
      () => {}
    )
    expect(hotkey.register("ctrl+shift+a")).toBe(true)
    expect(hotkey.register("ctrl+shift+a")).toBe(true)
    expect(hotkey.register("alt+g")).toBe(true)
    hotkey.unregister()
    expect(registered).toEqual(["ctrl+shift+a", "alt+g"])
    expect(unregistered).toEqual(["ctrl+shift+a", "alt+g"])
    expect(callback).toBeDefined()
  })
})
