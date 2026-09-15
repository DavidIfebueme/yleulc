import type { ChangeEvent } from "react"

export const cluelyPromptModes = [
  { id: "general", label: "General", prompt: "" },
  {
    id: "sales",
    label: "Cluely for Sales",
    prompt: "Coach the user through this sales conversation. Give concise, practical next steps they can say aloud."
  }
] as const

export type CluelyPromptModeId = (typeof cluelyPromptModes)[number]["id"]

interface CluelyPromptModeSelectProps {
  readonly modeId: CluelyPromptModeId
  readonly onModeChange: (modeId: CluelyPromptModeId) => void
}

export function promptForCluelyMode(modeId: CluelyPromptModeId, smartMode: boolean): string {
  const selected = cluelyPromptModes.find((mode) => mode.id === modeId) ?? cluelyPromptModes[0]
  const smartPrompt = smartMode
    ? "Prioritize coding assistance. Explain the approach, edge cases, and implementation clearly."
    : ""
  return [selected.prompt, smartPrompt].filter((prompt) => prompt !== "").join("\n\n")
}

export function CluelyPromptModeSelect(props: CluelyPromptModeSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const found = cluelyPromptModes.find((mode) => mode.id === event.currentTarget.value)
    props.onModeChange(found?.id ?? "general")
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-white/60">
      <span className="sr-only">Prompt mode</span>
      <select
        value={props.modeId}
        onChange={handleChange}
        className="max-w-44 rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs font-medium text-white/90 outline-none"
      >
        {cluelyPromptModes.map((mode) => (
          <option key={mode.id} value={mode.id}>
            {mode.label}
          </option>
        ))}
      </select>
    </label>
  )
}
