import { ConfigProvider, Deferred, Effect, Fiber, Layer, Ref } from "effect"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { defaultKeybinds, detectKeybindConflicts, isKeybindConflicted, rebindKeybind } from "../shared/keybinds"
import {
  defaultSettingsSnapshot,
  makeFileSettingsStoreLayer,
  makeSettingsStoreTestLayer,
  SettingsStore
} from "./SettingsStore"

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
    const directory = await mkdtemp(join(tmpdir(), "yleulc-settings-"))
    const configLayer = ConfigProvider.layer(
      ConfigProvider.fromEnvRecord({
        YLEULC_DEFAULT_MODE: "listen",
        YLEULC_DEFAULT_MODEL: "gpt-4o-mini",
        YLEULC_DEFAULT_PROVIDER: "anthropic",
        YLEULC_KEYBIND_ASSIST: "ctrl+shift+q",
        YLEULC_STEALTH_AUTO_HIDE: "false",
        YLEULC_STEALTH_SINGLE_WINDOW_HINT: "false",
        YLEULC_SYSTEM_PROMPT: "be concise",
        YLEULC_SETTINGS_PATH: join(directory, "settings.json"),
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
    await rm(directory, { force: true, recursive: true })
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
            ...defaultSettingsSnapshot.modesPrompts,
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
  it("persists prompt modes and the active prompt mode to a temporary file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yleulc-settings-"))
    const path = join(directory, "settings.json")
    const saved = {
      ...defaultSettingsSnapshot,
      modesPrompts: {
        ...defaultSettingsSnapshot.modesPrompts,
        activePromptModeId: "interview",
        promptModes: [
          ...defaultSettingsSnapshot.modesPrompts.promptModes,
          { id: "interview", label: "Interview", prompt: "Help me answer interview questions." }
        ]
      }
    }
    await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          yield* store.setModesPrompts(saved.modesPrompts)
        }),
        makeFileSettingsStoreLayer(path, defaultSettingsSnapshot)
      )
    )
    const restored = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          return yield* store.getSnapshot()
        }),
        makeFileSettingsStoreLayer(path, defaultSettingsSnapshot)
      )
    )
    expect(restored).toEqual(saved)
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(saved)
    await rm(directory, { force: true, recursive: true })
  })
  it("keeps the prior snapshot when a file write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "yleulc-settings-"))
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const store = yield* SettingsStore
          const error = yield* Effect.flip(
            store.setSnapshot({ ...defaultSettingsSnapshot, modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, systemPrompt: "saved" } })
          )
          const snapshot = yield* store.getSnapshot()
          return { error, snapshot }
        }),
        makeFileSettingsStoreLayer(directory, defaultSettingsSnapshot)
      )
    )
    expect(result.error._tag).toBe("SettingsStoreError")
    expect(result.error.kind).toBe("write")
    expect(result.snapshot).toEqual(defaultSettingsSnapshot)
    await rm(directory, { force: true, recursive: true })
  })
  it("serializes snapshot writes in submission order", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const writes = yield* Ref.make<ReadonlyArray<string>>([])
        const calls = yield* Ref.make(0)
        const first = { ...defaultSettingsSnapshot, modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, systemPrompt: "first" } }
        const second = { ...defaultSettingsSnapshot, modesPrompts: { ...defaultSettingsSnapshot.modesPrompts, systemPrompt: "second" } }
        const layer = makeSettingsStoreTestLayer(defaultSettingsSnapshot, (snapshot) =>
          Effect.gen(function* () {
            const call = yield* Ref.updateAndGet(calls, (count) => count + 1)
            if (call === 1) {
              yield* Deferred.succeed(started, undefined)
              yield* Deferred.await(release)
            }
            yield* Ref.update(writes, (saved) => [...saved, snapshot.modesPrompts.systemPrompt])
          })
        )
        return yield* Effect.provide(
          Effect.gen(function* () {
            const store = yield* SettingsStore
            const firstFiber = Effect.runFork(store.setSnapshot(first))
            yield* Deferred.await(started)
            const secondFiber = Effect.runFork(store.setSnapshot(second))
            yield* Deferred.succeed(release, undefined)
            yield* Fiber.join(firstFiber)
            yield* Fiber.join(secondFiber)
            return yield* Ref.get(writes)
          }),
          layer
        )
      })
    )
    expect(result).toEqual(["first", "second"])
  })
})
