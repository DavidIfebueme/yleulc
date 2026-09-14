import { describe, expect, it } from "vitest"
import {
  defaultSegmentationConfig,
  planSegments,
  type SegmentationConfig,
  type VadFrame
} from "./SegmentationPolicy"

const policyFixture: SegmentationConfig = {
  maxSegmentMs: 1000,
  minSegmentMs: 200,
  silenceHangoverMs: 250,
  speechThreshold: 0.5
}

function vadFixture(probabilities: ReadonlyArray<number>, stepMs: number): ReadonlyArray<VadFrame> {
  return probabilities.map((speechProbability, index) => ({ speechProbability, timeMs: index * stepMs }))
}

describe("planSegments", () => {
  it("segments a single utterance bounded by silence", () => {
    const frames = vadFixture([0.1, 0.1, 0.9, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1], 100)
    expect(planSegments(frames, policyFixture)).toEqual([{ endMs: 500, startMs: 200 }])
  })
  it("bridges a pause shorter than the hangover", () => {
    const frames = vadFixture([0.1, 0.1, 0.9, 0.9, 0.1, 0.9, 0.9, 0.1, 0.1, 0.1], 100)
    expect(planSegments(frames, policyFixture)).toEqual([{ endMs: 600, startMs: 200 }])
  })
  it("splits a pause longer than the hangover", () => {
    const frames = vadFixture(
      [0.1, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1, 0.9, 0.9, 0.9, 0.1, 0.1, 0.1, 0.1],
      100
    )
    expect(planSegments(frames, policyFixture)).toEqual([
      { endMs: 300, startMs: 100 },
      { endMs: 1000, startMs: 800 }
    ])
  })
  it("drops a blip shorter than the minimum segment", () => {
    const frames = vadFixture([0.1, 0.1, 0.9, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1], 100)
    expect(planSegments(frames, policyFixture)).toEqual([])
  })
  it("splits continuous speech at the maximum segment length", () => {
    const frames = vadFixture(new Array<number>(21).fill(0.9), 100)
    expect(planSegments(frames, policyFixture)).toEqual([
      { endMs: 1000, startMs: 0 },
      { endMs: 2000, startMs: 1000 }
    ])
  })
  it("closes a trailing utterance at the last speech frame", () => {
    const frames = vadFixture([0.1, 0.9, 0.9, 0.9, 0.9], 100)
    expect(planSegments(frames, policyFixture)).toEqual([{ endMs: 400, startMs: 100 }])
  })
  it("returns no spans for empty or silent input", () => {
    expect(planSegments([], policyFixture)).toEqual([])
    expect(planSegments(vadFixture([0.1, 0.0, 0.2], 100), policyFixture)).toEqual([])
  })
  it("ships a sane default policy", () => {
    expect(defaultSegmentationConfig.speechThreshold).toBeGreaterThan(0)
    expect(defaultSegmentationConfig.silenceHangoverMs).toBeGreaterThan(0)
    expect(defaultSegmentationConfig.maxSegmentMs).toBeGreaterThan(defaultSegmentationConfig.minSegmentMs)
  })
})
