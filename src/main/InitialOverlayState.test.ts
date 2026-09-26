import { describe, expect, it } from "vitest"
import { initialOverlayState } from "../shared/initialOverlayState"

describe("initialOverlayState", () => {
  it("opens the live transcript for listen mode", () => {
    expect(initialOverlayState("listen")).toEqual({ transcriptOpen: true })
  })

  it("opens the ask view for ask mode", () => {
    expect(initialOverlayState("ask")).toEqual({ transcriptOpen: false })
  })
})
