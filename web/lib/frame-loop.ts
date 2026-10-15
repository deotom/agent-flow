export interface FrameDriver {
  request: (callback: (time: number) => void) => number
  cancel: (id: number) => void
  delay: (callback: () => void, ms: number) => number
  clear: (id: number) => void
  now: () => number
}
/** Keep drawing aligned to display refresh; hidden views have no scheduled callbacks. */
export function createFrameLoop(driver: FrameDriver, callback: (time: number) => void, interval: () => number) {
  let running = false
  let frame: number | null = null
  let nextAt: number | null = null
  let previousSpacing = 0
  const tick = (time: number) => {
    frame = null
    if (!running) return
    const spacing = Math.max(0, interval())
    if (nextAt === null) nextAt = time
    if (spacing < previousSpacing) nextAt = Math.min(nextAt, time + spacing)
    previousSpacing = spacing
    try {
      if (time + 0.01 >= nextAt) {
        const deadline = nextAt
        // Carry the fractional frame remainder, and skip missed slots rather than burst.
        nextAt = spacing > 0 ? deadline + Math.max(1, Math.floor((time - deadline) / spacing) + 1) * spacing : time
        callback(time)
      }
    } finally { if (running) frame = driver.request(tick) }
  }
  const setVisible = (visible: boolean) => {
    if (running === visible) return
    running = visible
    if (frame !== null) driver.cancel(frame)
    frame = null
    nextAt = null
    previousSpacing = 0
    if (running) frame = driver.request(tick)
  }
  return { setVisible, dispose: () => setVisible(false) }
}
