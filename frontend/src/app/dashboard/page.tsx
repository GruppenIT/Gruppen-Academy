'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { useAuth } from '@/lib/auth'
import { api } from '@/lib/api'
import LevelProgress from '@/components/gamification/LevelProgress'
import PointsBadge from '@/components/gamification/PointsBadge'
import StreakCounter from '@/components/gamification/StreakCounter'
import LeaderboardRow from '@/components/gamification/LeaderboardRow'
import {
  Route, BookOpen, MessageSquareMore, Trophy, TrendingUp,
  Target, Sparkles, ArrowRight, Flame, Clock, LibraryBig, AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import type { UserPointsSummary, Journey, LearningPath, PendingItem } from '@/types'

function StatCard({ icon: Icon, label, value, color, href }: {
  icon: React.ElementType; label: string; value: string; color: string; href: string
}) {
  return (
    <Link href={href} className="card-hover p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm text-gray-500">{label}</p>
      </div>
    </Link>
  )
}

function QuickAction({ icon: Icon, label, description, href, color }: {
  icon: React.ElementType; label: string; description: string; href: string; color: string
}) {
  return (
    <Link href={href} className="card-hover p-5 group">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{label}</h3>
      <p className="text-sm text-gray-500 mb-3">{description}</p>
      <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all">
        Acessar <ArrowRight className="w-4 h-4" />
      </span>
    </Link>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [points, setPoints] = useState<UserPointsSummary | null>(null)
  const [leaderboard, setLeaderboard] = useState<UserPointsSummary[]>([])
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [pendingTrainings, setPendingTrainings] = useState<PendingItem[]>([])

  useEffect(() => {
    api.getMyPoints().then(setPoints).catch(() => {})
    api.getLeaderboard(5).then(setLeaderboard).catch(() => {})
    api.getJourneys(0, 3).then(setJourneys).catch(() => {})
    api.getLearningPaths().then((p) => setPaths(p.slice(0, 3))).catch(() => {})
    api.getMyPendingTrainings().then(setPendingTrainings).catch(() => {})
  }, [])

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  })()

  return (
    <AppShell>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {greeting}, {user?.full_name?.split(' ')[0]}!
          </h1>
          <p className="text-gray-500 mt-1">Continue evoluindo suas competências.</p>
        </div>
        <div className="flex items-center gap-3">
          <StreakCounter days={3} />
          {points && <PointsBadge points={points.total_points} size="lg" />}
        </div>
      </div>

      {/* Level Progress */}
      <div className="mb-8">
        <LevelProgress points={points?.total_points ?? 0} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Route} label="Jornadas" value={String(journeys.length)}
          color="bg-blue-50 text-blue-600" href="/jornadas"
        />
        <StatCard
          icon={BookOpen} label="Trilhas" value={String(paths.length)}
          color="bg-emerald-50 text-emerald-600" href="/trilhas"
        />
        <StatCard
          icon={Target} label="Competências" value="—"
          color="bg-violet-50 text-violet-600" href="/perfil"
        />
        <StatCard
          icon={Trophy} label="Ranking" value={leaderboard.length > 0 ? `#${leaderboard.findIndex(l => l.user_id === user?.id) + 1 || '—'}` : '—'}
          color="bg-gold-400/10 text-gold-600" href="/ranking"
        />
      </div>

      {/* Pending Trainings */}
      {pendingTrainings.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            Pendências
          </h2>
          <div className="space-y-2">
            {pendingTrainings.map((item) => (
              <Link
                key={item.id}
                href={`/treinamentos/${item.id}`}
                className="flex items-center gap-4 p-4 rounded-xl border border-amber-100 bg-amber-50/30 hover:bg-amber-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <LibraryBig className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.detail}</p>
                </div>
                <span className="badge-pill bg-amber-100 text-amber-700 text-xs">{item.status_label}</span>
                <ArrowRight className="w-4 h-4 text-gray-400" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-brand-500" />
        Acesso Rápido
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <QuickAction
          icon={MessageSquareMore}
          label="Tutor IA"
          description="Pratique com seu tutor pessoal. Simule conversas com clientes e evolua."
          href="/tutor"
          color="bg-brand-50 text-brand-600"
        />
        <QuickAction
          icon={Route}
          label="Jornadas de Avaliação"
          description="Participe de avaliações estruturadas e receba feedback detalhado."
          href="/jornadas"
          color="bg-blue-50 text-blue-600"
        />
        <QuickAction
          icon={TrendingUp}
          label="Evoluir Conhecimento"
          description="Trilhas personalizadas para fechar seus gaps de competência."
          href="/trilhas"
          color="bg-emerald-50 text-emerald-600"
        />
      </div>

      {/* Bottom Grid: Recent Journeys + Mini Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Journeys */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              Jornadas Recentes
            </h3>
            <Link href="/jornadas" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              Ver todas
            </Link>
          </div>
          {journeys.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma jornada disponível ainda.</p>
          ) : (
            <div className="space-y-3">
              {journeys.map((j) => (
                <Link key={j.id} href={`/jornadas/${j.id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Route className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                    <p className="text-xs text-gray-400">{j.domain} · {j.session_duration_minutes}min</p>
                  </div>
                  <span className={`badge-pill ${j.status.toLowerCase() === 'published' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-500'}`}>
                    {j.status.toLowerCase() === 'published' ? 'Ativa' : j.status.toLowerCase() === 'draft' ? 'Rascunho' : 'Arquivada'}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Mini Leaderboard */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-500" />
              Top Performers
            </h3>
            <Link href="/ranking" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
              Ver completo
            </Link>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Ranking em construção.</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, i) => (
                <LeaderboardRow
                  key={entry.user_id}
                  position={i + 1}
                  name={entry.full_name || 'Usuário'}
                  points={entry.total_points}
                  isCurrentUser={entry.user_id === user?.id}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
