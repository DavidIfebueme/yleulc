import { describe, expect, it } from "vitest"
import { initialOverlayState } from "../shared/initialOverlayState"

describe("initialOverlayState", () => {
  it("opens the live transcript for listen mode", () => {
    expect(initialOverlayState("listen")).toEqual({ listening: true, transcriptOpen: true })
  })

  it("opens the ask view for ask mode", () => {
    expect(initialOverlayState("ask")).toEqual({ listening: true, transcriptOpen: false })
  })
})
