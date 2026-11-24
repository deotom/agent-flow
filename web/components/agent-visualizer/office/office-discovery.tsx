'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { OFFICE_DISCOVERY_STORAGE, OfficeDiscoveryClock, officeDiscoverySeen } from '../../../lib/office-discovery'

// Retain dismissal during this app session even if the browser blocks storage.
let seenInMemory = false

function readSeen(): boolean {
  if (seenInMemory) return true
  try { return officeDiscoverySeen(localStorage.getItem(OFFICE_DISCOVERY_STORAGE)) }
  catch { return false }
}

export function useOfficeDiscovery(visible: boolean, autoShow = true): { open: boolean; show: () => void; dismiss: () => void } {
  const [requested, setRequested] = useState(false)
  const [pageVisible, setPageVisible] = useState(false)
  const [replay, setReplay] = useState(0)
  const initialized = useRef(false)
  const clock = useRef(new OfficeDiscoveryClock())

  useEffect(() => {
    const update = () => {
      if (document.hidden) clock.current.pause(performance.now())
      setPageVisible(!document.hidden)
    }
    update()
    document.addEventListener('visibilitychange', update)
    return () => document.removeEventListener('visibilitychange', update)
  }, [])

  useEffect(() => {
    if (!autoShow || !visible || !pageVisible || initialized.current) return
    initialized.current = true
    if (!readSeen()) setRequested(true)
  }, [autoShow, visible, pageVisible])

  const dismiss = useCallback(() => {
    initialized.current = true
    seenInMemory = true
    setRequested(false)
    try { localStorage.setItem(OFFICE_DISCOVERY_STORAGE, JSON.stringify({ version: 1, seen: true })) }
    catch { /* The in-memory preference still prevents repeated automatic tips. */ }
  }, [])

  const show = useCallback(() => {
    initialized.current = true
    clock.current.reset()
    setRequested(true)
    setReplay(value => value + 1)
  }, [])

  const open = requested && visible && pageVisible
  useEffect(() => {
    if (!open) return
    const timerClock = clock.current
    timerClock.resume(performance.now())
    const timeout = window.setTimeout(() => {
      if (!document.hidden) dismiss()
    }, timerClock.left(performance.now()))
    return () => {
      window.clearTimeout(timeout)
      timerClock.pause(performance.now())
    }
  }, [open, replay, dismiss])

  return { open, show, dismiss }
}

export function OfficeDiscoveryTip({ open, onDismiss }: { open: boolean; onDismiss: () => void }) {
  if (!open) return null
  return <aside className="of-discovery-tip" role="note" aria-label="วิธีใช้ Office">
    <div><strong>ลองสำรวจ Office</strong><p>คลิกเอเจนต์เพื่อดูชื่อเต็มและรายละเอียด · คลิกโต๊ะงานหรือบอร์ดเพื่อดูงาน · คลิกประตูเพื่อดูห้องพัก</p></div>
    <button type="button" onClick={onDismiss} aria-label="ปิดคำแนะนำ Office">×</button>
  </aside>
}
