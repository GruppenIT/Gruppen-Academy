'use client'

import { Zap } from 'lucide-react'

interface PointsBadgeProps {
  points: number
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

export default function PointsBadge({ points, label, size = 'md' }: PointsBadgeProps) {
  const sizes = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-sm px-3 py-1 gap-1.5',
    lg: 'text-base px-4 py-1.5 gap-2',
  }

  return (
    <div className={`inline-flex items-center ${sizes[size]} rounded-full bg-gold-400/15 text-gold-600 font-bold`}>
      <Zap className={size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4'} fill="currentColor" />
      {points} {label || 'XP'}
    </div>
  )
}
