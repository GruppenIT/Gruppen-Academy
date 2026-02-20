'use client'

import { clsx } from 'clsx'
import { Crown, Medal, Award } from 'lucide-react'
import PointsBadge from './PointsBadge'

interface LeaderboardRowProps {
  position: number
  name: string
  points: number
  isCurrentUser: boolean
}

function PositionIcon({ position }: { position: number }) {
  if (position === 1) return <Crown className="w-5 h-5 text-gold-500" fill="currentColor" />
  if (position === 2) return <Medal className="w-5 h-5 text-gray-400" fill="currentColor" />
  if (position === 3) return <Award className="w-5 h-5 text-amber-700" fill="currentColor" />
  return <span className="w-5 h-5 flex items-center justify-center text-sm font-bold text-gray-400">{position}</span>
}

export default function LeaderboardRow({ position, name, points, isCurrentUser }: LeaderboardRowProps) {
  return (
    <div
      className={clsx(
        'flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200',
        isCurrentUser
          ? 'bg-brand-50 border border-brand-200 ring-2 ring-brand-500/10'
          : position <= 3
            ? 'bg-gray-50'
            : 'hover:bg-gray-50'
      )}
    >
      <PositionIcon position={position} />

      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold shadow-md">
        {name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <p className={clsx('text-sm font-medium truncate', isCurrentUser ? 'text-brand-700' : 'text-gray-900')}>
          {name}
          {isCurrentUser && <span className="text-xs text-brand-500 ml-2">(Você)</span>}
        </p>
      </div>

      <PointsBadge points={points} size="sm" />
    </div>
  )
}
