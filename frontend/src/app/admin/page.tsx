'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { User, UserRole } from '@/types'
import {
  Plus, Search, UserCheck, UserX, Pencil, X, Loader2, Shield, Users,
} from 'lucide-react'

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  manager: 'Gestor',
  professional: 'Profissional',
}

const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-red-50 text-red-700',
  admin: 'bg-brand-50 text-brand-700',
  manager: 'bg-violet-50 text-violet-700',
  professional: 'bg-emerald-50 text-emerald-700',
}

type ModalMode = 'create' | 'edit' | null

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form state
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('professional')
  const [formDepartment, setFormDepartment] = useState('')

  const loadUsers = useCallback(async () => {
    try {
      const data = await api.getUsers(0, 200)
      setUsers(data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadUsers() }, [loadUsers])

  const openCreate = () => {
    setEditUser(null)
    setFormName('')
    setFormEmail('')
    setFormPassword('')
    setFormRole('professional')
    setFormDepartment('')
    setError('')
    setModalMode('create')
  }

  const openEdit = (u: User) => {
    setEditUser(u)
    setFormName(u.full_name)
    setFormEmail(u.email)
    setFormPassword('')
    setFormRole(u.role)
    setFormDepartment(u.department || '')
    setError('')
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setEditUser(null)
    setError('')
  }

  const handleSave = async () => {
    setError('')
    setSaving(true)
    try {
      if (modalMode === 'create') {
        if (!formName || !formEmail || !formPassword) {
          setError('Preencha todos os campos obrigatorios.')
          setSaving(false)
          return
        }
        await api.createUser({
          full_name: formName,
          email: formEmail,
          password: formPassword,
          role: formRole,
          department: formDepartment || undefined,
        })
      } else if (modalMode === 'edit' && editUser) {
        await api.updateUser(editUser.id, {
          full_name: formName,
          role: formRole,
          department: formDepartment || undefined,
        })
      }
      closeModal()
      loadUsers()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (u: User) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active })
      loadUsers()
    } catch {
      // ignore
    }
  }

  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return u.full_name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.department || '').toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Header row */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Usuarios</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{users.length}</span>
        </div>
        <button onClick={openCreate} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Novo Usuario
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome, email ou departamento..."
          className="input-field pl-10 w-full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Usuario</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Departamento</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="text-right px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Acoes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                        {u.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.full_name}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`badge-pill ${ROLE_COLORS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600">
                    {u.department || '—'}
                  </td>
                  <td className="px-5 py-4">
                    {u.is_active ? (
                      <span className="badge-pill bg-emerald-50 text-emerald-600 flex items-center gap-1 w-fit">
                        <UserCheck className="w-3 h-3" /> Ativo
                      </span>
                    ) : (
                      <span className="badge-pill bg-red-50 text-red-600 flex items-center gap-1 w-fit">
                        <UserX className="w-3 h-3" /> Inativo
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleActive(u)}
                        className={`p-2 rounded-lg transition-colors ${
                          u.is_active
                            ? 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                            : 'text-gray-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={u.is_active ? 'Desativar' : 'Ativar'}
                      >
                        {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center text-sm text-gray-400">
                    Nenhum usuario encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand-600" />
                {modalMode === 'create' ? 'Novo Usuario' : 'Editar Usuario'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Nome completo *</label>
                <input
                  type="text"
                  className="input-field w-full"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Ex: Joao Silva"
                />
              </div>

              {modalMode === 'create' && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Email *</label>
                    <input
                      type="email"
                      className="input-field w-full"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      placeholder="joao@gruppen.com.br"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Senha *</label>
                    <input
                      type="password"
                      className="input-field w-full"
                      value={formPassword}
                      onChange={(e) => setFormPassword(e.target.value)}
                      placeholder="Minimo 6 caracteres"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Perfil</label>
                <select
                  className="input-field w-full"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                >
                  <option value="professional">Profissional</option>
                  <option value="manager">Gestor</option>
                  <option value="admin">Admin</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1">Departamento</label>
                <input
                  type="text"
                  className="input-field w-full"
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  placeholder="Ex: Comercial"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'create' ? 'Criar Usuario' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
