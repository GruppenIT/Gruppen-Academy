'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Product } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Package, CheckCircle, XCircle,
} from 'lucide-react'

type ModalMode = 'create' | 'edit' | null

export default function AdminProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPersona, setFormPersona] = useState('')
  const [formPainPoints, setFormPainPoints] = useState('')
  const [formObjections, setFormObjections] = useState('')
  const [formDifferentials, setFormDifferentials] = useState('')

  const load = useCallback(async () => {
    try { setProducts(await api.getProducts(0, 200)) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditProduct(null)
    setFormName(''); setFormDescription(''); setFormPersona('')
    setFormPainPoints(''); setFormObjections(''); setFormDifferentials('')
    setError(''); setModalMode('create')
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setFormName(p.name); setFormDescription(p.description)
    setFormPersona(p.target_persona || ''); setFormPainPoints(p.common_pain_points || '')
    setFormObjections(p.typical_objections || ''); setFormDifferentials(p.differentials || '')
    setError(''); setModalMode('edit')
  }

  const closeModal = () => { setModalMode(null); setEditProduct(null); setError('') }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      if (modalMode === 'create') {
        if (!formName || !formDescription) { setError('Nome e descricao sao obrigatorios.'); setSaving(false); return }
        await api.createProduct({
          name: formName, description: formDescription,
          target_persona: formPersona || undefined, common_pain_points: formPainPoints || undefined,
          typical_objections: formObjections || undefined, differentials: formDifferentials || undefined,
        })
      } else if (editProduct) {
        await api.updateProduct(editProduct.id, {
          name: formName, description: formDescription,
          target_persona: formPersona || null, common_pain_points: formPainPoints || null,
          typical_objections: formObjections || null, differentials: formDifferentials || null,
        })
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const toggleActive = async (p: Product) => {
    try { await api.updateProduct(p.id, { is_active: !p.is_active }); load() } catch {}
  }

  const filtered = products.filter((p) => {
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Package className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Produtos / Solucoes</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{products.length}</span>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Novo Produto
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar produtos..." className="input-field pl-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="card p-5 relative">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-600" />
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => toggleActive(p)} className={`p-1.5 rounded-lg ${p.is_active ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}>
                    {p.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <h3 className="font-semibold text-gray-900 mb-1">{p.name}</h3>
              <p className="text-sm text-gray-500 line-clamp-2 mb-3">{p.description}</p>
              <span className={`badge-pill ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {p.is_active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-sm text-gray-400">Nenhum produto encontrado.</div>
          )}
        </div>
      )}

      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-brand-600" />
                {modalMode === 'create' ? 'Novo Produto' : 'Editar Produto'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nome *</label>
                <input type="text" className="input-field w-full" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ex: BaaS - Backup como Servico" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Descricao *</label>
                <textarea className="input-field w-full h-24 resize-none" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Descreva o produto/solucao..." />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Persona-alvo</label>
                <input type="text" className="input-field w-full" value={formPersona} onChange={(e) => setFormPersona(e.target.value)} placeholder="Ex: CTO, CISO, Gerente de TI" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Dores comuns</label>
                <textarea className="input-field w-full h-20 resize-none" value={formPainPoints} onChange={(e) => setFormPainPoints(e.target.value)} placeholder="Quais dores esse produto resolve?" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Objecoes tipicas</label>
                <textarea className="input-field w-full h-20 resize-none" value={formObjections} onChange={(e) => setFormObjections(e.target.value)} placeholder="Quais objecoes os clientes costumam ter?" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Diferenciais</label>
                <textarea className="input-field w-full h-20 resize-none" value={formDifferentials} onChange={(e) => setFormDifferentials(e.target.value)} placeholder="O que diferencia dos concorrentes?" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'create' ? 'Criar Produto' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
