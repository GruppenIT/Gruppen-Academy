'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { LearningPath, PathProgress, PathProgressActivity } from '@/types'
import PointsBadge from '@/components/gamification/PointsBadge'
import { BookOpen, ArrowLeft, CheckCircle2, Circle, Play, Loader2, Brain, MessageSquare, FileQuestion, Lightbulb, Gamepad2, XCircle } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'

const activityIcons: Record<string, React.ElementType> = {
  quiz: Gamepad2,
  simulation: Play,
  case_study: FileQuestion,
  guided_chat: MessageSquare,
  microlesson: Lightbulb,
}

const activityLabels: Record<string, string> = {
  quiz: 'Quiz',
  simulation: 'Simulacao',
  case_study: 'Estudo de Caso',
  guided_chat: 'Chat Guiado',
  microlesson: 'Microaula',
}

export default function TrilhaDetailPage() {
  const params = useParams()
  const [path, setPath] = useState<LearningPath | null>(null)
  const [progress, setProgress] = useState<PathProgress | null>(null)
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pathId = params.id as string

  useEffect(() => {
    loadData()
  }, [pathId])

  async function loadData() {
    setLoading(true)
    try {
      const [p, prog] = await Promise.all([
        api.getLearningPath(pathId),
        api.getPathProgress(pathId),
      ])
      setPath(p)
      setProgress(prog)
    } catch {
      setError('Erro ao carregar trilha')
    } finally {
      setLoading(false)
    }
  }

  async function handleComplete(activityId: string) {
    setCompletingId(activityId)
    setError(null)
    try {
      await api.completeActivity(activityId)
      // Reload progress
      const prog = await api.getPathProgress(pathId)
      setProgress(prog)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao completar atividade')
    } finally {
      setCompletingId(null)
    }
  }

  if (loading) {
    return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-600 animate-spin" /></div></AppShell>
  }

  if (!path) {
    return <AppShell><div className="text-center py-20"><p className="text-gray-500">Trilha nao encontrada.</p></div></AppShell>
  }

  const activities = progress?.activities || []
  const totalPoints = activities.reduce((sum, a) => sum + a.points_reward, 0)
  const completedCount = progress?.completed_activities ?? 0
  const progressPercent = progress?.progress_percent ?? 0

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
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-7 h-7 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{path.title}</h1>
            {path.description && <p className="text-gray-500 mb-4">{path.description}</p>}
            <div className="flex items-center gap-4">
              <span className="badge-pill bg-gray-100 text-gray-600">{path.domain}</span>
              <span className="text-sm text-gray-500">{activities.length} atividades</span>
              <PointsBadge points={totalPoints} label="XP totais" />
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-gray-500">Progresso</span>
            <span className="font-medium text-gray-700">{completedCount} / {activities.length} concluidas</span>
          </div>
          <div className="progress-bar h-3">
            <div
              className="progress-bar-fill bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          {progressPercent === 100 && (
            <p className="text-emerald-600 text-sm font-medium mt-2 flex items-center gap-1">
              <CheckCircle2 className="w-4 h-4" /> Trilha concluida! Parabens!
            </p>
          )}
        </div>
      </div>

      {/* Activities Timeline */}
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Brain className="w-5 h-5 text-violet-500" />
        Atividades
      </h2>

      <div className="space-y-3">
        {activities.sort((a, b) => a.order - b.order).map((activity, idx) => {
          const Icon = activityIcons[activity.type] || activityIcons[activity.type.toUpperCase()] || Circle
          const completed = activity.completed

          return (
            <div key={activity.activity_id}
              className={clsx('card p-5 flex items-center gap-4 transition-all animate-slide-up', completed && 'bg-emerald-50/30')}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Status */}
              <div className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                completed ? 'bg-emerald-100' : 'bg-gray-50'
              )}>
                {completed
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <Icon className="w-5 h-5 text-gray-400" />
                }
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className={clsx('font-medium', completed ? 'text-gray-500 line-through' : 'text-gray-900')}>{activity.title}</h4>
                {activity.description && <p className="text-sm text-gray-500 truncate">{activity.description}</p>}
              </div>

              {/* Meta */}
              <span className="badge-pill bg-violet-50 text-violet-600">
                {activityLabels[activity.type] || activityLabels[activity.type.toUpperCase()] || activity.type}
              </span>
              <PointsBadge points={activity.points_reward} size="sm" />

              {/* Complete Button */}
              {!completed && (
                <button
                  onClick={() => handleComplete(activity.activity_id)}
                  disabled={completingId !== null}
                  className="btn-primary text-xs flex items-center gap-1"
                >
                  {completingId === activity.activity_id
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <CheckCircle2 className="w-3 h-3" />}
                  Concluir
                </button>
              )}
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
