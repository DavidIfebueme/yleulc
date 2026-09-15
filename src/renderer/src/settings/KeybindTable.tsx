import type { ChangeEvent } from "react"
import { isKeybindConflicted, keybindActions } from "../../../shared/keybinds"
import type { KeybindAction, KeybindMap } from "../../../shared/keybinds"

interface KeybindTableProps {
  readonly keybinds: KeybindMap
  readonly onRebind: (action: KeybindAction, combo: string) => void
}

const actionLabels: Record<KeybindAction, string> = {
  assist: "Assist",
  submit: "Submit",
  toggleListen: "Toggle listen",
  toggleTranscript: "Toggle transcript",
  toggleVisibility: "Toggle overlay"
}

export function KeybindTable(props: KeybindTableProps) {
  return (
    <div className="space-y-2">
      {keybindActions.map((action) => {
        const conflicted = isKeybindConflicted(props.keybinds, action)
        return (
          <div key={action} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs text-white/70">
              <span>{actionLabels[action]}</span>
              {conflicted ? (
                <span className="rounded-full bg-red-400/15 px-2 py-0.5 text-[11px] text-red-200">conflict</span>
              ) : null}
            </span>
            <input
              value={props.keybinds[action] ?? ""}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                props.onRebind(action, event.currentTarget.value)
              }}
              className="w-36 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/90 outline-none"
            />
          </div>
        )
      })}
    </div>
  )
}
