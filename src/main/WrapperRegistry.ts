import { join } from "node:path"
import { yleulcAppsDir, yleulcBinDir } from "./BraveWrapper"

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
