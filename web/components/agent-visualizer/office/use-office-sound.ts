'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OfficeSound, type OfficeSoundCue, type OfficeSoundState } from '../../../lib/office-sound'

const SOUND_VOLUME_STORAGE = 'agent-flow-office-sound-volume-v1'
const clampVolume = (value: number) => (Number.isFinite(value) ? Math.max(0.1, Math.min(1, value)) : 0.65)
const readVolume = () => {
  try {
    const raw = localStorage.getItem(SOUND_VOLUME_STORAGE)
    return raw === null ? 0.65 : clampVolume(Number(raw))
  } catch { return 0.65 }
}

/** active must combine Office visibility, document visibility, live mode and !paused. */
export function useOfficeSound({ active, night, wet, phase, weather, season, holiday, liveliness, working }: OfficeSoundState) {
  const engine = useRef<OfficeSound | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [available, setAvailable] = useState(false)
  const [volume, setVolumeState] = useState(readVolume)
  useEffect(() => {
    // No AudioContext here; also fresh for React Strict Mode effect replay.
    const sound = new OfficeSound()
    sound.setVolume(volume)
    engine.current = sound
    setAvailable(sound.available)
    return () => { engine.current = null; sound.dispose() }
  }, [])
  useEffect(() => {
    engine.current?.update({ active, night, wet, phase, weather, season, holiday, liveliness, working })
  }, [active, night, wet, phase, weather, season, holiday, liveliness, working])
  useEffect(() => { engine.current?.setVolume(volume) }, [volume])
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
  const setVolume = useCallback((next: number) => {
    const clamped = clampVolume(next)
    setVolumeState(clamped)
    try { localStorage.setItem(SOUND_VOLUME_STORAGE, String(clamped)) } catch { /* ignore */ }
  }, [])
  const playCue = useCallback((cue: OfficeSoundCue) => engine.current?.playCue(cue) ?? false, [])
  return { enabled, available, toggle, playCue, volume, setVolume }
}
