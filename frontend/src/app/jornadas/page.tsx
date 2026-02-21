'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import Link from 'next/link'
import type { Journey } from '@/types'
import { Route, Clock, Users, ArrowRight, Search, Filter } from 'lucide-react'
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

  useEffect(() => {
    api.getJourneys(0, 100).then(setJourneys).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = journeys.filter(j =>
    j.title.toLowerCase().includes(search.toLowerCase()) ||
    j.domain.toLowerCase().includes(search.toLowerCase())
  )

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
        <button className="btn-secondary flex items-center gap-2">
          <Filter className="w-4 h-4" />
          Filtros
        </button>
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
            return (
              <Link key={journey.id} href={`/jornadas/${journey.id}`} className="card-hover p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <Route className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className={clsx('badge-pill', status.class)}>{status.label}</span>
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-brand-700 transition-colors">
                  {journey.title}
                </h3>
                {journey.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-4">{journey.description}</p>
                )}

                <div className="flex items-center gap-4 text-xs text-gray-400">
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

                <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all">
                    Ver detalhes <ArrowRight className="w-4 h-4" />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
