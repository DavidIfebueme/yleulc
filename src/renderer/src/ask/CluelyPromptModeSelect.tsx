import type { ChangeEvent } from "react"
import type { PromptMode } from "../../../shared/settingsIpc"

interface CluelyPromptModeSelectProps {
  readonly modeId: string
  readonly modes: ReadonlyArray<PromptMode>
  readonly onModeChange: (modeId: string) => void
}

export function CluelyPromptModeSelect(props: CluelyPromptModeSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const found = props.modes.find((mode) => mode.id === event.currentTarget.value)
    props.onModeChange(found?.id ?? props.modes[0]?.id ?? "")
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-white/60">
      <span className="sr-only">Prompt mode</span>
      <select
        value={props.modeId}
        onChange={handleChange}
        className="max-w-44 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs font-medium text-white/90 outline-none"
      >
        {props.modes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.label}
          </option>
        ))}
      </select>
    </label>
  )
}
