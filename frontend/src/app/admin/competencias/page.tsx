'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Competency, MasterGuideline, Product } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Brain, FileText, ChevronDown, ChevronUp,
} from 'lucide-react'

type Tab = 'competencies' | 'guidelines'
type ModalMode = 'create' | 'edit' | null

export default function AdminCompetenciasPage() {
  const [tab, setTab] = useState<Tab>('competencies')
  const [competencies, setCompetencies] = useState<Competency[]>([])
  const [guidelines, setGuidelines] = useState<MasterGuideline[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
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
  const [editGuideId, setEditGuideId] = useState<string | null>(null)

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
    setEditGuideId(null); setGTitle(''); setGContent(''); setGCategory(''); setGProductId(products[0]?.id || '')
    setError(''); setModalType('guidelines'); setModalMode('create')
  }
  const openEditGuide = (g: MasterGuideline) => {
    setEditGuideId(g.id); setGTitle(g.title); setGContent(g.content); setGCategory(g.category); setGProductId(g.product_id)
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
        if (!gTitle || !gContent || !gCategory || !gProductId) { setError('Todos os campos sao obrigatorios.'); setSaving(false); return }
        if (modalMode === 'create') {
          await api.createGuideline({ product_id: gProductId, title: gTitle, content: gContent, category: gCategory })
        } else if (editGuideId) {
          await api.updateGuideline(editGuideId, { title: gTitle, content: gContent, category: gCategory })
        }
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const filteredComps = competencies.filter((c) => {
    const q = search.toLowerCase()
    return c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
  })
  const filteredGuides = guidelines.filter((g) => {
    const q = search.toLowerCase()
    return g.title.toLowerCase().includes(q) || g.content.toLowerCase().includes(q)
  })

  const productName = (id: string) => products.find(p => p.id === id)?.name || '—'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Competencias & Orientacoes</h2>
        </div>
        <button onClick={tab === 'competencies' ? openCreateComp : openCreateGuide} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> {tab === 'competencies' ? 'Nova Competencia' : 'Nova Orientacao'}
        </button>
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
                    <p className="text-sm font-medium text-gray-900">{g.title}</p>
                    <p className="text-xs text-gray-500">{productName(g.product_id)} · {g.category}</p>
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

      {/* Modal */}
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
                      <input type="text" className="input-field w-full" value={cDomain} onChange={(e) => setCDomain(e.target.value)} placeholder="vendas" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Produto *</label>
                    <select className="input-field w-full" value={gProductId} onChange={(e) => setGProductId(e.target.value)}>
                      {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={gTitle} onChange={(e) => setGTitle(e.target.value)} placeholder="Ex: Abordagem consultiva BaaS" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Categoria *</label>
                    <input type="text" className="input-field w-full" value={gCategory} onChange={(e) => setGCategory(e.target.value)} placeholder="Ex: abordagem, objecoes, storytelling" />
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
    </div>
  )
}
