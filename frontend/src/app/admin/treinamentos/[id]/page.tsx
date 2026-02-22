'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { Training, TrainingModule, Team } from '@/types'
import {
  ArrowLeft, Plus, Trash2, Upload, Loader2, Save, Send,
  GripVertical, FileText, CheckCircle2, X, ChevronDown, ChevronUp,
} from 'lucide-react'
import Link from 'next/link'

export default function AdminTrainingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [training, setTraining] = useState<Training | null>(null)
  const [modules, setModules] = useState<TrainingModule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Edit form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [domain, setDomain] = useState('vendas')
  const [level, setLevel] = useState('intermediario')
  const [duration, setDuration] = useState(60)
  const [xpReward, setXpReward] = useState(100)

  // Publish modal
  const [showPublish, setShowPublish] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeams, setSelectedTeams] = useState<string[]>([])
  const [publishing, setPublishing] = useState(false)

  // Module expansion
  const [expandedModule, setExpandedModule] = useState<string | null>(null)

  // Upload state
  const [uploadingModule, setUploadingModule] = useState<string | null>(null)

  // New module
  const [addingModule, setAddingModule] = useState(false)
  const [newModuleTitle, setNewModuleTitle] = useState('')

  const load = useCallback(async () => {
    try {
      const t = await api.getTraining(id)
      setTraining(t)
      setTitle(t.title)
      setDescription(t.description || '')
      setDomain(t.domain)
      setLevel(t.participant_level)
      setDuration(t.estimated_duration_minutes)
      setXpReward(t.xp_reward)
      setModules(t.modules || [])
    } catch {
      setError('Treinamento nao encontrado')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const isDraft = training?.status === 'draft'

  const handleSave = async () => {
    if (!isDraft) return
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.updateTraining(id, { title, description, domain, participant_level: level, estimated_duration_minutes: duration, xp_reward: xpReward })
      setSuccess('Treinamento salvo.')
      setTimeout(() => setSuccess(''), 3000)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally { setSaving(false) }
  }

  const handleAddModule = async () => {
    if (!newModuleTitle.trim()) return
    setAddingModule(true)
    try {
      await api.createTrainingModule(id, { title: newModuleTitle.trim() })
      setNewModuleTitle('')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar modulo')
    } finally { setAddingModule(false) }
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Remover este modulo?')) return
    try {
      await api.deleteTrainingModule(id, moduleId)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover modulo')
    }
  }

  const handleUpload = async (moduleId: string, file: File) => {
    setUploadingModule(moduleId)
    setError('')
    try {
      await api.uploadModuleFile(id, moduleId, file)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally { setUploadingModule(null) }
  }

  const handleOpenPublish = async () => {
    try {
      const t = await api.getTeams()
      setTeams(t)
      setSelectedTeams([])
      setShowPublish(true)
    } catch { setError('Erro ao carregar equipes') }
  }

  const handlePublish = async () => {
    if (selectedTeams.length === 0) {
      setError('Selecione pelo menos uma equipe.')
      return
    }
    setPublishing(true)
    setError('')
    try {
      await api.publishTraining(id, selectedTeams)
      setShowPublish(false)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao publicar')
    } finally { setPublishing(false) }
  }

  const toggleTeam = (teamId: string) => {
    setSelectedTeams((prev) =>
      prev.includes(teamId) ? prev.filter((t) => t !== teamId) : [...prev, teamId]
    )
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 text-brand-600 animate-spin" />
      </div>
    )
  }

  if (!training) {
    return <p className="text-center text-gray-400 py-12">Treinamento nao encontrado.</p>
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/treinamentos" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-gray-900">{training.title}</h2>
          <p className="text-xs text-gray-500">
            {training.status === 'draft' ? 'Rascunho' : training.status === 'published' ? 'Publicado' : 'Arquivado'}
          </p>
        </div>
        {isDraft && (
          <div className="flex items-center gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-secondary flex items-center gap-2 px-4 py-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
            <button onClick={handleOpenPublish} className="btn-primary flex items-center gap-2 px-4 py-2">
              <Send className="w-4 h-4" />
              Publicar
            </button>
          </div>
        )}
      </div>

      {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm mb-4">{error}</div>}
      {success && <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm mb-4">{success}</div>}

      {/* Training Details Form */}
      {isDraft && (
        <div className="card p-5 mb-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Titulo</label>
              <input type="text" className="input-field w-full" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
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
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
            <textarea className="input-field w-full" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Nivel</label>
              <select className="input-field w-full" value={level} onChange={(e) => setLevel(e.target.value)}>
                <option value="iniciante">Iniciante</option>
                <option value="intermediario">Intermediario</option>
                <option value="avancado">Avancado</option>
              </select>
            </div>
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
      )}

      {/* Published summary */}
      {!isDraft && (
        <div className="card p-5 mb-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div><span className="text-gray-500">Dominio:</span> <span className="font-medium">{training.domain}</span></div>
            <div><span className="text-gray-500">Nivel:</span> <span className="font-medium">{training.participant_level}</span></div>
            <div><span className="text-gray-500">Duracao:</span> <span className="font-medium">{training.estimated_duration_minutes}min</span></div>
            <div><span className="text-gray-500">XP:</span> <span className="font-medium">{training.xp_reward}</span></div>
          </div>
          {training.description && <p className="text-sm text-gray-600 mt-3">{training.description}</p>}
        </div>
      )}

      {/* Modules */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-900">Modulos ({modules.length})</h3>
      </div>

      <div className="space-y-3 mb-4">
        {modules.map((mod) => (
          <div key={mod.id} className="card overflow-hidden">
            {/* Module header */}
            <div
              className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpandedModule(expandedModule === mod.id ? null : mod.id)}
            >
              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                {mod.order}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{mod.title}</p>
                <p className="text-xs text-gray-500">
                  {mod.content_type
                    ? mod.content_type === 'document'
                      ? `Documento: ${mod.original_filename || 'Enviado'}`
                      : mod.content_type === 'scorm'
                        ? 'SCORM'
                        : mod.content_type === 'ai_generated'
                          ? 'Conteudo IA'
                          : 'Texto rico'
                    : 'Sem conteudo'}
                  {mod.has_quiz && ` · Quiz${mod.quiz_required_to_advance ? ' (obrigatorio)' : ''}`}
                  {` · ${mod.xp_reward} XP`}
                </p>
              </div>
              {mod.content_type && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {expandedModule === mod.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>

            {/* Module expanded content */}
            {expandedModule === mod.id && (
              <div className="border-t border-gray-100 p-4 space-y-4">
                {/* Content section */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Conteudo</p>
                  {mod.original_filename ? (
                    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <FileText className="w-5 h-5 text-gray-400" />
                      <span className="text-sm text-gray-700 flex-1">{mod.original_filename}</span>
                      <a
                        href={api.getModuleFileUrl(id, mod.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium"
                      >
                        Visualizar
                      </a>
                    </div>
                  ) : mod.content_type === 'ai_generated' || mod.content_type === 'rich_text' ? (
                    <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                      Conteudo gerado. {mod.content_data ? 'Disponivel.' : 'Aguardando.'}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Nenhum conteudo adicionado.</p>
                  )}

                  {isDraft && (
                    <div className="mt-2">
                      <label className="btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer">
                        {uploadingModule === mod.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Enviar arquivo
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.pptx,.docx,.ppt,.doc,.zip"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleUpload(mod.id, file)
                            e.target.value = ''
                          }}
                          disabled={uploadingModule === mod.id}
                        />
                      </label>
                    </div>
                  )}
                </div>

                {/* Quiz section */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Quiz</p>
                  {mod.quiz ? (
                    <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
                      {mod.quiz.title} · {mod.quiz.questions?.length || 0} perguntas · Nota minima: {Math.round(mod.quiz.passing_score * 100)}%
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Nenhum quiz configurado.</p>
                  )}
                </div>

                {/* Actions */}
                {isDraft && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleDeleteModule(mod.id)}
                      className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover modulo
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add module */}
      {isDraft && (
        <div className="card p-4 flex items-center gap-3">
          <input
            type="text"
            placeholder="Titulo do novo modulo..."
            className="input-field flex-1"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
          />
          <button
            onClick={handleAddModule}
            disabled={addingModule || !newModuleTitle.trim()}
            className="btn-primary flex items-center gap-2 px-4 py-2"
          >
            {addingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      )}

      {/* Publish Modal */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Publicar Treinamento</h3>
              <button onClick={() => setShowPublish(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4">
                <strong>{training.title}</strong> sera publicado e ficara disponivel para as equipes selecionadas.
              </p>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {teams.map((team) => (
                  <label key={team.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(team.id)}
                      onChange={() => toggleTeam(team.id)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{team.name}</p>
                      <p className="text-xs text-gray-500">{team.members?.length || 0} membros</p>
                    </div>
                  </label>
                ))}
                {teams.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">Nenhuma equipe cadastrada.</p>
                )}
              </div>

              {selectedTeams.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  {teams.filter((t) => selectedTeams.includes(t.id)).reduce((sum, t) => sum + (t.members?.length || 0), 0)} profissionais receberao este treinamento.
                </p>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowPublish(false)} className="btn-secondary px-4 py-2">Cancelar</button>
              <button
                onClick={handlePublish}
                disabled={publishing || selectedTeams.length === 0}
                className="btn-primary flex items-center gap-2 px-4 py-2"
              >
                {publishing && <Loader2 className="w-4 h-4 animate-spin" />}
                Publicar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
