import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import { yleulcOverlayClassDefault } from "./BraveWrapper"
import {
  WrapperRegistry,
  buildAppDesktopEntry,
  buildAppWrapperScript,
  desktopFilePathFor,
  findHookEvidence,
  findRewriteEvidence,
  getWrapperEntry,
  isAppCmdline,
  listWrapperApps,
  rewriterLogMarkers,
  selectAppPids,
  verificationGuidance,
  wrapperScriptPathFor
} from "./WrapperRegistry"

describe("listWrapperApps", () => {
  it("covers chrome firefox zoom and discord", () => {
    expect(listWrapperApps()).toEqual(["chrome", "firefox", "zoom", "discord"])
  })
})

describe("getWrapperEntry", () => {
  it("marks every entry assumed with an honest basis", () => {
    for (const id of listWrapperApps()) {
      const entry = getWrapperEntry(id)
      expect(entry.binaries.length).toBeGreaterThan(0)
      expect(entry.quitMethod).toBe("sigterm-then-sigkill")
      expect(entry.verification.status).toBe("assumed")
      expect(entry.verification.basis.length).toBeGreaterThan(0)
      expect(entry.verification.guidance.length).toBeGreaterThan(0)
    }
  })
  it("forces X11 capture paths per app", () => {
    expect(getWrapperEntry("chrome").extraFlags).toContain("--disable-features=WebRTCPipeWireCapturer")
    expect(getWrapperEntry("discord").extraFlags).toContain("--disable-features=WebRTCPipeWireCapturer")
    expect(getWrapperEntry("firefox").extraEnv["MOZ_ENABLE_WAYLAND"]).toBe("0")
    expect(getWrapperEntry("zoom").extraEnv["QT_QPA_PLATFORM"]).toBe("xcb")
    expect(getWrapperEntry("chrome").portalCaptureDisabled).toBe(true)
    expect(getWrapperEntry("firefox").portalCaptureDisabled).toBe(true)
    expect(getWrapperEntry("zoom").portalCaptureDisabled).toBe(false)
    expect(getWrapperEntry("discord").portalCaptureDisabled).toBe(true)
  })
})

describe("isAppCmdline", () => {
  it("matches chrome executables", () => {
    const entry = getWrapperEntry("chrome")
    expect(isAppCmdline(entry, "/usr/bin/google-chrome")).toBe(true)
    expect(isAppCmdline(entry, "/opt/google/chrome/chrome --type=renderer")).toBe(true)
    expect(isAppCmdline(entry, "chromium")).toBe(true)
    expect(isAppCmdline(entry, "/usr/bin/chromium-browser")).toBe(true)
  })
  it("matches firefox executables", () => {
    const entry = getWrapperEntry("firefox")
    expect(isAppCmdline(entry, "/usr/bin/firefox")).toBe(true)
    expect(isAppCmdline(entry, "/usr/lib/firefox/firefox-bin")).toBe(true)
    expect(isAppCmdline(entry, "firefox-esr")).toBe(true)
  })
  it("matches zoom executables", () => {
    const entry = getWrapperEntry("zoom")
    expect(isAppCmdline(entry, "/opt/zoom/ZoomLauncher")).toBe(true)
    expect(isAppCmdline(entry, "/opt/zoom/zoom")).toBe(true)
    expect(isAppCmdline(entry, "zoom")).toBe(true)
  })
  it("matches discord executables", () => {
    const entry = getWrapperEntry("discord")
    expect(isAppCmdline(entry, "/opt/discord/Discord")).toBe(true)
    expect(isAppCmdline(entry, "discord")).toBe(true)
  })
  it("rejects other executables", () => {
    expect(isAppCmdline(getWrapperEntry("chrome"), "/usr/bin/firefox")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("firefox"), "/usr/bin/google-chrome")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("zoom"), "/opt/discord/Discord")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("discord"), "/opt/zoom/zoom")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("chrome"), "")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("chrome"), "/usr/bin/chrom")).toBe(false)
    expect(isAppCmdline(getWrapperEntry("firefox"), "/usr/bin/firefoxish")).toBe(false)
  })
})

describe("selectAppPids", () => {
  it("keeps only matching processes", () => {
    const pids = selectAppPids(getWrapperEntry("zoom"), [
      { pid: 21, cmdline: "/opt/zoom/zoom" },
      { pid: 22, cmdline: "/opt/discord/Discord" },
      { pid: 23, cmdline: "/opt/zoom/ZoomLauncher --foo" }
    ])
    expect(pids).toEqual([21, 23])
  })
  it("returns empty when nothing matches", () => {
    expect(selectAppPids(getWrapperEntry("discord"), [{ pid: 7, cmdline: "/usr/bin/firefox" }])).toEqual([])
  })
})

describe("wrapper script and desktop entry", () => {
  it("embeds shim overlay log binary env and flags", () => {
    const entry = getWrapperEntry("chrome")
    const script = buildAppWrapperScript({
      shimPath: "/tmp/h/.local/share/yleulc/capture_rewriter.so",
      overlayClass: "yleulc-overlay",
      logPath: "/tmp/h/.local/share/yleulc/rewriter.log",
      targetBin: "/usr/bin/google-chrome",
      extraEnv: entry.extraEnv,
      extraFlags: entry.extraFlags
    })
    expect(script.startsWith("#!/usr/bin/env bash")).toBe(true)
    expect(script).toContain("LD_PRELOAD")
    expect(script).toContain("/tmp/h/.local/share/yleulc/capture_rewriter.so")
    expect(script).toContain("yleulc-overlay")
    expect(script).toContain("/tmp/h/.local/share/yleulc/rewriter.log")
    expect(script).toContain("/usr/bin/google-chrome")
    expect(script).toContain("GDK_BACKEND=\"x11\"")
    expect(script).toContain("--ozone-platform-hint=x11")
    expect(script).toContain("--disable-features=WebRTCPipeWireCapturer")
  })
  it("writes flag-free firefox scripts with wayland disabled", () => {
    const entry = getWrapperEntry("firefox")
    const script = buildAppWrapperScript({
      shimPath: "/tmp/h/.local/share/yleulc/capture_rewriter.so",
      overlayClass: "yleulc-overlay",
      logPath: "/tmp/h/.local/share/yleulc/rewriter.log",
      targetBin: "/usr/bin/firefox",
      extraEnv: entry.extraEnv,
      extraFlags: entry.extraFlags
    })
    expect(script).toContain("MOZ_ENABLE_WAYLAND=\"0\"")
    expect(script).toContain("/usr/bin/firefox")
    expect(script).not.toContain("--ozone")
  })
  it("embeds label wrapper path icon and mime in the desktop entry", () => {
    const entry = getWrapperEntry("zoom")
    const rendered = buildAppDesktopEntry({
      wrapperPath: "/tmp/h/.local/bin/yleulc-zoom",
      icon: entry.icon,
      label: entry.label,
      mimeType: entry.mimeType
    })
    expect(rendered).toContain("[Desktop Entry]")
    expect(rendered).toContain("Name=Zoom (yleulc)")
    expect(rendered).toContain("Exec=/tmp/h/.local/bin/yleulc-zoom %U")
    expect(rendered).toContain("Icon=Zoom")
    expect(rendered).toContain("x-scheme-handler/zoommtg")
  })
  it("builds per-app wrapper and desktop paths", () => {
    const home = "/tmp/yleulc-test-home"
    expect(wrapperScriptPathFor(home, getWrapperEntry("discord"))).toBe("/tmp/yleulc-test-home/.local/bin/yleulc-discord")
    expect(desktopFilePathFor(home, getWrapperEntry("discord"))).toBe(
      "/tmp/yleulc-test-home/.local/share/applications/yleulc-discord.desktop"
    )
  })
})

describe("rewriter log evidence", () => {
  it("lists loaded hook and rewrite markers", () => {
    expect(rewriterLogMarkers()).toEqual(["loaded pid=", "capture hook fired (pid=", "rewrote overlay"])
  })
  it("finds hook evidence only for the matching pid", () => {
    const log = "loaded pid=4242\ncapture hook fired (pid=4242)\n"
    expect(findHookEvidence(log, 4242)).toBe(true)
    expect(findHookEvidence(log, 9999)).toBe(false)
    expect(findHookEvidence("", 4242)).toBe(false)
  })
  it("finds rewrite evidence", () => {
    expect(findRewriteEvidence("rewrote overlay 0x0 rect 0,0 20x20 from 1 windows (frames=1)")).toBe(true)
    expect(findRewriteEvidence("loaded pid=4242")).toBe(false)
  })
  it("guides verification through the rewriter log", () => {
    const guidance = verificationGuidance(getWrapperEntry("firefox"), "/tmp/h/.local/share/yleulc/rewriter.log")
    expect(guidance).toContain("Firefox")
    expect(guidance).toContain("yleulc-firefox")
    expect(guidance).toContain("/tmp/h/.local/share/yleulc/rewriter.log")
    expect(guidance).toContain("capture hook fired (pid=")
  })
})

describe("WrapperRegistry Test layer", () => {
  it("resolves overlay values from the test layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      return registry.overlayClass
    })
    const overlayClass = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Test))
    expect(overlayClass).toBe(yleulcOverlayClassDefault)
  })
  it("reports stubbed binaries from the test layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      const chrome = yield* registry.findBinary("chrome")
      const firefox = yield* registry.findBinary("firefox")
      const zoom = yield* registry.findBinary("zoom")
      const discord = yield* registry.findBinary("discord")
      return { chrome, firefox, zoom, discord }
    })
    const result = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Test))
    expect(result.chrome).toBe("/usr/bin/google-chrome")
    expect(result.firefox).toBe("/usr/bin/firefox")
    expect(result.zoom).toBe("/opt/zoom/ZoomLauncher")
    expect(result.discord).toBe("/opt/discord/Discord")
  })
  it("reports stubbed lifecycle state from the test layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      const running = yield* registry.isRunning("chrome")
      const quit = yield* registry.quitApp("chrome")
      const launched = yield* registry.launchWrapped("chrome")
      const installed = yield* registry.installEntry("chrome")
      const started = yield* registry.startWrapped("chrome")
      return { running, quit, launched, installed, started }
    })
    const result = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Test))
    expect(result.running).toBe(false)
    expect(result.quit).toBe(true)
    expect(result.launched).toBe(true)
    expect(result.installed.ok).toBe(true)
    expect(result.installed.wrapperPath).toBe(wrapperScriptPathFor("/tmp/yleulc-test", getWrapperEntry("chrome")))
    expect(result.started).toBe(true)
  })
  it("checks stubbed rewriter evidence from the test layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      const log = yield* registry.readRewriterLog()
      const hook = yield* registry.checkHookEvidence(4242)
      const missing = yield* registry.checkHookEvidence(9999)
      const rewrite = yield* registry.checkRewriteEvidence()
      const guidance = registry.guidanceFor("discord")
      return { log, hook, missing, rewrite, guidance }
    })
    const result = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Test))
    expect(result.log).toContain("capture hook fired (pid=4242)")
    expect(result.hook).toBe(true)
    expect(result.missing).toBe(false)
    expect(result.rewrite).toBe(true)
    expect(result.guidance).toContain("Discord")
  })
  it("resolves overlay class from the live layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      return registry.overlayClass
    })
    const overlayClass = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Live))
    expect(overlayClass.length).toBeGreaterThan(0)
  })
  it("lists all apps from the live layer", async () => {
    const program = Effect.gen(function* () {
      const registry = yield* WrapperRegistry
      return registry.listApps()
    })
    const apps = await Effect.runPromise(Effect.provide(program, WrapperRegistry.Live))
    expect(apps).toEqual(["chrome", "firefox", "zoom", "discord"])
  })
})
