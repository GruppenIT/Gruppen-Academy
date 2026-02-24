'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { LearningPath, PathItem, Badge, Training, Journey, PathBadge, Team, PathTeam } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, BookOpen, ChevronDown, ChevronUp,
  Trash2, GraduationCap, Route, Award, CheckCircle2, Users,
} from 'lucide-react'

type ModalMode = 'create-path' | 'edit-path' | 'add-items' | 'manage-badges' | 'manage-teams' | null

export default function AdminTrilhasPage() {
  const [paths, setPaths] = useState<LearningPath[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [pathItems, setPathItems] = useState<Record<string, PathItem[]>>({})

  // Data for selectors
  const [allTrainings, setAllTrainings] = useState<Training[]>([])
  const [allJourneys, setAllJourneys] = useState<Journey[]>([])
  const [allBadges, setAllBadges] = useState<Badge[]>([])
  const [allTeams, setAllTeams] = useState<Team[]>([])

  // Path form
  const [pId, setPId] = useState('')
  const [pTitle, setPTitle] = useState('')
  const [pDesc, setPDesc] = useState('')
  const [pDomain, setPDomain] = useState('vendas')
  const [pRole, setPRole] = useState('vendedor')

  // Add items form
  const [addItemsPathId, setAddItemsPathId] = useState('')
  const [selectedItems, setSelectedItems] = useState<{ item_type: 'training' | 'journey'; item_id: string }[]>([])
  const [itemSearch, setItemSearch] = useState('')

  // Badge form
  const [badgesPathId, setBadgesPathId] = useState('')
  const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([])

  // Team form
  const [teamsPathId, setTeamsPathId] = useState('')
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([])

  const load = useCallback(async () => {
    try { setPaths(await api.getLearningPaths(undefined, false)) } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const loadPathItems = async (pathId: string) => {
    try {
      const items = await api.getPathItems(pathId)
      setPathItems(prev => ({ ...prev, [pathId]: items }))
    } catch {}
  }

  const toggleExpand = (id: string) => {
    if (expanded === id) { setExpanded(null) } else { setExpanded(id); if (!pathItems[id]) loadPathItems(id) }
  }

  // Loaders for selectors
  const loadSelectorsData = async () => {
    try {
      const [trainings, journeys, badges, teams] = await Promise.all([
        api.getTrainings(0, 200),
        api.getJourneys(0, 200),
        api.getBadges(),
        api.getTeams(),
      ])
      setAllTrainings(trainings)
      setAllJourneys(journeys)
      setAllBadges(badges)
      setAllTeams(teams)
    } catch {}
  }

  // Path CRUD
  const openCreatePath = () => {
    setPId(''); setPTitle(''); setPDesc(''); setPDomain('vendas'); setPRole('vendedor')
    setError(''); setModalMode('create-path')
  }
  const openEditPath = (p: LearningPath) => {
    setPId(p.id); setPTitle(p.title); setPDesc(p.description || ''); setPDomain(p.domain); setPRole(p.target_role)
    setError(''); setModalMode('edit-path')
  }
  const handleDeletePath = async (pathId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta trilha e todos os seus itens?')) return
    try {
      await api.deleteLearningPath(pathId)
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir trilha')
    }
  }

  // Add items
  const openAddItems = async (pathId: string) => {
    setAddItemsPathId(pathId)
    setSelectedItems([])
    setItemSearch('')
    setError('')
    await loadSelectorsData()
    setModalMode('add-items')
  }

  const isItemAlreadyInPath = (type: 'training' | 'journey', id: string) => {
    const items = pathItems[addItemsPathId] || []
    return items.some(i => i.item_type === type && i.item_id === id)
  }

  const isItemSelected = (type: 'training' | 'journey', id: string) => {
    return selectedItems.some(i => i.item_type === type && i.item_id === id)
  }

  const toggleItemSelection = (type: 'training' | 'journey', id: string) => {
    if (isItemSelected(type, id)) {
      setSelectedItems(prev => prev.filter(i => !(i.item_type === type && i.item_id === id)))
    } else {
      setSelectedItems(prev => [...prev, { item_type: type, item_id: id }])
    }
  }

  // Badges
  const openManageBadges = async (p: LearningPath) => {
    setBadgesPathId(p.id)
    setSelectedBadgeIds(p.badges?.map(b => b.id) || [])
    setError('')
    await loadSelectorsData()
    setModalMode('manage-badges')
  }

  const toggleBadge = (id: string) => {
    setSelectedBadgeIds(prev => prev.includes(id) ? prev.filter(b => b !== id) : [...prev, id])
  }

  // Teams
  const openManageTeams = async (p: LearningPath) => {
    setTeamsPathId(p.id)
    setSelectedTeamIds(p.teams?.map(t => t.id) || [])
    setError('')
    await loadSelectorsData()
    setModalMode('manage-teams')
  }

  const toggleTeam = (id: string) => {
    setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id])
  }

  const handleRemoveItem = async (pathId: string, itemId: string) => {
    if (!confirm('Remover este item da trilha?')) return
    try {
      await api.removePathItem(pathId, itemId)
      loadPathItems(pathId)
      load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro ao remover item')
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
      } else if (modalMode === 'add-items') {
        if (selectedItems.length === 0) { setError('Selecione pelo menos um item.'); setSaving(false); return }
        const existingItems = pathItems[addItemsPathId] || []
        const startOrder = existingItems.length
        for (let i = 0; i < selectedItems.length; i++) {
          await api.addPathItem(addItemsPathId, {
            item_type: selectedItems[i].item_type,
            item_id: selectedItems[i].item_id,
            order: startOrder + i,
          })
        }
        loadPathItems(addItemsPathId)
      } else if (modalMode === 'manage-badges') {
        await api.setPathBadges(badgesPathId, selectedBadgeIds)
      } else if (modalMode === 'manage-teams') {
        await api.setPathTeams(teamsPathId, selectedTeamIds)
      }
      closeModal(); load()
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  const filtered = paths.filter((p) => {
    const q = search.toLowerCase()
    return p.title.toLowerCase().includes(q) || p.domain.toLowerCase().includes(q)
  })

  const getItemIcon = (type: string) => type === 'training'
    ? <GraduationCap className="w-4 h-4 text-indigo-500" />
    : <Route className="w-4 h-4 text-amber-500" />

  const getItemTypeLabel = (type: string) => type === 'training' ? 'Treinamento' : 'Jornada'

  // Filter available items for the add modal
  const filteredTrainings = allTrainings.filter(t => {
    if (isItemAlreadyInPath('training', t.id)) return false
    const q = itemSearch.toLowerCase()
    return !q || t.title.toLowerCase().includes(q)
  })
  const filteredJourneys = allJourneys.filter(j => {
    if (isItemAlreadyInPath('journey', j.id)) return false
    const q = itemSearch.toLowerCase()
    return !q || j.title.toLowerCase().includes(q)
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
          {filtered.map((p) => {
            const items = pathItems[p.id]
            const badges = p.badges || []
            const teams = p.teams || []
            return (
              <div key={p.id} className="card overflow-hidden">
                <div className="p-5 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{p.title}</h3>
                    <p className="text-xs text-gray-500">
                      {p.domain} · {p.target_role}
                      {(p.items?.length ?? 0) > 0 && (
                        <span className="ml-2 text-indigo-500">{p.items?.length} item(ns)</span>
                      )}
                    </p>
                  </div>
                  {teams.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap">
                      {teams.map((t: PathTeam) => (
                        <span key={t.id} className="badge-pill bg-blue-50 text-blue-600 text-xs flex items-center gap-1" title={t.name}>
                          <Users className="w-3 h-3" /> {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {badges.length > 0 && (
                    <div className="flex items-center gap-1">
                      {badges.map((b: PathBadge) => (
                        <span key={b.id} className="badge-pill bg-amber-50 text-amber-600 text-xs flex items-center gap-1" title={b.name}>
                          <Award className="w-3 h-3" /> {b.name}
                        </span>
                      ))}
                    </div>
                  )}
                  <span className={`badge-pill ${p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                    {p.is_active ? 'Ativa' : 'Inativa'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openManageTeams(p)} className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Gerenciar equipes">
                      <Users className="w-4 h-4" />
                    </button>
                    <button onClick={() => openManageBadges(p)} className="p-2 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50" title="Gerenciar badges">
                      <Award className="w-4 h-4" />
                    </button>
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
                        <Route className="w-4 h-4" /> Itens da Trilha ({items?.length || 0})
                      </h4>
                      <button onClick={() => openAddItems(p.id)} className="btn-secondary flex items-center gap-1 text-xs px-3 py-1.5">
                        <Plus className="w-3 h-3" /> Adicionar Itens
                      </button>
                    </div>
                    {!items ? (
                      <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-brand-600 animate-spin" /></div>
                    ) : items.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Nenhum treinamento ou jornada adicionada. Clique em &quot;Adicionar Itens&quot; para vincular.</p>
                    ) : (
                      <div className="space-y-2">
                        {items.sort((a, b) => a.order - b.order).map((item, i) => (
                          <div key={item.id} className="bg-white rounded-xl p-3 border border-gray-100 flex items-center gap-3">
                            <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              {getItemIcon(item.item_type)}
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{item.item_title || 'Item removido'}</p>
                                <span className="badge-pill bg-gray-100 text-gray-500 text-xs">{getItemTypeLabel(item.item_type)}</span>
                                {item.item_status && (
                                  <span className={`badge-pill text-xs ml-1 ${
                                    item.item_status === 'published' ? 'bg-emerald-50 text-emerald-600' :
                                    item.item_status === 'draft' ? 'bg-yellow-50 text-yellow-600' :
                                    'bg-gray-100 text-gray-500'
                                  }`}>{item.item_status}</span>
                                )}
                              </div>
                            </div>
                            <button onClick={() => handleRemoveItem(p.id, item.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0" title="Remover item">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma trilha encontrada.</div>
          )}
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 shrink-0">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'create-path' ? 'Nova Trilha' :
                 modalMode === 'edit-path' ? 'Editar Trilha' :
                 modalMode === 'add-items' ? 'Adicionar Treinamentos / Jornadas' :
                 modalMode === 'manage-teams' ? 'Gerenciar Equipes' :
                 'Gerenciar Badges'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              {(modalMode === 'create-path' || modalMode === 'edit-path') && (
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
                      <select className="input-field w-full" value={pDomain} onChange={(e) => setPDomain(e.target.value)}>
                        <option value="vendas">Vendas</option>
                        <option value="suporte">Suporte</option>
                        <option value="lideranca">Lideranca</option>
                        <option value="cs">Customer Success</option>
                        <option value="geral">Geral</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Cargo-alvo</label>
                      <input type="text" className="input-field w-full" value={pRole} onChange={(e) => setPRole(e.target.value)} placeholder="vendedor" />
                    </div>
                  </div>
                </>
              )}

              {modalMode === 'add-items' && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" placeholder="Buscar treinamentos e jornadas..." className="input-field pl-10 w-full" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                  </div>

                  {selectedItems.length > 0 && (
                    <div className="p-3 rounded-xl bg-indigo-50 text-indigo-700 text-sm">
                      {selectedItems.length} item(ns) selecionado(s)
                    </div>
                  )}

                  {filteredTrainings.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <GraduationCap className="w-3.5 h-3.5" /> Treinamentos
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {filteredTrainings.map(t => (
                          <label key={t.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isItemSelected('training', t.id)
                              ? 'border-indigo-300 bg-indigo-50'
                              : 'border-gray-100 hover:bg-gray-50'
                          }`}>
                            <input type="checkbox" checked={isItemSelected('training', t.id)} onChange={() => toggleItemSelection('training', t.id)} className="rounded text-indigo-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{t.title}</p>
                              <span className={`badge-pill text-xs ${
                                t.status === 'published' ? 'bg-emerald-50 text-emerald-600' :
                                t.status === 'draft' ? 'bg-yellow-50 text-yellow-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>{t.status}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredJourneys.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                        <Route className="w-3.5 h-3.5" /> Jornadas
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {filteredJourneys.map(j => (
                          <label key={j.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isItemSelected('journey', j.id)
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-gray-100 hover:bg-gray-50'
                          }`}>
                            <input type="checkbox" checked={isItemSelected('journey', j.id)} onChange={() => toggleItemSelection('journey', j.id)} className="rounded text-amber-600" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 truncate">{j.title}</p>
                              <span className={`badge-pill text-xs ${
                                j.status === 'published' ? 'bg-emerald-50 text-emerald-600' :
                                j.status === 'draft' ? 'bg-yellow-50 text-yellow-600' :
                                'bg-gray-100 text-gray-500'
                              }`}>{j.status}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {filteredTrainings.length === 0 && filteredJourneys.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">
                      {itemSearch ? 'Nenhum resultado encontrado.' : 'Todos os treinamentos e jornadas ja foram adicionados.'}
                    </p>
                  )}
                </>
              )}

              {modalMode === 'manage-badges' && (
                <>
                  <p className="text-sm text-gray-500">
                    Selecione os badges que serao concedidos ao usuario quando concluir todos os itens desta trilha.
                    Se um novo item for adicionado, os badges serao revogados ate que o novo item seja concluido.
                  </p>
                  {allBadges.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhum badge cadastrado. Crie badges na aba Gamificacao.</p>
                  ) : (
                    <div className="space-y-1">
                      {allBadges.map(b => (
                        <label key={b.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedBadgeIds.includes(b.id) ? 'border-amber-300 bg-amber-50' : 'border-gray-100 hover:bg-gray-50'
                        }`}>
                          <input type="checkbox" checked={selectedBadgeIds.includes(b.id)} onChange={() => toggleBadge(b.id)} className="rounded text-amber-600" />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Award className={`w-5 h-5 shrink-0 ${selectedBadgeIds.includes(b.id) ? 'text-amber-500' : 'text-gray-300'}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{b.name}</p>
                              <p className="text-xs text-gray-500">{b.description}</p>
                            </div>
                          </div>
                          {selectedBadgeIds.includes(b.id) && <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />}
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}

              {modalMode === 'manage-teams' && (
                <>
                  <p className="text-sm text-gray-500">
                    Selecione as equipes que terao acesso a esta trilha. Somente usuarios das equipes vinculadas verao esta trilha e seus treinamentos/jornadas, mesmo que estes nao estejam atribuidos diretamente a equipe.
                  </p>
                  {allTeams.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma equipe cadastrada. Crie equipes na aba Equipes.</p>
                  ) : (
                    <div className="space-y-1">
                      {allTeams.map(t => (
                        <label key={t.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedTeamIds.includes(t.id) ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                        }`}>
                          <input type="checkbox" checked={selectedTeamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} className="rounded text-blue-600" />
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Users className={`w-5 h-5 shrink-0 ${selectedTeamIds.includes(t.id) ? 'text-blue-500' : 'text-gray-300'}`} />
                            <div>
                              <p className="text-sm font-medium text-gray-900">{t.name}</p>
                              {t.description && <p className="text-xs text-gray-500">{t.description}</p>}
                              <p className="text-xs text-gray-400">{t.members?.length || 0} membro(s)</p>
                            </div>
                          </div>
                          {selectedTeamIds.includes(t.id) && <CheckCircle2 className="w-4 h-4 text-blue-500 shrink-0" />}
                        </label>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 shrink-0">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'add-items' ? 'Adicionar Selecionados' :
                 modalMode === 'manage-badges' ? 'Salvar Badges' :
                 modalMode === 'manage-teams' ? 'Salvar Equipes' :
                 (modalMode === 'edit-path' ? 'Atualizar' : 'Criar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
