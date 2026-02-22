'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import type { OCRUpload, OCRExtractedResponse, OCRImportReport, ParticipationEvaluationSummary, Question } from '@/types'
import {
  Upload, FileText, Eye, Play, CheckCircle, AlertCircle, Loader2,
  ChevronLeft, Save, X, Users, BookOpen, AlertTriangle,
} from 'lucide-react'
import { clsx } from 'clsx'

type View = 'list' | 'detail' | 'report'

const STATUS_LABELS: Record<string, { label: string; color: string; icon: typeof Upload }> = {
  uploaded: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Upload },
  processing: { label: 'Processando', color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
  processed: { label: 'Processado', color: 'bg-purple-100 text-purple-700', icon: Eye },
  reviewed: { label: 'Revisado', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  error: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

export default function AdminOCRPage() {
  const [view, setView] = useState<View>('list')
  const [uploads, setUploads] = useState<OCRUpload[]>([])
  const [selectedUpload, setSelectedUpload] = useState<OCRUpload | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [editedResponses, setEditedResponses] = useState<OCRExtractedResponse[]>([])
  const [participations, setParticipations] = useState<ParticipationEvaluationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [importReport, setImportReport] = useState<OCRImportReport | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [upl, parts] = await Promise.all([
        api.getOCRUploads(),
        api.getParticipationsForEvaluation(0, 100),
      ])
      setUploads(upl)
      setParticipations(parts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const handleUpload = async () => {
    if (!uploadFile) return
    setUploading(true)
    setError('')
    try {
      const report = await api.uploadOCRBatch(uploadFile)
      setImportReport(report)
      setShowUploadModal(false)
      setUploadFile(null)
      setView('report')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao enviar PDF')
    } finally {
      setUploading(false)
    }
  }

  const handleProcess = async (upload: OCRUpload) => {
    setProcessing(true)
    setError('')
    try {
      const updated = await api.processOCRUpload(upload.id)
      setUploads(prev => prev.map(u => u.id === updated.id ? updated : u))
      setSuccess('OCR processado!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao processar OCR')
    } finally {
      setProcessing(false)
    }
  }

  const openDetail = async (upload: OCRUpload) => {
    setSelectedUpload(upload)
    setError('')
    try {
      const part = participations.find(p => p.participation_id === upload.participation_id)
      if (part) {
        const qs = await api.getJourneyQuestions(part.journey_id)
        setQuestions(qs)
      }
      setEditedResponses(upload.extracted_responses || [])
      setView('detail')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar detalhes')
    }
  }

  const handleResponseTextChange = (index: number, text: string) => {
    setEditedResponses(prev => {
      const copy = [...prev]
      copy[index] = { ...copy[index], extracted_text: text }
      return copy
    })
  }

  const handleSaveReview = async () => {
    if (!selectedUpload) return
    setSaving(true)
    setError('')
    try {
      const updated = await api.reviewOCRUpload(selectedUpload.id, editedResponses)
      setSelectedUpload(updated)
      setUploads(prev => prev.map(u => u.id === updated.id ? updated : u))
      setSuccess('Revisao salva!')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao salvar revisao')
    } finally {
      setSaving(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedUpload) return
    setSaving(true)
    setError('')
    try {
      await api.approveOCRUpload(selectedUpload.id)
      setSuccess('Respostas aprovadas e salvas!')
      setView('list')
      await loadData()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao aprovar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    )
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* === LIST VIEW === */}
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Importacao OCR</h2>
              <p className="text-sm text-gray-500">
                Envie PDFs digitalizados de jornadas presenciais. O sistema identifica automaticamente a jornada e os respondentes pelo cabecalho.
              </p>
            </div>
            <button
              onClick={() => setShowUploadModal(true)}
              className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-brand-700"
            >
              <Upload className="w-4 h-4" /> Importar PDF
            </button>
          </div>

          {uploads.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhuma importacao OCR encontrada.</p>
              <p className="text-sm mt-1">Envie um PDF digitalizado para comecar.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Arquivo</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Profissional</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Acoes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {uploads.map(upload => {
                    const st = STATUS_LABELS[upload.status] || STATUS_LABELS.uploaded
                    const Icon = st.icon
                    const part = participations.find(p => p.participation_id === upload.participation_id)
                    return (
                      <tr key={upload.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <span className="font-medium">{upload.original_filename}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {part ? `${part.user_name} - ${part.journey_title}` : (upload.participation_id ? upload.participation_id.slice(0, 8) : 'Pendente')}
                        </td>
                        <td className="px-4 py-3">
                          <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', st.color)}>
                            <Icon className="w-3 h-3" /> {st.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(upload.created_at).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex gap-2 justify-end">
                            {upload.import_report && (
                              <button
                                onClick={() => { setImportReport(upload.import_report); setView('report') }}
                                className="text-blue-600 hover:text-blue-700 text-xs font-medium flex items-center gap-1"
                              >
                                <BookOpen className="w-3 h-3" /> Relatorio
                              </button>
                            )}
                            {upload.status === 'uploaded' && (
                              <button
                                onClick={() => handleProcess(upload)}
                                disabled={processing}
                                className="text-brand-600 hover:text-brand-700 text-xs font-medium flex items-center gap-1"
                              >
                                <Play className="w-3 h-3" /> Processar
                              </button>
                            )}
                            {['processed', 'reviewed'].includes(upload.status) && (
                              <button
                                onClick={() => openDetail(upload)}
                                className="text-brand-600 hover:text-brand-700 text-xs font-medium flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" /> Revisar
                              </button>
                            )}
                            {upload.status === 'error' && (
                              <span className="text-xs text-red-500">{upload.error_message}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* === IMPORT REPORT VIEW === */}
      {view === 'report' && importReport && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => { setView('list'); setImportReport(null) }} className="text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Relatorio de Importacao</h2>
              <p className="text-sm text-gray-500">Resultado do processamento do PDF digitalizado.</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Journey identified */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <BookOpen className="w-5 h-5 text-brand-600" />
                <h3 className="font-semibold text-gray-900">Jornada Identificada</h3>
              </div>
              {importReport.journey_title ? (
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-gray-700 font-medium">{importReport.journey_title}</span>
                  {importReport.journey_id && (
                    <span className="text-xs text-gray-400 ml-2">ID: {importReport.journey_id.slice(0, 8)}...</span>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span>Nao foi possivel identificar a jornada</span>
                </div>
              )}
              <div className="mt-2 text-xs text-gray-400">
                {importReport.total_pages} pagina(s) processada(s)
              </div>
            </div>

            {/* Users imported */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-center gap-3 mb-3">
                <Users className="w-5 h-5 text-brand-600" />
                <h3 className="font-semibold text-gray-900">
                  Usuarios Importados ({importReport.users_imported.filter(u => u.status === 'ok').length}/{importReport.total_respondents_found})
                </h3>
              </div>
              {importReport.users_imported.length > 0 ? (
                <div className="space-y-2">
                  {importReport.users_imported.map((user, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <div className="flex items-center gap-2">
                        {user.status === 'ok' ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <div>
                          <span className="text-sm font-medium text-gray-700">{user.user_name}</span>
                          <span className="text-xs text-gray-400 ml-2">{user.user_email}</span>
                        </div>
                      </div>
                      <span className={clsx(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        user.status === 'ok' ? 'bg-green-100 text-green-700' :
                          user.status === 'not_found' ? 'bg-red-100 text-red-700' :
                            'bg-yellow-100 text-yellow-700'
                      )}>
                        {user.status === 'ok' ? 'Importado' :
                          user.status === 'not_found' ? 'Usuario nao encontrado' :
                            'Jornada nao identificada'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">Nenhum respondente identificado no PDF.</p>
              )}
            </div>

            {/* Failures */}
            {importReport.failures.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  <h3 className="font-semibold text-red-700">Inconsistencias</h3>
                </div>
                <div className="space-y-2">
                  {importReport.failures.map((failure, idx) => (
                    <div key={idx} className="py-2 border-b border-red-100 last:border-0">
                      <p className="text-sm font-medium text-red-700">{failure.message}</p>
                      {failure.details && (
                        <p className="text-xs text-red-500 mt-1">{failure.details}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No failures */}
            {importReport.failures.length === 0 && importReport.users_imported.length > 0 && (
              <div className="bg-green-50 rounded-xl border border-green-200 p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-700">Importacao concluida sem inconsistencias.</span>
              </div>
            )}
          </div>

          <div className="mt-6">
            <button
              onClick={() => { setView('list'); setImportReport(null) }}
              className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700"
            >
              Voltar para Lista
            </button>
          </div>
        </>
      )}

      {/* === DETAIL VIEW (Review OCR) === */}
      {view === 'detail' && selectedUpload && (
        <>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Revisao OCR: {selectedUpload.original_filename}
              </h2>
              <p className="text-sm text-gray-500">
                Revise e corrija o texto extraido antes de aprovar.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {editedResponses.map((resp, idx) => {
              const question = questions.find(
                q => q.id === resp.question_id || q.order === resp.question_order
              )
              return (
                <div key={idx} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-xs font-medium text-gray-400">
                        Pergunta {resp.question_order}
                      </span>
                      {question && (
                        <p className="text-sm font-medium text-gray-700 mt-1">{question.text}</p>
                      )}
                    </div>
                    {resp.confidence !== null && resp.confidence !== undefined && (
                      <span className={clsx(
                        'text-xs px-2 py-1 rounded-full font-medium',
                        resp.confidence >= 0.7 ? 'bg-green-100 text-green-700' :
                          resp.confidence >= 0.4 ? 'bg-yellow-100 text-yellow-700' :
                            'bg-red-100 text-red-700'
                      )}>
                        Confianca: {Math.round(resp.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <textarea
                    value={resp.extracted_text}
                    onChange={e => handleResponseTextChange(idx, e.target.value)}
                    rows={5}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                    placeholder="Texto extraido da resposta..."
                  />
                </div>
              )
            })}
          </div>

          <div className="flex gap-3 mt-6 sticky bottom-4">
            <button
              onClick={handleSaveReview}
              disabled={saving}
              className="bg-brand-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-brand-700 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar Revisao
            </button>
            {selectedUpload.status === 'reviewed' && (
              <button
                onClick={handleApprove}
                disabled={saving}
                className="bg-green-600 text-white px-6 py-2 rounded-lg flex items-center gap-2 hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" /> Aprovar e Criar Respostas
              </button>
            )}
          </div>
        </>
      )}

      {/* === UPLOAD MODAL === */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Importar PDF Digitalizado</h3>
              <button onClick={() => { setShowUploadModal(false); setUploadFile(null) }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            <p className="text-sm text-gray-500 mb-4">
              Selecione o PDF digitalizado da jornada presencial. O sistema identifica automaticamente a jornada e os respondentes pelo cabecalho impresso (Nome, E-mail).
            </p>
            <p className="text-xs text-gray-400 mb-4">
              O PDF pode conter um ou varios respondentes.
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo PDF</label>
              <input
                type="file"
                ref={fileInputRef}
                accept=".pdf"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowUploadModal(false); setUploadFile(null) }}
                className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                disabled={!uploadFile || uploading}
                className="bg-brand-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-brand-700 disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Processando...' : 'Importar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
