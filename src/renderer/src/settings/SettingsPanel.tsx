import type { KeybindAction, KeybindMap } from "../../../shared/keybinds"
import type { ProviderSettingsProvider } from "../../../shared/providerIpc"
import { KeybindTable } from "./KeybindTable"
import { ModesPrompts } from "./ModesPrompts"
import type { ModesPromptsProviderOption, ModesPromptsValue } from "./ModesPrompts"
import { ProviderKeysTable } from "./ProviderKeysTable"

interface SettingsPanelProps {
  readonly autoAnswer: boolean
  readonly keybinds: KeybindMap
  readonly modesPrompts: ModesPromptsValue
  readonly onAutoAnswerChange: (value: boolean) => void
  readonly onKeybindRebind: (action: KeybindAction, combo: string) => void
  readonly onModesPromptsChange: (update: (value: ModesPromptsValue) => ModesPromptsValue) => void
  readonly onProviderRemove: (id: ProviderSettingsProvider["id"]) => void
  readonly onProviderSave: (id: ProviderSettingsProvider["id"], key: string) => void
  readonly onProviderTest: (id: ProviderSettingsProvider["id"]) => void
  readonly onReset: () => void
  readonly providerOptions: ReadonlyArray<ModesPromptsProviderOption>
  readonly providerRows: ReadonlyArray<ProviderSettingsProvider>
  readonly providerTestMessages: Record<string, string>
  readonly testingProviderIds: ReadonlyArray<string>
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <div className="w-full min-w-0 space-y-2 text-white">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div>
          <p className="overlay-section-title">Workspace controls</p>
          <h2 className="mt-0.5 text-sm font-semibold text-white/90">Settings</h2>
        </div>
        <button
          type="button"
          onClick={props.onReset}
          className="overlay-button"
        >
          Reset
        </button>
      </div>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Provider keys</h3>
        <ProviderKeysTable
          rows={props.providerRows}
          onRemove={props.onProviderRemove}
          onSave={props.onProviderSave}
          onTest={props.onProviderTest}
          testMessages={props.providerTestMessages}
          testingIds={props.testingProviderIds}
        />
      </section>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Transcription</h3>
        <p className="text-xs text-white/60">The transcription engine is selected when the app starts.</p>
      </section>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Live transcription</h3>
        <label className="flex items-center justify-between text-xs text-white/70">
          <span>Answer questions automatically</span>
          <input
            type="checkbox"
            checked={props.autoAnswer}
            onChange={() => {
              props.onAutoAnswerChange(!props.autoAnswer)
            }}
          />
        </label>
        <p className="text-xs text-white/60">Off by default. Yleulc only answers when you turn this on.</p>
      </section>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Keybinds</h3>
        <KeybindTable keybinds={props.keybinds} onRebind={props.onKeybindRebind} />
      </section>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Stealth</h3>
        <p className="text-xs text-white/60">Portal screencast detection is not available yet.</p>
      </section>
      <section className="overlay-section space-y-2">
        <h3 className="overlay-section-title">Modes and prompts</h3>
        <ModesPrompts
          value={props.modesPrompts}
          providerOptions={props.providerOptions}
          onChange={props.onModesPromptsChange}
        />
      </section>
    </div>
  )
}
