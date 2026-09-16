import { app } from "electron"
import { Config, Context, Data, Effect, Layer, Option, Ref, Schema, Semaphore } from "effect"
import { open, readFile, rename, unlink } from "node:fs/promises"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { defaultKeybinds } from "../shared/keybinds"
import type { KeybindAction, KeybindMap } from "../shared/keybinds"
import {
  ProviderIdSchema,
  SettingsModeSchema,
  SettingsSnapshotSchema,
  TranscriptionEngineKindSchema,
  defaultSettingsSnapshot,
  isValidSettingsSnapshot,
  type ModesPromptsSettings,
  type SettingsSnapshot,
  type StealthSettings,
  type TranscriptionEngineKind
} from "../shared/settingsIpc"

export type { ModesPromptsSettings, SettingsSnapshot, StealthSettings, TranscriptionEngineKind }
export { defaultSettingsSnapshot }

export class SettingsStoreError extends Data.TaggedError("SettingsStoreError")<{
  readonly message: string
  readonly kind: "write"
}> {}

export const defaultStealthSettings: StealthSettings = {
  autoHideOnPortalScreencast: true,
  showSingleWindowGuidance: true
}

export const defaultModesPromptsSettings: ModesPromptsSettings = {
  ...defaultSettingsSnapshot.modesPrompts
}

export interface SettingsStoreShape {
  readonly getKeybinds: () => Effect.Effect<KeybindMap, never>
  readonly getModesPrompts: () => Effect.Effect<ModesPromptsSettings, never>
  readonly getSnapshot: () => Effect.Effect<SettingsSnapshot, never>
  readonly getStealth: () => Effect.Effect<StealthSettings, never>
  readonly getTranscriptionEngine: () => Effect.Effect<TranscriptionEngineKind, never>
  readonly reset: () => Effect.Effect<void, SettingsStoreError>
  readonly setSnapshot: (value: SettingsSnapshot) => Effect.Effect<void, SettingsStoreError>
  readonly setKeybind: (action: KeybindAction, combo: string) => Effect.Effect<void, SettingsStoreError>
  readonly setModesPrompts: (value: ModesPromptsSettings) => Effect.Effect<void, SettingsStoreError>
  readonly setStealth: (value: StealthSettings) => Effect.Effect<void, SettingsStoreError>
  readonly setTranscriptionEngine: (value: TranscriptionEngineKind) => Effect.Effect<void, SettingsStoreError>
}

function makeSettingsStore(
  initial: SettingsSnapshot,
  state: Ref.Ref<SettingsSnapshot>,
  save: (snapshot: SettingsSnapshot) => Effect.Effect<void, SettingsStoreError>,
  writes: Semaphore.Semaphore
): SettingsStoreShape {
  const setSnapshot = (snapshot: SettingsSnapshot): Effect.Effect<void, SettingsStoreError> =>
    writes.withPermit(Effect.andThen(save(snapshot), () => Ref.set(state, snapshot)))
  const updateSnapshot = (
    update: (snapshot: SettingsSnapshot) => SettingsSnapshot
  ): Effect.Effect<void, SettingsStoreError> =>
    writes.withPermit(
      Effect.flatMap(Ref.get(state), (snapshot) => {
        const next = update(snapshot)
        return Effect.andThen(save(next), () => Ref.set(state, next))
      })
    )
  return {
    getKeybinds: () => Effect.map(Ref.get(state), (snapshot) => snapshot.keybinds),
    getModesPrompts: () => Effect.map(Ref.get(state), (snapshot) => snapshot.modesPrompts),
    getSnapshot: () => Ref.get(state),
    getStealth: () => Effect.map(Ref.get(state), (snapshot) => snapshot.stealth),
    getTranscriptionEngine: () => Effect.map(Ref.get(state), (snapshot) => snapshot.transcriptionEngine),
    reset: () => setSnapshot(initial),
    setSnapshot,
    setKeybind: (action, combo) =>
      updateSnapshot((snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, [action]: combo } })),
    setModesPrompts: (value) => updateSnapshot((snapshot) => ({ ...snapshot, modesPrompts: value })),
    setStealth: (value) => updateSnapshot((snapshot) => ({ ...snapshot, stealth: value })),
    setTranscriptionEngine: (value) => updateSnapshot((snapshot) => ({ ...snapshot, transcriptionEngine: value }))
  }
}

function loadSettings(path: string, fallback: SettingsSnapshot): Effect.Effect<SettingsSnapshot> {
  return Effect.flatMap(
    Effect.option(Effect.tryPromise(() => readFile(path, "utf8").then((content) => JSON.parse(content) as unknown))),
    (content) => {
      if (Option.isNone(content)) {
        return Effect.succeed(fallback)
      }
      const decoded = Schema.decodeUnknownResult(SettingsSnapshotSchema)(content.value)
      return Effect.succeed(decoded._tag === "Success" && isValidSettingsSnapshot(decoded.success) ? decoded.success : fallback)
    }
  )
}

function doesNotSupportDirectorySync(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    "code" in cause &&
    (cause.code === "EISDIR" || cause.code === "EINVAL" || cause.code === "ENOTSUP")
  )
}

function syncParentDirectory(path: string): Promise<void> {
  return open(dirname(path), "r")
    .then((directory) => directory.sync().finally(() => directory.close()))
    .catch((cause: unknown) => (doesNotSupportDirectorySync(cause) ? undefined : Promise.reject(cause)))
}

function writeAndSyncTemporaryFile(path: string, content: string): Promise<void> {
  return open(path, "w").then((temporary) =>
    temporary
      .writeFile(content, "utf8")
      .then(() => temporary.sync())
      .finally(() => temporary.close())
  )
}

function makeFileSettingsStore(path: string, fallback: SettingsSnapshot): Effect.Effect<SettingsStoreShape> {
  return Effect.gen(function* () {
    const initial = yield* loadSettings(path, fallback)
    const state = yield* Ref.make(initial)
    const writes = yield* Semaphore.make(1)
    const save = (snapshot: SettingsSnapshot): Effect.Effect<void, SettingsStoreError> => {
      const temporaryPath = `${path}.${randomUUID()}.tmp`
      return Effect.tryPromise({
        try: () => writeAndSyncTemporaryFile(temporaryPath, JSON.stringify(snapshot)),
        catch: (cause) => new SettingsStoreError({ kind: "write", message: String(cause) })
      }).pipe(
        Effect.andThen(() =>
          Effect.tryPromise({
            try: () => rename(temporaryPath, path),
            catch: (cause) => new SettingsStoreError({ kind: "write", message: String(cause) })
          })
        ),
        Effect.andThen(() =>
          Effect.tryPromise({
            try: () => syncParentDirectory(path),
            catch: (cause) => new SettingsStoreError({ kind: "write", message: String(cause) })
          })
        ),
        Effect.ensuring(Effect.ignore(Effect.tryPromise(() => unlink(temporaryPath))))
      )
    }
    return makeSettingsStore(initial, state, save, writes)
  })
}

const readLiveSnapshot = Effect.gen(function* () {
  const transcriptionEngine = yield* Config.withDefault(
    Config.schema(TranscriptionEngineKindSchema, "YLEULC_TRANSCRIPTION_ENGINE"),
    "local"
  )
  const assist = yield* Config.withDefault(Config.String("YLEULC_KEYBIND_ASSIST"), defaultKeybinds.assist)
  const submit = yield* Config.withDefault(Config.String("YLEULC_KEYBIND_SUBMIT"), defaultKeybinds.submit)
  const toggleListen = yield* Config.withDefault(
    Config.String("YLEULC_KEYBIND_TOGGLE_LISTEN"),
    defaultKeybinds.toggleListen
  )
  const toggleTranscript = yield* Config.withDefault(
    Config.String("YLEULC_KEYBIND_TOGGLE_TRANSCRIPT"),
    defaultKeybinds.toggleTranscript
  )
  const toggleVisibility = yield* Config.withDefault(
    Config.String("YLEULC_KEYBIND_TOGGLE_VISIBILITY"),
    defaultKeybinds.toggleVisibility
  )
  const autoHideOnPortalScreencast = yield* Config.withDefault(Config.Boolean("YLEULC_STEALTH_AUTO_HIDE"), true)
  const showSingleWindowGuidance = yield* Config.withDefault(
    Config.Boolean("YLEULC_STEALTH_SINGLE_WINDOW_HINT"),
    true
  )
  const defaultMode = yield* Config.withDefault(Config.schema(SettingsModeSchema, "YLEULC_DEFAULT_MODE"), "ask")
  const defaultProviderId = yield* Config.withDefault(
    Config.schema(ProviderIdSchema, "YLEULC_DEFAULT_PROVIDER"),
    "openai"
  )
  const defaultModel = yield* Config.withDefault(
    Config.String("YLEULC_DEFAULT_MODEL"),
    defaultSettingsSnapshot.modesPrompts.defaultModel
  )
  const systemPrompt = yield* Config.withDefault(Config.String("YLEULC_SYSTEM_PROMPT"), "")
  return {
    keybinds: {
      assist,
      submit,
      toggleListen,
      toggleTranscript,
      toggleVisibility
    },
    modesPrompts: {
      ...defaultModesPromptsSettings,
      defaultMode,
      defaultModel,
      defaultProviderId,
      systemPrompt
    },
    stealth: { autoHideOnPortalScreencast, showSingleWindowGuidance },
    transcriptionEngine
  } satisfies SettingsSnapshot
})

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()("SettingsStore") {
  static readonly Live = Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const initial = yield* readLiveSnapshot
      const configuredPath = yield* Config.option(Config.String("YLEULC_SETTINGS_PATH"))
      const path = Option.getOrElse(configuredPath, () => join(app.getPath("userData"), "settings.json"))
      return yield* makeFileSettingsStore(path, initial)
    })
  )
  static readonly Test = Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const initial: SettingsSnapshot = {
        keybinds: { ...defaultKeybinds },
        modesPrompts: { ...defaultModesPromptsSettings },
        stealth: { ...defaultStealthSettings },
        transcriptionEngine: "local"
      }
      const state = yield* Ref.make(initial)
      const writes = yield* Semaphore.make(1)
      return makeSettingsStore(initial, state, () => Effect.void, writes)
    })
  )
}

export function makeSettingsStoreTestLayer(
  initial: SettingsSnapshot,
  save: (snapshot: SettingsSnapshot) => Effect.Effect<void, SettingsStoreError> = () => Effect.void
): Layer.Layer<SettingsStore> {
  return Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const state = yield* Ref.make(initial)
      const writes = yield* Semaphore.make(1)
      return makeSettingsStore(initial, state, save, writes)
    })
  )
}

export function makeFileSettingsStoreLayer(path: string, initial: SettingsSnapshot): Layer.Layer<SettingsStore> {
  return Layer.effect(SettingsStore, Effect.map(makeFileSettingsStore(path, initial), SettingsStore.of))
}
