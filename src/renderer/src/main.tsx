import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { OverlayPanel } from "./OverlayPanel"
import "./overlay.css"

const rootElement = document.getElementById("root")

if (rootElement !== null) {
  createRoot(rootElement).render(
    <StrictMode>
      <OverlayPanel />
    </StrictMode>
  )
}
