import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../../shared/settingsIpc"
import type { SettingsUpdate } from "../../../shared/settingsSaveQueue"
import { SettingsPanel } from "./SettingsPanel"
import type { ModesPromptsProviderOption } from "./ModesPrompts"

const providerOptions: ReadonlyArray<ModesPromptsProviderOption> = [
  { displayName: "Anthropic", id: "anthropic" },
  { displayName: "Custom", id: "custom" },
  { displayName: "DeepSeek", id: "deepseek" },
  { displayName: "Gemini", id: "gemini" },
  { displayName: "Groq", id: "groq" },
  { displayName: "Mistral", id: "mistral" },
  { displayName: "Ollama", id: "ollama" },
  { displayName: "OpenAI", id: "openai" },
  { displayName: "OpenRouter", id: "openrouter" },
  { displayName: "Together", id: "together" },
  { displayName: "xAI", id: "xai" }
]

interface SettingsDashboardProps {
  readonly errorMessage: string
  readonly onSettingsChange: (update: SettingsUpdate) => void
  readonly settings: SettingsSnapshot
}

export function SettingsDashboard(props: SettingsDashboardProps) {
  const save = (update: SettingsUpdate): void => {
    props.onSettingsChange(update)
  }

  return (
    <>
      <SettingsPanel
        keybinds={props.settings.keybinds}
        modesPrompts={props.settings.modesPrompts}
        onKeybindRebind={(action, combo) => {
          save((snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, [action]: combo } }))
        }}
        onModesPromptsChange={(update) => {
          save((snapshot) => ({ ...snapshot, modesPrompts: update(snapshot.modesPrompts) }))
        }}
        onReset={() => {
          save(() => defaultSettingsSnapshot)
        }}
        onStealthChange={(stealth) => {
          save((snapshot) => ({ ...snapshot, stealth }))
        }}
        onTranscriptionEngineChange={(transcriptionEngine) => {
          save((snapshot) => ({ ...snapshot, transcriptionEngine }))
        }}
        providerOptions={providerOptions}
        stealth={props.settings.stealth}
        transcriptionEngine={props.settings.transcriptionEngine}
      />
      {props.errorMessage === "" ? null : <p className="mt-2 text-xs text-red-300/80">{props.errorMessage}</p>}
    </>
  )
}
