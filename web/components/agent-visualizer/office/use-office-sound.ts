'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OfficeSound, type OfficeSoundCue, type OfficeSoundState } from '../../../lib/office-sound'

/** active must combine Office visibility, document visibility, live mode and !paused. */
export function useOfficeSound({ active, night, wet }: OfficeSoundState) {
  const engine = useRef<OfficeSound | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [available, setAvailable] = useState(false)
  useEffect(() => {
    // No AudioContext here; also fresh for React Strict Mode effect replay.
    const sound = new OfficeSound()
    engine.current = sound
    setAvailable(sound.available)
    return () => { engine.current = null; sound.dispose() }
  }, [])
  useEffect(() => { engine.current?.update({ active, night, wet }) }, [active, night, wet])
  const toggle = useCallback(() => {
    const sound = engine.current
    if (!sound) return
    const completion = sound.toggleFromGesture()
    setEnabled(sound.enabled)
    void completion.then(() => {
      if (engine.current !== sound) return
      setEnabled(sound.enabled)
      setAvailable(sound.available)
    })
  }, [])
  const playCue = useCallback((cue: OfficeSoundCue) => engine.current?.playCue(cue) ?? false, [])
  return { enabled, available, toggle, playCue }
}
