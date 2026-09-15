import {
  formatMeetingDuration,
  formatMeetingUseCounts,
  groupMeetingsByDay,
  meetingDurationMs,
  type MeetingId,
  type MeetingSummary
} from "../../../shared/meeting"

interface ActivityHistoryProps {
  readonly meetings: ReadonlyArray<MeetingSummary>
  readonly nowMs: number
  readonly onDelete: (id: MeetingId) => void
  readonly onExport: (id: MeetingId) => void
  readonly onReopen: (id: MeetingId) => void
}

const rowButtonClass =
  "rounded-lg border border-white/15 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-white/80 hover:bg-white/10"

export function ActivityHistory(props: ActivityHistoryProps) {
  const groups = groupMeetingsByDay(props.meetings, props.nowMs)
  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/40 p-3">
        <p className="text-sm font-medium text-white/90">Activity</p>
        <p className="mt-1 text-xs text-white/50">No meetings yet.</p>
      </div>
    )
  }
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-white/90">Activity</p>
      {groups.map((group) => (
        <section key={group.label}>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{group.label}</p>
          <ol className="mt-1 space-y-1.5">
            {group.meetings.map((meeting) => (
              <li key={meeting.id} className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-xs font-medium text-white/90">{meeting.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-white/40">
                    {formatMeetingDuration(meetingDurationMs(meeting))}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-white/50">
                  {formatMeetingUseCounts(meeting.askCount, meeting.assistCount)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      props.onReopen(meeting.id)
                    }}
                    className={rowButtonClass}
                  >
                    Reopen
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onExport(meeting.id)
                    }}
                    className={rowButtonClass}
                  >
                    Export
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      props.onDelete(meeting.id)
                    }}
                    className={rowButtonClass}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
