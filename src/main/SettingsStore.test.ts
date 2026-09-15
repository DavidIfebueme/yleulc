import { ConfigProvider, Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { defaultKeybinds, detectKeybindConflicts, isKeybindConflicted, rebindKeybind } from "../shared/keybinds"
import { defaultSettingsSnapshot, SettingsStore } from "./SettingsStore"

describe("SettingsStore", () => {
  it("resolves defaults from the test layer", async () => {
    const snapshot = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          return yield* store.getSnapshot()
        }),
        SettingsStore.Test
      )
    )
    expect(snapshot).toEqual(defaultSettingsSnapshot)
    expect(snapshot.transcriptionEngine).toBe("local")
    expect(snapshot.keybinds).toEqual(defaultKeybinds)
    expect(snapshot.stealth).toEqual({ autoHideOnPortalScreencast: true, showSingleWindowGuidance: true })
    expect(snapshot.modesPrompts).toMatchObject({ defaultMode: "ask", defaultProviderId: "openai" })
  })
  it("reads every control through effect config in the live layer", async () => {
    const configLayer = ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({
        YLEULC_DEFAULT_MODE: "listen",
        YLEULC_DEFAULT_MODEL: "gpt-4o-mini",
        YLEULC_DEFAULT_PROVIDER: "anthropic",
        YLEULC_KEYBIND_ASSIST: "ctrl+shift+q",
        YLEULC_STEALTH_AUTO_HIDE: "false",
        YLEULC_STEALTH_SINGLE_WINDOW_HINT: "false",
        YLEULC_SYSTEM_PROMPT: "be concise",
        YLEULC_TRANSCRIPTION_ENGINE: "deepgram"
      })
    )
    const live = Layer.provide(SettingsStore.Live, configLayer)
    const snapshot = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          return yield* store.getSnapshot()
        }),
        live
      )
    )
    expect(snapshot.transcriptionEngine).toBe("deepgram")
    expect(snapshot.keybinds.assist).toBe("ctrl+shift+q")
    expect(snapshot.stealth.autoHideOnPortalScreencast).toBe(false)
    expect(snapshot.stealth.showSingleWindowGuidance).toBe(false)
    expect(snapshot.modesPrompts.defaultMode).toBe("listen")
    expect(snapshot.modesPrompts.defaultProviderId).toBe("anthropic")
    expect(snapshot.modesPrompts.defaultModel).toBe("gpt-4o-mini")
    expect(snapshot.modesPrompts.systemPrompt).toBe("be concise")
  })
  it("writes transcription engine select through the store", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          yield* store.setTranscriptionEngine("deepgram")
          return yield* store.getTranscriptionEngine()
        }),
        SettingsStore.Test
      )
    )
    expect(outcome).toBe("deepgram")
  })
  it("rebinds keybinds and surfaces conflict badges", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          yield* store.setKeybind("submit", "ctrl+shift+space")
          return yield* store.getKeybinds()
        }),
        SettingsStore.Test
      )
    )
    expect(isKeybindConflicted(outcome, "submit")).toBe(true)
    expect(isKeybindConflicted(outcome, "toggleVisibility")).toBe(true)
    expect(detectKeybindConflicts(outcome).length).toBe(1)
    const rebound = rebindKeybind(defaultKeybinds, "submit", "ctrl+enter")
    expect(detectKeybindConflicts(rebound)).toEqual([])
  })
  it("writes stealth toggles plus modes and prompt basics", async () => {
    const outcome = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          yield* store.setStealth({ autoHideOnPortalScreencast: false, showSingleWindowGuidance: false })
          yield* store.setModesPrompts({
            defaultMode: "listen",
            defaultModel: "claude-sonnet-4-20250514",
            defaultProviderId: "anthropic",
            systemPrompt: "summarize actions"
          })
          const stealth = yield* store.getStealth()
          const modesPrompts = yield* store.getModesPrompts()
          yield* store.reset()
          const afterReset = yield* store.getSnapshot()
          return { afterReset, modesPrompts, stealth }
        }),
        SettingsStore.Test
      )
    )
    expect(outcome.stealth.autoHideOnPortalScreencast).toBe(false)
    expect(outcome.modesPrompts.systemPrompt).toBe("summarize actions")
    expect(outcome.afterReset).toEqual(defaultSettingsSnapshot)
  })
})
