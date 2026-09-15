import type { ChangeEvent } from "react"
import type { ModesPromptsSettings, ProviderId, SettingsMode } from "../../../shared/settingsIpc"

export type ModesPromptsValue = ModesPromptsSettings

export interface ModesPromptsProviderOption {
  readonly displayName: string
  readonly id: ProviderId
}

interface ModesPromptsProps {
  readonly onChange: (value: ModesPromptsValue) => void
  readonly providerOptions: ReadonlyArray<ModesPromptsProviderOption>
  readonly value: ModesPromptsValue
}

export function ModesPrompts(props: ModesPromptsProps) {
  const addPromptMode = (): void => {
    let number = props.value.promptModes.length + 1
    let id = `mode-${number}`
    while (props.value.promptModes.some((mode) => mode.id === id)) {
      number = number + 1
      id = `mode-${number}`
    }
    props.onChange({
      ...props.value,
      activePromptModeId: id,
      promptModes: [...props.value.promptModes, { id, label: "New mode", prompt: "" }]
    })
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        <span>Default mode</span>
        <select
          value={props.value.defaultMode}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const next: SettingsMode = event.currentTarget.value === "listen" ? "listen" : "ask"
            props.onChange({ ...props.value, defaultMode: next })
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white/90 outline-none"
        >
          <option value="ask">Ask</option>
          <option value="listen">Listen</option>
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        <span>Default provider</span>
        <select
          value={props.value.defaultProviderId}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const provider = props.providerOptions.find((option) => option.id === event.currentTarget.value)
            props.onChange({ ...props.value, defaultProviderId: provider?.id ?? props.value.defaultProviderId })
          }}
          className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white/90 outline-none"
        >
          {props.providerOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.displayName}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        <span>Default model</span>
        <input
          value={props.value.defaultModel}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            props.onChange({ ...props.value, defaultModel: event.currentTarget.value })
          }}
          className="w-40 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none"
        />
      </label>
      <label className="block space-y-1 text-xs text-white/70">
        <span>System prompt</span>
        <textarea
          value={props.value.systemPrompt}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
            props.onChange({ ...props.value, systemPrompt: event.currentTarget.value })
          }}
          rows={3}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none"
        />
      </label>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-white/70">
          <span>Prompt modes</span>
          <button
            type="button"
            onClick={addPromptMode}
            className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
          >
            Add mode
          </button>
        </div>
        {props.value.promptModes.map((mode) => (
          <div key={mode.id} className="space-y-1 rounded-xl border border-white/10 bg-white/5 p-2">
            <input
              value={mode.label}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                props.onChange({
                  ...props.value,
                  promptModes: props.value.promptModes.map((entry) =>
                    entry.id === mode.id ? { ...entry, label: event.currentTarget.value } : entry
                  )
                })
              }}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white/90 outline-none"
            />
            <textarea
              value={mode.prompt}
              onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                props.onChange({
                  ...props.value,
                  promptModes: props.value.promptModes.map((entry) =>
                    entry.id === mode.id ? { ...entry, prompt: event.currentTarget.value } : entry
                  )
                })
              }}
              rows={2}
              className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white/90 outline-none"
            />
            {props.value.promptModes.length > 1 ? (
              <button
                type="button"
                onClick={() => {
                  const promptModes = props.value.promptModes.filter((entry) => entry.id !== mode.id)
                  props.onChange({
                    ...props.value,
                    activePromptModeId:
                      props.value.activePromptModeId === mode.id
                        ? (promptModes[0]?.id ?? "")
                        : props.value.activePromptModeId,
                    promptModes
                  })
                }}
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                Remove mode
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
