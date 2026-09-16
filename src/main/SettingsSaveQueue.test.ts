import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot } from "../shared/settingsIpc"
import { makeSettingsDraft, makeSettingsSaveQueue } from "../shared/settingsSaveQueue"
import { canRebindKeybind } from "../shared/keybinds"

describe("SettingsSaveQueue", () => {
  it("composes rapid model then system prompt edits from the preceding acknowledged snapshot", async () => {
    let releaseFirst: (() => void) | undefined
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const saved: Array<typeof defaultSettingsSnapshot> = []
    const queue = makeSettingsSaveQueue(defaultSettingsSnapshot, async (snapshot) => {
      saved.push(snapshot)
      if (saved.length === 1) {
        await firstWrite
      }
      return snapshot
    })
    const first = queue.enqueue((snapshot) => ({
      ...snapshot,
      modesPrompts: { ...snapshot.modesPrompts, defaultModel: "gpt-4.1" }
    }))
    const second = queue.enqueue((snapshot) => ({
      ...snapshot,
      modesPrompts: { ...snapshot.modesPrompts, systemPrompt: "Use concise language." }
    }))
    releaseFirst?.()
    await Promise.all([first, second])
    expect(saved).toEqual([
      {
        ...defaultSettingsSnapshot,
        modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, defaultModel: "gpt-4.1" }
      },
      {
        ...defaultSettingsSnapshot,
        modesPrompts: {
          ...defaultSettingsSnapshot.modesPrompts,
          defaultModel: "gpt-4.1",
          systemPrompt: "Use concise language."
        }
      }
    ])
  })

  it("keeps a local save when hydration resolves after it", async () => {
    let releaseWrite: (() => void) | undefined
    const write = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    const queue = makeSettingsSaveQueue(defaultSettingsSnapshot, async (snapshot) => {
      await write
      return snapshot
    })
    const save = queue.enqueue((snapshot) => ({
      ...snapshot,
      modesPrompts: { ...snapshot.modesPrompts, activePromptModeId: "sales" }
    }))
    releaseWrite?.()
    await save
    expect(
      queue.hydrate({
        ...defaultSettingsSnapshot,
        modesPrompts: {
          ...defaultSettingsSnapshot.modesPrompts,
          activePromptModeId: "general",
          systemPrompt: "hydrated"
        }
      })
    ).toBe(false)
    expect(queue.current().modesPrompts).toMatchObject({ activePromptModeId: "sales", systemPrompt: "" })
  })

  it("keeps the acknowledged active prompt mode when a save fails", async () => {
    const queue = makeSettingsSaveQueue(defaultSettingsSnapshot, () => Promise.reject(new Error("write failed")))
    await expect(
      queue.enqueue((snapshot) => ({
        ...snapshot,
        modesPrompts: { ...snapshot.modesPrompts, activePromptModeId: "sales" }
      }))
    ).rejects.toThrow("write failed")
    expect(queue.current().modesPrompts.activePromptModeId).toBe("general")
  })

  it("keeps rapid keybind edits in its latest snapshot", () => {
    const draft = makeSettingsDraft(defaultSettingsSnapshot)
    draft.apply((snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, assist: "ctrl+shift+q" } }))
    expect(canRebindKeybind(draft.current().keybinds, "submit", "ctrl+shift+q")).toBe(false)
  })
})
