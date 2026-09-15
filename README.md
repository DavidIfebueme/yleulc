# yleulc

Working title. Linux-first invisible AI meeting overlay: real-time answers, transcription, and notes in a floating panel that stays out of screen captures on X11.

Status: early scaffold. Private repo until the license is decided.

Stack: Electron, React, TypeScript strict, Tailwind CSS, Effect v4.

See AGENTS.md for contributor rules, CONTEXT.md for domain language.

`scripts/verify-overlay/run.sh` verifies X11 root-window capture rewriting under Xvfb. It skips when Xvfb is unavailable. This check does not apply to Wayland. On Wayland, use single-window sharing and auto-hide while portal screencasting is active.
