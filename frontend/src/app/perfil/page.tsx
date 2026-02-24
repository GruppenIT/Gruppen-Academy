'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import LevelProgress from '@/components/gamification/LevelProgress'
import PointsBadge from '@/components/gamification/PointsBadge'
import BadgeCard from '@/components/gamification/BadgeCard'
import type { Score, UserPointsSummary, UserBadge } from '@/types'
import {
  User, Mail, Building, Shield, Calendar, Award,
  Clock, Zap, Loader2,
} from 'lucide-react'

export default function PerfilPage() {
  const { user } = useAuth()
  const [points, setPoints] = useState<UserPointsSummary | null>(null)
  const [history, setHistory] = useState<Score[]>([])
  const [badges, setBadges] = useState<UserBadge[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getMyPoints(),
      api.getMyHistory(0, 10),
      api.getMyBadges(),
    ]).then(([pts, hist, b]) => {
      setPoints(pts)
      setHistory(hist)
      setBadges(b)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-600 animate-spin" /></div></AppShell>
  }

  const roleLabels: Record<string, string> = {
    super_admin: 'Super Admin',
    admin: 'Administrador',
    manager: 'Gestor',
    professional: 'Profissional',
  }

  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Meu Perfil</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="space-y-6">
          <div className="card p-6 text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center text-white text-3xl font-bold mx-auto mb-4 shadow-lg shadow-brand-500/25">
              {user?.full_name?.charAt(0).toUpperCase()}
            </div>
            <h2 className="text-xl font-bold text-gray-900">{user?.full_name}</h2>
            <p className="text-sm text-gray-500 mt-1">{roleLabels[user?.role || ''] || user?.role}</p>

            <div className="mt-4 space-y-2 text-left">
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                {user?.email}
              </div>
              {user?.department && (
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Building className="w-4 h-4 text-gray-400" />
                  {user.department}
                </div>
              )}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Shield className="w-4 h-4 text-gray-400" />
                {roleLabels[user?.role || ''] || user?.role}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                <Calendar className="w-4 h-4 text-gray-400" />
                Membro desde {user?.created_at ? new Date(user.created_at).toLocaleDateString('pt-BR') : '—'}
              </div>
            </div>
          </div>

          {/* Badges */}
          <div className="card p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Award className="w-4 h-4 text-violet-500" />
              Minhas Conquistas
            </h3>
            {badges.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma conquista ainda. Continue evoluindo!</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {badges.map((ub) => (
                  <BadgeCard
                    key={ub.id}
                    name={ub.badge.name}
                    description={ub.badge.description}
                    icon={ub.badge.icon}
                    earned={true}
                    earnedAt={ub.earned_at}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Level + History */}
        <div className="lg:col-span-2 space-y-6">
          <LevelProgress points={points?.total_points ?? 0} />

          {/* Points History */}
          <div className="card p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-gray-400" />
              Histórico de Pontos
            </h3>
            {history.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem atividades recentes.</p>
            ) : (
              <div className="space-y-3">
                {history.map((score) => (
                  <div key={score.id} className="flex items-center gap-4 py-2 border-b border-gray-50 last:border-0">
                    <div className="w-8 h-8 rounded-lg bg-gold-400/10 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-gold-600" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-700">{score.description || score.source}</p>
                      <p className="text-xs text-gray-400">
                        {new Date(score.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <PointsBadge points={score.points} size="sm" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
