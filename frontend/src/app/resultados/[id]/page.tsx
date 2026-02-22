'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { ParticipationResponseDetail, AnalyticalReport } from '@/types'
import { clsx } from 'clsx'
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, FileText,
  ChevronDown, ChevronUp, Target, Lightbulb, MessageSquare,
} from 'lucide-react'

export default function ResultadoDetalhePage() {
  const params = useParams()
  const router = useRouter()
  const participationId = params.id as string

  const [details, setDetails] = useState<ParticipationResponseDetail[]>([])
  const [report, setReport] = useState<AnalyticalReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getMyParticipationDetails(participationId)
        setDetails(data)

        // Try to load report — find report_id from participations list
        try {
          const participations = await api.getMyParticipations()
          const thisOne = participations.find(p => p.participation_id === participationId)
          if (thisOne?.report_id) {
            const reportData = await api.getReport(thisOne.report_id)
            setReport(reportData)
          }
        } catch {
          // Report not available yet, that's ok
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [participationId])

  const evaluatedDetails = details.filter(d => d.evaluation)
  const avgScore = evaluatedDetails.length > 0
    ? evaluatedDetails.reduce((sum, d) => sum + (d.evaluation?.score_global ?? 0), 0) / evaluatedDetails.length
    : null

  function scoreColor(score: number) {
    if (score >= 7) return 'text-emerald-600'
    if (score >= 5) return 'text-amber-600'
    return 'text-red-600'
  }

  function scoreBgBar(score: number) {
    if (score >= 7) return 'bg-emerald-500'
    if (score >= 5) return 'bg-amber-500'
    return 'bg-red-500'
  }

  return (
    <AppShell>
      <button
        onClick={() => router.push('/resultados')}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Voltar para Meus Resultados
      </button>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
          <XCircle className="w-4 h-4 inline mr-2" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : (
        <>
          {/* Summary Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Resultado da Jornada</h1>
                <p className="text-gray-500 text-sm mt-1">
                  {details.length} perguntas — {evaluatedDetails.length} avaliadas
                </p>
              </div>
              {avgScore !== null && (
                <div className="text-center">
                  <div className={clsx('text-3xl font-bold', scoreColor(avgScore))}>
                    {avgScore.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Media geral</div>
                </div>
              )}
            </div>

            {/* Score bar overview */}
            {evaluatedDetails.length > 0 && (
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {evaluatedDetails.map(d => (
                  <div key={d.response_id} className="bg-gray-50 rounded-lg p-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Q{d.question_order}</span>
                      <span className={clsx('text-xs font-bold', scoreColor(d.evaluation!.score_global))}>
                        {d.evaluation!.score_global.toFixed(1)}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div
                        className={clsx('h-1.5 rounded-full', scoreBgBar(d.evaluation!.score_global))}
                        style={{ width: `${(d.evaluation!.score_global / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Report button */}
            {report && (
              <button
                onClick={() => setShowReport(!showReport)}
                className="mt-4 btn-primary flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                {showReport ? 'Ocultar Relatorio' : 'Ver Relatorio Analitico'}
              </button>
            )}
          </div>

          {/* Analytical Report */}
          {showReport && report && (
            <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" />
                Relatorio Analitico
              </h2>
              <ReportContent content={report.content} />
            </div>
          )}

          {/* Question-by-question breakdown */}
          <div className="space-y-3">
            {details.map((d) => {
              const isExpanded = expandedQuestion === d.response_id
              return (
                <div key={d.response_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {/* Header - always visible */}
                  <button
                    onClick={() => setExpandedQuestion(isExpanded ? null : d.response_id)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded">
                        Q{d.question_order}
                      </span>
                      <span className="text-sm text-gray-700 text-left line-clamp-1">{d.question_text}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {d.evaluation ? (
                        <span className={clsx(
                          'text-sm font-bold',
                          scoreColor(d.evaluation.score_global),
                        )}>
                          {d.evaluation.score_global.toFixed(1)}/10
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Pendente</span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100">
                      {/* Question */}
                      <div className="p-4 bg-gray-50">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="w-4 h-4 text-gray-400" />
                          <span className="text-xs font-semibold text-gray-500 uppercase">Pergunta ({d.question_type})</span>
                        </div>
                        <p className="text-sm text-gray-700">{d.question_text}</p>
                      </div>

                      {/* Answer */}
                      <div className="p-4">
                        <span className="text-xs font-semibold text-gray-500 uppercase mb-2 block">Sua Resposta</span>
                        <p className="text-sm text-gray-800 whitespace-pre-wrap bg-blue-50/50 p-3 rounded-lg">{d.answer_text}</p>
                      </div>

                      {/* Evaluation */}
                      {d.evaluation && (
                        <div className="p-4 border-t border-gray-100">
                          <span className="text-xs font-semibold text-gray-500 uppercase mb-3 block flex items-center gap-1">
                            <Target className="w-3 h-3" /> Avaliacao
                          </span>

                          {/* Criteria scores */}
                          {d.evaluation.criteria?.criterios && (
                            <div className="space-y-2 mb-4">
                              {d.evaluation.criteria.criterios.map((c, i) => (
                                <div key={i} className="bg-gray-50 p-3 rounded-lg">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-gray-700 capitalize">{c.nome.replace(/_/g, ' ')}</span>
                                    <div className="flex items-center gap-2">
                                      <div className="w-20 bg-gray-200 rounded-full h-2">
                                        <div
                                          className={clsx('h-2 rounded-full', scoreBgBar(c.nota))}
                                          style={{ width: `${(c.nota / 10) * 100}%` }}
                                        />
                                      </div>
                                      <span className={clsx('text-xs font-bold w-8 text-right', scoreColor(c.nota))}>
                                        {c.nota.toFixed(1)}
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-xs text-gray-600 mt-1">{c.comentario}</p>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* General comment */}
                          <div className="mb-3 bg-blue-50 p-3 rounded-lg">
                            <span className="text-xs font-semibold text-blue-700 mb-1 block">Comentario Geral</span>
                            <p className="text-sm text-gray-700">{d.evaluation.general_comment}</p>
                          </div>

                          {/* Recommendations */}
                          {d.evaluation.recommendations?.length > 0 && (
                            <div className="bg-amber-50 p-3 rounded-lg">
                              <span className="text-xs font-semibold text-amber-700 mb-1 block flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Recomendacoes
                              </span>
                              <ul className="space-y-1">
                                {d.evaluation.recommendations.map((r, i) => (
                                  <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
                                    <span className="text-amber-500 mt-0.5">-</span> {r}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </AppShell>
  )
}

/** Format a JSON key into a readable label. */
function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

/** Render a single value adaptively (string, number, array, object). */
function RenderValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) return null

  if (typeof value === 'string') {
    return <p className="text-sm text-gray-600 whitespace-pre-wrap">{value}</p>
  }

  if (typeof value === 'number') {
    return <p className="text-sm text-gray-600 font-medium">{value.toFixed?.(1) ?? value}</p>
  }

  if (Array.isArray(value)) {
    // Array of simple strings
    if (value.every(item => typeof item === 'string')) {
      return (
        <ul className="list-disc list-inside space-y-1">
          {value.map((item, i) => (
            <li key={i} className="text-sm text-gray-600">{item}</li>
          ))}
        </ul>
      )
    }
    // Array of objects — render each as a card
    return (
      <div className="space-y-2">
        {value.map((item, i) => (
          <div key={i} className="bg-white border border-gray-100 rounded-lg p-3">
            {typeof item === 'object' && item !== null ? (
              Object.entries(item as Record<string, unknown>).map(([k, v]) => (
                <div key={k} className="mb-1 last:mb-0">
                  <span className="text-xs font-medium text-gray-500 capitalize">{formatLabel(k)}: </span>
                  <span className="text-sm text-gray-700">
                    {typeof v === 'number' ? (v.toFixed?.(1) ?? v) : String(v ?? '')}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-600">{String(item)}</p>
            )}
          </div>
        ))}
      </div>
    )
  }

  if (typeof value === 'object') {
    return (
      <div className="space-y-2">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <div key={k}>
            <span className="text-xs font-medium text-gray-500 capitalize">{formatLabel(k)}: </span>
            {typeof v === 'string' || typeof v === 'number' ? (
              <span className="text-sm text-gray-600">{typeof v === 'number' ? (v.toFixed?.(1) ?? v) : v}</span>
            ) : (
              <RenderValue value={v} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return <p className="text-sm text-gray-600">{String(value)}</p>
}

/** Renders analytical report JSON content in a readable format. */
function ReportContent({ content }: { content: Record<string, unknown> }) {
  return (
    <div className="space-y-4">
      {Object.entries(content).map(([key, value]) => {
        const label = formatLabel(key)
        const isObject = typeof value === 'object' && value !== null && !Array.isArray(value)

        return (
          <div key={key} className={isObject ? 'bg-gray-50 rounded-lg p-4' : ''}>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">{label}</h3>
            <RenderValue value={value} />
          </div>
        )
      })}
    </div>
  )
}
