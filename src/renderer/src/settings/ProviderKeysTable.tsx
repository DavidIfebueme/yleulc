import { useState } from "react"
import type { ChangeEvent } from "react"

export interface ProviderKeyRow {
  readonly displayName: string
  readonly hasKeychainKey: boolean
  readonly id: string
  readonly registryMissing: boolean
}

interface ProviderKeysTableProps {
  readonly onRemove: (id: string) => void
  readonly onSave: (id: string, key: string) => void
  readonly onTest: (id: string) => void
  readonly rows: ReadonlyArray<ProviderKeyRow>
  readonly testMessages: Record<string, string>
  readonly testingIds: ReadonlyArray<string>
}

export function ProviderKeysTable(props: ProviderKeysTableProps) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const changeDraft = (id: string, value: string): void => {
    setDrafts((previous) => ({ ...previous, [id]: value }))
  }
  return (
    <div className="space-y-2">
      {props.rows.map((row) => {
        const draft = drafts[row.id] ?? ""
        const testing = props.testingIds.includes(row.id)
        const message = props.testMessages[row.id] ?? ""
        const missing = row.registryMissing || !row.hasKeychainKey
        return (
          <div key={row.id} className="rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-white/90">{row.displayName}</span>
              {missing ? (
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-200">
                  missing key
                </span>
              ) : (
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[11px] text-emerald-200">saved</span>
              )}
            </div>
            <input
              value={draft}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                changeDraft(row.id, event.currentTarget.value)
              }}
              type="password"
              placeholder={`enter ${row.displayName} key`}
              className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white/90 outline-none"
            />
            <div className="mt-2 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  props.onSave(row.id, draft)
                  changeDraft(row.id, "")
                }}
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onTest(row.id)
                }}
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                {testing ? "Testing…" : "Test"}
              </button>
              <button
                type="button"
                onClick={() => {
                  props.onRemove(row.id)
                }}
                className="rounded-lg border border-white/15 bg-white/5 px-2 py-1 text-xs text-white/80 hover:bg-white/10"
              >
                Remove
              </button>
            </div>
            {message === "" ? null : <p className="mt-1 text-[11px] text-white/50">{message}</p>}
          </div>
        )
      })}
    </div>
  )
}
