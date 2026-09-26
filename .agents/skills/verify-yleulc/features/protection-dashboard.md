# Protection dashboard

Protection shows which third-party apps are wrapped so the shim erases the overlay from their X11 captures, and lets the user relaunch an app wrapped or protect all at once.

## Sub-features

- `protection-open` opens the Protection panel from the header.
- `protection-rows` lists wrapped apps with their state.
- `protection-states` distinguishes not installed, not running, running unwrapped, running wrapped, and verified.
- `protection-protect-all` requests wrapping for every known app.
- `protection-relaunch` requests a wrapped relaunch for one app.
- `protection-failsafe` refuses to signal anything when the shim or the target binary is missing.

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
- **Read the rows.** Read the same text output. Each row shows an app label and a state, with a `Relaunch` control. Record the labels and states you see. Five apps are listed: Chrome, Firefox, Brave, Zoom, Discord.
- **Capture the panel.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/protection/panel.png`. Read the PNG with your vision and confirm the heading, the description line, and the rows or the empty state render without clipping.
- **Failsafe proof.** Copy a decoy named `zoom` from `/usr/bin/sleep`, keep it running, and call `window.yleulc.relaunchProtectedApp("zoom")` through `node $SKILL_DIR/scripts/drive.mjs eval`. The call returns an error naming a reason, and the decoy is still alive afterwards. A relaxed process here is a defect, because a failed relaunch must never signal anything.
- **Success proof.** Set `YLEULC_REWRITER_PATH` to the packaged shim at `resources/native/capture-rewriter/capture_rewriter.so`, relaunch `firefox` with no Firefox running, and check the isolated HOME. `~/.local/bin/yleulc-firefox`, `~/.local/share/applications/yleulc-firefox.desktop`, and `~/.local/share/yleulc/capture_rewriter.so` all exist, and `rewriter.log` contains `loaded pid=` lines from the launched browser.
- **Protect all.** Run `node $SKILL_DIR/scripts/drive.mjs click "Protect all"`. The rows change state or an error naming a reason appears. Record which.

## Gotchas

- Launching a wrapped app is a real side effect on this machine. Prefer reading the dashboard over choosing `Relaunch` unless the function under test is relaunch itself.
- Relaunch closes the running app first. If the app is your own browser, or a browser an automation tool is attached to, it will lose it. Verify relaunch against a decoy or a scratch profile, never against the browser you are working in.
- An empty app list is not a failure. Report it as `no wrappable apps installed`, not as a broken panel.
- The dashboard refreshes on a protection event. Wait for the row text rather than screenshotting immediately after a click.
- `not running` means the binary is installed but no matching process is up. Do not read it as `not installed`.
- Matching is by resolved executable path, not by name. A process merely named `firefox` does not appear in Firefox's pids, and Brave's `chrome-sandbox` and `chrome-management-service` helpers never appear in Chrome's pids.
- When the shim or the target binary cannot be resolved, relaunch must fail with a reason and signal nothing. Run the decoy check before and after any change to the protection code.
- Claims about hiding are X11 only. Do not record a Wayland capture claim from this panel.
