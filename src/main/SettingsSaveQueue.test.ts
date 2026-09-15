import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot } from "../shared/settingsIpc"
import { makeSettingsSaveQueue } from "../shared/settingsSaveQueue"

describe("SettingsSaveQueue", () => {
  it("derives queued edits from the preceding acknowledged snapshot", async () => {
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
})
