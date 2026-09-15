import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { defaultSettingsSnapshot, makeSettingsStoreTestLayer, SettingsStore } from "./SettingsStore"
import { getSettings, saveSettings } from "./SettingsIpc"

describe("settings IPC", () => {
  it("round trips a validated prompt mode snapshot through an in-memory store double", async () => {
    const snapshot = {
      ...defaultSettingsSnapshot,
      modesPrompts: {
        ...defaultSettingsSnapshot.modesPrompts,
        activePromptModeId: "interview",
        promptModes: [
          ...defaultSettingsSnapshot.modesPrompts.promptModes,
          { id: "interview", label: "Interview", prompt: "Help answer interview questions." }
        ]
      }
    }
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          const saved = yield* saveSettings(snapshot, store)
          const read = yield* getSettings(store)
          return { read, saved }
        }),
        makeSettingsStoreTestLayer(defaultSettingsSnapshot)
      )
    )
    expect(result.saved).toEqual(snapshot)
    expect(result.read).toEqual(snapshot)
  })

  it("rejects invalid renderer payloads without changing the store", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          const error = yield* Effect.flip(saveSettings({ modesPrompts: { activePromptModeId: 12 } }, store))
          const read = yield* getSettings(store)
          return { error, read }
        }),
        makeSettingsStoreTestLayer(defaultSettingsSnapshot)
      )
    )
    expect(result.error.message).toBe("invalid settings snapshot")
    expect(result.read).toEqual(defaultSettingsSnapshot)
  })

  it("rejects empty, duplicate, and inactive prompt mode lists", async () => {
    const invalidSnapshots = [
      {
        ...defaultSettingsSnapshot,
        modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, promptModes: [] }
      },
      {
        ...defaultSettingsSnapshot,
        modesPrompts: {
          ...defaultSettingsSnapshot.modesPrompts,
          promptModes: [
            { id: "duplicate", label: "First", prompt: "" },
            { id: "duplicate", label: "Second", prompt: "" }
          ]
        }
      },
      {
        ...defaultSettingsSnapshot,
        modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, activePromptModeId: "missing" }
      }
    ]
    const errors = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          return yield* Effect.forEach(invalidSnapshots, (snapshot) => Effect.flip(saveSettings(snapshot, store)))
        }),
        makeSettingsStoreTestLayer(defaultSettingsSnapshot)
      )
    )
    expect(errors.map((error) => error.message)).toEqual([
      "invalid prompt modes",
      "invalid prompt modes",
      "invalid prompt modes"
    ])
  })
})
