import type { ListenTranscriptEntry } from "../../../shared/listenIpc"

export const mockListenEntries: ReadonlyArray<ListenTranscriptEntry> = [
  {
    channel: "mic",
    endMs: 2200,
    id: "listen-001",
    interim: false,
    language: "en",
    startMs: 1200,
    text: "Kickoff with scope and timeline review."
  },
  {
    channel: "system",
    endMs: 42500,
    id: "listen-002",
    interim: false,
    language: "en",
    startMs: 40000,
    text: "Can you share the pricing breakdown?"
  },
  {
    channel: "mic",
    endMs: 76200,
    id: "listen-003",
    interim: false,
    language: "en",
    startMs: 74000,
    text: "Owner assigned for the follow-up draft."
  },
  {
    channel: "mic",
    endMs: 90000,
    id: "listen-004",
    interim: true,
    language: "en",
    startMs: 88000,
    text: "What should I"
  }
]

export function streamMockListenEntries(
  onEntry: (entry: ListenTranscriptEntry) => void,
  intervalMs = 1200
): () => void {
  let index = 0
  const timerId = window.setInterval(() => {
    const next = mockListenEntries[index]
    index = index + 1
    if (next === undefined) {
      window.clearInterval(timerId)
      return
    }
    onEntry(next)
  }, intervalMs)
  return () => {
    window.clearInterval(timerId)
  }
}
