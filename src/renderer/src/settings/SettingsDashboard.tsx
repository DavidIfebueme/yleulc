import { useRef, useState } from "react"
import { canRebindKeybind } from "../../../shared/keybinds"
import { defaultSettingsSnapshot, type SettingsSnapshot } from "../../../shared/settingsIpc"
import { makeSettingsDraft, type SettingsUpdate } from "../../../shared/settingsSaveQueue"
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
  const [keybindError, setKeybindError] = useState("")
  const settingsDraft = useRef(makeSettingsDraft(props.settings))
  const save = (update: SettingsUpdate): void => {
    settingsDraft.current.apply(update)
    props.onSettingsChange(update)
  }

  return (
    <>
      <SettingsPanel
        keybinds={props.settings.keybinds}
        modesPrompts={props.settings.modesPrompts}
        onKeybindRebind={(action, combo) => {
          if (!canRebindKeybind(settingsDraft.current.current().keybinds, action, combo)) {
            setKeybindError("That shortcut is already assigned to another action.")
            return
          }
          setKeybindError("")
          save((snapshot) => ({ ...snapshot, keybinds: { ...snapshot.keybinds, [action]: combo } }))
        }}
        onModesPromptsChange={(update) => {
          save((snapshot) => ({ ...snapshot, modesPrompts: update(snapshot.modesPrompts) }))
        }}
        onReset={() => {
          save(() => defaultSettingsSnapshot)
        }}
        providerOptions={providerOptions}
      />
      {props.errorMessage === "" ? null : <p className="mt-2 text-xs text-red-300/80">{props.errorMessage}</p>}
      {keybindError === "" ? null : <p className="mt-2 text-xs text-red-300/80">{keybindError}</p>}
    </>
  )
}
