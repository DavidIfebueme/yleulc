# yleulc verification map

This directory is the maintained source for verifying the user-facing behavior of yleulc. Read this index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- Launch with `.agents/skills/verify-yleulc/scripts/up.sh` from the repo root, then `source "$RUN_DIR/env.sh"`.
- The app runs from `out/` against the mock provider, with `HOME` and `YLEULC_SETTINGS_PATH` under `$RUN_DIR`.
- `check-fresh-build.mjs` must pass; a stale `out/` invalidates every result.
- Never drive an instance this run did not start. Run `doctor.sh` to confirm.
- One Xvfb display and one CDP port per run. Change `DISPLAY_NUM` and `CDP_PORT` before starting a second run.

## Driving conventions

- Start every recipe from the baseline state unless its preconditions say otherwise.
- Prefer `data-*` handles, ARIA labels, and visible text over coordinates.
- Treat every command as literal. Keep quoted strings and flags unchanged.
- Run renderer actions through `scripts/drive.mjs`.
- Read every screenshot with your own vision before claiming a visual pass.
- Restore any seeded state you mutate. Never remove proof artifacts during cleanup.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof is a screenshot plus the DOM text that contains the expected string.
- Answer proof is the `ask` JSON with `status`, the answer text, and the timings.
- Persistence proof is a read of `$RUN_DIR/home/settings.json` after a Settings change.
- Record the feature ID and the entry point used with every artifact.
- Report an unreachable path with the attempted command and the unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with drive.mjs` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Ask an answer](./ask-panel.md) covers typing a question, streaming an answer, the empty state, and the failure card.
- [Listen and status](./listen-status.md) covers capture start, the status pill wording, End and Resume, and the transcript view.
- [Settings persistence](./settings-persistence.md) covers provider keys, auto-answer, and survival across a restart.
- [Protection dashboard](./protection-dashboard.md) covers wrapped app rows and the Protect all action.
- [Activity history](./activity-history.md) covers saving and reopening a meeting.
