'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { api } from '@/lib/api'
import type { Training } from '@/types'
import {
  Plus, Search, Loader2, LibraryBig, Archive, Eye,
  Upload, ChevronDown, X, FileArchive,
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

  // Dropdown + SCORM import
  const [showCreateMenu, setShowCreateMenu] = useState(false)
  const [showScormModal, setShowScormModal] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const data = await api.getTrainings(0, 100, statusFilter || undefined)
      setTrainings(data)
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowCreateMenu(false)
      }
    }
    if (showCreateMenu) document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showCreateMenu])

  const handleCreate = async () => {
    setShowCreateMenu(false)
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

        {/* Create dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setShowCreateMenu(!showCreateMenu)}
            disabled={creating}
            className="btn-primary flex items-center gap-2"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Novo Treinamento
            <ChevronDown className="w-3.5 h-3.5 opacity-60" />
          </button>

          {showCreateMenu && (
            <div className="absolute right-0 top-full mt-1.5 w-64 bg-white rounded-xl shadow-lg border border-gray-100 z-20 overflow-hidden animate-slide-up">
              <button
                onClick={handleCreate}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                  <Plus className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Criar manualmente</p>
                  <p className="text-xs text-gray-500">Montar modulos com IA ou upload</p>
                </div>
              </button>
              <div className="border-t border-gray-100" />
              <button
                onClick={() => { setShowCreateMenu(false); setShowScormModal(true) }}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <FileArchive className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Importar SCORM</p>
                  <p className="text-xs text-gray-500">Upload de pacote .zip SCORM</p>
                </div>
              </button>
            </div>
          )}
        </div>
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

      {/* SCORM Import Modal */}
      {showScormModal && (
        <ScormImportModal
          onClose={() => setShowScormModal(false)}
          onError={setError}
        />
      )}
    </div>
  )
}


// ── SCORM Import Modal ──
function ScormImportModal({ onClose, onError }: {
  onClose: () => void
  onError: (msg: string) => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState('vendas')
  const [level, setLevel] = useState('intermediario')
  const [duration, setDuration] = useState(60)
  const [xpReward, setXpReward] = useState(100)
  const [importing, setImporting] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped && (dropped.name.endsWith('.zip') || dropped.type.includes('zip'))) {
      setFile(dropped)
    } else {
      onError('Apenas arquivos .zip sao aceitos.')
    }
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true)
    try {
      const t = await api.importScormTraining(file, {
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        domain,
        participant_level: level,
        estimated_duration_minutes: duration,
        xp_reward: xpReward,
      })
      window.location.href = `/admin/treinamentos/${t.id}`
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao importar SCORM')
      setImporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <FileArchive className="w-5 h-5 text-emerald-600" />
            <h3 className="font-bold text-gray-900">Importar pacote SCORM</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
              dragOver ? 'border-emerald-400 bg-emerald-50' : file ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileArchive className="w-8 h-8 text-emerald-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); setFile(null) }}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-600">Arraste o arquivo .zip ou clique para selecionar</p>
                <p className="text-xs text-gray-400 mt-1">Pacote SCORM 1.2 ou 2004</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); e.target.value = '' }}
            />
          </div>

          {/* Metadata fields */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              Titulo <span className="text-xs text-gray-400 font-normal">(opcional, detectado do pacote)</span>
            </label>
            <input
              type="text"
              className="input-field w-full"
              placeholder="Detectado automaticamente do manifesto..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
            <textarea
              className="input-field w-full"
              rows={2}
              placeholder="Opcional..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Dominio</label>
              <select className="input-field w-full" value={domain} onChange={(e) => setDomain(e.target.value)}>
                <option value="vendas">Vendas</option>
                <option value="suporte">Suporte</option>
                <option value="lideranca">Lideranca</option>
                <option value="cs">Customer Success</option>
                <option value="geral">Geral</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nivel</label>
              <select className="input-field w-full" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="iniciante">Iniciante</option>
                <option value="intermediario">Intermediario</option>
                <option value="avancado">Avancado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Duracao (min)</label>
              <input type="number" className="input-field w-full" value={duration} onChange={(e) => setDuration(Number(e.target.value))} min={1} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">XP ao concluir</label>
              <input type="number" className="input-field w-full" value={xpReward} onChange={(e) => setXpReward(Number(e.target.value))} min={0} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary px-4 py-2">Cancelar</button>
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="btn-primary flex items-center gap-2 px-4 py-2"
          >
            {importing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {importing ? 'Importando...' : 'Importar SCORM'}
          </button>
        </div>
      </div>
    </div>
  )
}
