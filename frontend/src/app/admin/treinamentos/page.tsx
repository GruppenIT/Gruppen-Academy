'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Training } from '@/types'
import {
  Plus, Search, Loader2, LibraryBig, Archive, Eye,
} from 'lucide-react'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  published: 'Publicado',
  archived: 'Arquivado',
}
const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-600',
  archived: 'bg-gray-100 text-gray-500',
}

export default function AdminTrainingsPage() {
  const [trainings, setTrainings] = useState<Training[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await api.getTrainings(0, 100, statusFilter || undefined)
      setTrainings(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    setCreating(true)
    setError('')
    try {
      const t = await api.createTraining({ title: 'Novo Treinamento' })
      window.location.href = `/admin/treinamentos/${t.id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar')
      setCreating(false)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Deseja arquivar este treinamento?')) return
    try {
      await api.archiveTraining(id)
      load()
    } catch { /* ignore */ }
  }

  const filtered = trainings.filter((t) => {
    const q = search.toLowerCase()
    return t.title.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      t.domain.toLowerCase().includes(q)
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <LibraryBig className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Treinamentos</h2>
          <span className="badge-pill bg-gray-100 text-gray-600">{trainings.length}</span>
        </div>
        <button onClick={handleCreate} disabled={creating} className="btn-primary flex items-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Novo Treinamento
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm mb-4">{error}</div>
      )}

      {/* Filters */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar treinamento..."
            className="input-field pl-10 w-full"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input-field"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Todos os status</option>
          <option value="draft">Rascunho</option>
          <option value="published">Publicado</option>
          <option value="archived">Arquivado</option>
        </select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <LibraryBig className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nenhum treinamento encontrado.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="card p-5 flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
                <LibraryBig className="w-6 h-6 text-indigo-600" />
              </div>
              <div className="flex-1 min-w-0">
                <Link href={`/admin/treinamentos/${t.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand-600 truncate block">
                  {t.title}
                </Link>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.domain} · {t.estimated_duration_minutes}min · {t.xp_reward} XP
                  {t.modules && ` · ${t.modules.length} modulos`}
                </p>
              </div>
              <span className={`badge-pill ${STATUS_COLORS[t.status] || 'bg-gray-100 text-gray-500'}`}>
                {STATUS_LABELS[t.status] || t.status}
              </span>
              <div className="flex items-center gap-1">
                <Link
                  href={`/admin/treinamentos/${t.id}`}
                  className="p-2 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                  title="Editar / Ver"
                >
                  <Eye className="w-4 h-4" />
                </Link>
                {t.status !== 'archived' && (
                  <button
                    onClick={() => handleArchive(t.id)}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="Arquivar"
                  >
                    <Archive className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
