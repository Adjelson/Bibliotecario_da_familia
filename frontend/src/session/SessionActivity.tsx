// src/session/SessionActivity.tsx
import { useEffect } from 'react'
import { useAuth } from '../store/auth'

export default function SessionActivity() {
  const touch = useAuth((s) => s.touchActivity)
  const startTimers = useAuth((s) => s.startTimers)
  const stopTimers = useAuth((s) => s.stopTimers)
  const isAuthed = useAuth((s) => s.isAuthed)

  useEffect(() => {
    const onAny = () => touch()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') touch()
    }

    const events: Array<[keyof DocumentEventMap, EventListener]> = [
      ['mousemove', onAny],
      ['mousedown', onAny],
      ['keydown', onAny],
      ['scroll', onAny],
      ['click', onAny],
      ['visibilitychange', onVisibility],
    ]

    events.forEach(([e, h]) => window.addEventListener(e, h, { passive: true } as any))
    // inicia timers ao montar (útil no reload da página)
    if (isAuthed()) startTimers()

    return () => {
      events.forEach(([e, h]) => window.removeEventListener(e, h))
      stopTimers()
    }
  }, [touch, startTimers, stopTimers, isAuthed])

  return null
}
