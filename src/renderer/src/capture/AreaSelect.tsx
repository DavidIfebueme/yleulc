import { useEffect, useState } from "react"
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react"
import { selectionToCropRect } from "../../../shared/areaSelect"
import type { ScreenshotImage } from "../../../shared/screenshot"
import { requestAreaCapture } from "./ScreenshotGateway"

interface AreaSelectProps {
  readonly onCancel: () => void
  readonly onCaptured: (image: ScreenshotImage) => void
}

interface AreaPoint {
  readonly x: number
  readonly y: number
}

function toPreviewStyle(origin: AreaPoint, current: AreaPoint): CSSProperties {
  return {
    height: Math.abs(current.y - origin.y),
    left: Math.min(origin.x, current.x),
    top: Math.min(origin.y, current.y),
    width: Math.abs(current.x - origin.x)
  }
}

export function AreaSelect(props: AreaSelectProps) {
  const [origin, setOrigin] = useState<AreaPoint | null>(null)
  const [current, setCurrent] = useState<AreaPoint | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        props.onCancel()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [props])

  const beginDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const point = { x: event.clientX, y: event.clientY }
    setOrigin(point)
    setCurrent(point)
    setErrorMessage("")
  }

  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (origin === null) {
      return
    }
    setCurrent({ x: event.clientX, y: event.clientY })
  }

  const confirmSelection = (): void => {
    if (origin === null || current === null || capturing) {
      return
    }
    const rect = selectionToCropRect(
      { currentX: current.x, currentY: current.y, startX: origin.x, startY: origin.y },
      { height: window.innerHeight, width: window.innerWidth }
    )
    if (rect === null) {
      setErrorMessage("drag to select an area first")
      return
    }
    setErrorMessage("")
    setCapturing(true)
    void requestAreaCapture(rect).then(
      (image) => {
        setCapturing(false)
        props.onCaptured(image)
      },
      () => {
        setCapturing(false)
        setErrorMessage("area capture failed")
      }
    )
  }

  const hasSelection = origin !== null && current !== null && (origin.x !== current.x || origin.y !== current.y)

  return (
    <div
      role="dialog"
      aria-label="Select screen area"
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      className="fixed inset-0 z-50 cursor-crosshair bg-slate-950/70 backdrop-blur-[1px]"
    >
      <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
        <p className="rounded-full border border-white/15 bg-slate-950/80 px-3 py-1 text-xs text-white/80 shadow-2xl">
          Drag to select an area
        </p>
      </div>
      {origin !== null && current !== null && hasSelection ? (
        <div
          aria-hidden="true"
          style={toPreviewStyle(origin, current)}
          className="absolute border-2 border-blue-400 bg-blue-400/20 shadow-2xl"
        />
      ) : null}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2">
        <button
          type="button"
          onClick={props.onCancel}
          className="rounded-lg border border-white/15 bg-slate-950/80 px-2.5 py-1 text-xs font-medium text-white/80 shadow-2xl backdrop-blur-xl hover:bg-white/10"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={hasSelection === false || capturing}
          onClick={confirmSelection}
          className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-2xl hover:bg-blue-500 disabled:opacity-40"
        >
          {capturing ? "Capturing…" : "Capture area"}
        </button>
        {errorMessage === "" ? null : <p className="text-[11px] text-red-300/80">{errorMessage}</p>}
      </div>
    </div>
  )
}
