# Activity history

Activity shows saved meetings. A user ends a session to save the current transcript as a meeting, then reopens, exports, or deletes stored meetings.

## Sub-features

- `activity-open` opens the Activity panel from the header.
- `activity-save` saves the current session as a meeting.
- `activity-list` lists saved meetings with their timestamps.
- `activity-reopen` opens a saved meeting and shows its transcript.
- `activity-export` produces a markdown export of a saved meeting.
- `activity-delete` removes a saved meeting.

## How to get to it (user POV)

- Choose `Activity` in the header.
- Choose `End session and save` after a session with transcript segments.
- Choose a meeting row to reopen it.
- Choose `Export` to read the markdown, `Delete` to remove it.

## Driving it with drive.mjs

Preconditions:

- `up.sh` completed and `env.sh` is sourced.
- The meeting database lives under `$RUN_DIR/home`, so it starts empty.
- `End session and save` is disabled until the transcript has at least one segment. With no transcription engine configured in the sandbox, drive the save path only when a transcript exists.

- **Open Activity.** Run `node $SKILL_DIR/scripts/drive.mjs click "Activity"` then `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Activity` and `End session and save`.
- **Empty history.** Read the same output. With an empty database the list has no meeting rows. Record it as empty, not broken.
- **Capture the panel.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/activity/panel.png`. Read the PNG with your vision and confirm the panel and the save control render without clipping.
- **Database check.** Run `ls -la $RUN_DIR/home/.config/yleulc/`. A `yleulc-meetings.db` file exists once the store initialises. Its presence after a save proves the write.
- **Save path.** With transcript segments present, choose `End session and save`. A meeting row appears with a timestamp and a `Relaunch`-free row of controls including export and delete. Then reopen it and confirm the transcript renders.

## Gotchas

- Save is disabled without transcript segments. An empty transcript is the normal sandbox state, so the full save, reopen, export, and delete path needs a live transcription engine or a seeded database.
- Do not clear `yleulc-meetings.db` to force an empty state; a fresh `RUN_DIR` already gives you one.
- Timestamps render from `nowMs` at load. A stale relative time is not a defect on its own.
- Export returns markdown text into the panel. Assert the text, not a downloaded file.
