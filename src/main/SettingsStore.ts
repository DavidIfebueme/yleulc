import { Config, Context, Effect, Layer, Ref, Schema } from "effect"
import { defaultAskModel } from "../shared/askIpc"
import { defaultKeybinds } from "../shared/keybinds"
import type { KeybindAction, KeybindMap } from "../shared/keybinds"
import { TranscriptionEngineKindSchema } from "./TranscriptionEngine"
import type { TranscriptionEngineKind } from "./TranscriptionEngine"
import { ProviderIdSchema } from "./providers/Provider"
import type { ProviderId } from "./providers/Provider"

export const SettingsModeSchema = Schema.Union([Schema.Literal("ask"), Schema.Literal("listen")])

export type SettingsMode = typeof SettingsModeSchema.Type

export interface StealthSettings {
  readonly autoHideOnPortalScreencast: boolean
  readonly showSingleWindowGuidance: boolean
}

export interface ModesPromptsSettings {
  readonly defaultMode: SettingsMode
  readonly defaultModel: string
  readonly defaultProviderId: ProviderId
  readonly systemPrompt: string
}

export interface SettingsSnapshot {
  readonly keybinds: KeybindMap
  readonly modesPrompts: ModesPromptsSettings
  readonly stealth: StealthSettings
  readonly transcriptionEngine: TranscriptionEngineKind
}

export const defaultStealthSettings: StealthSettings = {
  autoHideOnPortalScreencast: true,
  showSingleWindowGuidance: true
}

export const defaultModesPromptsSettings: ModesPromptsSettings = {
  defaultMode: "ask",
  defaultModel: defaultAskModel,
  defaultProviderId: "openai",
  systemPrompt: ""
}

export const defaultSettingsSnapshot: SettingsSnapshot = {
  keybinds: { ...defaultKeybinds },
  modesPrompts: { ...defaultModesPromptsSettings },
  stealth: { ...defaultStealthSettings },
  transcriptionEngine: "local"
}

export interface SettingsStoreShape {
  readonly getKeybinds: () => Effect.Effect<KeybindMap, never>
  readonly getModesPrompts: () => Effect.Effect<ModesPromptsSettings, never>
  readonly getSnapshot: () => Effect.Effect<SettingsSnapshot, never>
  readonly getStealth: () => Effect.Effect<StealthSettings, never>
  readonly getTranscriptionEngine: () => Effect.Effect<TranscriptionEngineKind, never>
  readonly reset: () => Effect.Effect<void, never>
  readonly setKeybind: (action: KeybindAction, combo: string) => Effect.Effect<void, never>
  readonly setModesPrompts: (value: ModesPromptsSettings) => Effect.Effect<void, never>
  readonly setStealth: (value: StealthSettings) => Effect.Effect<void, never>
  readonly setTranscriptionEngine: (value: TranscriptionEngineKind) => Effect.Effect<void, never>
}

function makeSettingsStore(initial: SettingsSnapshot, state: Ref.Ref<SettingsSnapshot>): SettingsStoreShape {
  return {
    getKeybinds: () => Effect.map(Ref.get(state), (snapshot) => snapshot.keybinds),
    getModesPrompts: () => Effect.map(Ref.get(state), (snapshot) => snapshot.modesPrompts),
    getSnapshot: () => Ref.get(state),
    getStealth: () => Effect.map(Ref.get(state), (snapshot) => snapshot.stealth),
    getTranscriptionEngine: () => Effect.map(Ref.get(state), (snapshot) => snapshot.transcriptionEngine),
    reset: () => Ref.set(state, initial),
    setKeybind: (action, combo) =>
      Ref.update(state, (snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, [action]: combo } })),
    setModesPrompts: (value) => Ref.update(state, (snapshot) => ({ ...snapshot, modesPrompts: value })),
    setStealth: (value) => Ref.update(state, (snapshot) => ({ ...snapshot, stealth: value })),
    setTranscriptionEngine: (value) => Ref.update(state, (snapshot) => ({ ...snapshot, transcriptionEngine: value }))
  }
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
  const defaultModel = yield* Config.withDefault(Config.String("YLEULC_DEFAULT_MODEL"), defaultAskModel)
  const systemPrompt = yield* Config.withDefault(Config.String("YLEULC_SYSTEM_PROMPT"), "")
  return {
    keybinds: {
      assist,
      submit,
      toggleListen,
      toggleTranscript,
      toggleVisibility
    },
    modesPrompts: { defaultMode, defaultModel, defaultProviderId, systemPrompt },
    stealth: { autoHideOnPortalScreencast, showSingleWindowGuidance },
    transcriptionEngine
  } satisfies SettingsSnapshot
})

export class SettingsStore extends Context.Service<SettingsStore, SettingsStoreShape>()("SettingsStore") {
  static readonly Live = Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const initial = yield* readLiveSnapshot
      const state = yield* Ref.make(initial)
      return makeSettingsStore(initial, state)
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
      return makeSettingsStore(initial, state)
    })
  )
}

export function makeSettingsStoreTestLayer(initial: SettingsSnapshot): Layer.Layer<SettingsStore> {
  return Layer.effect(
    SettingsStore,
    Effect.gen(function* () {
      const state = yield* Ref.make(initial)
      return makeSettingsStore(initial, state)
    })
  )
}
