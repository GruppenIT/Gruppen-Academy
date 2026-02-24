'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Team, User } from '@/types'
import {
  Plus, Search, Pencil, X, Loader2, UsersRound, Trash2,
  Check, UserPlus,
} from 'lucide-react'

export default function AdminEquipesPage() {
  const [teams, setTeams] = useState<Team[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedMembers, setSelectedMembers] = useState<string[]>([])
  const [memberSearch, setMemberSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const [t, u] = await Promise.all([api.getTeams(), api.getUsers(0, 500)])
      setTeams(t); setUsers(u)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreate = () => {
    setEditId(null); setName(''); setDescription(''); setSelectedMembers([])
    setMemberSearch(''); setError(''); setModalOpen(true)
  }

  const openEdit = (team: Team) => {
    setEditId(team.id); setName(team.name); setDescription(team.description || '')
    setSelectedMembers(team.members.map(m => m.id))
    setMemberSearch(''); setError(''); setModalOpen(true)
  }

  const closeModal = () => { setModalOpen(false); setError('') }

  const toggleMember = (userId: string) => {
    setSelectedMembers(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    )
  }

  const handleSave = async () => {
    if (!name.trim()) { setError('Nome da equipe e obrigatorio.'); return }
    setError(''); setSaving(true)
    try {
      if (editId) {
        await api.updateTeam(editId, { name: name.trim(), description: description || undefined })
        await api.setTeamMembers(editId, selectedMembers)
      } else {
        await api.createTeam({ name: name.trim(), description: description || undefined, member_ids: selectedMembers })
      }
      closeModal(); load()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleDelete = async (teamId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta equipe?')) return
    try {
      await api.deleteTeam(teamId)
      load()
    } catch {}
  }

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  )

  const filteredUsers = users.filter(u => {
    const q = memberSearch.toLowerCase()
    return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UsersRound className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Equipes</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{teams.length}</span>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2 px-4 py-2.5 text-sm">
          <Plus className="w-4 h-4" /> Nova Equipe
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="text" placeholder="Buscar equipes..." className="input-field pl-10 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((team) => (
            <div key={team.id} className="card p-5">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0">
                  <UsersRound className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{team.name}</h3>
                  <p className="text-xs text-gray-500">
                    {team.members.length} membro{team.members.length !== 1 ? 's' : ''}
                    {team.description && ` · ${team.description}`}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {team.members.length > 0 && (
                    <div className="flex -space-x-2 mr-3">
                      {team.members.slice(0, 5).map((m) => (
                        <div key={m.id} className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center border-2 border-white" title={m.full_name}>
                          {m.full_name.charAt(0).toUpperCase()}
                        </div>
                      ))}
                      {team.members.length > 5 && (
                        <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 text-xs font-bold flex items-center justify-center border-2 border-white">
                          +{team.members.length - 5}
                        </div>
                      )}
                    </div>
                  )}
                  <button onClick={() => openEdit(team)} className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(team.id)} className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-400">Nenhuma equipe encontrada.</div>
          )}
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
              <h3 className="font-bold text-gray-900">{editId ? 'Editar Equipe' : 'Nova Equipe'}</h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nome *</label>
                <input type="text" className="input-field w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Time Comercial SP" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                <input type="text" className="input-field w-full" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descricao opcional" />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  <UserPlus className="w-4 h-4 inline mr-1" />
                  Membros ({selectedMembers.length})
                </label>
                <input type="text" className="input-field w-full mb-2" placeholder="Buscar usuarios..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
                <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-100 rounded-xl p-2">
                  {filteredUsers.map((u) => {
                    const selected = selectedMembers.includes(u.id)
                    return (
                      <button key={u.id} type="button" onClick={() => toggleMember(u.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg text-left transition-colors ${selected ? 'bg-brand-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'border-brand-600 bg-brand-600' : 'border-gray-300'}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-900 truncate">{u.full_name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </button>
                    )
                  })}
                  {filteredUsers.length === 0 && <p className="text-sm text-gray-400 text-center py-2">Nenhum usuario encontrado.</p>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editId ? 'Salvar' : 'Criar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
