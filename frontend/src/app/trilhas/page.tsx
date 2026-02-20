'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import Link from 'next/link'
import type { LearningPath } from '@/types'
import PointsBadge from '@/components/gamification/PointsBadge'
import { BookOpen, ArrowRight, Search, Sparkles, Target, Loader2 } from 'lucide-react'

export default function TrilhasPage() {
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getLearningPaths().then(setPaths).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const filtered = paths.filter(p =>
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.domain.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-brand-500" />
            Evoluir Meu Conhecimento
          </h1>
          <p className="text-gray-500 mt-1">Trilhas personalizadas para desenvolver suas competências.</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar trilhas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-10"
        />
      </div>

      {/* Paths Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Nenhuma trilha encontrada</h3>
          <p className="text-sm text-gray-400">Novas trilhas serão disponibilizadas em breve.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((path) => (
            <Link key={path.id} href={`/trilhas/${path.id}`} className="card-hover p-5 group">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                </div>
                <PointsBadge points={0} label="XP" size="sm" />
              </div>

              <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-brand-700 transition-colors">
                {path.title}
              </h3>
              {path.description && (
                <p className="text-sm text-gray-500 line-clamp-2 mb-4">{path.description}</p>
              )}

              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  {path.target_role}
                </span>
                <span className="badge-pill bg-gray-100 text-gray-500">{path.domain}</span>
              </div>

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-end">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 group-hover:gap-2 transition-all">
                  Iniciar trilha <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
