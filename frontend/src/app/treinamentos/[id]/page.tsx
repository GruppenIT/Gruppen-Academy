'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { TrainingProgressOut, TrainingProgressModule } from '@/types'
import Link from 'next/link'
import {
  LibraryBig, ArrowLeft, CheckCircle2, Lock, PlayCircle, FileText, Star,
  ChevronRight, ClipboardCheck, Circle,
} from 'lucide-react'
import { clsx } from 'clsx'

export default function TrainingProgressPage() {
  const params = useParams()
  const router = useRouter()
  const trainingId = params.id as string
  const [progress, setProgress] = useState<TrainingProgressOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getTrainingProgress(trainingId)
      .then(setProgress)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [trainingId])

  if (loading) {
    return (
      <AppShell>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-1/2" />
          <div className="space-y-3 mt-8">
            {[1, 2, 3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl" />)}
          </div>
        </div>
      </AppShell>
    )
  }

  if (error || !progress) {
    return (
      <AppShell>
        <div className="text-center py-16">
          <LibraryBig className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Treinamento não encontrado</h3>
          <p className="text-sm text-gray-400 mb-4">{error || 'Inscrição não encontrada.'}</p>
          <button onClick={() => router.push('/treinamentos')} className="btn-secondary text-sm">
            Voltar
          </button>
        </div>
      </AppShell>
    )
  }

  const pct = progress.total_modules > 0
    ? Math.round((progress.completed_modules / progress.total_modules) * 100)
    : 0
  const isCompleted = progress.status === 'completed'

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push('/treinamentos')} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{progress.training_title}</h1>
            <p className="text-gray-500 mt-1">
              {progress.completed_modules}/{progress.total_modules} módulos concluídos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-sm text-gray-500">
              <Star className="w-4 h-4 text-amber-500" /> {progress.xp_reward} XP
            </span>
            <span className={clsx(
              'badge-pill text-xs',
              isCompleted ? 'bg-emerald-50 text-emerald-600' : 'bg-brand-50 text-brand-600'
            )}>
              {isCompleted ? 'Concluído' : `${pct}%`}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-4 w-full h-3 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={clsx(
              'h-full rounded-full transition-all duration-500',
              isCompleted ? 'bg-emerald-500' : 'bg-brand-500'
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Module list */}
      <div className="space-y-3">
        {progress.modules.map((mod, idx) => (
          <ModuleCard
            key={mod.module_id}
            module={mod}
            trainingId={trainingId}
            index={idx}
          />
        ))}
      </div>

      {isCompleted && (
        <div className="mt-8 text-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h3 className="font-bold text-emerald-800 text-lg">Treinamento Concluído!</h3>
          <p className="text-emerald-600 text-sm mt-1">
            Parabéns! Você concluiu todos os módulos e ganhou {progress.xp_reward} XP.
          </p>
        </div>
      )}
    </AppShell>
  )
}

function ModuleCard({ module: mod, trainingId, index }: { module: TrainingProgressModule; trainingId: string; index: number }) {
  const getStatusIcon = () => {
    if (mod.locked) return <Lock className="w-5 h-5 text-gray-300" />
    if (mod.completed) return <CheckCircle2 className="w-5 h-5 text-emerald-500" />
    if (mod.content_viewed) return <PlayCircle className="w-5 h-5 text-amber-500" />
    return <Circle className="w-5 h-5 text-gray-300" />
  }

  const getStatusLabel = () => {
    if (mod.locked) return 'Bloqueado'
    if (mod.completed) return 'Concluído'
    if (mod.content_viewed && mod.has_quiz && !mod.quiz_passed) return 'Quiz pendente'
    if (mod.content_viewed) return 'Conteúdo visto'
    return 'Não iniciado'
  }

  const canAccess = !mod.locked

  const className = clsx(
    'flex items-center gap-4 p-4 rounded-xl border transition-all',
    canAccess && !mod.completed && 'card-hover cursor-pointer',
    mod.completed && 'bg-emerald-50/30 border-emerald-100',
    mod.locked && 'bg-gray-50 border-gray-100 opacity-60',
    !mod.completed && !mod.locked && 'border-gray-200 hover:border-brand-200',
  )

  const inner = (
    <>
      {/* Order number */}
      <div className={clsx(
        'w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
        mod.completed ? 'bg-emerald-100 text-emerald-600' :
        mod.locked ? 'bg-gray-100 text-gray-400' :
        'bg-brand-50 text-brand-600'
      )}>
        {index + 1}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h3 className={clsx(
          'font-medium',
          mod.locked ? 'text-gray-400' : 'text-gray-900'
        )}>
          {mod.title}
        </h3>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
          <span>{getStatusLabel()}</span>
          {mod.has_quiz && (
            <span className="flex items-center gap-0.5">
              <ClipboardCheck className="w-3 h-3" />
              Quiz{mod.quiz_required_to_advance ? ' (obrigatório)' : ''}
            </span>
          )}
          {mod.original_filename && (
            <span className="flex items-center gap-0.5">
              <FileText className="w-3 h-3" />
              {mod.original_filename}
            </span>
          )}
          <span className="flex items-center gap-0.5">
            <Star className="w-3 h-3" /> {mod.xp_reward} XP
          </span>
        </div>
        {mod.quiz_score !== null && (
          <div className="mt-1 text-xs">
            <span className={clsx(
              'font-medium',
              mod.quiz_passed ? 'text-emerald-600' : 'text-red-500'
            )}>
              Nota: {Math.round(mod.quiz_score * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Status icon */}
      <div className="shrink-0 flex items-center gap-2">
        {getStatusIcon()}
        {canAccess && !mod.completed && <ChevronRight className="w-4 h-4 text-gray-300" />}
      </div>
    </>
  )

  if (canAccess) {
    return <Link href={`/treinamentos/${trainingId}/modulo/${mod.order}`} className={className}>{inner}</Link>
  }
  return <div className={className}>{inner}</div>
  )
}
