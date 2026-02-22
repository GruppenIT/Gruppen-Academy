'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { ManagerDashboard, ManagerTeamSummary, ManagerTeamMemberSummary, Journey } from '@/types'
import { clsx } from 'clsx'
import {
  Users, BarChart3, ChevronDown, ChevronUp, ChevronRight,
  Loader2, Trophy, Target, Route, UserCheck, Send,
  CheckCircle2, XCircle,
} from 'lucide-react'

export default function GestorPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const [dashboard, setDashboard] = useState<ManagerDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)

  // Journey assignment state
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [assigningTeam, setAssigningTeam] = useState<string | null>(null)
  const [selectedJourney, setSelectedJourney] = useState('')
  const [assignLoading, setAssignLoading] = useState(false)
  const [assignSuccess, setAssignSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user && !['manager', 'admin', 'super_admin'].includes(user.role)) {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    async function load() {
      try {
        const [dashboardData, journeysData] = await Promise.all([
          api.getManagerDashboard(),
          api.getJourneys(0, 200),
        ])
        setDashboard(dashboardData)
        setJourneys(journeysData.filter(j => j.status.toLowerCase() === 'published'))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard')
      } finally {
        setLoading(false)
      }
    }
    if (user && ['manager', 'admin', 'super_admin'].includes(user.role)) {
      load()
    }
  }, [user])

  async function handleAssignJourney(teamId: string) {
    if (!selectedJourney) return
    setAssignLoading(true)
    try {
      // Get current teams for the journey, then add this one
      const currentTeams = await api.getJourneyTeams(selectedJourney)
      const currentIds = currentTeams.map(t => t.id)
      if (!currentIds.includes(teamId)) {
        currentIds.push(teamId)
      }
      await api.assignJourneyTeams(selectedJourney, currentIds)
      setAssignSuccess(`Jornada atribuida com sucesso!`)
      setAssigningTeam(null)
      setSelectedJourney('')
      setTimeout(() => setAssignSuccess(null), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atribuir jornada')
    } finally {
      setAssignLoading(false)
    }
  }

  function scoreColor(score: number | null) {
    if (score === null) return 'text-gray-400'
    if (score >= 7) return 'text-emerald-600'
    if (score >= 5) return 'text-amber-600'
    return 'text-red-600'
  }

  function scoreBg(score: number | null) {
    if (score === null) return 'bg-gray-100'
    if (score >= 7) return 'bg-emerald-50 border-emerald-200'
    if (score >= 5) return 'bg-amber-50 border-amber-200'
    return 'bg-red-50 border-red-200'
  }

  if (authLoading || !user || !['manager', 'admin', 'super_admin'].includes(user.role)) {
    return null
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-brand-600" />
          Dashboard do Gestor
        </h1>
        <p className="text-gray-500 mt-1">Acompanhe a evolucao dos seus times e profissionais.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <XCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 text-sm">x</button>
        </div>
      )}

      {assignSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {assignSuccess}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : !dashboard ? (
        <div className="text-center py-12 text-gray-500">Nenhum dado disponivel.</div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{dashboard.total_teams}</p>
                  <p className="text-xs text-gray-500">Equipes</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <UserCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{dashboard.total_members}</p>
                  <p className="text-xs text-gray-500">Profissionais</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">
                    {dashboard.teams.length > 0 && dashboard.teams.some(t => t.avg_score !== null)
                      ? (dashboard.teams.filter(t => t.avg_score !== null)
                          .reduce((sum, t) => sum + (t.avg_score ?? 0), 0) /
                          dashboard.teams.filter(t => t.avg_score !== null).length
                        ).toFixed(1)
                      : '—'}
                  </p>
                  <p className="text-xs text-gray-500">Media geral</p>
                </div>
              </div>
            </div>
          </div>

          {/* Teams */}
          <div className="space-y-4">
            {dashboard.teams.map(team => {
              const isExpanded = expandedTeam === team.team_id
              return (
                <div key={team.team_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Team Header */}
                  <div
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedTeam(isExpanded ? null : team.team_id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className={clsx(
                        'w-12 h-12 rounded-xl flex items-center justify-center border',
                        scoreBg(team.avg_score),
                      )}>
                        {team.avg_score !== null ? (
                          <span className={clsx('text-lg font-bold', scoreColor(team.avg_score))}>
                            {team.avg_score.toFixed(1)}
                          </span>
                        ) : (
                          <Target className="w-5 h-5 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">{team.team_name}</h3>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span>{team.member_count} membros</span>
                          <span>{team.completed_participations}/{team.total_participations} jornadas concluidas</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setAssigningTeam(assigningTeam === team.team_id ? null : team.team_id)
                        }}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-lg"
                      >
                        <Send className="w-3 h-3" /> Atribuir Jornada
                      </button>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                    </div>
                  </div>

                  {/* Journey Assignment */}
                  {assigningTeam === team.team_id && (
                    <div className="px-4 pb-4 border-t border-gray-100 bg-blue-50/30 pt-3">
                      <div className="flex items-center gap-3">
                        <select
                          value={selectedJourney}
                          onChange={e => setSelectedJourney(e.target.value)}
                          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="">Selecione uma jornada...</option>
                          {journeys.map(j => (
                            <option key={j.id} value={j.id}>
                              {j.title} ({j.mode === 'async' ? 'Online' : 'Presencial'})
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleAssignJourney(team.team_id)}
                          disabled={!selectedJourney || assignLoading}
                          className="btn-primary text-sm flex items-center gap-2"
                        >
                          {assignLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                          Atribuir
                        </button>
                        <button
                          onClick={() => { setAssigningTeam(null); setSelectedJourney('') }}
                          className="btn-secondary text-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Team Members Table */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {team.members.length === 0 ? (
                        <div className="p-4 text-center text-gray-400 text-sm">Nenhum membro nesta equipe.</div>
                      ) : (
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-4 py-2 font-medium text-gray-600">Profissional</th>
                              <th className="text-center px-4 py-2 font-medium text-gray-600">Jornadas</th>
                              <th className="text-center px-4 py-2 font-medium text-gray-600">Concluidas</th>
                              <th className="text-center px-4 py-2 font-medium text-gray-600">Media</th>
                              <th className="px-4 py-2"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {team.members.map(member => (
                              <tr key={member.user_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div>
                                    <p className="font-medium text-gray-900">{member.user_name}</p>
                                    <p className="text-xs text-gray-500">{member.user_email}</p>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-center text-gray-600">{member.participations}</td>
                                <td className="px-4 py-3 text-center">
                                  <span className={clsx(
                                    'text-xs font-medium px-2 py-0.5 rounded-full',
                                    member.completed === member.participations && member.participations > 0
                                      ? 'bg-emerald-100 text-emerald-700'
                                      : member.completed > 0
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-gray-100 text-gray-500'
                                  )}>
                                    {member.completed}/{member.participations}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  {member.avg_score !== null ? (
                                    <span className={clsx('font-bold', scoreColor(member.avg_score))}>
                                      {member.avg_score.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-gray-400">—</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {member.participations > 0 && (
                                    <button
                                      onClick={() => router.push(`/admin/avaliacoes`)}
                                      className="text-xs text-brand-600 hover:text-brand-800 flex items-center gap-1"
                                    >
                                      Ver detalhes <ChevronRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {dashboard.teams.length === 0 && (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-lg font-medium">Nenhuma equipe encontrada</p>
              <p className="text-gray-400 text-sm mt-1">Solicite ao admin para adicionar voce a uma equipe.</p>
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
