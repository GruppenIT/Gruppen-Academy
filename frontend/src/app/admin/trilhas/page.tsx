'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { LearningPath, LearningActivity } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, BookOpen, ChevronDown, ChevronUp,
  Sparkles, Zap, Trash2,
} from 'lucide-react'

const ACTIVITY_LABELS: Record<string, string> = { QUIZ: 'Quiz', SIMULATION: 'Simulacao', CASE_STUDY: 'Estudo de Caso', GUIDED_CHAT: 'Chat Guiado', MICROLESSON: 'Microaula' }

type ModalMode = 'create-path' | 'edit-path' | 'add-activity' | 'edit-activity' | null

export default function AdminTrilhasPage() {
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [activities, setActivities] = useState<Record<string, LearningActivity[]>>({})

  // Path form
  const [pId, setPId] = useState('')
  const [pTitle, setPTitle] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pDomain, setPDomain] = useState('vendas')
  const [pRole, setPRole] = useState('vendedor')

  // Activity form
  const [aPathId, setAPathId] = useState('')
  const [aId, setAId] = useState('')
  const [aTitle, setATitle] = useState('')
  const [aDesc, setADesc] = useState('')
  const [aType, setAType] = useState('MICROLESSON')
  const [aOrder, setAOrder] = useState(0)
  const [aPoints, setAPoints] = useState(10)

  const load = useCallback(async () => {
    try { setPaths(await api.getLearningPaths()) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadActivities = async (pathId: string) => {
    try {
      const acts = await api.getPathActivities(pathId)
      setActivities(prev => ({ ...prev, [pathId]: acts }))
    } catch {}
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null) } else { setExpanded(id); if (!activities[id]) loadActivities(id) }
  }

  const openCreatePath = () => {
    setPId(''); setPTitle(''); setPDesc(''); setPDomain('vendas'); setPRole('vendedor')
    setError(''); setModalMode('create-path')
  }
  const openEditPath = (p: LearningPath) => {
    setPId(p.id); setPTitle(p.title); setPDesc(p.description || ''); setPDomain(p.domain); setPRole(p.target_role)
    setError(''); setModalMode('edit-path')
  }
  const handleDeletePath = async (pathId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta trilha e todas as suas atividades?')) return
    try {
      await api.deleteLearningPath(pathId)
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir trilha')
    }
  }
  const openAddActivity = (pathId: string) => {
    setAPathId(pathId); setAId(''); setATitle(''); setADesc(''); setAType('MICROLESSON'); setAPoints(10)
    setAOrder((activities[pathId]?.length || 0) + 1)
    setError(''); setModalMode('add-activity')
  }
  const openEditActivity = (pathId: string, a: LearningActivity) => {
    setAPathId(pathId); setAId(a.id); setATitle(a.title); setADesc(a.description || ''); setAType(a.type); setAPoints(a.points_reward)
    setAOrder(a.order)
    setError(''); setModalMode('edit-activity')
  }
  const handleDeleteActivity = async (pathId: string, activityId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return
    try {
      await api.deleteActivity(pathId, activityId)
      loadActivities(pathId)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir atividade')
    }
  }

  const closeModal = () => { setModalMode(null); setError('') }

  const handleSave = async () => {
    setError(''); setSaving(true)
    try {
      if (modalMode === 'create-path') {
        if (!pTitle) { setError('Titulo e obrigatorio.'); setSaving(false); return }
        await api.createLearningPath({ title: pTitle, description: pDesc || undefined, domain: pDomain, target_role: pRole })
      } else if (modalMode === 'edit-path') {
        if (!pTitle) { setError('Titulo e obrigatorio.'); setSaving(false); return }
        await api.updateLearningPath(pId, { title: pTitle, description: pDesc || undefined, domain: pDomain, target_role: pRole })
      } else if (modalMode === 'add-activity') {
        if (!aTitle) { setError('Titulo e obrigatorio.'); setSaving(false); return }
        await api.createActivity(aPathId, { title: aTitle, description: aDesc || undefined, type: aType, order: aOrder, points_reward: aPoints })
        loadActivities(aPathId)
      } else if (modalMode === 'edit-activity') {
        if (!aTitle) { setError('Titulo e obrigatorio.'); setSaving(false); return }
        await api.updateActivity(aPathId, aId, { title: aTitle, description: aDesc || undefined, type: aType, order: aOrder, points_reward: aPoints })
        loadActivities(aPathId)
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const filtered = paths.filter((p) => {
    const q = search.toLowerCase()
    return p.title.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Trilhas de Aprendizagem</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{paths.length}</span>
        </div>
        <button onClick={openCreatePath} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nova Trilha
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar trilhas..." className="input-field pl-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="card overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <BookOpen className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{p.title}</h3>
                  <p className="text-xs text-gray-500">{p.domain} · {p.target_role}</p>
                </div>
                <span className={`badge-pill ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                  {p.is_active ? 'Ativa' : 'Inativa'}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditPath(p)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Editar trilha">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDeletePath(p.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Excluir trilha">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleExpand(p.id)} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50">
                    {expanded === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {expanded === p.id && (
                <div className="border-t border-gray-100 bg-gray-50/50 p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Sparkles className="w-4 h-4" /> Atividades ({activities[p.id]?.length || 0})
                    </h4>
                    <button onClick={() => openAddActivity(p.id)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
                      <Plus className="w-3 h-3" /> Adicionar
                    </button>
                  </div>
                  {!activities[p.id] ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-brand-600 animate-spin" /></div>
                  ) : activities[p.id].length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma atividade cadastrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {activities[p.id].sort((a, b) => a.order - b.order).map((a, i) => (
                        <div key={a.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{a.title}</p>
                            <span className="badge-pill bg-violet-50 text-violet-600 text-xs">{ACTIVITY_LABELS[a.type] || a.type}</span>
                          </div>
                          <span className="badge-pill bg-amber-50 text-amber-600 text-xs flex items-center gap-1">
                            <Zap className="w-3 h-3" /> {a.points_reward} XP
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => openEditActivity(p.id, a)} className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50" title="Editar atividade">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteActivity(p.id, a.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50" title="Excluir atividade">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
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
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma trilha encontrada.</div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'create-path' ? 'Nova Trilha' : modalMode === 'edit-path' ? 'Editar Trilha' : modalMode === 'edit-activity' ? 'Editar Atividade' : 'Nova Atividade'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {(modalMode === 'create-path' || modalMode === 'edit-path') ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Ex: Fundamentos de BaaS" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                    <textarea className="input-field w-full h-20 resize-none" value={pDesc} onChange={(e) => setPDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
                      <input type="text" className="input-field w-full" value={pDomain} onChange={(e) => setPDomain(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Cargo-alvo</label>
                      <input type="text" className="input-field w-full" value={pRole} onChange={(e) => setPRole(e.target.value)} placeholder="vendedor" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Titulo *</label>
                    <input type="text" className="input-field w-full" value={aTitle} onChange={(e) => setATitle(e.target.value)} placeholder="Ex: Quiz - Conceitos RTO/RPO" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                    <textarea className="input-field w-full h-20 resize-none" value={aDesc} onChange={(e) => setADesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Tipo</label>
                      <select className="input-field w-full" value={aType} onChange={(e) => setAType(e.target.value)}>
                        <option value="MICROLESSON">Microaula</option>
                        <option value="QUIZ">Quiz</option>
                        <option value="SIMULATION">Simulacao</option>
                        <option value="CASE_STUDY">Estudo de Caso</option>
                        <option value="GUIDED_CHAT">Chat Guiado</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Ordem</label>
                      <input type="number" className="input-field w-full" value={aOrder} onChange={(e) => setAOrder(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">XP</label>
                      <input type="number" className="input-field w-full" value={aPoints} onChange={(e) => setAPoints(Number(e.target.value))} />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {(modalMode === 'edit-path' || modalMode === 'edit-activity') ? 'Atualizar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
