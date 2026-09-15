import type { ChangeEvent } from "react"

export type TranscriptionEngineOption = "deepgram" | "local"

interface TranscriptionEngineSelectProps {
  readonly onChange: (value: TranscriptionEngineOption) => void
  readonly value: TranscriptionEngineOption
}

export function TranscriptionEngineSelect(props: TranscriptionEngineSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const next: TranscriptionEngineOption = event.currentTarget.value === "deepgram" ? "deepgram" : "local"
    props.onChange(next)
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-white/60">
      <span>Transcription engine</span>
      <select
        value={props.value}
        onChange={handleChange}
        className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1 text-xs text-white/90 outline-none"
      >
        <option value="local">Local whisper</option>
        <option value="deepgram">Deepgram</option>
      </select>
    </label>
  )
}
