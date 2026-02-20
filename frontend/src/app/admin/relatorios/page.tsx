'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { User, Journey, UserPointsSummary } from '@/types'
import {
  BarChart3, Users, Route, BookOpen, Trophy, TrendingUp, Loader2,
} from 'lucide-react'

export default function AdminRelatoriosPage() {
  const [users, setUsers] = useState<User[]>([])
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [leaderboard, setLeaderboard] = useState<UserPointsSummary[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [u, j, l] = await Promise.all([
        api.getUsers(0, 500),
        api.getJourneys(0, 500),
        api.getLeaderboard(20),
      ])
      setUsers(u); setJourneys(j); setLeaderboard(l)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
  }

  const activeUsers = users.filter(u => u.is_active).length
  const admins = users.filter(u => ['super_admin', 'admin'].includes(u.role)).length
  const managers = users.filter(u => u.role === 'manager').length
  const professionals = users.filter(u => u.role === 'professional').length
  const publishedJourneys = journeys.filter(j => j.status === 'PUBLISHED').length
  const draftJourneys = journeys.filter(j => j.status === 'DRAFT').length

  const departments = users.reduce((acc, u) => {
    const dept = u.department || 'Sem departamento'
    acc[dept] = (acc[dept] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <BarChart3 className="w-5 h-5 text-gray-400" />
        <h2 className="text-lg font-bold text-gray-900">Relatorios & Metricas</h2>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
              <Users className="w-5 h-5 text-brand-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{users.length}</p>
              <p className="text-xs text-gray-500">Usuarios totais</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{activeUsers} ativos</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
              <Route className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{journeys.length}</p>
              <p className="text-xs text-gray-500">Jornadas</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{publishedJourneys} publicadas · {draftJourneys} rascunho</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {leaderboard.length > 0 ? leaderboard.reduce((s, l) => s + l.total_points, 0) : 0}
              </p>
              <p className="text-xs text-gray-500">XP total plataforma</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">{leaderboard.length} usuarios com pontos</p>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {leaderboard.length > 0 ? Math.round(leaderboard.reduce((s, l) => s + l.total_points, 0) / leaderboard.length) : 0}
              </p>
              <p className="text-xs text-gray-500">Media XP/usuario</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Users by role */}
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" /> Usuarios por Perfil
          </h3>
          <div className="space-y-3">
            {[
              { label: 'Administradores', count: admins, color: 'bg-brand-600' },
              { label: 'Gestores', count: managers, color: 'bg-violet-500' },
              { label: 'Profissionais', count: professionals, color: 'bg-emerald-500' },
            ].map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{item.label}</span>
                  <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${users.length > 0 ? (item.count / users.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Users by department */}
        <div className="card p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-gray-400" /> Usuarios por Departamento
          </h3>
          <div className="space-y-3">
            {Object.entries(departments).sort((a, b) => b[1] - a[1]).map(([dept, count]) => (
              <div key={dept}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-700">{dept}</span>
                  <span className="text-sm font-semibold text-gray-900">{count}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-blue-500" style={{ width: `${users.length > 0 ? (count / users.length) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top performers */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-gold-600" /> Top 20 Performers
          </h3>
          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum dado de pontuacao ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">#</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Nome</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">XP Total</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Atividades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaderboard.map((entry, i) => (
                    <tr key={entry.user_id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2.5 text-sm font-semibold text-gray-500">{i + 1}</td>
                      <td className="px-3 py-2.5 text-sm font-medium text-gray-900">{entry.full_name || '—'}</td>
                      <td className="px-3 py-2.5 text-sm text-right">
                        <span className="badge-pill bg-gold-400/15 text-gold-600">{entry.total_points} XP</span>
                      </td>
                      <td className="px-3 py-2.5 text-sm text-right text-gray-500">{entry.scores_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
