import { Config, Context, Data, Effect, Layer, Option } from "effect"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { spawn } from "node:child_process"
import {
  installedShimPath,
  pickFirstExisting,
  rewriterLogPath,
  shimCandidates,
  yleulcAppsDir,
  yleulcBinDir,
  yleulcOverlayClassDefault,
  yleulcShareDir
} from "./BraveWrapper"

export const wrapperAppIds = ["chrome", "firefox", "zoom", "discord"] as const
export type WrapperAppId = (typeof wrapperAppIds)[number]
export type WrapperQuitMethod = "sigterm-then-sigkill"
export type WrapperVerificationStatus = "assumed" | "verified"
export interface WrapperVerificationDoc {
  readonly status: WrapperVerificationStatus
  readonly basis: string
  readonly guidance: string
}
export interface WrapperAppEntry {
  readonly id: WrapperAppId
  readonly label: string
  readonly binaries: ReadonlyArray<string>
  readonly matchBases: ReadonlyArray<string>
  readonly matchPrefixes: ReadonlyArray<string>
  readonly quitMethod: WrapperQuitMethod
  readonly quitTimeoutMs: number
  readonly extraEnv: Readonly<Record<string, string>>
  readonly extraFlags: ReadonlyArray<string>
  readonly wrapperName: string
  readonly desktopFileName: string
  readonly icon: string
  readonly mimeType: string
  readonly portalCaptureDisabled: boolean
  readonly capturePath: string
  readonly verification: WrapperVerificationDoc
}

const browserMime = "text/html;x-scheme-handler/http;x-scheme-handler/https;"

export const wrapperAppEntries: Record<WrapperAppId, WrapperAppEntry> = {
  chrome: {
    id: "chrome",
    label: "Chrome",
    binaries: [
      "google-chrome",
      "google-chrome-stable",
      "chrome",
      "chromium",
      "chromium-browser",
      "/opt/google/chrome/chrome",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser"
    ],
    matchBases: ["chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"],
    matchPrefixes: ["chrome-", "chromium-", "google-chrome-"],
    quitMethod: "sigterm-then-sigkill",
    quitTimeoutMs: 8000,
    extraEnv: { GDK_BACKEND: "x11" },
    extraFlags: ["--ozone-platform-hint=x11", "--disable-features=WebRTCPipeWireCapturer"],
    wrapperName: "yleulc-chrome",
    desktopFileName: "yleulc-chrome.desktop",
    icon: "google-chrome",
    mimeType: browserMime,
    portalCaptureDisabled: true,
    capturePath: "x11 ozone with pipewire capturer disabled",
    verification: {
      status: "assumed",
      basis: "flags mirror the proven Brave wrapper pattern; no hook-fired line observed for Chrome in the rewriter log",
      guidance: "share from wrapped Chrome on an X11 session and require a hook-fired line for the Chrome PID before calling it verified"
    }
  },
  firefox: {
    id: "firefox",
    label: "Firefox",
    binaries: ["firefox", "firefox-esr", "/usr/bin/firefox", "/usr/bin/firefox-esr", "/opt/firefox/firefox", "/usr/lib/firefox/firefox"],
    matchBases: ["firefox", "firefox-esr", "firefox-bin"],
    matchPrefixes: ["firefox-"],
    quitMethod: "sigterm-then-sigkill",
    quitTimeoutMs: 8000,
    extraEnv: { MOZ_ENABLE_WAYLAND: "0", GDK_BACKEND: "x11" },
    extraFlags: [],
    wrapperName: "yleulc-firefox",
    desktopFileName: "yleulc-firefox.desktop",
    icon: "firefox",
    mimeType: browserMime,
    portalCaptureDisabled: true,
    capturePath: "x11 backend with wayland disabled",
    verification: {
      status: "assumed",
      basis: "MOZ_ENABLE_WAYLAND=0 selects the X11 backend; no hook-fired line observed for Firefox in the rewriter log",
      guidance: "share from wrapped Firefox on an X11 session and require a hook-fired line for the Firefox PID before calling it verified"
    }
  },
  zoom: {
    id: "zoom",
    label: "Zoom",
    binaries: ["zoom", "zoomlinux", "/opt/zoom/ZoomLauncher", "/opt/zoom/zoom", "/usr/bin/zoom"],
    matchBases: ["zoom", "zoomlinux", "ZoomLauncher"],
    matchPrefixes: ["zoom-"],
    quitMethod: "sigterm-then-sigkill",
    quitTimeoutMs: 8000,
    extraEnv: { QT_QPA_PLATFORM: "xcb" },
    extraFlags: [],
    wrapperName: "yleulc-zoom",
    desktopFileName: "yleulc-zoom.desktop",
    icon: "Zoom",
    mimeType: "x-scheme-handler/zoommtg;x-scheme-handler/zoomus;",
    portalCaptureDisabled: false,
    capturePath: "x11 xcb native client capture",
    verification: {
      status: "assumed",
      basis: "QT_QPA_PLATFORM=xcb selects X11 platform paths; Zoom ships its own capture stack so shim hook compatibility is unproven and no hook-fired line observed for Zoom",
      guidance: "share from wrapped Zoom on an X11 session and require a hook-fired line for the Zoom PID before calling it verified"
    }
  },
  discord: {
    id: "discord",
    label: "Discord",
    binaries: ["discord", "Discord", "/opt/discord/Discord", "/usr/bin/discord", "/usr/bin/Discord", "/usr/share/discord/Discord"],
    matchBases: ["Discord", "discord"],
    matchPrefixes: ["Discord-", "discord-"],
    quitMethod: "sigterm-then-sigkill",
    quitTimeoutMs: 8000,
    extraEnv: { GDK_BACKEND: "x11" },
    extraFlags: ["--ozone-platform-hint=x11", "--disable-features=WebRTCPipeWireCapturer"],
    wrapperName: "yleulc-discord",
    desktopFileName: "yleulc-discord.desktop",
    icon: "discord",
    mimeType: "x-scheme-handler/discord;",
    portalCaptureDisabled: true,
    capturePath: "x11 ozone hint with pipewire capturer disabled",
    verification: {
      status: "assumed",
      basis: "Electron honors the Chromium ozone hint; no hook-fired line observed for Discord in the rewriter log",
      guidance: "share from wrapped Discord on an X11 session and require a hook-fired line for the Discord PID before calling it verified"
    }
  }
}

export const rewriterLoadedMarker = "loaded pid="
export const rewriterHookMarker = "capture hook fired (pid="
export const rewriterRewriteMarker = "rewrote overlay"

export function listWrapperApps(): ReadonlyArray<WrapperAppId> {
  return [...wrapperAppIds]
}

export function getWrapperEntry(id: WrapperAppId): WrapperAppEntry {
  return wrapperAppEntries[id]
}

export function wrapperScriptPathFor(home: string, entry: WrapperAppEntry): string {
  return join(yleulcBinDir(home), entry.wrapperName)
}

export function desktopFilePathFor(home: string, entry: WrapperAppEntry): string {
  return join(yleulcAppsDir(home), entry.desktopFileName)
}

export function isAppCmdline(entry: WrapperAppEntry, cmdline: string): boolean {
  const first = cmdline.split(" ")[0] ?? ""
  const parts = first.split("/")
  const base = parts.pop() ?? ""
  if (entry.matchBases.includes(base)) {
    return true
  }
  return entry.matchPrefixes.some((prefix) => base.startsWith(prefix))
}

export function selectAppPids(
  entry: WrapperAppEntry,
  entries: ReadonlyArray<{ readonly pid: number; readonly cmdline: string }>
): ReadonlyArray<number> {
  return entries.filter((candidate) => isAppCmdline(entry, candidate.cmdline)).map((candidate) => candidate.pid)
}

export function buildAppWrapperScript(input: {
  readonly shimPath: string
  readonly overlayClass: string
  readonly logPath: string
  readonly targetBin: string
  readonly extraEnv: Readonly<Record<string, string>>
  readonly extraFlags: ReadonlyArray<string>
}): string {
  const header = "#!/usr/bin/env bash"
  const guard = "set -euo pipefail"
  const envParts = Object.entries(input.extraEnv).map(([name, value]) => name + "=\"" + value + "\"")
  const assignments = ["LD_PRELOAD=\"" + input.shimPath + "\"", "YLEULC_OVERLAY_CLASS=\"" + input.overlayClass + "\"", "YLEULC_REWRITER_LOG=\"" + input.logPath + "\"", ...envParts].join(" ")
  const command = ["\"" + input.targetBin + "\"", ...input.extraFlags, "\"$@\""].join(" ")
  return header + "\n" + guard + "\n" + "exec env " + assignments + " " + command + "\n"
}

export function buildAppDesktopEntry(input: { readonly wrapperPath: string; readonly icon: string; readonly label: string; readonly mimeType: string }): string {
  const lines = [
    "[Desktop Entry]",
    "Type=Application",
    "Name=" + input.label + " (yleulc)",
    "Comment=" + input.label + " with the yleulc overlay excluded from screen capture",
    "Exec=" + input.wrapperPath + " %U",
    "Icon=" + input.icon,
    "Terminal=false",
    "Categories=Network;",
    "MimeType=" + input.mimeType,
    "StartupNotify=true"
  ]
  return lines.join("\n") + "\n"
}

export function rewriterLogMarkers(): ReadonlyArray<string> {
  return [rewriterLoadedMarker, rewriterHookMarker, rewriterRewriteMarker]
}

export function findHookEvidence(logText: string, pid: number): boolean {
  return logText.includes(rewriterHookMarker + String(pid) + ")")
}

export function findRewriteEvidence(logText: string): boolean {
  return logText.includes(rewriterRewriteMarker)
}

export function verificationGuidance(entry: WrapperAppEntry, logPath: string): string {
  return "Wrap and relaunch " + entry.label + " from " + entry.wrapperName + ", share a screen from it, then check " + logPath + " for \"" + rewriterHookMarker + "<pid>)\" matching the " + entry.label + " PID; " + entry.verification.guidance
}

export class WrapperRegistryError extends Data.TaggedError("WrapperRegistryError")<{
  readonly reason: string
  readonly detail?: string
}> {}

export interface WrapperInstallResult {
  readonly ok: boolean
  readonly wrapperPath: string
  readonly shimPath: string
  readonly targetBin: string | null
  readonly reason?: string
}

export interface WrapperRegistryShape {
  readonly overlayClass: string
  readonly listApps: () => ReadonlyArray<WrapperAppId>
  readonly getEntry: (id: WrapperAppId) => WrapperAppEntry
  readonly findBinary: (id: WrapperAppId) => Effect.Effect<string | null, WrapperRegistryError>
  readonly isRunning: (id: WrapperAppId) => Effect.Effect<boolean, WrapperRegistryError>
  readonly quitApp: (id: WrapperAppId, timeoutMs?: number) => Effect.Effect<boolean, WrapperRegistryError>
  readonly launchWrapped: (id: WrapperAppId) => Effect.Effect<boolean, WrapperRegistryError>
  readonly installEntry: (id: WrapperAppId) => Effect.Effect<WrapperInstallResult, WrapperRegistryError>
  readonly startWrapped: (id: WrapperAppId) => Effect.Effect<boolean, WrapperRegistryError>
  readonly readRewriterLog: () => Effect.Effect<string, WrapperRegistryError>
  readonly checkHookEvidence: (pid: number) => Effect.Effect<boolean, WrapperRegistryError>
  readonly checkRewriteEvidence: () => Effect.Effect<boolean, WrapperRegistryError>
  readonly guidanceFor: (id: WrapperAppId) => string
}

const sleepMs = (ms: number): Effect.Effect<void> =>
  Effect.promise(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(() => resolve(), ms)
      })
  )

const nullSeparator = String.fromCharCode(0)

const stubBinaries: Record<WrapperAppId, string> = {
  chrome: "/usr/bin/google-chrome",
  firefox: "/usr/bin/firefox",
  zoom: "/opt/zoom/ZoomLauncher",
  discord: "/opt/discord/Discord"
}

const stubBinaryFor = (id: WrapperAppId): string => stubBinaries[id]

const stubRewriterLog = "loaded pid=4242\ncapture hook fired (pid=4242)\nrewrote overlay 0x0 rect 0,0 20x20 from 1 windows (frames=1)\n"

const readProcCmdline = (pidText: string): Effect.Effect<string | null, never> =>
  Effect.catch(
    Effect.try({
      try: () => readFileSync(join("/proc", pidText, "cmdline"), "utf8"),
      catch: () => new WrapperRegistryError({ reason: "read-cmdline" })
    }),
    () => Effect.succeed(null)
  )

const listAppPidsLive = (entry: WrapperAppEntry): Effect.Effect<ReadonlyArray<number>, WrapperRegistryError> =>
  Effect.gen(function* () {
    const names = yield* Effect.try({
      try: () => readdirSync("/proc"),
      catch: (cause) => new WrapperRegistryError({ reason: "read-proc", detail: String(cause) })
    })
    const numeric = names.filter((name) => /^\d+$/.test(name))
    const maybe = yield* Effect.forEach(numeric, (pidText) =>
      Effect.map(readProcCmdline(pidText), (raw) => {
        if (raw === null) {
          return null
        }
        const normalized = raw.split(nullSeparator).join(" ").trim()
        if (!isAppCmdline(entry, normalized)) {
          return null
        }
        return Number(pidText)
      })
    )
    return maybe.filter((value): value is number => value !== null)
  })

const findBinaryLive = (entry: WrapperAppEntry): Effect.Effect<string | null, WrapperRegistryError> =>
  Effect.sync(() => {
    const pathEnv = process.env["PATH"] ?? ""
    const pathDirs = pathEnv.split(":")
    for (const candidate of entry.binaries) {
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

const quitAppLive = (entry: WrapperAppEntry, timeoutMs: number): Effect.Effect<boolean, WrapperRegistryError> =>
  Effect.gen(function* () {
    const initial = yield* listAppPidsLive(entry)
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
            catch: (cause) => new WrapperRegistryError({ reason: "signal-term", detail: String(cause) })
          }),
          () => Effect.void
        ),
      { discard: true }
    )
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const still = yield* listAppPidsLive(entry)
      if (still.length === 0) {
        return true
      }
      yield* sleepMs(250)
    }
    const remaining = yield* listAppPidsLive(entry)
    yield* Effect.forEach(
      remaining,
      (pid) =>
        Effect.catch(
          Effect.try({
            try: () => {
              process.kill(pid, "SIGKILL")
            },
            catch: (cause) => new WrapperRegistryError({ reason: "signal-kill", detail: String(cause) })
          }),
          () => Effect.void
        ),
      { discard: true }
    )
    yield* sleepMs(500)
    const after = yield* listAppPidsLive(entry)
    return after.length === 0
  })

const launchWrappedLive = (
  entry: WrapperAppEntry,
  overlayClass: string,
  rewriterOverride: string | undefined,
  logOverride: string | undefined
): Effect.Effect<boolean, WrapperRegistryError> =>
  Effect.gen(function* () {
    const home = homedir()
    const cwd = process.cwd()
    const shim = resolveShimLive(home, cwd, rewriterOverride)
    const target = yield* findBinaryLive(entry)
    if (shim === null || target === null) {
      return false
    }
    const share = yleulcShareDir(home)
    const logPath = logOverride ?? rewriterLogPath(home)
    yield* Effect.try({
      try: () => mkdirSync(share, { recursive: true }),
      catch: (cause) => new WrapperRegistryError({ reason: "mkdir-share", detail: String(cause) })
    })
    const installed = installedShimPath(home)
    if (shim !== installed) {
      yield* Effect.try({
        try: () => copyFileSync(shim, installed),
        catch: (cause) => new WrapperRegistryError({ reason: "copy-shim", detail: String(cause) })
      })
    }
    const useShim = existsSync(installed) ? installed : shim
    const launchEnv = {
      ...process.env,
      LD_PRELOAD: useShim,
      YLEULC_OVERLAY_CLASS: overlayClass,
      YLEULC_REWRITER_LOG: logPath,
      ...entry.extraEnv
    }
    const launchFlags = [...entry.extraFlags]
    yield* Effect.try({
      try: () => {
        const child = spawn(target, launchFlags, { env: launchEnv, detached: true, stdio: "ignore" })
        child.unref()
      },
      catch: (cause) => new WrapperRegistryError({ reason: "spawn-app", detail: String(cause) })
    })
    return true
  })

const installEntryLive = (
  entry: WrapperAppEntry,
  overlayClass: string,
  rewriterOverride: string | undefined,
  logOverride: string | undefined
): Effect.Effect<WrapperInstallResult, WrapperRegistryError> =>
  Effect.gen(function* () {
    const home = homedir()
    const cwd = process.cwd()
    const shim = resolveShimLive(home, cwd, rewriterOverride)
    const wrapperPath = wrapperScriptPathFor(home, entry)
    if (shim === null) {
      return { ok: false, wrapperPath, shimPath: installedShimPath(home), targetBin: null, reason: "shim-missing" }
    }
    const target = yield* findBinaryLive(entry)
    const targetBin = target ?? entry.binaries[0] ?? entry.id
    const share = yleulcShareDir(home)
    const binDir = yleulcBinDir(home)
    const appsDir = yleulcAppsDir(home)
    const logPath = logOverride ?? rewriterLogPath(home)
    yield* Effect.try({
      try: () => mkdirSync(share, { recursive: true }),
      catch: (cause) => new WrapperRegistryError({ reason: "mkdir-share", detail: String(cause) })
    })
    yield* Effect.try({
      try: () => mkdirSync(binDir, { recursive: true }),
      catch: (cause) => new WrapperRegistryError({ reason: "mkdir-bin", detail: String(cause) })
    })
    yield* Effect.try({
      try: () => mkdirSync(appsDir, { recursive: true }),
      catch: (cause) => new WrapperRegistryError({ reason: "mkdir-apps", detail: String(cause) })
    })
    const installed = installedShimPath(home)
    yield* Effect.try({
      try: () => copyFileSync(shim, installed),
      catch: (cause) => new WrapperRegistryError({ reason: "copy-shim", detail: String(cause) })
    })
    const script = buildAppWrapperScript({
      shimPath: installed,
      overlayClass,
      logPath,
      targetBin,
      extraEnv: entry.extraEnv,
      extraFlags: entry.extraFlags
    })
    yield* Effect.try({
      try: () => writeFileSync(wrapperPath, script, { mode: 0o755 }),
      catch: (cause) => new WrapperRegistryError({ reason: "write-wrapper", detail: String(cause) })
    })
    const desktopPath = desktopFilePathFor(home, entry)
    const desktop = buildAppDesktopEntry({ wrapperPath, icon: entry.icon, label: entry.label, mimeType: entry.mimeType })
    yield* Effect.try({
      try: () => writeFileSync(desktopPath, desktop, { mode: 0o644 }),
      catch: (cause) => new WrapperRegistryError({ reason: "write-desktop", detail: String(cause) })
    })
    return { ok: true, wrapperPath, shimPath: installed, targetBin: target }
  })

const readRewriterLogLive = (logOverride: string | undefined): Effect.Effect<string, WrapperRegistryError> =>
  Effect.catch(
    Effect.try({
      try: () => readFileSync(logOverride ?? rewriterLogPath(homedir()), "utf8"),
      catch: () => new WrapperRegistryError({ reason: "read-log" })
    }),
    () => Effect.succeed("")
  )

export class WrapperRegistry extends Context.Service<WrapperRegistry, WrapperRegistryShape>()("WrapperRegistry") {
  static readonly Live = Layer.effect(
    WrapperRegistry,
    Effect.gen(function* () {
      const overlayClass = yield* Config.withDefault(Config.String("YLEULC_OVERLAY_CLASS"), yleulcOverlayClassDefault)
      const rewriterOverrideOption = yield* Config.option(Config.String("YLEULC_REWRITER_PATH"))
      const logOverrideOption = yield* Config.option(Config.String("YLEULC_REWRITER_LOG"))
      const rewriterOverride = Option.getOrUndefined(rewriterOverrideOption)
      const logOverride = Option.getOrUndefined(logOverrideOption)
      const listApps = (): ReadonlyArray<WrapperAppId> => listWrapperApps()
      const getEntry = (id: WrapperAppId): WrapperAppEntry => getWrapperEntry(id)
      const findBinary = (id: WrapperAppId): Effect.Effect<string | null, WrapperRegistryError> => findBinaryLive(getWrapperEntry(id))
      const isRunning = (id: WrapperAppId): Effect.Effect<boolean, WrapperRegistryError> =>
        Effect.map(listAppPidsLive(getWrapperEntry(id)), (pids) => pids.length > 0)
      const quitApp = (id: WrapperAppId, timeoutMs?: number): Effect.Effect<boolean, WrapperRegistryError> =>
        quitAppLive(getWrapperEntry(id), timeoutMs ?? getWrapperEntry(id).quitTimeoutMs)
      const launchWrapped = (id: WrapperAppId): Effect.Effect<boolean, WrapperRegistryError> =>
        launchWrappedLive(getWrapperEntry(id), overlayClass, rewriterOverride, logOverride)
      const installEntry = (id: WrapperAppId): Effect.Effect<WrapperInstallResult, WrapperRegistryError> =>
        installEntryLive(getWrapperEntry(id), overlayClass, rewriterOverride, logOverride)
      const startWrapped = (id: WrapperAppId): Effect.Effect<boolean, WrapperRegistryError> =>
        Effect.gen(function* () {
          yield* installEntryLive(getWrapperEntry(id), overlayClass, rewriterOverride, logOverride)
          yield* quitAppLive(getWrapperEntry(id), getWrapperEntry(id).quitTimeoutMs)
          return yield* launchWrappedLive(getWrapperEntry(id), overlayClass, rewriterOverride, logOverride)
        })
      const readRewriterLog = (): Effect.Effect<string, WrapperRegistryError> => readRewriterLogLive(logOverride)
      const checkHookEvidence = (pid: number): Effect.Effect<boolean, WrapperRegistryError> =>
        Effect.map(readRewriterLogLive(logOverride), (logText) => findHookEvidence(logText, pid))
      const checkRewriteEvidence = (): Effect.Effect<boolean, WrapperRegistryError> =>
        Effect.map(readRewriterLogLive(logOverride), (logText) => findRewriteEvidence(logText))
      const guidanceFor = (id: WrapperAppId): string => verificationGuidance(getWrapperEntry(id), logOverride ?? rewriterLogPath(homedir()))
      return {
        overlayClass,
        listApps,
        getEntry,
        findBinary,
        isRunning,
        quitApp,
        launchWrapped,
        installEntry,
        startWrapped,
        readRewriterLog,
        checkHookEvidence,
        checkRewriteEvidence,
        guidanceFor
      }
    })
  )
  static readonly Test = Layer.succeed(WrapperRegistry, {
    overlayClass: yleulcOverlayClassDefault,
    listApps: () => listWrapperApps(),
    getEntry: (id: WrapperAppId) => getWrapperEntry(id),
    findBinary: (id: WrapperAppId) => Effect.succeed(stubBinaryFor(id)),
    isRunning: () => Effect.succeed(false),
    quitApp: () => Effect.succeed(true),
    launchWrapped: () => Effect.succeed(true),
    installEntry: (id: WrapperAppId) =>
      Effect.succeed({
        ok: true,
        wrapperPath: wrapperScriptPathFor("/tmp/yleulc-test", getWrapperEntry(id)),
        shimPath: installedShimPath("/tmp/yleulc-test"),
        targetBin: stubBinaryFor(id)
      }),
    startWrapped: () => Effect.succeed(true),
    readRewriterLog: () => Effect.succeed(stubRewriterLog),
    checkHookEvidence: (pid: number) => Effect.succeed(findHookEvidence(stubRewriterLog, pid)),
    checkRewriteEvidence: () => Effect.succeed(findRewriteEvidence(stubRewriterLog)),
    guidanceFor: (id: WrapperAppId) => verificationGuidance(getWrapperEntry(id), rewriterLogPath("/tmp/yleulc-test"))
  })
}
