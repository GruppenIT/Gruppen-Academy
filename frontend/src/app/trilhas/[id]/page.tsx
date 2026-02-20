'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { LearningPath, LearningActivity } from '@/types'
import PointsBadge from '@/components/gamification/PointsBadge'
import { BookOpen, ArrowLeft, CheckCircle2, Circle, Play, Loader2, Brain, MessageSquare, FileQuestion, Lightbulb, Gamepad2 } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'

const activityIcons: Record<string, React.ElementType> = {
  QUIZ: Gamepad2,
  SIMULATION: Play,
  CASE_STUDY: FileQuestion,
  GUIDED_CHAT: MessageSquare,
  MICROLESSON: Lightbulb,
}

const activityLabels: Record<string, string> = {
  QUIZ: 'Quiz',
  SIMULATION: 'Simulação',
  CASE_STUDY: 'Estudo de Caso',
  GUIDED_CHAT: 'Chat Guiado',
  MICROLESSON: 'Microaula',
}

export default function TrilhaDetailPage() {
  const params = useParams()
  const [path, setPath] = useState<LearningPath | null>(null)
  const [activities, setActivities] = useState<LearningActivity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const id = params.id as string
    Promise.all([
      api.getLearningPath(id),
      api.getPathActivities(id),
    ]).then(([p, a]) => {
      setPath(p)
      setActivities(a)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return <AppShell><div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-brand-600 animate-spin" /></div></AppShell>
  }

  if (!path) {
    return <AppShell><div className="text-center py-20"><p className="text-gray-500">Trilha não encontrada.</p></div></AppShell>
  }

  const totalPoints = activities.reduce((sum, a) => sum + a.points_reward, 0)

  return (
    <AppShell>
      <Link href="/trilhas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar para Trilhas
      </Link>

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
            <span className="font-medium text-gray-700">0 / {activities.length} concluídas</span>
          </div>
          <div className="progress-bar h-3">
            <div className="progress-bar-fill bg-gradient-to-r from-emerald-400 to-emerald-600" style={{ width: '0%' }} />
          </div>
        </div>
      </div>

      {/* Activities Timeline */}
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Brain className="w-5 h-5 text-violet-500" />
        Atividades
      </h2>

      <div className="space-y-3">
        {activities.sort((a, b) => a.order - b.order).map((activity, idx) => {
          const Icon = activityIcons[activity.type] || Circle
          const completed = false // TODO: track completion

          return (
            <div key={activity.id}
              className={clsx('card p-5 flex items-center gap-4 transition-all animate-slide-up', !completed && 'hover:border-brand-200 cursor-pointer')}
              style={{ animationDelay: `${idx * 60}ms` }}
            >
              {/* Status */}
              <div className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                completed ? 'bg-emerald-50' : 'bg-gray-50'
              )}>
                {completed
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <Icon className="w-5 h-5 text-gray-400" />
                }
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-900">{activity.title}</h4>
                {activity.description && <p className="text-sm text-gray-500 truncate">{activity.description}</p>}
              </div>

              {/* Meta */}
              <span className="badge-pill bg-violet-50 text-violet-600">{activityLabels[activity.type] || activity.type}</span>
              <PointsBadge points={activity.points_reward} size="sm" />
            </div>
          )
        })}
      </div>
    </AppShell>
  )
}
