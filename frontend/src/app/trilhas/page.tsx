'use client'

import { useEffect, useState } from 'react'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import Link from 'next/link'
import type { LearningPath, SuggestedPath, PathCompletion } from '@/types'
import { BookOpen, ArrowRight, Search, Sparkles, Target, Loader2, Lightbulb, CheckCircle2, Award } from 'lucide-react'

export default function TrilhasPage() {
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [suggestedPaths, setSuggestedPaths] = useState<SuggestedPath[]>([])
  const [completions, setCompletions] = useState<Record<string, PathCompletion>>({})
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.allSettled([
      api.getLearningPaths(),
      api.getSuggestedPaths(),
    ]).then(async ([pathsResult, suggestedResult]) => {
      if (pathsResult.status === 'fulfilled') {
        setPaths(pathsResult.value)
        // Load completion for each path
        const completionPromises = pathsResult.value.map(p =>
          api.getPathCompletion(p.id).then(c => ({ id: p.id, completion: c })).catch(() => null)
        )
        const results = await Promise.all(completionPromises)
        const compMap: Record<string, PathCompletion> = {}
        for (const r of results) {
          if (r) compMap[r.id] = r.completion
        }
        setCompletions(compMap)
      }
      if (suggestedResult.status === 'fulfilled') setSuggestedPaths(suggestedResult.value)
    }).finally(() => setLoading(false))
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
          <p className="text-gray-500 mt-1">Trilhas personalizadas para desenvolver suas competencias.</p>
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

      {/* Suggested Paths */}
      {suggestedPaths.length > 0 && !search && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-amber-500" />
            Sugeridas para voce
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {suggestedPaths.slice(0, 3).map((sp) => (
              <Link key={sp.path_id} href={`/trilhas/${sp.path_id}`} className="card-hover p-4 group border-l-4 border-l-amber-400">
                <h3 className="font-semibold text-gray-900 text-sm mb-1 group-hover:text-brand-700 transition-colors">{sp.title}</h3>
                <p className="text-xs text-amber-600 mb-2">{sp.relevance}</p>
                {sp.matching_competencies.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {sp.matching_competencies.map((c, i) => (
                      <span key={i} className="badge-pill bg-amber-50 text-amber-600 text-xs">{c}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Paths Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Nenhuma trilha encontrada</h3>
          <p className="text-sm text-gray-400">Novas trilhas serao disponibilizadas em breve.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((path) => {
            const completion = completions[path.id]
            const progress = completion?.progress_percent || 0
            const isComplete = completion?.completed || false
            const totalItems = completion?.total_items || (path.items?.length || 0)
            const completedItems = completion?.completed_items || 0
            const badges = path.badges || []

            return (
              <Link key={path.id} href={`/trilhas/${path.id}`} className="card-hover p-5 group">
                <div className="flex items-start justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isComplete ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
                    {isComplete ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <BookOpen className="w-5 h-5 text-emerald-600" />}
                  </div>
                  {badges.length > 0 && (
                    <div className="flex items-center gap-1">
                      {badges.map(b => (
                        <span key={b.id} className="badge-pill bg-amber-50 text-amber-500 text-xs" title={b.name}>
                          <Award className="w-3 h-3" />
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-brand-700 transition-colors">
                  {path.title}
                </h3>
                {path.description && (
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{path.description}</p>
                )}

                {totalItems > 0 && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>{completedItems}/{totalItems} concluidos</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isComplete ? 'bg-emerald-500' : 'bg-brand-500'}`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
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
                    {isComplete ? 'Ver detalhes' : 'Continuar trilha'} <ArrowRight className="w-4 h-4" />
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
