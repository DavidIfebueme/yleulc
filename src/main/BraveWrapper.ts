import { Config, Context, Data, Effect, Layer, Option } from "effect"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
export const yleulcOverlayClassDefault = "yleulc-overlay"
export const yleulcWrapperName = "yleulc-brave"
export const yleulcDesktopFileName = "yleulc-brave.desktop"
export const yleulcShimFileName = "capture_rewriter.so"
export const yleulcRewriterLogName = "rewriter.log"
export const yleulcAppShareName = "yleulc"
export function yleulcShareDir(home: string): string {
  return join(home, ".local", "share", yleulcAppShareName)
}
export function yleulcBinDir(home: string): string {
  return join(home, ".local", "bin")
}
export function yleulcAppsDir(home: string): string {
  return join(home, ".local", "share", "applications")
}
export function rewriterLogPath(home: string): string {
  return join(yleulcShareDir(home), yleulcRewriterLogName)
}
export function installedShimPath(home: string): string {
  return join(yleulcShareDir(home), yleulcShimFileName)
}
export function wrapperScriptPath(home: string): string {
  return join(yleulcBinDir(home), yleulcWrapperName)
}
export function desktopFilePath(home: string): string {
  return join(yleulcAppsDir(home), yleulcDesktopFileName)
}
export function shimCandidates(input: { readonly home: string; readonly cwd: string; readonly override?: string }): ReadonlyArray<string> {
  const base = [installedShimPath(input.home), join(input.cwd, "native", "capture-rewriter", yleulcShimFileName)]
  const override = input.override
  if (override !== undefined && override !== "") {
    return [override, ...base]
  }
  return base
}
export function braveCandidates(): ReadonlyArray<string> {
  return ["brave", "brave-browser", "/opt/brave-bin/brave", "/usr/bin/brave", "/usr/bin/brave-browser"]
}
export function isBraveCmdline(cmdline: string): boolean {
  const first = cmdline.split(" ")[0] ?? ""
  const parts = first.split("/")
  const base = parts.pop() ?? ""
  if (base === "brave") {
    return true
  }
  if (base === "brave-browser") {
    return true
  }
  if (base.startsWith("brave-")) {
    return true
  }
  return false
}
export function selectBravePids(entries: ReadonlyArray<{ readonly pid: number; readonly cmdline: string }>): ReadonlyArray<number> {
  return entries.filter((entry) => isBraveCmdline(entry.cmdline)).map((entry) => entry.pid)
}
export function pickFirstExisting(candidates: ReadonlyArray<string>, exists: (path: string) => boolean): string | null {
  for (const candidate of candidates) {
    if (exists(candidate)) {
      return candidate
    }
  }
  return null
}
export function buildWrapperScript(input: { readonly shimPath: string; readonly overlayClass: string; readonly logPath: string; readonly braveBin: string }): string {
  const header = "#!/usr/bin/env bash"
  const guard = "set -euo pipefail"
  const body = "exec env LD_PRELOAD=\"" + input.shimPath + "\" YLEULC_OVERLAY_CLASS=\"" + input.overlayClass + "\" YLEULC_REWRITER_LOG=\"" + input.logPath + "\" \"" + input.braveBin + "\" \"$@\""
  return header + "\n" + guard + "\n" + body + "\n"
}
export function buildDesktopEntry(input: { readonly wrapperPath: string; readonly icon: string }): string {
  const mime = "text/html;x-scheme-handler/http;x-scheme-handler/https;"
  const lines = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=Brave (yleulc)",
    "Comment=Brave with the yleulc overlay excluded from screen capture",
    "Exec=" + input.wrapperPath + " %U",
    "Icon=" + input.icon,
    "Terminal=false",
    "Categories=Network;WebBrowser;",
    "MimeType=" + mime,
    "StartupNotify=true"
  ]
  return lines.join("\n") + "\n"
}
export class BraveWrapperError extends Data.TaggedError("BraveWrapperError")<{
  readonly reason: string
  readonly detail?: string
}> {}
export interface BraveInstallResult {
  readonly ok: boolean
  readonly wrapperPath: string
  readonly shimPath: string
  readonly braveBin: string | null
  readonly reason?: string
}
export interface BraveWrapperShape {
  readonly overlayClass: string
  readonly findBrave: () => Effect.Effect<string | null, BraveWrapperError>
  readonly isBraveRunning: () => Effect.Effect<boolean, BraveWrapperError>
  readonly quitBrave: (timeoutMs?: number) => Effect.Effect<boolean, BraveWrapperError>
  readonly launchWrappedBrave: () => Effect.Effect<boolean, BraveWrapperError>
  readonly installBraveEntry: () => Effect.Effect<BraveInstallResult, BraveWrapperError>
  readonly startWrappedBrave: () => Effect.Effect<boolean, BraveWrapperError>
}
const sleepMs = (ms: number): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms)
      })
  )
const nullSeparator = String.fromCharCode(0)
const readProcCmdline = (pidText: string): Effect.Effect<string | null, never> =>
  Effect.catch(
    Effect.try({
      try: () => readFileSync(join("/proc", pidText, "cmdline"), "utf8"),
      catch: () => new BraveWrapperError({ reason: "read-cmdline" })
    }),
    () => Effect.succeed(null)
  )
const listBravePidsLive = (): Effect.Effect<ReadonlyArray<number>, BraveWrapperError> =>
  Effect.gen(function* () {
    const names = yield* Effect.try({
      try: () => readdirSync("/proc"),
      catch: (cause) => new BraveWrapperError({ reason: "read-proc", detail: String(cause) })
    })
    const numeric = names.filter((name) => /^\d+$/.test(name))
    const maybe = yield* Effect.forEach(numeric, (pidText) =>
      Effect.map(readProcCmdline(pidText), (raw) => {
        if (raw === null) {
          return null
        }
        const normalized = raw.split(nullSeparator).join(" ").trim()
        if (!isBraveCmdline(normalized)) {
          return null
        }
        return Number(pidText)
      })
    )
    return maybe.filter((value): value is number => value !== null)
  })
const findBraveLive = (): Effect.Effect<string | null, BraveWrapperError> =>
  Effect.sync(() => {
    const candidates = braveCandidates()
    const pathEnv = process.env["PATH"] ?? ""
    const pathDirs = pathEnv.split(":")
    for (const candidate of candidates) {
      if (candidate.includes("/")) {
        if (existsSync(candidate)) {
          return candidate
        }
      } else {
        for (const dir of pathDirs) {
          if (dir === "") {
            continue
          }
          const full = join(dir, candidate)
          if (existsSync(full)) {
            return full
          }
        }
      }
    }
    return null
  })
const resolveShimLive = (home: string, cwd: string, override: string | undefined): string | null => {
  const candidates = shimCandidates({ home, cwd, override })
  return pickFirstExisting(candidates, (candidate) => existsSync(candidate))
}
const quitBraveLive = (timeoutMs: number): Effect.Effect<boolean, BraveWrapperError> =>
  Effect.gen(function* () {
    const initial = yield* listBravePidsLive()
    if (initial.length === 0) {
      return true
    }
    yield* Effect.forEach(
      initial,
      (pid) =>
        Effect.catch(
          Effect.try({
            try: () => {
              process.kill(pid, "SIGTERM")
            },
            catch: (cause) => new BraveWrapperError({ reason: "signal-term", detail: String(cause) })
          }),
          () => Effect.void
        ),
      { discard: true }
    )
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const still = yield* listBravePidsLive()
      if (still.length === 0) {
        return true
      }
      yield* sleepMs(250)
    }
    const remaining = yield* listBravePidsLive()
    yield* Effect.forEach(
      remaining,
      (pid) =>
        Effect.catch(
          Effect.try({
            try: () => {
              process.kill(pid, "SIGKILL")
            },
            catch: (cause) => new BraveWrapperError({ reason: "signal-kill", detail: String(cause) })
          }),
          () => Effect.void
        ),
      { discard: true }
    )
    yield* sleepMs(500)
    const after = yield* listBravePidsLive()
    return after.length === 0
  })
export class BraveWrapper extends Context.Service<BraveWrapper, BraveWrapperShape>()("BraveWrapper") {
  static readonly Live = Layer.effect(
    BraveWrapper,
    Effect.gen(function* () {
      const overlayClass = yield* Config.withDefault(Config.String("YLEULC_OVERLAY_CLASS"), yleulcOverlayClassDefault)
      const rewriterOverrideOption = yield* Config.option(Config.String("YLEULC_REWRITER_PATH"))
      const logOverrideOption = yield* Config.option(Config.String("YLEULC_REWRITER_LOG"))
      const rewriterOverride = Option.getOrUndefined(rewriterOverrideOption)
      const logOverride = Option.getOrUndefined(logOverrideOption)
      const findBrave = (): Effect.Effect<string | null, BraveWrapperError> => findBraveLive()
      const isBraveRunning = (): Effect.Effect<boolean, BraveWrapperError> =>
        Effect.map(listBravePidsLive(), (pids) => pids.length > 0)
      const quitBrave = (timeoutMs = 8000): Effect.Effect<boolean, BraveWrapperError> => quitBraveLive(timeoutMs)
      const launchWrappedBrave = (): Effect.Effect<boolean, BraveWrapperError> =>
        Effect.gen(function* () {
          const home = homedir()
          const cwd = process.cwd()
          const shim = resolveShimLive(home, cwd, rewriterOverride)
          const brave = yield* findBraveLive()
          if (shim === null || brave === null) {
            return false
          }
          const share = yleulcShareDir(home)
          const logPath = logOverride ?? rewriterLogPath(home)
          yield* Effect.try({
            try: () => mkdirSync(share, { recursive: true }),
            catch: (cause) => new BraveWrapperError({ reason: "mkdir-share", detail: String(cause) })
          })
          const installed = installedShimPath(home)
          if (shim !== installed) {
            yield* Effect.try({
              try: () => copyFileSync(shim, installed),
              catch: (cause) => new BraveWrapperError({ reason: "copy-shim", detail: String(cause) })
            })
          }
          const useShim = existsSync(installed) ? installed : shim
          yield* Effect.try({
            try: () => {
              const child = spawn(brave, {
                env: { ...process.env, LD_PRELOAD: useShim, YLEULC_OVERLAY_CLASS: overlayClass, YLEULC_REWRITER_LOG: logPath },
                detached: true,
                stdio: "ignore"
              })
              child.unref()
            },
            catch: (cause) => new BraveWrapperError({ reason: "spawn-brave", detail: String(cause) })
          })
          return true
        })
      const installBraveEntry = (): Effect.Effect<BraveInstallResult, BraveWrapperError> =>
        Effect.gen(function* () {
          const home = homedir()
          const cwd = process.cwd()
          const shim = resolveShimLive(home, cwd, rewriterOverride)
          if (shim === null) {
            return { ok: false, wrapperPath: wrapperScriptPath(home), shimPath: installedShimPath(home), braveBin: null, reason: "shim-missing" }
          }
          const brave = yield* findBraveLive()
          const braveBin = brave ?? "brave"
          const share = yleulcShareDir(home)
          const binDir = yleulcBinDir(home)
          const appsDir = yleulcAppsDir(home)
          const logPath = logOverride ?? rewriterLogPath(home)
          yield* Effect.try({
            try: () => mkdirSync(share, { recursive: true }),
            catch: (cause) => new BraveWrapperError({ reason: "mkdir-share", detail: String(cause) })
          })
          yield* Effect.try({
            try: () => mkdirSync(binDir, { recursive: true }),
            catch: (cause) => new BraveWrapperError({ reason: "mkdir-bin", detail: String(cause) })
          })
          yield* Effect.try({
            try: () => mkdirSync(appsDir, { recursive: true }),
            catch: (cause) => new BraveWrapperError({ reason: "mkdir-apps", detail: String(cause) })
          })
          const installed = installedShimPath(home)
          yield* Effect.try({
            try: () => copyFileSync(shim, installed),
            catch: (cause) => new BraveWrapperError({ reason: "copy-shim", detail: String(cause) })
          })
          const wrapperPath = wrapperScriptPath(home)
          const script = buildWrapperScript({ shimPath: installed, overlayClass, logPath, braveBin })
          yield* Effect.try({
            try: () => writeFileSync(wrapperPath, script, { mode: 0o755 }),
            catch: (cause) => new BraveWrapperError({ reason: "write-wrapper", detail: String(cause) })
          })
          const desktopPath = desktopFilePath(home)
          const desktop = buildDesktopEntry({ wrapperPath, icon: "brave-browser" })
          yield* Effect.try({
            try: () => writeFileSync(desktopPath, desktop, { mode: 0o644 }),
            catch: (cause) => new BraveWrapperError({ reason: "write-desktop", detail: String(cause) })
          })
          return { ok: true, wrapperPath, shimPath: installed, braveBin: brave }
        })
      const startWrappedBrave = (): Effect.Effect<boolean, BraveWrapperError> =>
        Effect.gen(function* () {
          yield* installBraveEntry()
          yield* quitBraveLive(8000)
          return yield* launchWrappedBrave()
        })
      return { overlayClass, findBrave, isBraveRunning, quitBrave, launchWrappedBrave, installBraveEntry, startWrappedBrave }
    })
  )
  static readonly Test = Layer.succeed(BraveWrapper, {
    overlayClass: yleulcOverlayClassDefault,
    findBrave: () => Effect.succeed("/usr/bin/brave"),
    isBraveRunning: () => Effect.succeed(false),
    quitBrave: () => Effect.succeed(true),
    launchWrappedBrave: () => Effect.succeed(true),
    installBraveEntry: () =>
      Effect.succeed({
        ok: true,
        wrapperPath: wrapperScriptPath("/tmp/yleulc-test"),
        shimPath: installedShimPath("/tmp/yleulc-test"),
        braveBin: "/usr/bin/brave"
      }),
    startWrappedBrave: () => Effect.succeed(true)
  })
}
