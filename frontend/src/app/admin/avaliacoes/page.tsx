'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { ParticipationEvaluationSummary, ParticipationResponseDetail, Evaluation, AnalyticalReport } from '@/types'
import { clsx } from 'clsx'
import {
  ClipboardCheck, ChevronRight, Play, Eye, FileText,
  CheckCircle2, Clock, AlertCircle, XCircle, Loader2, ArrowLeft, Save,
} from 'lucide-react'

type View = 'list' | 'detail' | 'report'

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
    if (value.every(item => typeof item === 'string')) {
      return (
        <ul className="list-disc list-inside space-y-1">
          {value.map((item, i) => (
            <li key={i} className="text-sm text-gray-600">{item}</li>
          ))}
        </ul>
      )
    }
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

export default function AdminAvaliacoesPage() {
  const [view, setView] = useState<View>('list')
  const [participations, setParticipations] = useState<ParticipationEvaluationSummary[]>([])
  const [selectedParticipation, setSelectedParticipation] = useState<ParticipationEvaluationSummary | null>(null)
  const [details, setDetails] = useState<ParticipationResponseDetail[]>([])
  const [report, setReport] = useState<AnalyticalReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')

  useEffect(() => {
    loadParticipations()
  }, [])

  async function loadParticipations() {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getParticipationsForEvaluation(0, 100)
      setParticipations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar participacoes')
    } finally {
      setLoading(false)
    }
  }

  async function openDetail(p: ParticipationEvaluationSummary) {
    setSelectedParticipation(p)
    setView('detail')
    setLoading(true)
    try {
      const data = await api.getParticipationDetails(p.participation_id)
      setDetails(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar detalhes')
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkEvaluate(participationId: string) {
    setActionLoading('bulk-' + participationId)
    try {
      await api.evaluateBulk(participationId)
      // Reload detail
      const data = await api.getParticipationDetails(participationId)
      setDetails(data)
      await loadParticipations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao avaliar')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleEvaluateSingle(responseId: string, participationId: string) {
    setActionLoading('eval-' + responseId)
    try {
      await api.evaluateResponse(responseId)
      const data = await api.getParticipationDetails(participationId)
      setDetails(data)
      await loadParticipations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao avaliar')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReview(evaluationId: string, status: string) {
    setActionLoading('review-' + evaluationId)
    try {
      await api.reviewEvaluation(evaluationId, {
        status,
        review_notes: reviewNotes || undefined,
      })
      if (selectedParticipation) {
        const data = await api.getParticipationDetails(selectedParticipation.participation_id)
        setDetails(data)
      }
      setReviewingId(null)
      setReviewNotes('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao revisar')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleGenerateReport(participationId: string, type: 'manager' | 'professional') {
    setActionLoading('report-' + type)
    try {
      const generatedReport = await api.generateReport(participationId, type)
      setReport(generatedReport)
      setView('report')
      await loadParticipations()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar relatorio')
    } finally {
      setActionLoading(null)
    }
  }

  function statusIcon(p: ParticipationEvaluationSummary) {
    if (p.total_responses === 0) return <Clock className="w-4 h-4 text-gray-400" />
    if (p.evaluated_count === 0) return <AlertCircle className="w-4 h-4 text-amber-500" />
    if (p.evaluated_count < p.total_responses) return <Clock className="w-4 h-4 text-blue-500" />
    if (p.has_report) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    return <CheckCircle2 className="w-4 h-4 text-blue-500" />
  }

  function statusLabel(p: ParticipationEvaluationSummary) {
    if (p.total_responses === 0) return 'Sem respostas'
    if (p.evaluated_count === 0) return 'Pendente'
    if (p.evaluated_count < p.total_responses) return 'Parcial'
    if (p.has_report) return 'Completo'
    return 'Avaliado'
  }

  // Report view
  if (view === 'report' && report && selectedParticipation) {
    return (
      <div>
        <button
          onClick={() => setView('detail')}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para avaliacoes
        </button>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-brand-600" />
                Relatorio {report.report_type === 'manager' ? 'do Gestor' : 'do Profissional'}
              </h2>
              <p className="text-gray-500 text-sm mt-1">
                {selectedParticipation.journey_title} — {selectedParticipation.user_name}
              </p>
            </div>
            <span className="text-xs text-gray-400">
              Gerado em {new Date(report.created_at).toLocaleDateString('pt-BR')}
            </span>
          </div>

          <div className="space-y-4">
            {Object.entries(report.content).map(([key, value]) => {
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
        </div>
      </div>
    )
  }

  if (view === 'detail' && selectedParticipation) {
    return (
      <div>
        <button
          onClick={() => { setView('list'); setDetails([]) }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar para lista
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{selectedParticipation.journey_title}</h2>
            <p className="text-gray-500 text-sm">
              {selectedParticipation.user_name} ({selectedParticipation.user_email})
              {selectedParticipation.completed_at
                ? ` — Concluida em ${new Date(selectedParticipation.completed_at).toLocaleDateString('pt-BR')}`
                : ' — Em andamento'}
            </p>
          </div>
          <div className="flex gap-2">
            {details.some(d => !d.evaluation) && (
              <button
                onClick={() => handleBulkEvaluate(selectedParticipation.participation_id)}
                disabled={actionLoading !== null}
                className="btn-primary flex items-center gap-2"
              >
                {actionLoading?.startsWith('bulk') ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                Avaliar Todas
              </button>
            )}
            {details.length > 0 && details.every(d => d.evaluation) && (
              <>
                <button
                  onClick={() => handleGenerateReport(selectedParticipation.participation_id, 'professional')}
                  disabled={actionLoading !== null}
                  className="btn-secondary flex items-center gap-2"
                >
                  {actionLoading === 'report-professional' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Relatorio Profissional
                </button>
                <button
                  onClick={() => handleGenerateReport(selectedParticipation.participation_id, 'manager')}
                  disabled={actionLoading !== null}
                  className="btn-secondary flex items-center gap-2"
                >
                  {actionLoading === 'report-manager' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Relatorio Gestor
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
            <XCircle className="w-4 h-4" /> {error}
            <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">x</button>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {details.map((d, idx) => (
              <div key={d.response_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-bold text-brand-600 bg-brand-50 px-2 py-1 rounded">
                        Q{d.question_order}
                      </span>
                      <span className="text-xs text-gray-500 uppercase">{d.question_type}</span>
                    </div>
                    {d.evaluation ? (
                      <span className={clsx(
                        'text-xs font-medium px-2 py-1 rounded-full',
                        d.evaluation.status === 'evaluated' && 'bg-blue-100 text-blue-700',
                        d.evaluation.status === 'reviewed' && 'bg-emerald-100 text-emerald-700',
                        d.evaluation.status === 'sent' && 'bg-gray-100 text-gray-700',
                      )}>
                        {d.evaluation.status === 'evaluated' ? 'Avaliado' : d.evaluation.status === 'reviewed' ? 'Revisado' : 'Enviado'}
                        {' — '}{d.evaluation.score_global.toFixed(1)}/10
                      </span>
                    ) : (
                      <button
                        onClick={() => handleEvaluateSingle(d.response_id, selectedParticipation.participation_id)}
                        disabled={actionLoading !== null}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
                      >
                        {actionLoading === 'eval-' + d.response_id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <Play className="w-3 h-3" />}
                        Avaliar
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{d.question_text}</p>
                </div>

                <div className="p-4">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Resposta do Profissional</h4>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded-lg">{d.answer_text}</p>
                </div>

                {d.evaluation && (
                  <div className="p-4 border-t border-gray-100 bg-blue-50/30">
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-3">Avaliacao IA</h4>

                    {/* Criteria */}
                    {d.evaluation.criteria?.criterios && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
                        {d.evaluation.criteria.criterios.map((c, i) => (
                          <div key={i} className="bg-white p-3 rounded-lg border border-gray-100">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium text-gray-700 capitalize">{c.nome.replace(/_/g, ' ')}</span>
                              <span className={clsx(
                                'text-xs font-bold px-2 py-0.5 rounded',
                                c.nota >= 7 ? 'bg-emerald-100 text-emerald-700' :
                                c.nota >= 5 ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700',
                              )}>
                                {c.nota.toFixed(1)} (peso {c.peso})
                              </span>
                            </div>
                            <p className="text-xs text-gray-600">{c.comentario}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* General comment */}
                    <div className="mb-3">
                      <span className="text-xs font-semibold text-gray-500">Comentario Geral:</span>
                      <p className="text-sm text-gray-700 mt-1">{d.evaluation.general_comment}</p>
                    </div>

                    {/* Recommendations */}
                    {d.evaluation.recommendations?.length > 0 && (
                      <div className="mb-3">
                        <span className="text-xs font-semibold text-gray-500">Recomendacoes:</span>
                        <ul className="list-disc list-inside mt-1">
                          {d.evaluation.recommendations.map((r, i) => (
                            <li key={i} className="text-sm text-gray-700">{r}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Review Section */}
                    {d.evaluation.status === 'evaluated' && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        {reviewingId === d.evaluation.id ? (
                          <div className="space-y-2">
                            <textarea
                              value={reviewNotes}
                              onChange={e => setReviewNotes(e.target.value)}
                              placeholder="Notas de revisao (opcional)..."
                              className="w-full border border-gray-300 rounded-lg p-2 text-sm"
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleReview(d.evaluation!.id, 'reviewed')}
                                disabled={actionLoading !== null}
                                className="btn-primary text-xs flex items-center gap-1"
                              >
                                {actionLoading?.startsWith('review') ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Aprovar
                              </button>
                              <button
                                onClick={() => { setReviewingId(null); setReviewNotes('') }}
                                className="btn-secondary text-xs"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setReviewingId(d.evaluation!.id)}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" /> Revisar e Aprovar
                          </button>
                        )}
                      </div>
                    )}

                    {d.evaluation.review_notes && (
                      <div className="mt-2 p-2 bg-emerald-50 rounded text-xs text-emerald-700">
                        <strong>Notas do revisor:</strong> {d.evaluation.review_notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // List view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-brand-600" />
            Avaliacoes
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Revise e aprove as avaliacoes das jornadas dos profissionais.
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
          <XCircle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700">x</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : participations.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          Nenhuma participacao encontrada.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Jornada</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Profissional</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Respostas</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Avaliadas</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">Relatorio</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {participations.map(p => (
                <tr key={p.participation_id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {statusIcon(p)}
                      <span className="text-xs text-gray-600">{statusLabel(p)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{p.journey_title}</td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-gray-900">{p.user_name}</p>
                      <p className="text-xs text-gray-500">{p.user_email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {p.started_at ? new Date(p.started_at).toLocaleDateString('pt-BR') : '—'}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{p.total_responses}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      p.evaluated_count === p.total_responses && p.total_responses > 0
                        ? 'bg-emerald-100 text-emerald-700'
                        : p.evaluated_count > 0
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-500'
                    )}>
                      {p.evaluated_count}/{p.total_responses}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {p.has_report
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => openDetail(p)}
                      className="text-brand-600 hover:text-brand-800 flex items-center gap-1 text-xs font-medium"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
