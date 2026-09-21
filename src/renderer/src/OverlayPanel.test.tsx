import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { OverlayPanel } from "./OverlayPanel"

Object.defineProperty(globalThis, "window", { value: {} })

describe("OverlayPanel", () => {
  it("keeps the overlay viewport bounded and assigns scrolling to content panels", () => {
    const markup = renderToStaticMarkup(<OverlayPanel />)
    expect(markup).toContain('class="overlay-viewport" data-overlay-viewport="bounded"')
    expect(markup).toContain('class="overlay-surface"')
    expect(markup).toContain('class="overlay-ask-content" data-scroll-region="ask"')
  })
})
