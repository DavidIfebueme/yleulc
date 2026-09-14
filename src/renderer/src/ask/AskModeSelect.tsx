import type { ChangeEvent } from "react"

export type AskMode = "ask" | "listen"

interface AskModeSelectProps {
  readonly mode: AskMode
  readonly onModeChange: (mode: AskMode) => void
}

export function AskModeSelect(props: AskModeSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next: AskMode = event.currentTarget.value === "listen" ? "listen" : "ask"
    props.onModeChange(next)
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-white/60">
      <span>Mode</span>
      <select
        value={props.mode}
        onChange={handleChange}
        className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white/90 outline-none"
      >
        <option value="ask">Ask</option>
        <option value="listen">Listen</option>
      </select>
    </label>
  )
}
