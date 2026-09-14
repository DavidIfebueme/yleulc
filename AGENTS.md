# AGENTS.md

Yleulc: Linux-first invisible AI meeting overlay. Electron + React + TypeScript strict + Tailwind + Effect v4.

## Commands

- `npm run dev` — run in development
- `npm run typecheck` — strict typecheck, must pass before any commit
- `npm run lint` — eslint, must pass before any commit
- `npm run test` — vitest unit tests, must pass before any commit
- `npm run build` — production build

## Rules

- TypeScript strict. Never use `any`. If a third-party type forces your hand, isolate it in one narrow cast helper in `src/lib/`, never inline.
- No code comments of any kind. No `//`, no `/* */`, no JSDoc. Names carry meaning. Bare eslint-disable directives only where a rule cannot be satisfied structurally.
- No try/catch statements anywhere. Model failures with Effect (`Effect.tryPromise`, `Effect.catch`, `Effect.mapError`, typed error channels). The linter bans TryStatement.
- Commits: one logical change per commit. Message is one lowercase conventional line, e.g. `feat: add overlay window service`. No body.
- Effect v4, version pinned exact in package.json: `Context.Service` for services, `Layer` for composition, `Schema` for every IPC payload and every LLM API DTO, `Config` for configuration.
- Tests: every main-process service ships with Effect TestLayers plus vitest specs. No network calls in tests.
- Read CONTEXT.md and the ADRs under docs/adr touching your area before changing code. Use the glossary terms exactly.

## Agent skills

### Issue tracker

Issues live as GitHub issues. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` plus `docs/adr/`. See `docs/agents/domain.md`.
