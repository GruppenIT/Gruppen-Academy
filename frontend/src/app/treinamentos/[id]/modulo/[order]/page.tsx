'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { TrainingProgressOut, TrainingProgressModule, TrainingModule as TrainingModuleType, QuizQuestion, ModuleQuiz, QuizAttemptOut } from '@/types'
import {
  ArrowLeft, FileText, CheckCircle2, XCircle, ChevronRight,
  Loader2, Download, Eye, Box,
} from 'lucide-react'
import { clsx } from 'clsx'

export default function ModuleContentPage() {
  const params = useParams()
  const router = useRouter()
  const trainingId = params.id as string
  const moduleOrder = parseInt(params.order as string, 10)

  const [progress, setProgress] = useState<TrainingProgressOut | null>(null)
  const [currentModule, setCurrentModule] = useState<TrainingProgressModule | null>(null)
  const [moduleDetail, setModuleDetail] = useState<TrainingModuleType | null>(null)
  const [quiz, setQuiz] = useState<ModuleQuiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [markingView, setMarkingView] = useState(false)
  const [contentMarked, setContentMarked] = useState(false)

  // Quiz state
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [attemptResult, setAttemptResult] = useState<QuizAttemptOut | null>(null)
  const [showQuiz, setShowQuiz] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const prog = await api.getTrainingProgress(trainingId)
      setProgress(prog)
      const mod = prog.modules.find(m => m.order === moduleOrder)
      setCurrentModule(mod || null)
      if (mod) {
        setContentMarked(mod.content_viewed)
      }
      // Load training detail for content_data (SCORM) and quiz
      const trainingDetail = await api.getTraining(trainingId)
      const trainModule = trainingDetail.modules?.find(m => m.order === moduleOrder)
      if (trainModule) {
        setModuleDetail(trainModule)
        if (mod?.has_quiz) {
          const q = await api.getModuleQuiz(trainingId, trainModule.id)
          setQuiz(q)
        }
      }
    } catch {
      // handle error silently
    } finally {
      setLoading(false)
    }
  }, [trainingId, moduleOrder])

  useEffect(() => { loadData() }, [loadData])

  // SCORM postMessage listener: capture lesson_status and score from SCORM iframe
  useEffect(() => {
    if (currentModule?.content_type !== 'scorm' || !moduleDetail) return

    const handler = async (event: MessageEvent) => {
      if (!event.data || event.data.type !== 'scorm_status') return
      const { lesson_status, score_raw, score_max } = event.data
      if (!lesson_status) return
      try {
        await api.updateScormStatus(trainingId, moduleDetail.id, {
          lesson_status,
          score_raw: score_raw ?? null,
          score_max: score_max ?? null,
        })
        if (['completed', 'passed'].includes(lesson_status)) {
          setContentMarked(true)
          const prog = await api.getTrainingProgress(trainingId)
          setProgress(prog)
          setCurrentModule(prog.modules.find(m => m.order === moduleOrder) || null)
        }
      } catch {
        // silently ignore SCORM status errors
      }
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentModule, moduleDetail, trainingId, moduleOrder])

  const handleMarkViewed = async () => {
    if (!currentModule || contentMarked) return
    setMarkingView(true)
    try {
      // Find module ID from training detail
      const trainingDetail = await api.getTraining(trainingId)
      const trainModule = trainingDetail.modules?.find(m => m.order === moduleOrder)
      if (trainModule) {
        await api.markModuleViewed(trainingId, trainModule.id)
        setContentMarked(true)
        // Reload progress
        const prog = await api.getTrainingProgress(trainingId)
        setProgress(prog)
        setCurrentModule(prog.modules.find(m => m.order === moduleOrder) || null)
      }
    } catch {
      // handle error silently
    } finally {
      setMarkingView(false)
    }
  }

  const handleSubmitQuiz = async () => {
    if (!currentModule) return
    setSubmitting(true)
    try {
      const trainingDetail = await api.getTraining(trainingId)
      const trainModule = trainingDetail.modules?.find(m => m.order === moduleOrder)
      if (trainModule) {
        const result = await api.submitQuizAttempt(trainingId, trainModule.id, answers)
        setAttemptResult(result)
        // Reload progress after attempt
        const prog = await api.getTrainingProgress(trainingId)
        setProgress(prog)
        setCurrentModule(prog.modules.find(m => m.order === moduleOrder) || null)
      }
    } catch {
      // handle error silently
    } finally {
      setSubmitting(false)
    }
  }

  const goToNextModule = () => {
    if (progress && moduleOrder < progress.total_modules) {
      router.push(`/treinamentos/${trainingId}/modulo/${moduleOrder + 1}`)
    } else {
      router.push(`/treinamentos/${trainingId}`)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-64 bg-gray-100 rounded-xl" />
        </div>
      </AppShell>
    )
  }

  if (!currentModule || !progress) {
    return (
      <AppShell>
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Módulo não encontrado</h3>
          <button onClick={() => router.push(`/treinamentos/${trainingId}`)} className="btn-secondary text-sm mt-4">
            Voltar ao treinamento
          </button>
        </div>
      </AppShell>
    )
  }

  if (currentModule.locked) {
    return (
      <AppShell>
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Módulo Bloqueado</h3>
          <p className="text-sm text-gray-400 mb-4">Conclua o módulo anterior para desbloquear.</p>
          <button onClick={() => router.push(`/treinamentos/${trainingId}`)} className="btn-secondary text-sm">
            Voltar
          </button>
        </div>
      </AppShell>
    )
  }

  // Determine file URL
  const fileUrl = currentModule.original_filename
    ? api.getModuleFileUrl(trainingId, currentModule.module_id)
    : null
  const isPdf = currentModule.original_filename?.toLowerCase().endsWith('.pdf')

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <button onClick={() => router.push(`/treinamentos/${trainingId}`)} className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {progress.training_title}
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Módulo {currentModule.order}: {currentModule.title}
            </h1>
            {currentModule.description && (
              <p className="text-gray-500 mt-1 text-sm">{currentModule.description}</p>
            )}
          </div>
          {currentModule.completed && (
            <span className="badge-pill bg-emerald-50 text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Concluído
            </span>
          )}
        </div>
      </div>

      {/* Content area */}
      {currentModule.content_type === 'scorm' && moduleDetail?.content_data?.entry_point ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700 flex items-center gap-2">
              <Box className="w-4 h-4 text-purple-500" /> Conteúdo Interativo (SCORM)
            </h2>
          </div>
          <div className="border rounded-xl overflow-hidden bg-gray-50" style={{ height: '75vh' }}>
            <iframe
              src={api.getScormLaunchUrl(trainingId, moduleDetail.id)}
              className="w-full h-full"
              title={currentModule.title}
            />
          </div>
        </div>
      ) : currentModule.content_type === 'ai_generated' && moduleDetail?.content_data ? (
        <div className="mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">Conteúdo</h2>
          <div className="card p-6 prose prose-sm max-w-none">
            {(moduleDetail.content_data.sections as { heading: string; content: string }[] | undefined)?.map((sec, i) => (
              <div key={i} className="mb-4">
                <h3 className="text-base font-semibold text-gray-800 mb-2">{sec.heading}</h3>
                <div className="text-gray-600 whitespace-pre-wrap text-sm">{sec.content}</div>
              </div>
            ))}
            {(moduleDetail.content_data.summary as string) && (
              <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-800 mb-1">Resumo</p>
                <p className="text-sm text-blue-700">{moduleDetail.content_data.summary as string}</p>
              </div>
            )}
            {(moduleDetail.content_data.key_concepts as string[] | undefined)?.length ? (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Conceitos-chave</p>
                <div className="flex flex-wrap gap-2">
                  {(moduleDetail.content_data.key_concepts as string[]).map((c, i) => (
                    <span key={i} className="badge-pill bg-gray-100 text-gray-600 text-xs">{c}</span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : fileUrl ? (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-700">Conteúdo</h2>
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-secondary text-xs flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Baixar arquivo
            </a>
          </div>
          {isPdf ? (
            <div className="border rounded-xl overflow-hidden bg-gray-50" style={{ height: '70vh' }}>
              <iframe
                src={fileUrl}
                className="w-full h-full"
                title={currentModule.original_filename || 'Conteúdo'}
              />
            </div>
          ) : (
            <div className="card p-8 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">{currentModule.original_filename}</p>
              <p className="text-sm text-gray-400 mt-1">Baixe o arquivo para visualizar o conteúdo.</p>
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary text-sm mt-4 inline-flex items-center gap-1"
              >
                <Download className="w-4 h-4" /> Baixar
              </a>
            </div>
          )}
        </div>
      ) : (
        <div className="card p-8 text-center mb-6">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Este módulo não possui conteúdo anexado.</p>
        </div>
      )}

      {/* Mark as viewed button */}
      {!contentMarked && (
        <div className="mb-6">
          <button
            onClick={handleMarkViewed}
            disabled={markingView}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {markingView ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Registrando...</>
            ) : (
              <><Eye className="w-4 h-4" /> Marcar conteúdo como visto</>
            )}
          </button>
        </div>
      )}

      {/* Quiz section */}
      {currentModule.has_quiz && quiz && contentMarked && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">{quiz.title}</h2>
            {currentModule.quiz_passed && (
              <span className="badge-pill bg-emerald-50 text-emerald-600 text-xs">Aprovado</span>
            )}
          </div>

          {/* Show quiz result or quiz form */}
          {attemptResult ? (
            <QuizResult
              attempt={attemptResult}
              questions={quiz.questions}
              onRetry={() => {
                setAttemptResult(null)
                setAnswers({})
              }}
              onNext={goToNextModule}
              isLastModule={moduleOrder >= progress.total_modules}
            />
          ) : currentModule.quiz_passed ? (
            <div className="card p-6 text-center bg-emerald-50/50">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
              <p className="text-emerald-700 font-medium">Você já foi aprovado neste quiz!</p>
              {currentModule.quiz_score !== null && (
                <p className="text-emerald-600 text-sm mt-1">Nota: {Math.round(currentModule.quiz_score * 100)}%</p>
              )}
              <button onClick={goToNextModule} className="btn-primary text-sm mt-4 inline-flex items-center gap-1">
                {moduleOrder < progress.total_modules ? (
                  <>Próximo módulo <ChevronRight className="w-4 h-4" /></>
                ) : (
                  <>Voltar ao treinamento</>
                )}
              </button>
            </div>
          ) : !showQuiz ? (
            <div className="card p-6 text-center">
              <p className="text-gray-600 mb-1">
                {quiz.questions.length} pergunta{quiz.questions.length !== 1 ? 's' : ''}
              </p>
              <p className="text-sm text-gray-400 mb-4">
                Nota mínima para aprovação: {Math.round(quiz.passing_score * 100)}%
                {currentModule.quiz_required_to_advance && ' (obrigatório para avançar)'}
              </p>
              <button onClick={() => setShowQuiz(true)} className="btn-primary text-sm">
                Iniciar Quiz
              </button>
            </div>
          ) : (
            <QuizForm
              questions={quiz.questions}
              answers={answers}
              onChange={setAnswers}
              onSubmit={handleSubmitQuiz}
              submitting={submitting}
              passingScore={quiz.passing_score}
            />
          )}
        </div>
      )}

      {/* Next module button when no quiz or quiz not required */}
      {contentMarked && (!currentModule.has_quiz || (!currentModule.quiz_required_to_advance && !showQuiz && !attemptResult)) && (
        <div className="mt-6 flex justify-end">
          <button onClick={goToNextModule} className="btn-primary text-sm inline-flex items-center gap-1">
            {moduleOrder < progress.total_modules ? (
              <>Próximo módulo <ChevronRight className="w-4 h-4" /></>
            ) : (
              <>Voltar ao treinamento</>
            )}
          </button>
        </div>
      )}
    </AppShell>
  )
}

function QuizForm({
  questions, answers, onChange, onSubmit, submitting, passingScore,
}: {
  questions: QuizQuestion[]
  answers: Record<string, string>
  onChange: (a: Record<string, string>) => void
  onSubmit: () => void
  submitting: boolean
  passingScore: number
}) {
  const allAnswered = questions.every(q => answers[q.id]?.trim())

  return (
    <div className="space-y-6">
      {questions
        .sort((a, b) => a.order - b.order)
        .map((q, idx) => (
          <div key={q.id} className="card p-5">
            <h4 className="font-medium text-gray-900 mb-3">
              {idx + 1}. {q.text}
            </h4>
            {q.type === 'multiple_choice' && q.options && (
              <div className="space-y-2">
                {q.options.map((opt, i) => {
                  const val = String.fromCharCode(65 + i) // A, B, C, D...
                  return (
                    <label
                      key={i}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all',
                        answers[q.id] === val
                          ? 'border-brand-300 bg-brand-50'
                          : 'border-gray-200 hover:border-gray-300'
                      )}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={val}
                        checked={answers[q.id] === val}
                        onChange={() => onChange({ ...answers, [q.id]: val })}
                        className="accent-brand-600"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-medium mr-1">{val}.</span> {opt.text}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}
            {q.type === 'true_false' && (
              <div className="flex gap-3">
                {['true', 'false'].map(val => (
                  <label
                    key={val}
                    className={clsx(
                      'flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all',
                      answers[q.id] === val
                        ? 'border-brand-300 bg-brand-50'
                        : 'border-gray-200 hover:border-gray-300'
                    )}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      value={val}
                      checked={answers[q.id] === val}
                      onChange={() => onChange({ ...answers, [q.id]: val })}
                      className="accent-brand-600"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {val === 'true' ? 'Verdadeiro' : 'Falso'}
                    </span>
                  </label>
                ))}
              </div>
            )}
            {q.type === 'essay' && (
              <textarea
                value={answers[q.id] || ''}
                onChange={(e) => onChange({ ...answers, [q.id]: e.target.value })}
                className="input-field w-full h-28 resize-none"
                placeholder="Digite sua resposta..."
              />
            )}
          </div>
        ))}

      <div className="flex items-center justify-between pt-2">
        <p className="text-xs text-gray-400">
          Nota mínima: {Math.round(passingScore * 100)}%
        </p>
        <button
          onClick={onSubmit}
          disabled={!allAnswered || submitting}
          className="btn-primary flex items-center gap-2"
        >
          {submitting ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : (
            'Enviar respostas'
          )}
        </button>
      </div>
    </div>
  )
}

function QuizResult({
  attempt, questions, onRetry, onNext, isLastModule,
}: {
  attempt: QuizAttemptOut
  questions: QuizQuestion[]
  onRetry: () => void
  onNext: () => void
  isLastModule: boolean
}) {
  const pct = Math.round(attempt.score * 100)

  return (
    <div className="space-y-4">
      {/* Score summary */}
      <div className={clsx(
        'card p-6 text-center',
        attempt.passed ? 'bg-emerald-50/50' : 'bg-red-50/50'
      )}>
        {attempt.passed ? (
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
        ) : (
          <XCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
        )}
        <h3 className={clsx('text-lg font-bold', attempt.passed ? 'text-emerald-700' : 'text-red-600')}>
          {attempt.passed ? 'Aprovado!' : 'Não aprovado'}
        </h3>
        <p className={clsx('text-2xl font-bold mt-1', attempt.passed ? 'text-emerald-600' : 'text-red-500')}>
          {pct}%
        </p>
      </div>

      {/* Question-by-question results */}
      <div className="space-y-3">
        {questions.sort((a, b) => a.order - b.order).map((q, idx) => {
          const result = attempt.answers[q.id]
          if (!result) return null
          return (
            <div key={q.id} className={clsx(
              'card p-4 border-l-4',
              result.is_correct ? 'border-l-emerald-500' : 'border-l-red-400'
            )}>
              <div className="flex items-start gap-2">
                {result.is_correct ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{idx + 1}. {q.text}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Sua resposta: <span className="font-medium">{result.user_answer || '(vazio)'}</span>
                  </p>
                  {!result.is_correct && result.correct_answer && (
                    <p className="text-xs text-emerald-600 mt-0.5">
                      Resposta correta: <span className="font-medium">{result.correct_answer}</span>
                    </p>
                  )}
                  {result.explanation && (
                    <p className="text-xs text-gray-400 mt-1 italic">{result.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        {!attempt.passed && (
          <button onClick={onRetry} className="btn-secondary text-sm">
            Tentar novamente
          </button>
        )}
        {attempt.passed && (
          <div />
        )}
        <button onClick={onNext} className="btn-primary text-sm inline-flex items-center gap-1">
          {isLastModule ? 'Voltar ao treinamento' : <>Próximo módulo <ChevronRight className="w-4 h-4" /></>}
        </button>
      </div>
    </div>
  )
}
