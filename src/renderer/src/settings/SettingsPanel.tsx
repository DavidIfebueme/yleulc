import type { KeybindAction, KeybindMap } from "../../../shared/keybinds"
import type { TranscriptionEngineKind } from "../../../shared/settingsIpc"
import { KeybindTable } from "./KeybindTable"
import { ModesPrompts } from "./ModesPrompts"
import type { ModesPromptsProviderOption, ModesPromptsValue } from "./ModesPrompts"
import { StealthToggles } from "./StealthToggles"
import type { StealthToggleValue } from "./StealthToggles"
import { TranscriptionEngineSelect } from "./TranscriptionEngineSelect"

interface SettingsPanelProps {
  readonly keybinds: KeybindMap
  readonly modesPrompts: ModesPromptsValue
  readonly onKeybindRebind: (action: KeybindAction, combo: string) => void
  readonly onModesPromptsChange: (update: (value: ModesPromptsValue) => ModesPromptsValue) => void
  readonly onReset: () => void
  readonly onStealthChange: (value: StealthToggleValue) => void
  readonly onTranscriptionEngineChange: (value: TranscriptionEngineKind) => void
  readonly providerOptions: ReadonlyArray<ModesPromptsProviderOption>
  readonly stealth: StealthToggleValue
  readonly transcriptionEngine: TranscriptionEngineKind
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <div className="w-[400px] space-y-4 rounded-2xl border border-white/10 bg-slate-950/80 p-3 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/90">Settings</h2>
        <button
          type="button"
          onClick={props.onReset}
          className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
        >
          Reset
        </button>
      </div>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-white/60">Provider keys</h3>
        <p className="text-xs text-white/60">Manage provider keys through the system keychain.</p>
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-white/60">Transcription</h3>
        <TranscriptionEngineSelect
          value={props.transcriptionEngine}
          onChange={props.onTranscriptionEngineChange}
        />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-white/60">Keybinds</h3>
        <KeybindTable keybinds={props.keybinds} onRebind={props.onKeybindRebind} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-white/60">Stealth</h3>
        <StealthToggles value={props.stealth} onChange={props.onStealthChange} />
      </section>
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-white/60">Modes and prompts</h3>
        <ModesPrompts
          value={props.modesPrompts}
          providerOptions={props.providerOptions}
          onChange={props.onModesPromptsChange}
        />
      </section>
    </div>
  )
}
