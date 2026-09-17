import { Schema } from "effect"
import { defaultKeybinds } from "./keybinds"

export const settingsGetChannel = "yleulc:settings-get"
export const settingsSaveChannel = "yleulc:settings-save"

export const SettingsModeSchema = Schema.Union([Schema.Literal("ask"), Schema.Literal("listen")])

export type SettingsMode = typeof SettingsModeSchema.Type

export const PromptModeSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  prompt: Schema.String
})

export type PromptMode = typeof PromptModeSchema.Type

export const ProviderIdSchema = Schema.Union([
  Schema.Literal("anthropic"),
  Schema.Literal("custom"),
  Schema.Literal("deepseek"),
  Schema.Literal("gemini"),
  Schema.Literal("groq"),
  Schema.Literal("mistral"),
  Schema.Literal("ollama"),
  Schema.Literal("openai"),
  Schema.Literal("openrouter"),
  Schema.Literal("together"),
  Schema.Literal("xai")
])

export type ProviderId = typeof ProviderIdSchema.Type

export const KeybindMapSchema = Schema.Struct({
  assist: Schema.String,
  submit: Schema.String,
  toggleListen: Schema.String,
  toggleTranscript: Schema.String,
  toggleVisibility: Schema.String
})

export const ModesPromptsSettingsSchema = Schema.Struct({
  activePromptModeId: Schema.String,
  defaultMode: SettingsModeSchema,
  defaultModel: Schema.String,
  defaultProviderId: ProviderIdSchema,
  promptModes: Schema.Array(PromptModeSchema),
  systemPrompt: Schema.String
})

export type ModesPromptsSettings = typeof ModesPromptsSettingsSchema.Type

export const StealthSettingsSchema = Schema.Struct({
  autoHideOnPortalScreencast: Schema.Boolean,
  showSingleWindowGuidance: Schema.Boolean
})

export type StealthSettings = typeof StealthSettingsSchema.Type

export const TranscriptionEngineKindSchema = Schema.Union([Schema.Literal("local"), Schema.Literal("deepgram"), Schema.Literal("assemblyai")])

export type TranscriptionEngineKind = typeof TranscriptionEngineKindSchema.Type

export const SettingsSnapshotSchema = Schema.Struct({
  keybinds: KeybindMapSchema,
  modesPrompts: ModesPromptsSettingsSchema,
  stealth: StealthSettingsSchema,
  transcriptionEngine: TranscriptionEngineKindSchema
})

export type SettingsSnapshot = typeof SettingsSnapshotSchema.Type

export function hasValidPromptModes(settings: ModesPromptsSettings): boolean {
  if (settings.promptModes.length === 0) {
    return false
  }
  const ids = new Set<string>()
  for (const mode of settings.promptModes) {
    if (mode.id.trim().length === 0 || ids.has(mode.id)) {
      return false
    }
    ids.add(mode.id)
  }
  return ids.has(settings.activePromptModeId)
}

export function isValidSettingsSnapshot(snapshot: SettingsSnapshot): boolean {
  return hasValidPromptModes(snapshot.modesPrompts)
}

export const defaultSettingsSnapshot: SettingsSnapshot = {
  keybinds: { ...defaultKeybinds },
  modesPrompts: {
    activePromptModeId: "general",
    defaultMode: "ask",
    defaultModel: "gpt-4o",
    defaultProviderId: "openai",
    promptModes: [
      { id: "general", label: "General", prompt: "" },
      {
        id: "sales",
        label: "Cluely for Sales",
        prompt: "Coach the user through this sales conversation. Give concise, practical next steps they can say aloud."
      }
    ],
    systemPrompt: ""
  },
  stealth: {
    autoHideOnPortalScreencast: true,
    showSingleWindowGuidance: true
  },
  transcriptionEngine: "local"
}
