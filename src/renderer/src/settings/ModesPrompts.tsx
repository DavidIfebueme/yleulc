import type { ChangeEvent } from "react"

export type ModesPromptMode = "ask" | "listen"

export interface ModesPromptsValue {
  readonly defaultMode: ModesPromptMode
  readonly defaultModel: string
  readonly defaultProviderId: string
  readonly systemPrompt: string
}

export interface ModesPromptsProviderOption {
  readonly displayName: string
  readonly id: string
}

interface ModesPromptsProps {
  readonly onChange: (value: ModesPromptsValue) => void
  readonly providerOptions: ReadonlyArray<ModesPromptsProviderOption>
  readonly value: ModesPromptsValue
}

export function ModesPrompts(props: ModesPromptsProps) {
  return (
    <div className="space-y-2">
      <label className="flex items-center justify-between gap-2 text-xs text-white/70">
        <span>Default mode</span>
        <select
          value={props.value.defaultMode}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => {
            const next: ModesPromptMode = event.currentTarget.value === "listen" ? "listen" : "ask"
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
            props.onChange({ ...props.value, defaultProviderId: event.currentTarget.value })
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
    </div>
  )
}
