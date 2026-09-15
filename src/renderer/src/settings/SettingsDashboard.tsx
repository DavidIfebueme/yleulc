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
  readonly errorMessage: string
  readonly onSettingsChange: (snapshot: SettingsSnapshot) => void
  readonly settings: SettingsSnapshot
}

export function SettingsDashboard(props: SettingsDashboardProps) {
  const save = (snapshot: SettingsSnapshot): void => {
    props.onSettingsChange(snapshot)
  }

  return (
    <>
      <SettingsPanel
        modesPrompts={props.settings.modesPrompts}
        onModesPromptsChange={(modesPrompts) => {
          save({ ...props.settings, modesPrompts })
        }}
        onReset={() => {
          save(defaultSettingsSnapshot)
        }}
        providerOptions={providerOptions}
      />
      {props.errorMessage === "" ? null : <p className="mt-2 text-xs text-red-300/80">{props.errorMessage}</p>}
    </>
  )
}
