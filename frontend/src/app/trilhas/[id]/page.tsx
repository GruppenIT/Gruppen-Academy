'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { LearningPath, PathCompletion } from '@/types'
import { BookOpen, ArrowLeft, CheckCircle2, Circle, Loader2, Award, GraduationCap, Route, XCircle } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'

export default function TrilhaDetailPage() {
  const params = useParams()
  const [path, setPath] = useState<LearningPath | null>(null)
  const [completion, setCompletion] = useState<PathCompletion | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pathId = params.id as string

  useEffect(() => {
    loadData()
  }, [pathId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadData() {
    setLoading(true)
    try {
      const [p, c] = await Promise.all([
        api.getLearningPath(pathId),
        api.getPathCompletion(pathId),
      ])
      setPath(p)
      setCompletion(c)
    } catch {
      setError('Erro ao carregar trilha')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-600 animate-spin" /></div></AppShell>
  }

  if (!path) {
    return <AppShell><div className="text-center py-20"><p className="text-gray-500">Trilha nao encontrada.</p></div></AppShell>
  }

  const items = completion?.items || []
  const totalItems = completion?.total_items || 0
  const completedItems = completion?.completed_items || 0
  const progressPercent = completion?.progress_percent || 0
  const isComplete = completion?.completed || false
  const badgesEarned = completion?.badges_earned || []
  const pathBadges = path.badges || []

  return (
    <AppShell>
      <Link href="/trilhas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar para Trilhas
      </Link>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <XCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 text-sm">x</button>
        </div>
      )}

      {/* Path Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${isComplete ? 'bg-emerald-100' : 'bg-emerald-50'}`}>
            {isComplete ? <CheckCircle2 className="w-7 h-7 text-emerald-600" /> : <BookOpen className="w-7 h-7 text-emerald-600" />}
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{path.title}</h1>
            {path.description && <p className="text-gray-500 mb-4">{path.description}</p>}
            <div className="flex items-center gap-4 flex-wrap">
              <span className="badge-pill bg-gray-100 text-gray-600">{path.domain}</span>
              <span className="text-sm text-gray-500">{totalItems} item(ns)</span>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {totalItems > 0 && (
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-gray-500">Progresso</span>
              <span className="font-medium text-gray-700">{completedItems} / {totalItems} concluidos</span>
            </div>
            <div className="progress-bar h-3">
              <div
                className={`progress-bar-fill transition-all duration-500 ${isComplete ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' : 'bg-gradient-to-r from-brand-400 to-brand-600'}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {isComplete && (
              <p className="text-emerald-600 text-sm font-medium mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Trilha concluida! Parabens!
              </p>
            )}
          </div>
        )}

        {/* Badges */}
        {pathBadges.length > 0 && (
          <div className="mt-5 pt-4 border-t border-gray-100">
            <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-1">
              <Award className="w-4 h-4 text-amber-500" /> Badges desta trilha
            </h3>
            <div className="flex flex-wrap gap-2">
              {pathBadges.map(b => {
                const earned = badgesEarned.some(be => be.id === b.id)
                return (
                  <div key={b.id} className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                    earned ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200 opacity-50'
                  }`}>
                    <Award className={`w-5 h-5 ${earned ? 'text-amber-500' : 'text-gray-300'}`} />
                    <div>
                      <p className={`text-sm font-medium ${earned ? 'text-amber-700' : 'text-gray-500'}`}>{b.name}</p>
                      <p className="text-xs text-gray-400">{earned ? 'Conquistado!' : 'Complete a trilha para conquistar'}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Items List */}
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Route className="w-5 h-5 text-indigo-500" />
        Treinamentos e Jornadas
      </h2>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-gray-400">Esta trilha ainda nao possui itens.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const completed = item.completed
            const isTraining = item.item_type === 'training'
            const href = isTraining ? `/treinamentos/${item.item_id}` : `/jornadas/${item.item_id}`

            return (
              <Link key={item.item_id} href={href}
                className={clsx('card p-5 flex items-center gap-4 transition-all animate-slide-up hover:shadow-md', completed && 'bg-emerald-50/30')}
                style={{ animationDelay: `${idx * 60}ms` }}
              >
                {/* Status */}
                <div className={clsx(
                  'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                  completed ? 'bg-emerald-100' : 'bg-gray-50'
                )}>
                  {completed
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    : isTraining
                      ? <GraduationCap className="w-5 h-5 text-indigo-400" />
                      : <Route className="w-5 h-5 text-amber-400" />
                  }
                </div>

                {/* Number */}
                <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{idx + 1}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h4 className={clsx('font-medium', completed ? 'text-gray-500' : 'text-gray-900')}>
                    {item.item_title || 'Item indisponivel'}
                  </h4>
                </div>

                {/* Type badge */}
                <span className={`badge-pill text-xs ${isTraining ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                  {isTraining ? 'Treinamento' : 'Jornada'}
                </span>

                {/* Status indicator */}
                {completed ? (
                  <span className="badge-pill bg-emerald-50 text-emerald-600 text-xs">Concluido</span>
                ) : (
                  <span className="badge-pill bg-gray-100 text-gray-500 text-xs">Pendente</span>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
