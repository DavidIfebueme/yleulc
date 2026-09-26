# Listen and status

Listen captures audio and transcribes it. Since 0.1.5 capture starts when the overlay opens, independent of whether the transcript panel is shown. The status bar reports the real session state, and End stops capture while Resume starts it again.

## Sub-features

- `listen-autostart` starts capture on overlay open with the transcript panel closed.
- `listen-pill` reports `Listening` while running and `Stopped` when not.
- `listen-end` stops capture and reveals Resume.
- `listen-resume` starts capture again from the stopped state.
- `listen-transcript` opens the transcript view with the Live transcript heading.
- `listen-engine-error` surfaces a transcription engine error instead of claiming to listen.

## How to get to it (user POV)

- Open the app; capture starts on its own.
- Read the status bar at the top, left of the End and Resume controls.
- Choose `End` to stop, `Resume` to start again.
- Choose `Show Transcript` to open the transcript view, `Hide Transcript` to close it.
- Press the `Ctrl+Shift+L` listen hotkey to toggle capture.

## Driving it with drive.mjs

Preconditions:

- `up.sh` completed and `env.sh` is sourced.
- The run is fresh, so the app has just launched and capture was attempted.
- `TRACE` defaults to `deepgram` in `up.sh`, which has no key in the sandbox. Expect a fast engine error rather than a long local model bootstrap.

- **Autostart with the panel closed.** Run `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Live session status`, the panel is not showing `Live transcript`, and the status line is present without any transcript entries. This proves capture started before the transcript was opened.
- **Capture the status bar.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/listen/status.png`. Read the PNG with your vision and confirm the status bar shows a state word, an elapsed timer, `Mute`, and either `End` or `Resume`.
- **Engine error honesty.** Read the status word and the banner together. If the engine failed, the status must read `Stopped` and an error banner must be present. `Listening` with a failed engine is a defect.
- **Open the transcript.** Run `node $SKILL_DIR/scripts/drive.mjs click "Show Transcript"` then `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Live transcript` and the button now reads `Hide Transcript`.
- **Stop capture.** Run `node $SKILL_DIR/scripts/drive.mjs click "End"` then `node $SKILL_DIR/scripts/drive.mjs text`. The status reads `Stopped` and a `Resume` control is present.
- **Resume capture.** Run `node $SKILL_DIR/scripts/drive.mjs click "Resume"` then `node $SKILL_DIR/scripts/drive.mjs text`. The status leaves `Stopped`. Either it returns to `Listening`, or it returns to `Stopped` with an error banner if the engine is unavailable. Record which.
- **Hotkey toggle.** Run `node $SKILL_DIR/scripts/drive.mjs click "Ask"` and observe the status before and after pressing the listen hotkey. Capture is toggled, not just the label.

## Gotchas

- The transcription engine is not configured in the sandbox. A stopped session with an engine banner is the expected state, not a failure. Do not treat it as a pass for `listen-resume` unless the status actually changes.
- Local whisper would download a model and slow the run to a crawl. Keep `TRACE=deepgram` unless you are specifically verifying the local engine.
- The elapsed timer only advances while the session runs. A frozen timer with `Listening` shown means the pill is lying.
- `Mute` is cosmetic. Toggling it does not change capture; do not claim audio mute as proven.
- Auto-answer is off by default and cannot yet separate your voice from the other party. Do not claim auto-answer from this recipe.
