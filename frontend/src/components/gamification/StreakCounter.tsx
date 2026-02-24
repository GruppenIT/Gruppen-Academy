'use client'

import { Flame } from 'lucide-react'

interface StreakCounterProps {
  days: number
}

export default function StreakCounter({ days }: StreakCounterProps) {
  if (days === 0) return null

  return (
    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 text-orange-600">
      <Flame className="w-4 h-4" fill="currentColor" />
      <span className="text-sm font-bold">{days}</span>
      <span className="text-xs font-medium">dias seguidos</span>
    </div>
  )
}
