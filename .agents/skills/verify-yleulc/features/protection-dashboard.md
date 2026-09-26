# Protection dashboard

Protection shows which third-party apps are wrapped so the shim erases the overlay from their X11 captures, and lets the user relaunch an app wrapped or protect all at once.

## Sub-features

- `protection-open` opens the Protection panel from the header.
- `protection-rows` lists wrapped apps with their state.
- `protection-protect-all` requests wrapping for every known app.
- `protection-relaunch` requests a wrapped relaunch for one app.

## How to get to it (user POV)

- Choose `Protection` in the header.
- Read the app rows and each state label.
- Choose `Protect all`.
- Choose `Relaunch` on a single app row.

## Driving it with drive.mjs

Preconditions:

- `up.sh` completed and `env.sh` is sourced.
- The wrapper registry is present. Rows appear only for apps the registry knows about, so an empty list is a valid state on a machine with none of them installed.

- **Open Protection.** Run `node $SKILL_DIR/scripts/drive.mjs click "Protection"` then `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Protection` and `Wrapped apps exclude the overlay from X11 captures.` and a `Protect all` control.
- **Read the rows.** Read the same text output. Each row shows an app label and a state, with a `Relaunch` control. Record the labels you see.
- **Capture the panel.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/protection/panel.png`. Read the PNG with your vision and confirm the heading, the description line, and the rows or the empty state render without clipping.
- **Protect all.** Run `node $SKILL_DIR/scripts/drive.mjs click "Protect all"`. A message appears or the rows change state. If the call fails, a message such as `apps could not be protected` is shown; record which.
- **Relaunch one.** Run `node $SKILL_DIR/scripts/drive.mjs click "Relaunch"`. The row state updates or a message names the app. Record the outcome.

## Gotchas

- Launching a wrapped app is a real side effect on this machine. Prefer reading the dashboard over choosing `Relaunch` unless the function under test is relaunch itself.
- An empty app list is not a failure. Report it as `no wrappable apps installed`, not as a broken panel.
- The dashboard refreshes on a protection event. Wait for the row text rather than screenshotting immediately after a click.
- Claims about hiding are X11 only. Do not record a Wayland capture claim from this panel.
