'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import Link from 'next/link'
import type { MyTrainingSummary, EnrollmentStatus } from '@/types'
import { LibraryBig, Clock, Star, Search, CheckCircle2, PlayCircle, Circle } from 'lucide-react'
import { clsx } from 'clsx'

const statusConfig: Record<EnrollmentStatus, { label: string; class: string; icon: typeof Circle }> = {
  pending: { label: 'Novo', class: 'bg-blue-50 text-blue-600', icon: Circle },
  in_progress: { label: 'Em andamento', class: 'bg-amber-50 text-amber-600', icon: PlayCircle },
  completed: { label: 'Concluído', class: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
}

export default function MeusExerciciosPage() {
  const [trainings, setTrainings] = useState<MyTrainingSummary[]>([])
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | EnrollmentStatus>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getMyTrainings()
      .then(setTrainings)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const filtered = trainings.filter(t => {
    const matchesSearch = t.training_title.toLowerCase().includes(search.toLowerCase()) ||
      t.domain.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = filterStatus === 'all' || t.status === filterStatus
    return matchesSearch && matchesStatus
  })

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Treinamentos</h1>
          <p className="text-gray-500 mt-1">Acompanhe e conclua seus treinamentos para ganhar XP.</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar treinamentos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([['all', 'Todos'], ['pending', 'Novos'], ['in_progress', 'Em andamento'], ['completed', 'Concluídos']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterStatus(val as typeof filterStatus)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterStatus === val ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Trainings Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card p-5 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
              <div className="h-3 bg-gray-100 rounded w-full mb-2" />
              <div className="h-3 bg-gray-100 rounded w-3/4" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <LibraryBig className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Nenhum treinamento encontrado</h3>
          <p className="text-sm text-gray-400">Aguarde a publicação de novos treinamentos pela sua equipe.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const status = statusConfig[t.status]
            const StatusIcon = status.icon
            const progress = t.total_modules > 0 ? Math.round((t.completed_modules / t.total_modules) * 100) : 0
            return (
              <Link key={t.enrollment_id} href={`/treinamentos/${t.training_id}`} className="card-hover p-5 group flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center">
                    <LibraryBig className="w-5 h-5 text-brand-600" />
                  </div>
                  <span className={clsx('badge-pill text-xs flex items-center gap-1', status.class)}>
                    <StatusIcon className="w-3 h-3" />
                    {status.label}
                  </span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-brand-700 transition-colors">
                  {t.training_title}
                </h3>
                {t.training_description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">{t.training_description}</p>
                )}

                {/* Progress bar */}
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                    <span>{t.completed_modules}/{t.total_modules} módulos</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        'h-full rounded-full transition-all duration-300',
                        t.status === 'completed' ? 'bg-emerald-500' : 'bg-brand-500'
                      )}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-gray-400 mt-3">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {t.estimated_duration_minutes}min
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5" />
                    {t.xp_reward} XP
                  </span>
                  <span className="badge-pill bg-gray-100 text-gray-500">{t.domain}</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
