import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../../shared/settingsIpc"
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
  readonly onSettingsChange: (snapshot: SettingsSnapshot) => void
  readonly settings: SettingsSnapshot
}

export function SettingsDashboard(props: SettingsDashboardProps) {
  const save = (snapshot: SettingsSnapshot): void => {
    props.onSettingsChange(snapshot)
  }

  return (
    <SettingsPanel
      keybinds={props.settings.keybinds}
      modesPrompts={props.settings.modesPrompts}
      onKeybindRebind={(action, combo) => {
        save({ ...props.settings, keybinds: { ...props.settings.keybinds, [action]: combo } })
      }}
      onModesPromptsChange={(modesPrompts) => {
        save({ ...props.settings, modesPrompts })
      }}
      onReset={() => {
        save(defaultSettingsSnapshot)
      }}
      onStealthChange={(stealth) => {
        save({ ...props.settings, stealth })
      }}
      providerOptions={providerOptions}
      stealth={props.settings.stealth}
    />
  )
}
