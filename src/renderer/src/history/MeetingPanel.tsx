import { useEffect, useState } from "react"
import {
  formatSegmentTimestamp,
  type Meeting,
  type MeetingId,
  type MeetingSummary,
  type MeetingTranscript
} from "../../../shared/meeting"
import { ActivityHistory } from "./ActivityHistory"
import {
  deleteMeeting,
  exportMeetingMarkdown,
  getMeeting,
  isMeetingBridgeAvailable,
  listMeetings,
  saveMeeting
} from "./MeetingIpcGateway"

interface MeetingPanelProps {
  readonly transcript: MeetingTranscript
}

export function MeetingPanel(props: MeetingPanelProps) {
  const [meetings, setMeetings] = useState<ReadonlyArray<MeetingSummary>>([])
  const [errorMessage, setErrorMessage] = useState("")
  const [detail, setDetail] = useState<Meeting | undefined>(undefined)
  const [exportText, setExportText] = useState("")
  const [nowMs, setNowMs] = useState(() => Date.now())

  const refreshMeetings = (): void => {
    void listMeetings().then(
      (rows) => {
        setMeetings(rows)
        setNowMs(Date.now())
        setErrorMessage("")
      },
      () => {
        setErrorMessage("meetings could not be loaded")
      }
    )
  }

  useEffect(() => {
    if (!isMeetingBridgeAvailable()) {
      return
    }
    void listMeetings().then(
      (rows) => {
        setMeetings(rows)
        setNowMs(Date.now())
        setErrorMessage("")
      },
      () => {
        setErrorMessage("meetings could not be loaded")
      }
    )
  }, [])

  const saveSession = (): void => {
    const first = props.transcript[0]
    const last = props.transcript[props.transcript.length - 1]
    if (first === undefined || last === undefined) {
      return
    }
    const startedAtMs = first.startMs
    const endedAtMs = last.endMs
    void saveMeeting({
      askCount: 0,
      assistCount: 0,
      endedAtMs,
      note: { actionItems: [], followUpDraft: "", keyQuestions: [] },
      startedAtMs,
      title: `Session ${new Date(startedAtMs).toLocaleString()}`,
      transcript: props.transcript
    }).then(
      () => {
        setErrorMessage("")
        refreshMeetings()
      },
      () => {
        setErrorMessage("meeting could not be saved")
      }
    )
  }

  const reopenMeeting = (id: MeetingId): void => {
    void getMeeting({ id }).then(
      (meeting) => {
        setDetail(meeting)
        setExportText("")
        setErrorMessage("")
      },
      () => {
        setErrorMessage("meeting could not be opened")
      }
    )
  }

  const exportMeeting = (id: MeetingId): void => {
    void exportMeetingMarkdown({ id }).then(
      (markdown) => {
        setExportText(markdown)
        setErrorMessage("")
      },
      () => {
        setErrorMessage("meeting could not be exported")
      }
    )
  }

  const removeMeeting = (id: MeetingId): void => {
    void deleteMeeting({ id }).then(
      () => {
        setErrorMessage("")
        setDetail((current) => (current !== undefined && current.id === id ? undefined : current))
        setExportText("")
        refreshMeetings()
      },
      () => {
        setErrorMessage("meeting could not be deleted")
      }
    )
  }

  if (!isMeetingBridgeAvailable()) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <p className="text-sm font-medium text-white/90">Activity</p>
        <p className="mt-1 text-xs text-white/50">Meeting history needs the desktop app.</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-white/90">Activity</p>
          <button
            type="button"
            disabled={props.transcript.length === 0}
            onClick={saveSession}
            className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-medium text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            End session and save
          </button>
        </div>
        {errorMessage === "" ? null : <p className="mt-1 text-[11px] text-red-300/80">{errorMessage}</p>}
      </div>
      <ActivityHistory
        meetings={meetings}
        nowMs={nowMs}
        onDelete={removeMeeting}
        onExport={exportMeeting}
        onReopen={reopenMeeting}
      />
      {detail === undefined ? null : (
        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
          <p className="text-sm font-medium text-white/90">{detail.title}</p>
          <p className="mt-1 text-[11px] text-white/50">{new Date(detail.startedAtMs).toLocaleString()}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Transcript</p>
          {detail.transcript.length === 0 ? (
            <p className="mt-1 text-xs text-white/50">No segments.</p>
          ) : (
            <ol className="mt-1 space-y-1">
              {detail.transcript.map((segment) => (
                <li key={segment.id} className="text-xs text-white/70">
                  <span className="font-mono text-[11px] text-white/40">{formatSegmentTimestamp(segment.startMs)}</span>
                  <span>{` ${segment.text}`}</span>
                </li>
              ))}
            </ol>
          )}
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Key questions</p>
          {detail.note.keyQuestions.length === 0 ? (
            <p className="mt-1 text-xs text-white/50">None</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {detail.note.keyQuestions.map((question) => (
                <li key={question} className="text-xs text-white/70">{question}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Action items</p>
          {detail.note.actionItems.length === 0 ? (
            <p className="mt-1 text-xs text-white/50">None</p>
          ) : (
            <ul className="mt-1 space-y-1">
              {detail.note.actionItems.map((item) => (
                <li key={item} className="text-xs text-white/70">{item}</li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Follow-up draft</p>
          <p className="mt-1 text-xs text-white/70">
            {detail.note.followUpDraft === "" ? "None" : detail.note.followUpDraft}
          </p>
        </div>
      )}
      {exportText === "" ? null : (
        <div className="rounded-xl border border-white/10 bg-black/40 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Export</p>
          <pre className="mt-1 whitespace-pre-wrap text-xs text-white/70">{exportText}</pre>
        </div>
      )}
    </div>
  )
}
