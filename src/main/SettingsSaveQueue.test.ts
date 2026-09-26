import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot } from "../shared/settingsIpc"
import {
  describeSettingsSaveFailure,
  makeSettingsDraft,
  makeSettingsSaveQueue
} from "../shared/settingsSaveQueue"
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

  it("persists selector values captured before the released event", async () => {
    const released: { currentTarget: { value: string } | null } = {
      currentTarget: { value: "openrouter/free" }
    }
    const capturedModel = released.currentTarget?.value ?? ""
    const capturedProvider = released.currentTarget?.value === "openrouter/free" ? "openrouter" : "openai"
    const capturedMode = "ask"
    released.currentTarget = null
    const queue = makeSettingsSaveQueue(defaultSettingsSnapshot, async (snapshot) => snapshot)
    const saved = await queue.enqueue((snapshot) => ({
      ...snapshot,
      modesPrompts: {
        ...snapshot.modesPrompts,
        defaultMode: capturedMode,
        defaultModel: capturedModel,
        defaultProviderId: capturedProvider
      }
    }))
    expect(saved.modesPrompts.defaultModel).toBe("openrouter/free")
    expect(saved.modesPrompts.defaultProviderId).toBe("openrouter")
    expect(saved.modesPrompts.defaultMode).toBe("ask")
    expect(queue.current().modesPrompts.defaultModel).toBe("openrouter/free")
  })

  it("rejects queued updates that read the released event", async () => {
    const released: { currentTarget: { value: string } | null } = {
      currentTarget: { value: "openrouter/free" }
    }
    const readReleased = (): string => {
      if (released.currentTarget === null) {
        throw new TypeError("released event")
      }
      return released.currentTarget.value
    }
    released.currentTarget = null
    const queue = makeSettingsSaveQueue(defaultSettingsSnapshot, async (snapshot) => snapshot)
    await expect(
      queue.enqueue((snapshot) => ({
        ...snapshot,
        modesPrompts: { ...snapshot.modesPrompts, defaultModel: readReleased() }
      }))
    ).rejects.toThrow("released event")
  })

  it("surfaces the specific save failure", () => {
    expect(describeSettingsSaveFailure(new Error("write failed"))).toBe("settings could not be saved: write failed")
    expect(describeSettingsSaveFailure(new Error(""))).toBe("settings could not be saved")
    expect(describeSettingsSaveFailure(undefined)).toBe("settings could not be saved")
  })
})
