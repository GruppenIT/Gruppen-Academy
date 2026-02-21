'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import Link from 'next/link'
import type { Journey } from '@/types'
import { Route, Clock, Users, ArrowRight, Search, Filter, Monitor, FileText, PlayCircle } from 'lucide-react'
import { clsx } from 'clsx'

const statusConfig: Record<string, { label: string; class: string }> = {
  published: { label: 'Ativa', class: 'bg-emerald-50 text-emerald-600' },
  draft: { label: 'Rascunho', class: 'bg-gray-100 text-gray-500' },
  archived: { label: 'Arquivada', class: 'bg-orange-50 text-orange-600' },
  PUBLISHED: { label: 'Ativa', class: 'bg-emerald-50 text-emerald-600' },
  DRAFT: { label: 'Rascunho', class: 'bg-gray-100 text-gray-500' },
  ARCHIVED: { label: 'Arquivada', class: 'bg-orange-50 text-orange-600' },
}

const levelLabels: Record<string, string> = {
  iniciante: 'Iniciante',
  intermediario: 'Intermediário',
  avancado: 'Avançado',
}

export default function JornadasPage() {
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [filterMode, setFilterMode] = useState<'all' | 'async' | 'sync'>('all')

  useEffect(() => {
    api.getMyAvailableJourneys()
      .then(setJourneys)
      .catch(() => {
        // Fallback to all journeys if the endpoint is unavailable
        api.getJourneys(0, 100).then(setJourneys).catch(() => {})
      })
      .finally(() => setLoading(false))
  }, [])

  const filtered = journeys.filter(j => {
    const matchesSearch = j.title.toLowerCase().includes(search.toLowerCase()) ||
      j.domain.toLowerCase().includes(search.toLowerCase())
    const matchesMode = filterMode === 'all' || j.mode === filterMode
    return matchesSearch && matchesMode
  })

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Jornadas de Avaliação</h1>
          <p className="text-gray-500 mt-1">Participe das jornadas e receba feedback detalhado sobre suas competências.</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar jornadas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10"
          />
        </div>
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
          {([['all', 'Todas'], ['async', 'Online'], ['sync', 'Presencial']] as const).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilterMode(val)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                filterMode === val ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Journeys Grid */}
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
          <Route className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Nenhuma jornada encontrada</h3>
          <p className="text-sm text-gray-400">Tente buscar por outro termo ou aguarde novas jornadas.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((journey) => {
            const status = statusConfig[journey.status]
            const isAsync = journey.mode === 'async'
            return (
              <div key={journey.id} className="card-hover p-5 group flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center', isAsync ? 'bg-blue-50' : 'bg-amber-50')}>
                    {isAsync ? <Monitor className="w-5 h-5 text-blue-600" /> : <FileText className="w-5 h-5 text-amber-600" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      'badge-pill text-xs',
                      isAsync ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'
                    )}>
                      {isAsync ? 'Online' : 'Presencial'}
                    </span>
                    {status && <span className={clsx('badge-pill', status.class)}>{status.label}</span>}
                  </div>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-brand-700 transition-colors">
                  {journey.title}
                </h3>
                {journey.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">{journey.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-400 mt-auto">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {journey.session_duration_minutes}min
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" />
                    {levelLabels[journey.participant_level] || journey.participant_level}
                  </span>
                  <span className="badge-pill bg-gray-100 text-gray-500">{journey.domain}</span>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <Link href={`/jornadas/${journey.id}`} className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
                    Ver detalhes
                  </Link>
                  {isAsync && (
                    <Link
                      href={`/jornadas/participar/${journey.id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700 group-hover:gap-2 transition-all"
                    >
                      <PlayCircle className="w-4 h-4" />
                      Participar
                    </Link>
                  )}
                  {!isAsync && (
                    <span className="text-xs text-gray-400 italic">Sessão presencial</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
