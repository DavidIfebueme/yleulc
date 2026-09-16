import { normalizeCropRect, type CropRect } from "./screenshot"

export interface AreaDragSelection {
  readonly currentX: number
  readonly currentY: number
  readonly startX: number
  readonly startY: number
}

export interface AreaWindowBounds {
  readonly height: number
  readonly width: number
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value)
}

export function selectionToCropRect(selection: AreaDragSelection, bounds: AreaWindowBounds): CropRect | null {
  if (
    isFiniteNumber(selection.startX) === false ||
    isFiniteNumber(selection.startY) === false ||
    isFiniteNumber(selection.currentX) === false ||
    isFiniteNumber(selection.currentY) === false ||
    isFiniteNumber(bounds.width) === false ||
    isFiniteNumber(bounds.height) === false
  ) {
    return null
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    return null
  }
  const x = Math.min(selection.startX, selection.currentX)
  const y = Math.min(selection.startY, selection.currentY)
  const width = Math.abs(selection.currentX - selection.startX)
  const height = Math.abs(selection.currentY - selection.startY)
  if (width < 1 || height < 1) {
    return null
  }
  const rect = normalizeCropRect(
    { height: bounds.height, width: bounds.width },
    { height, width, x, y }
  )
  if (rect.width < 1 || rect.height < 1) {
    return null
  }
  return rect
}
