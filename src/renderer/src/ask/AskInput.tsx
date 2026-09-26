import type { ChangeEvent, KeyboardEvent } from "react"

interface AskInputProps {
  readonly value: string
  readonly onChange: (value: string) => void
  readonly onSubmit: () => void
}

export function AskInput(props: AskInputProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    props.onChange(event.currentTarget.value)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter" && event.shiftKey === false) {
      event.preventDefault()
      props.onSubmit()
    }
  }
  return (
    <div className="overlay-card flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
      <input
        value={props.value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Ask anything about this meeting"
        aria-label="Ask input"
        className="overlay-input min-w-0 w-full flex-1 border-0 bg-transparent px-0 text-sm outline-none"
      />
      <kbd className="shrink-0 rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/50">
        Tab
      </kbd>
    </div>
  )
}
