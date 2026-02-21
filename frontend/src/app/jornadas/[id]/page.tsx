'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { Journey, Question } from '@/types'
import PointsBadge from '@/components/gamification/PointsBadge'
import { Route, Clock, Users, FileText, Target, ArrowLeft, Loader2, PlayCircle, Monitor, Lock } from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'

const typeLabels: Record<string, { label: string; color: string }> = {
  ESSAY: { label: 'Dissertativa', color: 'bg-blue-50 text-blue-600' },
  CASE_STUDY: { label: 'Estudo de Caso', color: 'bg-violet-50 text-violet-600' },
  ROLEPLAY: { label: 'Roleplay', color: 'bg-orange-50 text-orange-600' },
  OBJECTIVE: { label: 'Objetiva', color: 'bg-emerald-50 text-emerald-600' },
}

export default function JourneyDetailPage() {
  const params = useParams()
  const [journey, setJourney] = useState<Journey | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const isAsync = journey?.mode === 'async' || journey?.mode === 'ASYNC'

  useEffect(() => {
    const id = params.id as string
    Promise.all([
      api.getJourney(id),
      api.getJourneyQuestions(id),
    ]).then(([j, q]) => {
      setJourney(j)
      setQuestions(q)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [params.id])

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
        </div>
      </AppShell>
    )
  }

  if (!journey) {
    return (
      <AppShell>
        <div className="text-center py-20">
          <p className="text-gray-500">Jornada não encontrada.</p>
          <Link href="/jornadas" className="btn-primary mt-4 inline-flex">Voltar</Link>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      {/* Back */}
      <Link href="/jornadas" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6">
        <ArrowLeft className="w-4 h-4" /> Voltar para Jornadas
      </Link>

      {/* Journey Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start gap-5">
          <div className={clsx('w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0', isAsync ? 'bg-blue-50' : 'bg-amber-50')}>
            {isAsync ? <Monitor className="w-7 h-7 text-blue-600" /> : <FileText className="w-7 h-7 text-amber-600" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{journey.title}</h1>
              <span className={clsx('badge-pill text-xs', isAsync ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-700')}>
                {isAsync ? 'Online' : 'Presencial'}
              </span>
            </div>
            {journey.description && <p className="text-gray-500 mb-4">{journey.description}</p>}
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1.5"><Clock className="w-4 h-4" />{journey.session_duration_minutes} minutos</span>
              <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />Nivel: {journey.participant_level}</span>
              <span className="flex items-center gap-1.5"><Target className="w-4 h-4" />Dominio: {journey.domain}</span>
              <span className="flex items-center gap-1.5"><FileText className="w-4 h-4" />{questions.length} perguntas</span>
              <PointsBadge points={questions.length * 50} label="XP possiveis" />
            </div>
          </div>
        </div>
      </div>

      {/* Async mode: hide questions, show participation CTA */}
      {isAsync ? (
        <div className="card p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-brand-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Jornada Online</h2>
          <p className="text-sm text-gray-500 mb-2 max-w-md mx-auto">
            Esta jornada possui <strong>{questions.length} perguntas</strong> que serao apresentadas uma por vez.
            Cada pergunta pode ter um tempo maximo para resposta.
          </p>
          <p className="text-xs text-gray-400 mb-6">
            As perguntas nao sao exibidas previamente. Ao iniciar, voce respondera cada uma na ordem, sem retornar as anteriores.
          </p>
          <Link
            href={`/jornadas/participar/${journey.id}`}
            className="btn-primary inline-flex items-center gap-2 px-8 py-3 text-base"
          >
            <PlayCircle className="w-5 h-5" /> Iniciar Jornada
          </Link>
        </div>
      ) : (
        <>
          {/* Sync mode: show info about presential session */}
          <div className="card p-6 mb-6 bg-amber-50/50 border-amber-100">
            <div className="flex items-start gap-3">
              <FileText className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-amber-900 mb-1">Jornada Presencial</h3>
                <p className="text-sm text-amber-700">
                  Esta jornada sera realizada presencialmente. O administrador imprimira os formularios
                  e, apos a sessao, enviara as respostas digitalizadas para avaliacao.
                </p>
              </div>
            </div>
          </div>

          {/* Show questions for sync mode (informational) */}
          <h2 className="text-lg font-bold text-gray-900 mb-4">Perguntas da Jornada</h2>
          {questions.length === 0 ? (
            <div className="card p-8 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Nenhuma pergunta cadastrada nesta jornada.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.sort((a, b) => a.order - b.order).map((q, idx) => {
                const typeInfo = typeLabels[q.type] || { label: q.type, color: 'bg-gray-100 text-gray-600' }
                return (
                  <div key={q.id} className="card p-5 animate-slide-up" style={{ animationDelay: `${idx * 50}ms` }}>
                    <div className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-500 flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-900 font-medium mb-2">{q.text}</p>
                        <div className="flex items-center gap-3">
                          <span className={clsx('badge-pill', typeInfo.color)}>{typeInfo.label}</span>
                          <span className="text-xs text-gray-400">Peso: {q.weight}</span>
                          <span className="text-xs text-gray-400">{q.expected_lines} linhas esperadas</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
