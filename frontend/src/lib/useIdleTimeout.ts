'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

const ACTIVITY_EVENTS: readonly string[] = [
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'pointermove',
]

/** Only bump the "last active" timestamp this often to avoid perf overhead. */
const THROTTLE_MS = 30_000

interface UseIdleTimeoutOptions {
  /** Minutes of inactivity before calling `onIdle`. 0 = disabled. */
  timeoutMinutes: number
  /** Show the warning this many minutes before the timeout fires (default 2). */
  warningMinutes?: number
  /** Called once when the idle timeout is reached. */
  onIdle: () => void
}

/**
 * Tracks user activity (mouse, keyboard, scroll, touch) and fires `onIdle`
 * after `timeoutMinutes` of inactivity.  Also exposes a warning state so
 * the UI can show an "about to expire" banner.
 */
export function useIdleTimeout({
  timeoutMinutes,
  warningMinutes = 2,
  onIdle,
}: UseIdleTimeoutOptions) {
  const lastActivity = useRef(Date.now())
  const throttleRef = useRef(0)
  const firedRef = useRef(false)
  const [showWarning, setShowWarning] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)

  // Stable ref for the callback so the interval never goes stale.
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  const resetActivity = useCallback(() => {
    const now = Date.now()
    if (now - throttleRef.current < THROTTLE_MS) return
    throttleRef.current = now
    lastActivity.current = now
    firedRef.current = false
    setShowWarning(false)
  }, [])

  /** Allow the user to dismiss the warning and reset the idle timer. */
  const dismiss = useCallback(() => {
    lastActivity.current = Date.now()
    firedRef.current = false
    setShowWarning(false)
  }, [])

  useEffect(() => {
    if (timeoutMinutes <= 0) return

    const timeoutMs = timeoutMinutes * 60 * 1000
    const warningMs = warningMinutes * 60 * 1000

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, resetActivity, { passive: true })
    }

    const tick = setInterval(() => {
      const elapsed = Date.now() - lastActivity.current
      const remaining = timeoutMs - elapsed

      if (remaining <= 0 && !firedRef.current) {
        firedRef.current = true
        onIdleRef.current()
        return
      }

      if (remaining > 0 && remaining <= warningMs) {
        setShowWarning(true)
        setRemainingSeconds(Math.ceil(remaining / 1000))
      } else {
        setShowWarning(false)
      }
    }, 1_000)

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, resetActivity)
      }
      clearInterval(tick)
    }
  }, [timeoutMinutes, warningMinutes, resetActivity])

  return { showWarning, remainingSeconds, dismiss }
}
