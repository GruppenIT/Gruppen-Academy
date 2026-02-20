'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Journey, Question, Product, Competency } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Route, Eye, ChevronDown, ChevronUp,
  FileQuestion, Trash2,
} from 'lucide-react'

const STATUS_LABELS: Record<string, string> = { DRAFT: 'Rascunho', PUBLISHED: 'Publicada', ARCHIVED: 'Arquivada' }
const STATUS_COLORS: Record<string, string> = { DRAFT: 'bg-gray-100 text-gray-500', PUBLISHED: 'bg-emerald-50 text-emerald-600', ARCHIVED: 'bg-orange-50 text-orange-600' }
const Q_TYPE_LABELS: Record<string, string> = { ESSAY: 'Dissertativa', CASE_STUDY: 'Estudo de Caso', ROLEPLAY: 'Roleplay', OBJECTIVE: 'Objetiva' }

type ModalMode = 'create-journey' | 'edit-journey' | 'add-question' | null

export default function AdminJornadasPage() {
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [competencies, setCompetencies] = useState<Competency[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Record<string, Question[]>>({})

  // Journey form
  const [jTitle, setJTitle] = useState('')
  const [jDesc, setJDesc] = useState('')
  const [jDomain, setJDomain] = useState('vendas')
  const [jDuration, setJDuration] = useState(180)
  const [jLevel, setJLevel] = useState('intermediario')
  const [jStatus, setJStatus] = useState('DRAFT')
  const [editJourneyId, setEditJourneyId] = useState<string | null>(null)

  // Question form
  const [qJourneyId, setQJourneyId] = useState('')
  const [qText, setQText] = useState('')
  const [qType, setQType] = useState('ESSAY')
  const [qWeight, setQWeight] = useState(1)
  const [qLines, setQLines] = useState(10)
  const [qOrder, setQOrder] = useState(0)

  const load = useCallback(async () => {
    try {
      const [j, p, c] = await Promise.all([api.getJourneys(0, 200), api.getProducts(0, 200), api.getCompetencies()])
      setJourneys(j); setProducts(p); setCompetencies(c)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadQuestions = async (journeyId: string) => {
    try {
      const qs = await api.getJourneyQuestions(journeyId)
      setQuestions(prev => ({ ...prev, [journeyId]: qs }))
    } catch {}
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null) } else { setExpanded(id); if (!questions[id]) loadQuestions(id) }
  }

  const openCreateJourney = () => {
    setEditJourneyId(null); setJTitle(''); setJDesc(''); setJDomain('vendas'); setJDuration(180); setJLevel('intermediario'); setJStatus('DRAFT')
    setError(''); setModalMode('create-journey')
  }
  const openEditJourney = (j: Journey) => {
    setEditJourneyId(j.id); setJTitle(j.title); setJDesc(j.description || ''); setJDomain(j.domain); setJDuration(j.session_duration_minutes); setJLevel(j.participant_level); setJStatus(j.status)
    setError(''); setModalMode('edit-journey')
  }
  const openAddQuestion = (journeyId: string) => {
    setQJourneyId(journeyId); setQText(''); setQType('ESSAY'); setQWeight(1); setQLines(10)
    setQOrder((questions[journeyId]?.length || 0) + 1)
    setError(''); setModalMode('add-question')
  }

  const closeModal = () => { setModalMode(null); setError('') }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      if (modalMode === 'create-journey') {
        if (!jTitle) { setError('Titulo e obrigatorio.'); setSaving(false); return }
        await api.createJourney({ title: jTitle, description: jDesc || undefined, domain: jDomain, session_duration_minutes: jDuration, participant_level: jLevel })
      } else if (modalMode === 'edit-journey' && editJourneyId) {
        await api.updateJourney(editJourneyId, { title: jTitle, description: jDesc || null, domain: jDomain, session_duration_minutes: jDuration, participant_level: jLevel, status: jStatus })
      } else if (modalMode === 'add-question') {
        if (!qText) { setError('Texto da pergunta e obrigatorio.'); setSaving(false); return }
        await api.createQuestion(qJourneyId, { text: qText, type: qType, weight: qWeight, expected_lines: qLines, order: qOrder })
        loadQuestions(qJourneyId)
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const filtered = journeys.filter((j) => {
    const q = search.toLowerCase()
    return j.title.toLowerCase().includes(q) || j.domain.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Route className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Jornadas de Avaliacao</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{journeys.length}</span>
        </div>
        <button onClick={openCreateJourney} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Jornada
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar jornadas..." className="input-field pl-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((j) => (
            <div key={j.id} className="card overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Route className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{j.title}</h3>
                    <span className={`badge-pill ${STATUS_COLORS[j.status]}`}>{STATUS_LABELS[j.status]}</span>
                  </div>
                  <p className="text-xs text-gray-500">{j.domain} · {j.session_duration_minutes}min · {j.participant_level}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openEditJourney(j)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => toggleExpand(j.id)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                    {expanded === j.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === j.id && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <FileQuestion className="w-4 h-4" /> Perguntas ({questions[j.id]?.length || 0})
                    </h4>
                    <button onClick={() => openAddQuestion(j.id)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
                      <Plus className="w-3 h-3" /> Adicionar
                    </button>
                  </div>
                  {!questions[j.id] ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-brand-600 animate-spin" /></div>
                  ) : questions[j.id].length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma pergunta cadastrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {questions[j.id].sort((a, b) => a.order - b.order).map((q, i) => (
                        <div key={q.id} className="bg-white rounded-xl p-3 border border-gray-100">
                          <div className="flex items-start gap-3">
                            <span className="w-6 h-6 rounded-full bg-brand-50 text-brand-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900">{q.text}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="badge-pill bg-blue-50 text-blue-600 text-xs">{Q_TYPE_LABELS[q.type] || q.type}</span>
                                <span className="text-xs text-gray-400">Peso: {q.weight}</span>
                                <span className="text-xs text-gray-400">{q.expected_lines} linhas</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma jornada encontrada.</div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'create-journey' ? 'Nova Jornada' : modalMode === 'edit-journey' ? 'Editar Jornada' : 'Nova Pergunta'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {(modalMode === 'create-journey' || modalMode === 'edit-journey') ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={jTitle} onChange={(e) => setJTitle(e.target.value)} placeholder="Ex: Avaliacao BaaS Q1 2026" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                    <textarea className="input-field w-full h-20 resize-none" value={jDesc} onChange={(e) => setJDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
                      <input type="text" className="input-field w-full" value={jDomain} onChange={(e) => setJDomain(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Duracao (min)</label>
                      <input type="number" className="input-field w-full" value={jDuration} onChange={(e) => setJDuration(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Nivel</label>
                      <select className="input-field w-full" value={jLevel} onChange={(e) => setJLevel(e.target.value)}>
                        <option value="iniciante">Iniciante</option>
                        <option value="intermediario">Intermediario</option>
                        <option value="avancado">Avancado</option>
                      </select>
                    </div>
                    {modalMode === 'edit-journey' && (
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
                        <select className="input-field w-full" value={jStatus} onChange={(e) => setJStatus(e.target.value)}>
                          <option value="DRAFT">Rascunho</option>
                          <option value="PUBLISHED">Publicada</option>
                          <option value="ARCHIVED">Arquivada</option>
                        </select>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Texto da Pergunta *</label>
                    <textarea className="input-field w-full h-32 resize-none" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Descreva a pergunta..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
                      <select className="input-field w-full" value={qType} onChange={(e) => setQType(e.target.value)}>
                        <option value="ESSAY">Dissertativa</option>
                        <option value="CASE_STUDY">Estudo de Caso</option>
                        <option value="ROLEPLAY">Roleplay</option>
                        <option value="OBJECTIVE">Objetiva</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Peso</label>
                      <input type="number" step="0.1" className="input-field w-full" value={qWeight} onChange={(e) => setQWeight(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Linhas esperadas</label>
                      <input type="number" className="input-field w-full" value={qLines} onChange={(e) => setQLines(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Ordem</label>
                      <input type="number" className="input-field w-full" value={qOrder} onChange={(e) => setQOrder(Number(e.target.value))} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode?.startsWith('create') || modalMode === 'add-question' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
