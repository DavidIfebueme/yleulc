import { Effect } from "effect"
import { describe, expect, it } from "vitest"
import {
  BraveWrapper,
  braveCandidates,
  buildDesktopEntry,
  buildWrapperScript,
  desktopFilePath,
  installedShimPath,
  isBraveCmdline,
  pickFirstExisting,
  rewriterLogPath,
  selectBravePids,
  shimCandidates,
  wrapperScriptPath,
  yleulcAppsDir,
  yleulcBinDir,
  yleulcOverlayClassDefault,
  yleulcShareDir
} from "./BraveWrapper"
describe("isBraveCmdline", () => {
  it("matches brave executables", () => {
    expect(isBraveCmdline("/usr/bin/brave")).toBe(true)
    expect(isBraveCmdline("/usr/bin/brave --type=renderer")).toBe(true)
    expect(isBraveCmdline("brave")).toBe(true)
    expect(isBraveCmdline("/opt/brave-bin/brave")).toBe(true)
    expect(isBraveCmdline("/usr/bin/brave-browser")).toBe(true)
    expect(isBraveCmdline("/usr/bin/brave-beta --foo")).toBe(true)
  })
  it("rejects other executables", () => {
    expect(isBraveCmdline("/usr/bin/chrome")).toBe(false)
    expect(isBraveCmdline("/usr/bin/firefox")).toBe(false)
    expect(isBraveCmdline("")).toBe(false)
    expect(isBraveCmdline("/usr/bin/braveish")).toBe(false)
  })
})
describe("selectBravePids", () => {
  it("keeps only brave processes", () => {
    const pids = selectBravePids([
      { pid: 11, cmdline: "/usr/bin/brave --type=renderer" },
      { pid: 12, cmdline: "/usr/bin/firefox" },
      { pid: 13, cmdline: "/usr/bin/brave-browser" }
    ])
    expect(pids).toEqual([11, 13])
  })
  it("returns empty when nothing matches", () => {
    expect(selectBravePids([{ pid: 7, cmdline: "/usr/bin/firefox" }])).toEqual([])
  })
})
describe("pickFirstExisting", () => {
  it("picks the first existing candidate", () => {
    expect(pickFirstExisting(["a", "b", "c"], (path) => path === "b")).toBe("b")
  })
  it("returns null when nothing exists", () => {
    expect(pickFirstExisting(["a", "b"], () => false)).toBe(null)
  })
})
describe("rewriter paths", () => {
  it("builds share bin apps log shim wrapper desktop paths", () => {
    const home = "/tmp/yleulc-test-home"
    expect(yleulcShareDir(home)).toBe("/tmp/yleulc-test-home/.local/share/yleulc")
    expect(yleulcBinDir(home)).toBe("/tmp/yleulc-test-home/.local/bin")
    expect(yleulcAppsDir(home)).toBe("/tmp/yleulc-test-home/.local/share/applications")
    expect(rewriterLogPath(home)).toBe("/tmp/yleulc-test-home/.local/share/yleulc/rewriter.log")
    expect(installedShimPath(home)).toBe("/tmp/yleulc-test-home/.local/share/yleulc/capture_rewriter.so")
    expect(wrapperScriptPath(home)).toBe("/tmp/yleulc-test-home/.local/bin/yleulc-brave")
    expect(desktopFilePath(home)).toBe("/tmp/yleulc-test-home/.local/share/applications/yleulc-brave.desktop")
  })
  it("orders shim candidates with override first", () => {
    const withOverride = shimCandidates({ home: "/tmp/h", cwd: "/tmp/c", override: "/tmp/custom.so" })
    expect(withOverride[0]).toBe("/tmp/custom.so")
    const withoutOverride = shimCandidates({ home: "/tmp/h", cwd: "/tmp/c" })
    expect(withoutOverride.length).toBe(2)
  })
  it("lists brave candidates", () => {
    const candidates = braveCandidates()
    expect(candidates).toContain("brave")
    expect(candidates).toContain("/usr/bin/brave")
  })
})
describe("wrapper script and desktop entry", () => {
  it("embeds shim overlay log and brave in the wrapper", () => {
    const script = buildWrapperScript({
      shimPath: "/tmp/h/.local/share/yleulc/capture_rewriter.so",
      overlayClass: "yleulc-overlay",
      logPath: "/tmp/h/.local/share/yleulc/rewriter.log",
      braveBin: "/usr/bin/brave"
    })
    expect(script.startsWith("#!/usr/bin/env bash")).toBe(true)
    expect(script).toContain("LD_PRELOAD")
    expect(script).toContain("/tmp/h/.local/share/yleulc/capture_rewriter.so")
    expect(script).toContain("yleulc-overlay")
    expect(script).toContain("/tmp/h/.local/share/yleulc/rewriter.log")
    expect(script).toContain("/usr/bin/brave")
  })
  it("embeds wrapper path and icon in the desktop entry", () => {
    const entry = buildDesktopEntry({ wrapperPath: "/tmp/h/.local/bin/yleulc-brave", icon: "brave-browser" })
    expect(entry).toContain("[Desktop Entry]")
    expect(entry).toContain("Exec=/tmp/h/.local/bin/yleulc-brave %U")
    expect(entry).toContain("Icon=brave-browser")
  })
})
describe("BraveWrapper Test layer", () => {
  it("resolves overlay values from the test layer", async () => {
    const program = Effect.gen(function* () {
      const wrapper = yield* BraveWrapper
      return wrapper.overlayClass
    })
    const overlayClass = await Effect.runPromise(Effect.provide(program, BraveWrapper.Test))
    expect(overlayClass).toBe(yleulcOverlayClassDefault)
  })
  it("reports stubbed brave state from the test layer", async () => {
    const program = Effect.gen(function* () {
      const wrapper = yield* BraveWrapper
      const brave = yield* wrapper.findBrave()
      const running = yield* wrapper.isBraveRunning()
      const quit = yield* wrapper.quitBrave()
      const launched = yield* wrapper.launchWrappedBrave()
      const installed = yield* wrapper.installBraveEntry()
      const started = yield* wrapper.startWrappedBrave()
      return { brave, running, quit, launched, installed, started }
    })
    const result = await Effect.runPromise(Effect.provide(program, BraveWrapper.Test))
    expect(result.brave).toBe("/usr/bin/brave")
    expect(result.running).toBe(false)
    expect(result.quit).toBe(true)
    expect(result.launched).toBe(true)
    expect(result.installed.ok).toBe(true)
    expect(result.installed.wrapperPath).toBe(wrapperScriptPath("/tmp/yleulc-test"))
    expect(result.started).toBe(true)
  })
  it("resolves overlay class from the live layer", async () => {
    const program = Effect.gen(function* () {
      const wrapper = yield* BraveWrapper
      return wrapper.overlayClass
    })
    const overlayClass = await Effect.runPromise(Effect.provide(program, BraveWrapper.Live))
    expect(overlayClass.length).toBeGreaterThan(0)
  })
})
