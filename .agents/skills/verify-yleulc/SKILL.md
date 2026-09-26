---
name: verify-yleulc
description: Drive the yleulc Electron overlay the way a user does, capture screenshots and telemetry as proof, and check that the UI renders and answers correctly. Use when verifying yleulc UI, Ask, Listen, Settings, Protection, a provider or streaming change, a layout or visual change, or before releasing.
---

# Verify yleulc

yleulc is a Linux Electron overlay. The user-facing surface is a 420x320 always-on-top window with four panels, Ask, Activity, Settings, and Protection, plus a live transcription status bar. The app talks to LLM providers over OpenAI-compatible HTTP and to transcription backends over their own HTTP or a local binary.

This skill launches the built app against a deterministic mock provider on a private X display, drives the real renderer over the Chrome DevTools Protocol, and captures screenshots and telemetry you inspect with your own vision.

## Launch

Run every command from the repo root.

```bash
.agents/skills/verify-yleulc/scripts/up.sh
```

`up.sh` does all of this and prints `RUN_DIR` and `CDP_PORT`:

- runs `check-fresh-build.mjs`, which fails if any file under `src`, `native`, `electron-builder.yml`, or `package.json` is newer than `out/`. This is the guard against packaging or verifying a stale build.
- runs `npm run build`.
- starts `mock-provider.mjs` on `MOCK_PORT` (default 8787).
- starts `Xvfb` on `DISPLAY_NUM` (default 99).
- starts the app with `HOME` set to `$RUN_DIR/home`, `YLEULC_SETTINGS_PATH` to a seeded snapshot, `DEEPSEEK_API_KEY=verify-key`, and `DEEPSEEK_BASE_URL` pointed at the mock.
- waits until the CDP endpoint answers.

Load the run environment before driving:

```bash
source "$RUN_DIR/env.sh"
```

`MOCK_SCENARIO` selects the mock behavior: `default` returns a fixed answer whose first chunk carries `content:null` and `usage:null`, `slow` and `long` stream over time for latency work, `error` returns an upstream error frame.

Teardown is `scripts/down.sh`. It kills only the PIDs recorded in the run directory. It never kills by process name.

## Doctor

```bash
.agents/skills/verify-yleulc/scripts/doctor.sh
```

Read-only. Prints the run directory, whether the app process and the CDP and mock endpoints are up, the build freshness verdict, and the current renderer text. Run it first whenever the app looks wrong or a drive command fails.

## Drive

All driving goes through one script. It connects to the CDP page target and prints a value or JSON.

```bash
node .agents/skills/verify-yleulc/scripts/drive.mjs <command> [args]
```

- `text` prints `document.body.innerText`, the fastest way to see the whole UI as text.
- `shot <path>` writes a PNG of the renderer at its real 420x320 size. This is the vision artifact.
- `ask <question>` focuses the `Ask input`, types the question, presses Enter, and returns JSON with `status`, `answer`, `answerRendered`, `errorShown`, `firstTokenMs`, `settledMs`, and the raw event list. Typing into the real input is the user path; the events come from the app's own `onAskEvent` bridge.
- `perf <question>` is `ask` with a longer timeout, for `MOCK_SCENARIO=slow` or `long`.
- `click <label>` finds a button or link whose text matches and clicks it.
- `type <text>` inserts text into the focused element. `focus <selector>` focuses one first.
- `wait <text>` polls `innerText` until the text appears.
- `eval <expression>` runs arbitrary renderer JavaScript, for cases the other commands do not cover.

Stable handles in this app. The ask input is `input[aria-label="Ask input"]`. The status bar is `section[aria-label="Live session status"]`. Panels render as `[data-overlay-panel="ask"]` and the scroll region as `[data-scroll-region="ask"]`. Navigation buttons are `Ask`, `Activity`, `Settings`, `Protection`. Prefer these over coordinates.

## Evidence

Write proofs under `$RUN_DIR/artifacts/<feature>/`.

The proof standard:

- Exercise the user path. Type into the real input and click the real buttons, not an internal setter. `ask` types; it does not call `askQuestion` directly.
- Capture the action and the resulting state. A screenshot of the empty overlay does not prove an answer rendered. Capture after the answer settles, and assert the DOM text contains it.
- Inspect every screenshot yourself with your vision. Read the PNG, then state what you see. Check the header wordmark, the status pill wording, the panel you expect, and that no control is clipped or overlapped. A layout regression that passes the text assertions still fails this step.
- Verify side effects, not just pixels. Ask writes nothing, but Settings saves write `$RUN_DIR/home/settings.json`. Read that file to prove a toggle persisted.
- Report timings from `ask` and `perf` as numbers. A first-token time above 2000 ms against the mock is a finding.

Required artifacts per run: one screenshot per panel you touched, the `ask` JSON for any answer proof, and the mock request log from `curl -s http://127.0.0.1:$MOCK_PORT/requests` when you need to prove the request shape.

## Cleanup

```bash
.agents/skills/verify-yleulc/scripts/down.sh
```

Removes the app, Xvfb, and mock processes it started. Artifacts stay in `$RUN_DIR/artifacts`. After cleanup, confirm the screenshots still exist before you report.

## Helpers

- `scripts/up.sh` starts the whole stack and writes `env.sh`.
- `scripts/down.sh` stops only the recorded PIDs.
- `scripts/doctor.sh` one read-only health check.
- `scripts/drive.mjs` the CDP driver.
- `scripts/mock-provider.mjs` deterministic OpenAI-compatible provider.
- `scripts/check-fresh-build.mjs` fails on a stale `out/`.

## Feature map

Read `.agents/skills/verify-yleulc/features/README.md` before driving. It lists each user-facing feature and the recipe that proves it.
