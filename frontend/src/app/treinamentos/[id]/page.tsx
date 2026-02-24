'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { TrainingProgressOut, TrainingProgressModule, FinalQuizProgress, TrainingQuizQuestion, TrainingQuizAttemptOut, TrainingQuiz, CertificateOut } from '@/types'
import Link from 'next/link'
import {
  LibraryBig, ArrowLeft, CheckCircle2, Lock, PlayCircle, FileText, Star,
  ChevronRight, ClipboardCheck, Circle, Loader2, AlertTriangle, Shield, GraduationCap,
} from 'lucide-react'
import { clsx } from 'clsx'

export default function TrainingProgressPage() {
  const params = useParams()
  const router = useRouter()
  const trainingId = params.id as string
  const [progress, setProgress] = useState<TrainingProgressOut | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [certificate, setCertificate] = useState<CertificateOut | null>(null)
  const [issuingCert, setIssuingCert] = useState(false)

  useEffect(() => {
    api.getTrainingProgress(trainingId)
      .then(setProgress)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [trainingId])

  // Check for existing certificate when completed
  useEffect(() => {
    if (progress?.status === 'completed' && progress.enrollment_id) {
      api.getCertificateForEnrollment(progress.enrollment_id)
        .then((cert) => { if (cert) setCertificate(cert) })
        .catch(() => {})
    }
  }, [progress?.status, progress?.enrollment_id])

  const handleIssueCertificate = async () => {
    if (!progress) return
    setIssuingCert(true)
    try {
      const cert = await api.issueCertificate(progress.enrollment_id)
      setCertificate(cert)
      window.open(`/certificado/${cert.id}`, '_blank')
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao gerar certificado')
    } finally {
      setIssuingCert(false)
    }
  }

  const handleViewCertificate = () => {
    if (certificate) {
      window.open(`/certificado/${certificate.id}`, '_blank')
    }
  }

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

      {/* Final Quiz */}
      {progress.final_quiz?.has_quiz && (
        <FinalQuizCard
          trainingId={trainingId}
          finalQuiz={progress.final_quiz}
          xpReward={progress.xp_reward}
          onUpdate={() => {
            api.getTrainingProgress(trainingId).then(setProgress)
          }}
        />
      )}

      {isCompleted && (
        <div className="mt-8 text-center p-6 bg-emerald-50 rounded-2xl border border-emerald-100">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <h3 className="font-bold text-emerald-800 text-lg">Treinamento Concluído!</h3>
          <p className="text-emerald-600 text-sm mt-1">
            Parabéns! Você concluiu o treinamento e ganhou seus XP.
          </p>
          <div className="mt-4">
            {certificate ? (
              <button
                onClick={handleViewCertificate}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 transition-colors"
              >
                <GraduationCap className="w-4 h-4" />
                Ver certificado
              </button>
            ) : (
              <button
                onClick={handleIssueCertificate}
                disabled={issuingCert}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-medium text-sm hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {issuingCert ? <Loader2 className="w-4 h-4 animate-spin" /> : <GraduationCap className="w-4 h-4" />}
                Gerar certificado
              </button>
            )}
          </div>
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
}


function FinalQuizCard({ trainingId, finalQuiz, xpReward, onUpdate }: {
  trainingId: string; finalQuiz: FinalQuizProgress; xpReward: number; onUpdate: () => void
}) {
  const [showQuiz, setShowQuiz] = useState(false)
  const [quizData, setQuizData] = useState<TrainingQuiz | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<TrainingQuizAttemptOut | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  const attemptsLeft = finalQuiz.max_attempts > 0 ? finalQuiz.max_attempts - finalQuiz.attempts_used : Infinity
  const isLocked = !finalQuiz.unlocked
  const isBlocked = finalQuiz.blocked
  const hasPassed = finalQuiz.passed

  const handleStart = async () => {
    setLoadingQuiz(true)
    try {
      const q = await api.getTrainingQuiz(trainingId)
      if (q) {
        setQuizData(q)
        setAnswers({})
        setResult(null)
        setShowQuiz(true)
      }
    } catch { /* ignore */ }
    finally { setLoadingQuiz(false) }
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const attempt = await api.submitTrainingQuizAttempt(trainingId, answers)
      setResult(attempt)
      onUpdate()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao enviar avaliação')
    } finally { setSubmitting(false) }
  }

  if (showQuiz && quizData) {
    if (result) {
      return (
        <div className="mt-6 card p-6 border-2 border-violet-200">
          <div className="text-center mb-6">
            <div className={clsx(
              'w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3',
              result.passed ? 'bg-emerald-100' : 'bg-red-100'
            )}>
              {result.passed ? <CheckCircle2 className="w-8 h-8 text-emerald-600" /> : <AlertTriangle className="w-8 h-8 text-red-500" />}
            </div>
            <h3 className={clsx('text-lg font-bold', result.passed ? 'text-emerald-800' : 'text-red-700')}>
              {result.passed ? 'Aprovado!' : 'Não aprovado'}
            </h3>
            <p className="text-2xl font-bold mt-2">{Math.round(result.score * 100)}%</p>
            <p className="text-sm text-gray-500 mt-1">
              Mínimo: {Math.round(finalQuiz.passing_score * 100)}%
            </p>
            {result.passed && (
              <p className="text-sm text-emerald-600 mt-2 font-medium">
                +{Math.round(xpReward * result.score)} XP ganhos
              </p>
            )}
          </div>
          {/* Per-question results */}
          <div className="space-y-3 mb-6">
            {quizData.questions.map((q, i) => {
              const a = result.answers[q.id]
              return (
                <div key={q.id} className={clsx('p-3 rounded-xl border', a?.is_correct ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/50')}>
                  <p className="text-sm font-medium">{i + 1}. {q.text}</p>
                  <p className="text-xs mt-1 text-gray-500">
                    Sua resposta: {q.options?.find((_, oi) => String.fromCharCode(65 + oi) === a?.user_answer)?.text || a?.user_answer || '—'}
                  </p>
                  {a?.explanation && <p className="text-xs mt-1 text-gray-400 italic">{a.explanation}</p>}
                </div>
              )
            })}
          </div>
          <div className="flex justify-center gap-3">
            <button onClick={() => { setShowQuiz(false); setResult(null) }} className="btn-secondary text-sm px-4 py-2">Voltar</button>
            {!result.passed && attemptsLeft > 1 && !isBlocked && (
              <button onClick={handleStart} className="btn-primary text-sm px-4 py-2">Tentar novamente</button>
            )}
          </div>
        </div>
      )
    }

    return (
      <div className="mt-6 card p-6 border-2 border-violet-200">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-violet-600" /> {quizData.title}
        </h3>
        <p className="text-sm text-gray-500 mb-6">
          {quizData.questions.length} perguntas · Mínimo {Math.round(finalQuiz.passing_score * 100)}% para aprovação
        </p>
        <div className="space-y-6">
          {quizData.questions.map((q, i) => (
            <div key={q.id}>
              <p className="text-sm font-medium text-gray-800 mb-2">{i + 1}. {q.text}</p>
              {q.type === 'multiple_choice' && q.options?.map((opt, oi) => {
                const letter = String.fromCharCode(65 + oi)
                return (
                  <label key={oi} className={clsx(
                    'flex items-center gap-3 p-3 rounded-xl cursor-pointer mb-1 transition-colors',
                    answers[q.id] === letter ? 'bg-brand-50 border border-brand-200' : 'hover:bg-gray-50 border border-transparent'
                  )}>
                    <input type="radio" name={q.id} value={letter} checked={answers[q.id] === letter}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                      className="text-brand-600" />
                    <span className="text-sm">{opt.text}</span>
                  </label>
                )
              })}
              {q.type === 'true_false' && (
                <div className="flex gap-3">
                  {['A', 'B'].map((letter, li) => (
                    <button key={letter} onClick={() => setAnswers(a => ({ ...a, [q.id]: letter }))}
                      className={clsx(
                        'flex-1 py-2 rounded-xl text-sm font-medium border transition-colors',
                        answers[q.id] === letter ? 'bg-brand-50 border-brand-300 text-brand-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}>
                      {li === 0 ? 'Verdadeiro' : 'Falso'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-8">
          <button onClick={() => setShowQuiz(false)} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
          <button onClick={handleSubmit} disabled={submitting || Object.keys(answers).length < quizData.questions.length}
            className="btn-primary text-sm px-6 py-2 flex items-center gap-2">
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            Enviar avaliação
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(
      'mt-6 p-5 rounded-xl border-2 transition-all',
      hasPassed ? 'border-emerald-200 bg-emerald-50/30' :
      isLocked ? 'border-gray-200 bg-gray-50 opacity-60' :
      isBlocked ? 'border-red-200 bg-red-50/30' :
      'border-violet-200 bg-violet-50/30'
    )}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={clsx(
            'w-10 h-10 rounded-xl flex items-center justify-center',
            hasPassed ? 'bg-emerald-100' :
            isLocked ? 'bg-gray-100' :
            isBlocked ? 'bg-red-100' :
            'bg-violet-100'
          )}>
            {isLocked ? <Lock className="w-5 h-5 text-gray-400" /> :
             isBlocked ? <Shield className="w-5 h-5 text-red-500" /> :
             hasPassed ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> :
             <ClipboardCheck className="w-5 h-5 text-violet-600" />}
          </div>
          <div>
            <h3 className={clsx('font-medium', isLocked ? 'text-gray-400' : 'text-gray-900')}>
              Avaliação Final
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-400 mt-0.5">
              <span>{finalQuiz.questions_count} perguntas</span>
              <span>Mínimo {Math.round(finalQuiz.passing_score * 100)}%</span>
              {finalQuiz.max_attempts > 0 && (
                <span>{finalQuiz.attempts_used}/{finalQuiz.max_attempts} tentativas</span>
              )}
              {finalQuiz.best_score !== null && (
                <span className="font-medium">Melhor nota: {Math.round(finalQuiz.best_score * 100)}%</span>
              )}
            </div>
            {isLocked && <p className="text-xs text-gray-400 mt-1">Complete todos os módulos para desbloquear</p>}
            {isBlocked && <p className="text-xs text-red-500 mt-1">Tentativas esgotadas. Aguarde liberação do gestor.</p>}
          </div>
        </div>

        {!isLocked && !isBlocked && !hasPassed && (
          <button onClick={handleStart} disabled={loadingQuiz}
            className="btn-primary text-sm px-4 py-2 flex items-center gap-2">
            {loadingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            {finalQuiz.attempts_used > 0 ? 'Tentar novamente' : 'Iniciar avaliação'}
          </button>
        )}
      </div>
    </div>
  )
}
