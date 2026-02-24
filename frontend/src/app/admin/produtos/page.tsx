'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import type { Product } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, Package, CheckCircle, XCircle,
  ChevronUp, ChevronDown, GripVertical,
} from 'lucide-react'

type ModalMode = 'create' | 'edit' | null

function AutoTextarea({
  value,
  onChange,
  placeholder,
  className = '',
  minRows = 2,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  className?: string
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useEffect(() => { resize() }, [value, resize])

  return (
    <textarea
      ref={ref}
      className={`input-field w-full resize-none overflow-hidden ${className}`}
      rows={minRows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onInput={resize}
      placeholder={placeholder}
    />
  )
}

export default function AdminProdutosPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [reordering, setReordering] = useState(false)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPersona, setFormPersona] = useState('')
  const [formPainPoints, setFormPainPoints] = useState('')
  const [formObjections, setFormObjections] = useState('')
  const [formDifferentials, setFormDifferentials] = useState('')
  const [formTechnology, setFormTechnology] = useState('')

  const load = useCallback(async () => {
    try { setProducts(await api.getProducts(0, 200, true)) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditProduct(null)
    setFormName(''); setFormDescription(''); setFormPersona('')
    setFormPainPoints(''); setFormObjections(''); setFormDifferentials('')
    setFormTechnology('')
    setError(''); setModalMode('create')
  }

  const openEdit = (p: Product) => {
    setEditProduct(p)
    setFormName(p.name); setFormDescription(p.description)
    setFormPersona(p.target_persona || ''); setFormPainPoints(p.common_pain_points || '')
    setFormObjections(p.typical_objections || ''); setFormDifferentials(p.differentials || '')
    setFormTechnology(p.technology || '')
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
          technology: formTechnology || undefined,
          priority: products.length,
        })
      } else if (editProduct) {
        await api.updateProduct(editProduct.id, {
          name: formName, description: formDescription,
          target_persona: formPersona || null, common_pain_points: formPainPoints || null,
          typical_objections: formObjections || null, differentials: formDifferentials || null,
          technology: formTechnology || null,
        })
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const toggleActive = async (p: Product) => {
    try { await api.updateProduct(p.id, { is_active: !p.is_active }); load() } catch {}
  }

  const moveProduct = async (index: number, direction: 'up' | 'down') => {
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= products.length) return

    setReordering(true)
    const reordered = [...products]
    const temp = reordered[index]
    reordered[index] = reordered[swapIndex]
    reordered[swapIndex] = temp

    // Update local state immediately for responsiveness
    setProducts(reordered)

    // Send reorder to backend
    try {
      await api.reorderProducts(reordered.map((p, i) => ({ id: p.id, priority: i })))
    } catch {
      load() // revert on error
    } finally {
      setReordering(false)
    }
  }

  const filtered = search
    ? products.filter((p) => {
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q)
      })
    : products

  const isSearching = search.length > 0

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
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="w-10 px-3 py-3"></th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Produto</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Tecnologia</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">Persona</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((p, index) => (
                <tr key={p.id} className={`hover:bg-gray-50/50 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}>
                  {/* Reorder arrows */}
                  <td className="px-3 py-3">
                    {!isSearching && (
                      <div className="flex flex-col items-center gap-0.5">
                        <button
                          onClick={() => moveProduct(index, 'up')}
                          disabled={index === 0 || reordering}
                          className="p-0.5 rounded text-gray-300 hover:text-brand-600 disabled:opacity-30 disabled:hover:text-gray-300"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <GripVertical className="w-3.5 h-3.5 text-gray-300" />
                        <button
                          onClick={() => moveProduct(index, 'down')}
                          disabled={index === filtered.length - 1 || reordering}
                          className="p-0.5 rounded text-gray-300 hover:text-brand-600 disabled:opacity-30 disabled:hover:text-gray-300"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </td>
                  {/* Priority number */}
                  <td className="px-4 py-3">
                    <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center">
                      {p.priority + 1}
                    </span>
                  </td>
                  {/* Product info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-500 line-clamp-1">{p.description}</p>
                      </div>
                    </div>
                  </td>
                  {/* Technology */}
                  <td className="px-4 py-3 hidden md:table-cell">
                    <p className="text-xs text-gray-500 line-clamp-1">{p.technology || '—'}</p>
                  </td>
                  {/* Persona */}
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <p className="text-xs text-gray-500 line-clamp-1">{p.target_persona || '—'}</p>
                  </td>
                  {/* Status */}
                  <td className="px-4 py-3 text-center">
                    <span className={`badge-pill ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                      {p.is_active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(p)}
                        className={`p-2 rounded-lg ${p.is_active ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'}`}
                        title={p.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {p.is_active ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
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
                <AutoTextarea value={formDescription} onChange={setFormDescription} placeholder="Descreva o produto/solucao..." minRows={3} />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Tecnologia envolvida</label>
                <input type="text" className="input-field w-full" value={formTechnology} onChange={(e) => setFormTechnology(e.target.value)} placeholder="Ex: Fortinet FortiSIEM, Veeam, VMware" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Persona-alvo</label>
                <input type="text" className="input-field w-full" value={formPersona} onChange={(e) => setFormPersona(e.target.value)} placeholder="Ex: CTO, CISO, Gerente de TI" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Dores comuns</label>
                <AutoTextarea value={formPainPoints} onChange={setFormPainPoints} placeholder="Quais dores esse produto resolve?" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Objecoes tipicas</label>
                <AutoTextarea value={formObjections} onChange={setFormObjections} placeholder="Quais objecoes os clientes costumam ter?" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Diferenciais</label>
                <AutoTextarea value={formDifferentials} onChange={setFormDifferentials} placeholder="O que diferencia dos concorrentes?" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl z-10">
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
