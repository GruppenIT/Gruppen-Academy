'use client'

import { clsx } from 'clsx'
import { Award, Lock } from 'lucide-react'

interface BadgeCardProps {
  name: string
  description: string
  icon?: string | null
  earned: boolean
  earnedAt?: string
}

export default function BadgeCard({ name, description, icon, earned, earnedAt }: BadgeCardProps) {
  return (
    <div
      className={clsx(
        'relative p-4 rounded-2xl border-2 text-center transition-all duration-300',
        earned
          ? 'bg-white border-gold-400 shadow-lg shadow-gold-400/10'
          : 'bg-gray-50 border-gray-200 opacity-60'
      )}
    >
      <div
        className={clsx(
          'w-16 h-16 rounded-2xl mx-auto mb-3 flex items-center justify-center text-3xl',
          earned
            ? 'bg-gradient-to-br from-gold-400 to-amber-500 animate-badge-shine'
            : 'bg-gray-200'
        )}
      >
        {earned ? (
          icon || <Award className="w-8 h-8 text-white" />
        ) : (
          <Lock className="w-6 h-6 text-gray-400" />
        )}
      </div>

      <h4 className={clsx('font-bold text-sm', earned ? 'text-gray-900' : 'text-gray-500')}>
        {name}
      </h4>
      <p className="text-xs text-gray-400 mt-1 line-clamp-2">{description}</p>

      {earned && earnedAt && (
        <p className="text-[10px] text-gold-600 font-medium mt-2">
          Conquistado em {new Date(earnedAt).toLocaleDateString('pt-BR')}
        </p>
      )}
    </div>
  )
}
