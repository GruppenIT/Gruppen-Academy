'use client'

import { getUserLevel } from '@/types'
import { clsx } from 'clsx'

interface LevelProgressProps {
  points: number
  compact?: boolean
}

export default function LevelProgress({ points, compact }: LevelProgressProps) {
  const { current, next, progressToNext } = getUserLevel(points)

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-lg">{current.icon}</span>
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-700">{current.name}</span>
            <span className="text-xs text-gray-400">{points} XP</span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar-fill bg-gradient-to-r from-brand-500 to-violet-500"
              style={{ width: `${progressToNext}%` }}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 flex items-center justify-center text-2xl animate-badge-shine">
            {current.icon}
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{current.name}</h3>
            <p className="text-sm text-gray-500">{points} XP totais</p>
          </div>
        </div>
        {current !== next && (
          <div className="text-right">
            <p className="text-xs text-gray-400">Próximo nível</p>
            <p className="text-sm font-medium text-gray-600">
              {next.icon} {next.name}
            </p>
          </div>
        )}
      </div>

      <div className="progress-bar h-3">
        <div
          className={clsx(
            'progress-bar-fill bg-gradient-to-r from-brand-500 via-violet-500 to-purple-500',
            'animate-progress-fill'
          )}
          style={{ width: `${progressToNext}%`, '--progress-width': `${progressToNext}%` } as React.CSSProperties}
        />
      </div>

      {current !== next && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Faltam <span className="font-medium text-brand-600">{next.minPoints - points} XP</span> para {next.name}
        </p>
      )}
    </div>
  )
}
