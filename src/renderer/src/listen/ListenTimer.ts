export function formatListenDuration(totalSeconds: number): string {
  const floored = Math.floor(totalSeconds)
  const clamped = floored < 0 ? 0 : floored
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

export function formatListenTimestamp(ms: number): string {
  const floored = Math.floor(ms / 1000)
  const clamped = floored < 0 ? 0 : floored
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped - minutes * 60
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}
