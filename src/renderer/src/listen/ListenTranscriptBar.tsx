import { useEffect, useRef } from "react"
import { listenChannelLabel, type ListenTranscriptEntry } from "../../../shared/listenIpc"
import { formatListenTimestamp } from "./ListenTimer"

interface ListenTranscriptBarProps {
  readonly entries: ReadonlyArray<ListenTranscriptEntry>
}

export function ListenTranscriptBar(props: ListenTranscriptBarProps) {
  const scrollRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = scrollRef.current
    if (list !== null) {
      list.scrollTop = list.scrollHeight
    }
  }, [props.entries])
  if (props.entries.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-white/10 bg-black/40 px-3 py-2.5">
        <p className="text-xs text-white/50">Waiting for speech…</p>
      </div>
    )
  }
  return (
    <ol
      ref={scrollRef}
      className="mt-2 max-h-44 space-y-1.5 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-2.5"
    >
      {props.entries.map((entry) => (
        <li
          key={entry.id}
          className={`flex items-baseline gap-2 text-xs ${entry.interim ? "opacity-60" : ""}`}
        >
          <span className="shrink-0 font-mono text-white/40">{formatListenTimestamp(entry.startMs)}</span>
          <span
            className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold ${
              entry.channel === "mic" ? "bg-sky-500/20 text-sky-300" : "bg-violet-500/20 text-violet-300"
            }`}
          >
            {listenChannelLabel(entry.channel)}
          </span>
          <span className="text-white/80">{entry.interim ? `${entry.text}…` : entry.text}</span>
        </li>
      ))}
    </ol>
  )
}
