'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { ParticipationStatus, AsyncQuestion } from '@/types'
import {
  Loader2, Clock, Send, ChevronRight, CheckCircle2,
  AlertCircle, ArrowLeft, FileQuestion,
} from 'lucide-react'
import AppShell from '@/components/layout/AppShell'

function CountdownTimer({ seconds, onExpired }: { seconds: number; onExpired: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setRemaining(seconds)
    intervalRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          onExpired()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [seconds, onExpired])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60
  const pct = (remaining / seconds) * 100
  const isLow = remaining <= 30

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-mono font-bold ${isLow ? 'bg-red-50 text-red-600 animate-pulse' : 'bg-orange-50 text-orange-700'}`}>
      <Clock className="w-4 h-4" />
      <span>{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}</span>
      <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden ml-1">
        <div className={`h-full rounded-full transition-all duration-1000 ${isLow ? 'bg-red-500' : 'bg-orange-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export default function ParticiparJornadaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [status, setStatus] = useState<ParticipationStatus | null>(null)
  const [question, setQuestion] = useState<AsyncQuestion | null>(null)
  const [answer, setAnswer] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [showStartScreen, setShowStartScreen] = useState(true)

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.startJourney(id)
      setStatus(s)
      if (s.completed) {
        setShowStartScreen(false)
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar jornada')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { loadStatus() }, [loadStatus])

  const loadQuestion = async () => {
    try {
      const q = await api.getCurrentQuestion(id)
      setQuestion(q)
      setAnswer('')
      setShowStartScreen(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar pergunta')
    }
  }

  const handleSubmit = async () => {
    if (!answer.trim()) { setError('Digite sua resposta antes de enviar.'); return }
    setError(''); setSubmitting(true)
    try {
      const updated = await api.submitAnswer(id, answer.trim())
      setStatus(updated)
      if (updated.completed) {
        setQuestion(null)
      } else {
        // Load next question
        const q = await api.getCurrentQuestion(id)
        setQuestion(q)
        setAnswer('')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar resposta')
    } finally { setSubmitting(false) }
  }

  const handleTimeExpired = useCallback(() => {
    // Auto-submit with whatever they have
    if (answer.trim()) {
      handleSubmit()
    } else {
      setError('Tempo esgotado! Passe para a proxima pergunta.')
    }
  }, [answer])

  const handlePause = () => {
    router.push('/jornadas')
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      </AppShell>
    )
  }

  if (!status) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto text-center py-20">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Jornada nao encontrada</h2>
          <p className="text-sm text-gray-500 mb-6">{error || 'Voce nao tem permissao para participar desta jornada.'}</p>
          <button onClick={() => router.push('/jornadas')} className="btn-secondary px-4 py-2">Voltar</button>
        </div>
      </AppShell>
    )
  }

  // Completed state
  if (status.completed) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto text-center py-20">
          <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Jornada Concluida!</h2>
          <p className="text-sm text-gray-500 mb-2">{status.journey_title}</p>
          <p className="text-sm text-gray-400 mb-6">
            Voce respondeu todas as {status.total_questions} perguntas.
            Suas respostas serao avaliadas e o relatorio estara disponivel em breve.
          </p>
          <button onClick={() => router.push('/jornadas')} className="btn-primary px-6 py-2.5">
            Voltar para Jornadas
          </button>
        </div>
      </AppShell>
    )
  }

  // Start screen
  if (showStartScreen) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-10">
          <button onClick={() => router.push('/jornadas')} className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </button>

          <div className="card p-8 text-center">
            <div className="w-14 h-14 bg-brand-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FileQuestion className="w-7 h-7 text-brand-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">{status.journey_title}</h2>
            <p className="text-sm text-gray-500 mb-6">
              {status.total_questions} perguntas · {status.answered_questions > 0 ? `${status.answered_questions} ja respondidas` : 'Nenhuma respondida ainda'}
            </p>

            <div className="bg-amber-50 rounded-xl p-4 text-left text-sm text-amber-800 mb-6 space-y-2">
              <p className="font-semibold">Instrucoes:</p>
              <ul className="list-disc list-inside space-y-1 text-amber-700">
                <li>Voce vera uma pergunta por vez.</li>
                <li>Algumas perguntas possuem tempo maximo — um cronometro sera exibido.</li>
                <li>Apos enviar, voce <strong>nao pode retornar</strong> a pergunta anterior.</li>
                <li>Voce pode pausar e continuar depois.</li>
              </ul>
            </div>

            <button onClick={loadQuestion} className="btn-primary px-8 py-3 text-base flex items-center gap-2 mx-auto">
              {status.answered_questions > 0 ? 'Continuar' : 'Iniciar'} <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  // Question screen
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{status.journey_title}</h2>
            <p className="text-xs text-gray-500">Pergunta {question?.current_number} de {question?.total_questions}</p>
          </div>
          <div className="flex items-center gap-3">
            {question?.max_time_seconds && (
              <CountdownTimer seconds={question.max_time_seconds} onExpired={handleTimeExpired} />
            )}
            <button onClick={handlePause} className="btn-secondary px-3 py-1.5 text-xs">
              Pausar
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-100 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full bg-brand-600 rounded-full transition-all duration-500"
            style={{ width: `${((status.answered_questions) / status.total_questions) * 100}%` }}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 mb-4 bg-red-50 text-red-700 rounded-xl text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {question && (
          <div className="card p-6 space-y-5">
            {/* Question type badge */}
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-sm font-bold flex items-center justify-center">
                {question.current_number}
              </span>
              <span className={`badge-pill text-xs ${
                question.type === 'essay' ? 'bg-blue-50 text-blue-600' :
                question.type === 'case_study' ? 'bg-amber-50 text-amber-600' :
                question.type === 'roleplay' ? 'bg-purple-50 text-purple-600' :
                'bg-emerald-50 text-emerald-600'
              }`}>
                {question.type === 'essay' ? 'Dissertativa' :
                 question.type === 'case_study' ? 'Estudo de Caso' :
                 question.type === 'roleplay' ? 'Roleplay' : 'Objetiva'}
              </span>
            </div>

            {/* Question text */}
            <p className="text-gray-900 text-base leading-relaxed">{question.text}</p>

            {/* Answer textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Sua resposta
                <span className="text-xs text-gray-400 font-normal ml-2">
                  (aproximadamente {question.expected_lines} linhas esperadas)
                </span>
              </label>
              <textarea
                value={answer}
                onChange={(e) => { setAnswer(e.target.value); setError('') }}
                className="input-field w-full resize-none"
                style={{ minHeight: `${Math.max(question.expected_lines * 1.8, 8)}em` }}
                placeholder="Digite sua resposta aqui..."
                autoFocus
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={submitting || !answer.trim()}
                className="btn-primary flex items-center gap-2 px-6 py-2.5"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Enviar Resposta
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}
