'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Journey, Question, Product, Team, CopilotGeneratedQuestion } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Route, ChevronDown, ChevronUp,
  FileQuestion, Sparkles, Check, AlertCircle, Clock, UsersRound, Monitor, FileText,
} from 'lucide-react'

const STATUS_LABELS: Record<string, string> = { draft: 'Rascunho', published: 'Publicada', archived: 'Arquivada', DRAFT: 'Rascunho', PUBLISHED: 'Publicada', ARCHIVED: 'Arquivada' }
const STATUS_COLORS: Record<string, string> = { draft: 'bg-gray-100 text-gray-500', published: 'bg-emerald-50 text-emerald-600', archived: 'bg-orange-50 text-orange-600', DRAFT: 'bg-gray-100 text-gray-500', PUBLISHED: 'bg-emerald-50 text-emerald-600', ARCHIVED: 'bg-orange-50 text-orange-600' }
const MODE_LABELS: Record<string, string> = { sync: 'Presencial', async: 'Online' }
const MODE_COLORS: Record<string, string> = { sync: 'bg-amber-50 text-amber-700', async: 'bg-sky-50 text-sky-700' }
const Q_TYPE_LABELS: Record<string, string> = { essay: 'Dissertativa', case_study: 'Estudo de Caso', roleplay: 'Roleplay', objective: 'Objetiva', ESSAY: 'Dissertativa', CASE_STUDY: 'Estudo de Caso', ROLEPLAY: 'Roleplay', OBJECTIVE: 'Objetiva' }
const Q_TYPE_COLORS: Record<string, string> = { essay: 'bg-blue-50 text-blue-600', case_study: 'bg-amber-50 text-amber-600', roleplay: 'bg-purple-50 text-purple-600', objective: 'bg-emerald-50 text-emerald-600', ESSAY: 'bg-blue-50 text-blue-600', CASE_STUDY: 'bg-amber-50 text-amber-600', ROLEPLAY: 'bg-purple-50 text-purple-600', OBJECTIVE: 'bg-emerald-50 text-emerald-600' }

type ModalMode = 'edit-journey' | 'add-question' | 'assign-teams' | null
type WizardStep = 'form' | 'generating' | 'review' | 'error'

function formatTime(seconds: number | null) {
  if (!seconds) return null
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s}s`
  return s > 0 ? `${m}min ${s}s` : `${m}min`
}

export default function AdminJornadasPage() {
  const [journeys, setJourneys] = useState<Journey[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Record<string, Question[]>>({})

  // Edit Journey form
  const [editJourneyId, setEditJourneyId] = useState<string | null>(null)
  const [jTitle, setJTitle] = useState('')
  const [jDesc, setJDesc] = useState('')
  const [jDomain, setJDomain] = useState('vendas')
  const [jDuration, setJDuration] = useState(180)
  const [jLevel, setJLevel] = useState('intermediario')
  const [jMode, setJMode] = useState<string>('async')
  const [jStatus, setJStatus] = useState('DRAFT')

  // Question form
  const [qJourneyId, setQJourneyId] = useState('')
  const [qText, setQText] = useState('')
  const [qType, setQType] = useState('ESSAY')
  const [qWeight, setQWeight] = useState(1)
  const [qLines, setQLines] = useState(10)
  const [qOrder, setQOrder] = useState(0)
  const [qMaxTime, setQMaxTime] = useState<number | ''>('')

  // Team assignment
  const [assignJourneyId, setAssignJourneyId] = useState('')
  const [assignedTeamIds, setAssignedTeamIds] = useState<string[]>([])

  // AI Wizard state
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardStep, setWizardStep] = useState<WizardStep>('form')
  const [wizardError, setWizardError] = useState('')
  const [wTitle, setWTitle] = useState('')
  const [wDesc, setWDesc] = useState('')
  const [wDomain, setWDomain] = useState('vendas')
  const [wDuration, setWDuration] = useState(180)
  const [wLevel, setWLevel] = useState('intermediario')
  const [wMode, setWMode] = useState<string>('async')
  const [wProducts, setWProducts] = useState<string[]>([])
  const [generatedQuestions, setGeneratedQuestions] = useState<CopilotGeneratedQuestion[]>([])
  const [generatedJourneyId, setGeneratedJourneyId] = useState('')

  const load = useCallback(async () => {
    const [j, p, t] = await Promise.allSettled([api.getJourneys(0, 200), api.getProducts(0, 200), api.getTeams()])
    if (j.status === 'fulfilled') setJourneys(j.value)
    if (p.status === 'fulfilled') setProducts(p.value)
    if (t.status === 'fulfilled') setTeams(t.value)
    setLoading(false)
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

  const openEditJourney = (j: Journey) => {
    setEditJourneyId(j.id); setJTitle(j.title); setJDesc(j.description || ''); setJDomain(j.domain); setJDuration(j.session_duration_minutes); setJLevel(j.participant_level); setJMode(j.mode || 'async'); setJStatus(j.status)
    setError(''); setModalMode('edit-journey')
  }
  const openAddQuestion = (journeyId: string) => {
    setQJourneyId(journeyId); setQText(''); setQType('essay'); setQWeight(1); setQLines(10); setQMaxTime('')
    setQOrder((questions[journeyId]?.length || 0) + 1)
    setError(''); setModalMode('add-question')
  }
  const openAssignTeams = async (journeyId: string) => {
    setAssignJourneyId(journeyId)
    try {
      const assigned = await api.getJourneyTeams(journeyId)
      setAssignedTeamIds(assigned.map(t => t.id))
    } catch { setAssignedTeamIds([]) }
    setError(''); setModalMode('assign-teams')
  }
  const closeModal = () => { setModalMode(null); setError('') }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      if (modalMode === 'edit-journey' && editJourneyId) {
        await api.updateJourney(editJourneyId, { title: jTitle, description: jDesc || null, domain: jDomain, session_duration_minutes: jDuration, participant_level: jLevel, mode: jMode, status: jStatus })
      } else if (modalMode === 'add-question') {
        if (!qText) { setError('Texto da pergunta e obrigatorio.'); setSaving(false); return }
        await api.createQuestion(qJourneyId, { text: qText, type: qType, weight: qWeight, max_time_seconds: qMaxTime || null, expected_lines: qLines, order: qOrder })
        loadQuestions(qJourneyId)
      } else if (modalMode === 'assign-teams') {
        await api.assignJourneyTeams(assignJourneyId, assignedTeamIds)
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  // AI Wizard
  const openWizard = () => {
    setWTitle(''); setWDesc(''); setWDomain('vendas'); setWDuration(180); setWLevel('intermediario'); setWMode('async'); setWProducts([])
    setGeneratedQuestions([]); setGeneratedJourneyId(''); setWizardError('')
    setWizardStep('form'); setWizardOpen(true)
  }
  const closeWizard = () => { setWizardOpen(false) }

  const toggleProduct = (id: string) => {
    setWProducts(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id])
  }

  const toggleAssignTeam = (id: string) => {
    setAssignedTeamIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const runWizard = async () => {
    if (!wTitle.trim()) { setWizardError('Titulo e obrigatorio.'); return }
    if (wProducts.length === 0) { setWizardError('Selecione pelo menos um produto.'); return }
    setWizardError(''); setWizardStep('generating')
    try {
      const result = await api.copilotGenerateJourney({
        title: wTitle.trim(),
        domain: wDomain,
        session_duration_minutes: wDuration,
        participant_level: wLevel,
        product_ids: wProducts,
        description: wDesc || undefined,
      })
      // Update the journey mode if sync
      if (wMode === 'sync') {
        await api.updateJourney(result.journey_id, { mode: 'sync' })
      }
      setGeneratedJourneyId(result.journey_id)
      setGeneratedQuestions(result.questions)
      setWizardStep('review')
    } catch (err: unknown) {
      setWizardError(err instanceof Error ? err.message : 'Erro ao gerar jornada')
      setWizardStep('error')
    }
  }

  const finishWizard = () => {
    closeWizard(); load()
  }

  const journeyDomains = Array.from(new Set(journeys.map(j => j.domain))).sort()

  const filtered = journeys.filter((j) => {
    const q = search.toLowerCase()
    const matchesSearch = j.title.toLowerCase().includes(q) || j.domain.toLowerCase().includes(q)
    const matchesDomain = !domainFilter || j.domain === domainFilter
    return matchesSearch && matchesDomain
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Route className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Jornadas de Avaliacao</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{journeys.length}</span>
        </div>
        <button onClick={openWizard} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white font-medium text-sm bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-sm transition-all">
          <Sparkles className="w-4 h-4" /> Nova Jornada com IA
        </button>
      </div>

      {/* Domain filter */}
      {journeyDomains.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-500 uppercase">Dominio:</span>
          <button
            onClick={() => setDomainFilter(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!domainFilter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Todos ({journeys.length})
          </button>
          {journeyDomains.map((d) => {
            const count = journeys.filter(j => j.domain === d).length
            return (
              <button
                key={d}
                onClick={() => setDomainFilter(domainFilter === d ? null : d)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${domainFilter === d ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {d} ({count})
              </button>
            )
          })}
        </div>
      )}

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
                  {j.mode === 'sync' ? <FileText className="w-5 h-5 text-amber-600" /> : <Monitor className="w-5 h-5 text-sky-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900 truncate">{j.title}</h3>
                    <span className={`badge-pill ${STATUS_COLORS[j.status]}`}>{STATUS_LABELS[j.status]}</span>
                    <span className={`badge-pill ${MODE_COLORS[j.mode] || 'bg-gray-100 text-gray-600'}`}>{MODE_LABELS[j.mode] || j.mode}</span>
                  </div>
                  <p className="text-xs text-gray-500">{j.domain} · {j.session_duration_minutes}min · {j.participant_level}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openAssignTeams(j.id)} className="p-2 rounded-lg text-gray-400 hover:text-teal-600 hover:bg-teal-50" title="Atribuir equipes"><UsersRound className="w-4 h-4" /></button>
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
                                <span className={`badge-pill text-xs ${Q_TYPE_COLORS[q.type] || 'bg-gray-50 text-gray-600'}`}>{Q_TYPE_LABELS[q.type] || q.type}</span>
                                <span className="text-xs text-gray-400">Peso: {q.weight}</span>
                                <span className="text-xs text-gray-400">{q.expected_lines} linhas</span>
                                {q.max_time_seconds && (
                                  <span className="text-xs text-orange-500 flex items-center gap-0.5">
                                    <Clock className="w-3 h-3" /> {formatTime(q.max_time_seconds)}
                                  </span>
                                )}
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

      {/* Edit Journey / Add Question / Assign Teams Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'edit-journey' ? 'Editar Jornada' : modalMode === 'add-question' ? 'Nova Pergunta' : 'Atribuir Equipes'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {modalMode === 'edit-journey' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={jTitle} onChange={(e) => setJTitle(e.target.value)} />
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
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Nivel</label>
                      <select className="input-field w-full" value={jLevel} onChange={(e) => setJLevel(e.target.value)}>
                        <option value="iniciante">Iniciante</option>
                        <option value="intermediario">Intermediario</option>
                        <option value="avancado">Avancado</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Modalidade</label>
                      <select className="input-field w-full" value={jMode} onChange={(e) => setJMode(e.target.value)}>
                        <option value="async">Online (Assincrona)</option>
                        <option value="sync">Presencial (Sincrona)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Status</label>
                      <select className="input-field w-full" value={jStatus} onChange={(e) => setJStatus(e.target.value)}>
                        <option value="draft">Rascunho</option>
                        <option value="published">Publicada</option>
                        <option value="archived">Arquivada</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : modalMode === 'add-question' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Texto da Pergunta *</label>
                    <textarea className="input-field w-full h-32 resize-none" value={qText} onChange={(e) => setQText(e.target.value)} placeholder="Descreva a pergunta..." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
                      <select className="input-field w-full" value={qType} onChange={(e) => setQType(e.target.value)}>
                        <option value="essay">Dissertativa</option>
                        <option value="case_study">Estudo de Caso</option>
                        <option value="roleplay">Roleplay</option>
                        <option value="objective">Objetiva</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Peso</label>
                      <input type="number" step="0.1" className="input-field w-full" value={qWeight} onChange={(e) => setQWeight(Number(e.target.value))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Linhas esperadas</label>
                      <input type="number" className="input-field w-full" value={qLines} onChange={(e) => setQLines(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Ordem</label>
                      <input type="number" className="input-field w-full" value={qOrder} onChange={(e) => setQOrder(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1 flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" /> Tempo max (seg)
                      </label>
                      <input type="number" className="input-field w-full" value={qMaxTime} onChange={(e) => setQMaxTime(e.target.value ? Number(e.target.value) : '')} placeholder="Sem limite" />
                    </div>
                  </div>
                </>
              ) : modalMode === 'assign-teams' ? (
                <div>
                  <p className="text-sm text-gray-500 mb-3">Selecione as equipes que participarao desta jornada.</p>
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {teams.map((t) => {
                      const selected = assignedTeamIds.includes(t.id)
                      return (
                        <button key={t.id} type="button" onClick={() => toggleAssignTeam(t.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-teal-500 bg-teal-50' : 'border-gray-100 hover:border-gray-200'}`}
                        >
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                            {selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-gray-900">{t.name}</p>
                            <p className="text-xs text-gray-400">{t.members.length} membro{t.members.length !== 1 ? 's' : ''}</p>
                          </div>
                        </button>
                      )
                    })}
                    {teams.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhuma equipe cadastrada. Crie equipes na aba Equipes.</p>}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'add-question' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Journey Wizard */}
      {wizardOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900">Nova Jornada com IA</h3>
                  <p className="text-xs text-gray-500">
                    {wizardStep === 'form' && 'Configure os parametros e selecione os produtos'}
                    {wizardStep === 'generating' && 'Gerando perguntas com inteligencia artificial...'}
                    {wizardStep === 'review' && 'Jornada criada com sucesso!'}
                    {wizardStep === 'error' && 'Ocorreu um erro na geracao'}
                  </p>
                </div>
              </div>
              <button onClick={closeWizard} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5">
              {wizardStep === 'form' && (
                <div className="space-y-5">
                  {wizardError && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{wizardError}</div>}

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo da Jornada *</label>
                    <input type="text" className="input-field w-full" value={wTitle} onChange={(e) => setWTitle(e.target.value)} placeholder="Ex: Avaliacao BaaS Q1 2026" />
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao (opcional)</label>
                    <textarea className="input-field w-full h-16 resize-none" value={wDesc} onChange={(e) => setWDesc(e.target.value)} placeholder="Contexto ou objetivos especificos..." />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
                      <select className="input-field w-full" value={wDomain} onChange={(e) => setWDomain(e.target.value)}>
                        <option value="vendas">Vendas</option>
                        <option value="suporte">Suporte</option>
                        <option value="lideranca">Lideranca</option>
                        <option value="cs">CS</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Modalidade</label>
                      <select className="input-field w-full" value={wMode} onChange={(e) => setWMode(e.target.value)}>
                        <option value="async">Online (Assincrona)</option>
                        <option value="sync">Presencial (Sincrona)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Duracao (min)</label>
                      <input type="number" className="input-field w-full" value={wDuration} onChange={(e) => setWDuration(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Nivel</label>
                      <select className="input-field w-full" value={wLevel} onChange={(e) => setWLevel(e.target.value)}>
                        <option value="iniciante">Iniciante</option>
                        <option value="intermediario">Intermediario</option>
                        <option value="avancado">Avancado</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">
                      Produtos Foco * <span className="text-xs text-gray-400 font-normal">({wProducts.length} selecionado{wProducts.length !== 1 ? 's' : ''})</span>
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {products.map((p) => {
                        const selected = wProducts.includes(p.id)
                        return (
                          <button key={p.id} type="button" onClick={() => toggleProduct(p.id)} className={`p-3 rounded-xl border-2 text-left transition-all ${selected ? 'border-violet-500 bg-violet-50' : 'border-gray-100 hover:border-gray-200 bg-white'}`}>
                            <div className="flex items-start gap-2">
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${selected ? 'border-violet-500 bg-violet-500' : 'border-gray-300'}`}>
                                {selected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="min-w-0">
                                <p className={`text-sm font-medium truncate ${selected ? 'text-violet-900' : 'text-gray-900'}`}>{p.name}</p>
                                {p.technology && <p className="text-xs text-gray-400 truncate">{p.technology}</p>}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    {products.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhum produto cadastrado.</p>}
                  </div>
                </div>
              )}

              {wizardStep === 'generating' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="relative mb-6">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-white animate-pulse" />
                    </div>
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-violet-400 animate-ping" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Gerando Jornada</h4>
                  <p className="text-sm text-gray-500 text-center max-w-sm">
                    A IA esta analisando os produtos selecionados e criando perguntas variadas e calibradas para o tempo e nivel definidos.
                  </p>
                  <div className="flex items-center gap-1 mt-6">
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {wizardStep === 'review' && (
                <div className="space-y-5">
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Check className="w-5 h-5 text-emerald-600" />
                      <h4 className="font-semibold text-emerald-900">Jornada criada com sucesso!</h4>
                    </div>
                    <p className="text-sm text-emerald-700">
                      A IA gerou <strong>{generatedQuestions.length} perguntas</strong> para a jornada &ldquo;{wTitle}&rdquo;.
                      Voce pode editar as perguntas depois na pagina da jornada.
                    </p>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Perguntas Geradas</h4>
                    <div className="space-y-3">
                      {generatedQuestions.map((q, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                          <div className="flex items-start gap-3">
                            <span className="w-7 h-7 rounded-full bg-violet-100 text-violet-700 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 mb-2">{q.text}</p>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`badge-pill text-xs ${Q_TYPE_COLORS[q.type] || 'bg-gray-100 text-gray-600'}`}>
                                  {Q_TYPE_LABELS[q.type] || q.type}
                                </span>
                                <span className="text-xs text-gray-400">Peso: {q.weight}</span>
                                <span className="text-xs text-gray-400">{q.expected_lines} linhas</span>
                                {q.competency_tags?.map((tag, ti) => (
                                  <span key={ti} className="badge-pill bg-violet-50 text-violet-600 text-xs">{tag}</span>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {wizardStep === 'error' && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <h4 className="text-lg font-bold text-gray-900 mb-2">Erro na Geracao</h4>
                  <p className="text-sm text-gray-500 text-center max-w-sm mb-4">{wizardError}</p>
                  <button onClick={() => setWizardStep('form')} className="btn-secondary px-4 py-2 text-sm">
                    Tentar novamente
                  </button>
                </div>
              )}
            </div>

            {(wizardStep === 'form' || wizardStep === 'review') && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
                <button onClick={closeWizard} className="btn-secondary px-4 py-2">
                  {wizardStep === 'review' ? 'Fechar' : 'Cancelar'}
                </button>
                {wizardStep === 'form' && (
                  <button onClick={runWizard} className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium text-sm bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 shadow-sm transition-all">
                    <Sparkles className="w-4 h-4" /> Gerar com IA
                  </button>
                )}
                {wizardStep === 'review' && (
                  <button onClick={finishWizard} className="btn-primary flex items-center gap-2 px-4 py-2">
                    <Check className="w-4 h-4" /> Concluir
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
