import { useEffect, useRef } from 'react'
import { createFrameLoop } from '@/lib/frame-loop'

export function useVisibleFrameLoop(callback: React.RefObject<(time: number) => void>, enabled: boolean, interval: () => number, onResume: () => void) {
  const intervalRef = useRef(interval)
  const resumeRef = useRef(onResume)
  intervalRef.current = interval
  resumeRef.current = onResume
  useEffect(() => {
    const loop = createFrameLoop({ request: fn => window.requestAnimationFrame(fn), cancel: id => window.cancelAnimationFrame(id),
      delay: (fn, ms) => window.setTimeout(fn, ms), clear: id => window.clearTimeout(id), now: () => performance.now() },
      time => callback.current(time), () => intervalRef.current())
    const update = () => {
      const visible = enabled && !document.hidden
      if (visible) resumeRef.current()
      loop.setVisible(visible)
    }
    document.addEventListener('visibilitychange', update)
    update()
    return () => { document.removeEventListener('visibilitychange', update); loop.dispose() }
  }, [enabled, callback])
}
