import type { ChangeEvent } from "react"

export type TranscriptionEngineOption = "assemblyai" | "azure" | "deepgram" | "local"

interface TranscriptionEngineSelectProps {
  readonly onChange: (value: TranscriptionEngineOption) => void
  readonly value: TranscriptionEngineOption
}

export function TranscriptionEngineSelect(props: TranscriptionEngineSelectProps) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const value = event.currentTarget.value
    const next: TranscriptionEngineOption =
      value === "assemblyai" || value === "azure" || value === "deepgram" ? value : "local"
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
        <option value="assemblyai">AssemblyAI</option>
        <option value="azure">Azure</option>
      </select>
    </label>
  )
}
