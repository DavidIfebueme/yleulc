# CONTEXT.md

Domain language for yleulc. Use these terms exactly in issues, tests, and names.

## Glossary

- **overlay** — the floating always-on-top assistant window. The only window the stealth system hides.
- **Ask panel** — overlay mode for instant Q&A: type or screenshot, get a streamed answer.
- **Assist** — one-shot answer action triggered by hotkey, using current screen plus transcript context.
- **Listen** — overlay mode for live meetings: continuous transcription with automatic answers.
- **transcript** — timestamped speech-to-text segments of the current session.
- **note** — saved meeting summary with key questions, action items, follow-up draft.
- **meeting** — a stored session: transcript plus notes plus metadata.
- **provider** — an LLM backend (OpenAI, Anthropic, Gemini, OpenRouter, Groq, Together, DeepSeek, xAI, Mistral, Ollama, generic OpenAI-compatible). Users bring their own keys.
- **transcription engine** — speech-to-text backend. Default is local whisper.cpp. Deepgram, AssemblyAI, and Azure are BYOK options.
- **wrapper** — launcher that starts a third-party app (browser, Zoom, Discord) with the shim preloaded so its captures exclude the overlay.
- **shim** — the `LD_PRELOAD` shared library (`capture_rewriter.so`) that erases the overlay rectangle from root-window captures inside a wrapped process.
- **wrapped** — a process launched with the shim in its environment.
- **verified** — a wrapped process observed rewriting frames (hook-fired lines for its PID in the rewriter log during a share). Wrapped is a claim, verified is proof.
- **rewriter log** — per-run log the shim appends rewrite evidence to.

## Stealth posture

- X11 sessions: full erasure inside wrapped processes capturing through Xlib.
- Wayland sessions: share-a-single-window guidance plus auto-hide while any portal screencast session is active. Documented honestly, never oversold.
- Process lists, behavior, and physical capture are out of scope for pixel hiding.

## Non-goals

- No backend, no accounts, no telemetry. Keys live in the OS keychain. Data stays on the machine except prompt payloads sent to the provider the user chose.
- No macOS or Windows builds in v1.
