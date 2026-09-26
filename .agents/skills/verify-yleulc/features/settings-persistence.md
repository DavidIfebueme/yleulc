# Settings persistence

Settings lets a user store provider keys, choose a default provider and model, toggle auto-answer, rebind keys, and reset. Changes save through an IPC snapshot and must survive a restart. The snapshot is written to the `YLEULC_SETTINGS_PATH` file this run seeded.

## Sub-features

- `settings-open` opens the Settings panel from the header.
- `settings-aut` toggles auto-answer and persists it.
- `settings-model` selects a provider and model and persists the pair.
- `settings-reset` restores the defaults snapshot.
- `settings-restart` keeps the saved values across an app restart.

## How to get to it (user POV)

- Choose `Settings` in the header.
- Toggle `Answer questions automatically` under `Live transcription`.
- Change `Default provider` and `Default model` under `Modes and prompts`.
- Choose `Reset` to restore defaults.

## Driving it with drive.mjs

Preconditions:

- `up.sh` completed and `env.sh` is sourced.
- The seeded snapshot has `listen.autoAnswer` false and provider `deepseek`.

- **Open Settings.** Run `node $SKILL_DIR/scripts/drive.mjs click "Settings"` then `node $SKILL_DIR/scripts/drive.mjs text`. The text contains `Workspace controls`, `Provider keys`, `Transcription`, `Live transcription`, `Keybinds`, `Stealth`, and `Modes and prompts`.
- **Toggle auto-answer.** Run `node $SKILL_DIR/scripts/drive.mjs eval "document.querySelector('input[type=checkbox]').click(), true"` then wait for the save. Confirm the toggle is checked in the DOM.
- **Prove persistence.** Run `cat $RUN_DIR/home/settings.json`. The JSON has `"listen":{"autoAnswer":true}`. A UI-only change that is absent from the file is a defect.
- **Capture the panel.** Run `node $SKILL_DIR/scripts/drive.mjs shot $RUN_DIR/artifacts/settings/panel.png`. Read the PNG with your vision and confirm the section headings and the checkbox render without clipping.
- **Reset.** Choose `Reset`. The file returns to the defaults, with `"autoAnswer":false`.
- **Restart survival.** Stop the app with `down.sh`, run `up.sh` again with the same `RUN_DIR`, and read the panel. Values written before the restart are still present. Note that `up.sh` reseeds the settings file, so seed the value you want to survive immediately after the first `up.sh`.

## Gotchas

- `up.sh` overwrites `$RUN_DIR/home/settings.json` on every start. For a restart-survival proof, edit or toggle after the second `up.sh`, then restart again.
- Provider keys save to the OS keychain through `secret-tool`, not to the settings file. Do not look for keys in `settings.json`.
- The save is queued. Read the file after the UI shows a saved value, not immediately after the click.
- A provider with no keychain entry still lists, but the registry only exposes providers with a key. Ask uses the provider named in the snapshot.
