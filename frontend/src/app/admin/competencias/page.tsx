'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Competency, MasterGuideline, Product, CopilotCompetencySuggestion, CopilotGuidelineSuggestion } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Brain, FileText, ChevronDown, ChevronUp,
  Sparkles, Check, AlertCircle, Building2,
} from 'lucide-react'

type Tab = 'competencies' | 'guidelines'
type ModalMode = 'create' | 'edit' | null

type CopilotStep = 'idle' | 'analyzing' | 'suggestions' | 'creating' | 'done' | 'error'

export default function AdminCompetenciasPage() {
  const [tab, setTab] = useState<Tab>('competencies')
  const [competencies, setCompetencies] = useState<Competency[]>([])
  const [guidelines, setGuidelines] = useState<MasterGuideline[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState<string | null>(null)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [modalType, setModalType] = useState<Tab>('competencies')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedGuideline, setExpandedGuideline] = useState<string | null>(null)

  // Competency form
  const [cName, setCName] = useState('')
  const [cDesc, setCDesc] = useState('')
  const [cType, setCType] = useState<'HARD' | 'SOFT'>('HARD')
  const [cDomain, setCDomain] = useState('vendas')
  const [editCompId, setEditCompId] = useState<string | null>(null)

  // Guideline form
  const [gTitle, setGTitle] = useState('')
  const [gContent, setGContent] = useState('')
  const [gCategory, setGCategory] = useState('')
  const [gProductId, setGProductId] = useState('')
  const [gIsCorporate, setGIsCorporate] = useState(false)
  const [gDomain, setGDomain] = useState<string>('')
  const [editGuideId, setEditGuideId] = useState<string | null>(null)

  // Copilot state
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotStep, setCopilotStep] = useState<CopilotStep>('idle')
  const [copilotError, setCopilotError] = useState('')
  const [compSuggestions, setCompSuggestions] = useState<(CopilotCompetencySuggestion & { selected: boolean })[]>([])
  const [guideSuggestions, setGuideSuggestions] = useState<(CopilotGuidelineSuggestion & { selected: boolean })[]>([])
  const [copilotCreatedCount, setCopilotCreatedCount] = useState(0)

  const load = useCallback(async () => {
    try {
      const [c, g, p] = await Promise.all([api.getCompetencies(), api.getGuidelines(), api.getProducts(0, 200)])
      setCompetencies(c); setGuidelines(g); setProducts(p)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreateComp = () => {
    setEditCompId(null); setCName(''); setCDesc(''); setCType('HARD'); setCDomain('vendas')
    setError(''); setModalType('competencies'); setModalMode('create')
  }
  const openEditComp = (c: Competency) => {
    setEditCompId(c.id); setCName(c.name); setCDesc(c.description); setCType(c.type); setCDomain(c.domain)
    setError(''); setModalType('competencies'); setModalMode('edit')
  }
  const openCreateGuide = () => {
    setEditGuideId(null); setGTitle(''); setGContent(''); setGCategory(''); setGProductId(products[0]?.id || ''); setGIsCorporate(false); setGDomain('')
    setError(''); setModalType('guidelines'); setModalMode('create')
  }
  const openEditGuide = (g: MasterGuideline) => {
    setEditGuideId(g.id); setGTitle(g.title); setGContent(g.content); setGCategory(g.category); setGProductId(g.product_id || ''); setGIsCorporate(g.is_corporate); setGDomain(g.domain || '')
    setError(''); setModalType('guidelines'); setModalMode('edit')
  }

  const closeModal = () => { setModalMode(null); setError('') }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      if (modalType === 'competencies') {
        if (!cName || !cDesc) { setError('Nome e descricao sao obrigatorios.'); setSaving(false); return }
        if (modalMode === 'create') {
          await api.createCompetency({ name: cName, description: cDesc, type: cType, domain: cDomain })
        } else if (editCompId) {
          await api.updateCompetency(editCompId, { name: cName, description: cDesc, type: cType, domain: cDomain })
        }
      } else {
        if (!gTitle || !gContent || !gCategory) { setError('Titulo, categoria e conteudo sao obrigatorios.'); setSaving(false); return }
        if (!gIsCorporate && !gProductId) { setError('Selecione um produto ou marque como orientacao corporativa.'); setSaving(false); return }
        if (modalMode === 'create') {
          await api.createGuideline({
            product_id: gIsCorporate ? null : gProductId,
            title: gTitle,
            content: gContent,
            category: gCategory,
            is_corporate: gIsCorporate,
            domain: gDomain || undefined,
          })
        } else if (editGuideId) {
          await api.updateGuideline(editGuideId, {
            product_id: gIsCorporate ? null : gProductId,
            title: gTitle,
            content: gContent,
            category: gCategory,
            is_corporate: gIsCorporate,
            domain: gDomain || null,
          })
        }
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  // --- Copilot Flow ---
  const startCopilot = () => {
    setCopilotOpen(true)
    setCopilotStep('idle')
    setCopilotError('')
    setCompSuggestions([])
    setGuideSuggestions([])
    setCopilotCreatedCount(0)
  }

  const runCopilotAnalysis = async () => {
    setCopilotStep('analyzing')
    setCopilotError('')
    try {
      if (tab === 'competencies') {
        const result = await api.copilotSuggestCompetencies()
        setCompSuggestions(result.suggestions.map(s => ({ ...s, selected: true })))
      } else {
        const result = await api.copilotSuggestGuidelines()
        setGuideSuggestions(result.suggestions.map(s => ({ ...s, selected: true })))
      }
      setCopilotStep('suggestions')
    } catch (err: unknown) {
      setCopilotError(err instanceof Error ? err.message : 'Erro ao analisar. Tente novamente.')
      setCopilotStep('error')
    }
  }

  const toggleCompSuggestion = (index: number) => {
    setCompSuggestions(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s))
  }

  const toggleGuideSuggestion = (index: number) => {
    setGuideSuggestions(prev => prev.map((s, i) => i === index ? { ...s, selected: !s.selected } : s))
  }

  const confirmCopilotCreation = async () => {
    setCopilotStep('creating')
    try {
      if (tab === 'competencies') {
        const selected = compSuggestions.filter(s => s.selected)
        const result = await api.copilotCreateCompetenciesBulk(
          selected.map(s => ({ name: s.name, description: s.description, type: s.type, domain: s.domain }))
        )
        setCopilotCreatedCount(result.count)
      } else {
        const selected = guideSuggestions.filter(s => s.selected)
        const result = await api.copilotCreateGuidelinesBulk(
          selected.map(s => ({ product_id: s.product_id, title: s.title, content: s.content, category: s.category, is_corporate: s.is_corporate }))
        )
        setCopilotCreatedCount(result.count)
      }
      setCopilotStep('done')
      load()
    } catch (err: unknown) {
      setCopilotError(err instanceof Error ? err.message : 'Erro ao criar. Tente novamente.')
      setCopilotStep('error')
    }
  }

  const closeCopilot = () => { setCopilotOpen(false) }

  const selectedCount = tab === 'competencies'
    ? compSuggestions.filter(s => s.selected).length
    : guideSuggestions.filter(s => s.selected).length

  const totalSuggestions = tab === 'competencies' ? compSuggestions.length : guideSuggestions.length

  // Derive available domains from data
  const compDomains = [...new Set(competencies.map(c => c.domain))].sort()

  const filteredComps = competencies.filter((c) => {
    const q = search.toLowerCase()
    const matchesSearch = c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    const matchesDomain = !domainFilter || c.domain === domainFilter
    return matchesSearch && matchesDomain
  })
  const filteredGuides = guidelines.filter((g) => {
    const q = search.toLowerCase()
    return g.title.toLowerCase().includes(q) || g.content.toLowerCase().includes(q)
  })

  const productName = (id: string | null) => id ? (products.find(p => p.id === id)?.name || '—') : '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Competencias & Orientacoes</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startCopilot}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
          >
            <Sparkles className="w-4 h-4" />
            Copiloto IA
          </button>
          <button onClick={tab === 'competencies' ? openCreateComp : openCreateGuide} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> {tab === 'competencies' ? 'Nova Competencia' : 'Nova Orientacao'}
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('competencies')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'competencies' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <Brain className="w-4 h-4 inline mr-1" /> Competencias ({competencies.length})
        </button>
        <button onClick={() => setTab('guidelines')} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${tab === 'guidelines' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          <FileText className="w-4 h-4 inline mr-1" /> Orientacoes Master ({guidelines.length})
        </button>
      </div>

      {/* Domain filter (competencies tab only) */}
      {tab === 'competencies' && compDomains.length > 1 && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-medium text-gray-500 uppercase">Dominio:</span>
          <button
            onClick={() => setDomainFilter(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${!domainFilter ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            Todos ({competencies.length})
          </button>
          {compDomains.map((d) => {
            const count = competencies.filter(c => c.domain === d).length
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
        <input type="text" placeholder="Buscar..." className="input-field pl-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : tab === 'competencies' ? (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Nome</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Dominio</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredComps.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{c.description}</p>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge-pill ${c.type === 'HARD' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                      {c.type === 'HARD' ? 'Hard Skill' : 'Soft Skill'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600 capitalize">{c.domain}</td>
                  <td className="px-5 py-4 text-right">
                    <button onClick={() => openEditComp(c)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50">
                      <Pencil className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredComps.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400">Nenhuma competencia encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGuides.map((g) => (
            <div key={g.id} className="card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedGuideline(expandedGuideline === g.id ? null : g.id)}>
                  {expandedGuideline === g.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{g.title}</p>
                      {g.is_corporate && (
                        <span className="inline-flex items-center gap-1 badge-pill text-xs bg-amber-50 text-amber-700 border border-amber-200">
                          <Building2 className="w-3 h-3" /> Corporativa
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {g.is_corporate ? 'Todos os produtos' : productName(g.product_id || '')} · {g.category}
                      {g.domain && <span className="capitalize"> · {g.domain}</span>}
                    </p>
                  </div>
                </div>
                <button onClick={() => openEditGuide(g)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50">
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              {expandedGuideline === g.id && (
                <div className="mt-3 pl-7 text-sm text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-3">{g.content}</div>
              )}
            </div>
          ))}
          {filteredGuides.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma orientacao encontrada.</div>
          )}
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'create' ? 'Criar' : 'Editar'} {modalType === 'competencies' ? 'Competencia' : 'Orientacao'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {modalType === 'competencies' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Nome *</label>
                    <input type="text" className="input-field w-full" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Ex: Explicar valor do BaaS" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao *</label>
                    <textarea className="input-field w-full h-24 resize-none" value={cDesc} onChange={(e) => setCDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
                      <select className="input-field w-full" value={cType} onChange={(e) => setCType(e.target.value as 'HARD' | 'SOFT')}>
                        <option value="HARD">Hard Skill</option>
                        <option value="SOFT">Soft Skill</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
                      <select className="input-field w-full" value={cDomain} onChange={(e) => setCDomain(e.target.value)}>
                        <option value="vendas">Vendas</option>
                        <option value="suporte">Suporte</option>
                        <option value="lideranca">Lideranca</option>
                        <option value="cs">CS</option>
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div
                    onClick={() => setGIsCorporate(!gIsCorporate)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                      gIsCorporate
                        ? 'border-amber-300 bg-amber-50/50'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                      gIsCorporate ? 'bg-amber-500' : 'border-2 border-gray-300'
                    }`}>
                      {gIsCorporate && <Check className="w-3 h-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-amber-600" />
                        <span className="text-sm font-medium text-gray-900">Orientacao Corporativa</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">Vale para todos os produtos. Sera considerada pelo copiloto na criacao de jornadas e relatorios.</p>
                    </div>
                  </div>

                  {!gIsCorporate && (
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Produto *</label>
                      <select className="input-field w-full" value={gProductId} onChange={(e) => setGProductId(e.target.value)}>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={gTitle} onChange={(e) => setGTitle(e.target.value)} placeholder="Ex: Abordagem consultiva BaaS" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Categoria *</label>
                      <input type="text" className="input-field w-full" value={gCategory} onChange={(e) => setGCategory(e.target.value)} placeholder="Ex: abordagem, objecoes" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
                      <select className="input-field w-full" value={gDomain} onChange={(e) => setGDomain(e.target.value)}>
                        <option value="">Todos os dominios</option>
                        <option value="vendas">Vendas</option>
                        <option value="suporte">Suporte</option>
                        <option value="lideranca">Lideranca</option>
                        <option value="cs">CS</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Conteudo *</label>
                    <textarea className="input-field w-full h-40 resize-none" value={gContent} onChange={(e) => setGContent(e.target.value)} placeholder="Orientacoes detalhadas..." />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'create' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copilot Modal */}
      {copilotOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                Copiloto IA — {tab === 'competencies' ? 'Competencias' : 'Orientacoes Master'}
              </h3>
              <button onClick={closeCopilot} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5">
              {/* Step: Idle - Confirmation */}
              {copilotStep === 'idle' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center mx-auto mb-4">
                    <Sparkles className="w-8 h-8 text-violet-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">
                    {tab === 'competencies' ? 'Sugerir novas competencias' : 'Sugerir novas orientacoes'}
                  </h4>
                  <p className="text-sm text-gray-500 max-w-md mx-auto mb-6">
                    {tab === 'competencies'
                      ? `A IA vai analisar os ${products.length} produtos cadastrados e as ${competencies.length} competencias existentes para sugerir novas competencias que complementem o catalogo.`
                      : `A IA vai analisar os ${products.length} produtos cadastrados e as ${guidelines.length} orientacoes existentes para sugerir novas diretrizes estrategicas.`
                    }
                  </p>
                  <button
                    onClick={runCopilotAnalysis}
                    className="px-6 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 transition-all shadow-sm"
                  >
                    Iniciar analise
                  </button>
                </div>
              )}

              {/* Step: Analyzing */}
              {copilotStep === 'analyzing' && (
                <div className="text-center py-12">
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-100 to-purple-100 animate-pulse" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
                    </div>
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Analisando...</h4>
                  <p className="text-sm text-gray-500">
                    {tab === 'competencies'
                      ? 'Avaliando produtos e identificando lacunas de competencias...'
                      : 'Avaliando produtos e identificando oportunidades de orientacao...'
                    }
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}

              {/* Step: Error */}
              {copilotStep === 'error' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Erro na analise</h4>
                  <p className="text-sm text-red-600 mb-6">{copilotError}</p>
                  <button
                    onClick={runCopilotAnalysis}
                    className="px-6 py-3 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 transition-all"
                  >
                    Tentar novamente
                  </button>
                </div>
              )}

              {/* Step: Suggestions */}
              {copilotStep === 'suggestions' && (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm text-gray-600">
                      <span className="font-semibold text-violet-600">{totalSuggestions}</span> sugestoes encontradas — <span className="font-semibold">{selectedCount}</span> selecionadas
                    </p>
                    <button
                      onClick={() => {
                        if (tab === 'competencies') {
                          const allSelected = compSuggestions.every(s => s.selected)
                          setCompSuggestions(prev => prev.map(s => ({ ...s, selected: !allSelected })))
                        } else {
                          const allSelected = guideSuggestions.every(s => s.selected)
                          setGuideSuggestions(prev => prev.map(s => ({ ...s, selected: !allSelected })))
                        }
                      }}
                      className="text-xs text-violet-600 hover:text-violet-700 font-medium"
                    >
                      {(tab === 'competencies' ? compSuggestions : guideSuggestions).every(s => s.selected) ? 'Desmarcar todas' : 'Selecionar todas'}
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                    {tab === 'competencies' && compSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => toggleCompSuggestion(i)}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          s.selected
                            ? 'border-violet-300 bg-violet-50/50'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                            s.selected ? 'bg-violet-600' : 'border-2 border-gray-300'
                          }`}>
                            {s.selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-gray-900">{s.name}</p>
                              <span className={`badge-pill text-xs ${s.type === 'HARD' ? 'bg-blue-50 text-blue-600' : 'bg-violet-50 text-violet-600'}`}>
                                {s.type === 'HARD' ? 'Hard' : 'Soft'}
                              </span>
                              <span className="badge-pill text-xs bg-gray-100 text-gray-500">{s.domain}</span>
                            </div>
                            <p className="text-xs text-gray-600 mb-2">{s.description}</p>
                            <p className="text-xs text-gray-400 italic">{s.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {tab === 'guidelines' && guideSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => toggleGuideSuggestion(i)}
                        className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${
                          s.selected
                            ? 'border-violet-300 bg-violet-50/50'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${
                            s.selected ? 'bg-violet-600' : 'border-2 border-gray-300'
                          }`}>
                            {s.selected && <Check className="w-3 h-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
                              <span className="badge-pill text-xs bg-gray-100 text-gray-500">{s.category}</span>
                              {s.is_corporate && (
                                <span className="inline-flex items-center gap-1 badge-pill text-xs bg-amber-50 text-amber-700 border border-amber-200">
                                  <Building2 className="w-3 h-3" /> Corporativa
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mb-1">{s.is_corporate ? 'Todos os produtos' : productName(s.product_id || '')}</p>
                            <p className="text-xs text-gray-600 line-clamp-3">{s.content}</p>
                            <p className="text-xs text-gray-400 italic mt-1">{s.rationale}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step: Creating */}
              {copilotStep === 'creating' && (
                <div className="text-center py-12">
                  <Loader2 className="w-8 h-8 text-violet-600 animate-spin mx-auto mb-4" />
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Criando {selectedCount} itens...</h4>
                  <p className="text-sm text-gray-500">Aguarde enquanto salvamos no sistema.</p>
                </div>
              )}

              {/* Step: Done */}
              {copilotStep === 'done' && (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                    <Check className="w-8 h-8 text-emerald-600" />
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-2">Pronto!</h4>
                  <p className="text-sm text-gray-500 mb-6">
                    {copilotCreatedCount} {tab === 'competencies' ? 'competencias criadas' : 'orientacoes criadas'} com sucesso.
                  </p>
                  <button onClick={closeCopilot} className="btn-primary px-6 py-2">
                    Fechar
                  </button>
                </div>
              )}
            </div>

            {/* Footer with actions */}
            {copilotStep === 'suggestions' && (
              <div className="flex items-center justify-between p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl z-10">
                <button onClick={closeCopilot} className="btn-secondary px-4 py-2">Cancelar</button>
                <button
                  onClick={confirmCopilotCreation}
                  disabled={selectedCount === 0}
                  className="flex items-center gap-2 px-6 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Check className="w-4 h-4" />
                  Criar {selectedCount} {tab === 'competencies' ? 'competencias' : 'orientacoes'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
