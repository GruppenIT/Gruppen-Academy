'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import type { Training, TrainingModule, Team, ModuleQuiz, QuizQuestion, QuizQuestionType, TrainingQuiz, TrainingQuizQuestion } from '@/types'
import {
  ArrowLeft, Plus, Trash2, Upload, Loader2, Save, Send,
  GripVertical, FileText, CheckCircle2, X, ChevronDown, ChevronUp,
  ClipboardCheck, Pencil, Star, Sparkles, Wand2, Video, Download, Box, Eye,
} from 'lucide-react'
import Link from 'next/link'
import { clsx } from 'clsx'

// ── Question Form Types ──
interface QuestionFormData {
  text: string
  type: QuizQuestionType
  options: { text: string }[]
  correct_answer: string
  explanation: string
  weight: number
}

const emptyQuestion: QuestionFormData = {
  text: '', type: 'multiple_choice', options: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }],
  correct_answer: '', explanation: '', weight: 1,
}

// ── Main Page ──
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

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  // Reload only modules + training metadata (without resetting form fields)
  const reloadModules = useCallback(async () => {
    try {
      const t = await api.getTraining(id)
      setTraining(t)
      setModules(t.modules || [])
    } catch {
      setError('Erro ao recarregar modulos')
    }
  }, [id])

  useEffect(() => { load() }, [load])

  const isDraft = training?.status === 'draft'

  const handleSave = async () => {
    if (!isDraft) return
    setSaving(true); setError(''); setSuccess('')
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
      reloadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar modulo')
    } finally { setAddingModule(false) }
  }

  const handleDeleteModule = async (moduleId: string) => {
    if (!confirm('Remover este modulo?')) return
    try {
      await api.deleteTrainingModule(id, moduleId)
      reloadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover modulo')
    }
  }

  const handleUpload = async (moduleId: string, file: File, allowDownload: boolean = true) => {
    setUploadingModule(moduleId)
    setError('')
    try {
      await api.uploadModuleFile(id, moduleId, file, allowDownload)
      reloadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar arquivo')
    } finally { setUploadingModule(null) }
  }

  const handleUpdateModuleSettings = async (moduleId: string, data: Record<string, unknown>) => {
    try {
      await api.updateTrainingModule(id, moduleId, data)
      reloadModules()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar modulo')
    }
  }

  const handleDelete = async () => {
    setDeleting(true); setError('')
    try {
      await api.deleteTraining(id)
      router.push('/admin/treinamentos')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir treinamento')
      setShowDeleteConfirm(false)
    } finally { setDeleting(false) }
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
    if (selectedTeams.length === 0) { setError('Selecione pelo menos uma equipe.'); return }
    setPublishing(true); setError('')
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
        <div className="flex items-center gap-2">
          {isDraft && (
            <>
              <button onClick={handleSave} disabled={saving} className="btn-secondary flex items-center gap-2 px-4 py-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Salvar
              </button>
              <button onClick={handleOpenPublish} className="btn-primary flex items-center gap-2 px-4 py-2">
                <Send className="w-4 h-4" /> Publicar
              </button>
            </>
          )}
          <button onClick={() => setShowDeleteConfirm(true)}
            className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1 px-3 py-2">
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
        </div>
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
                        ? (mod.content_data?.generated_as_scorm ? 'Conteudo IA (SCORM)' : 'SCORM')
                        : mod.content_type === 'ai_generated' ? 'Conteudo IA' : 'Texto rico'
                    : 'Sem conteudo'}
                  {mod.has_quiz && ` · Quiz (${mod.quiz?.questions?.length || 0} perguntas)${mod.quiz_required_to_advance ? ' obrigatorio' : ''}`}
                </p>
              </div>
              {mod.content_type && <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />}
              {mod.has_quiz && <ClipboardCheck className="w-4 h-4 text-indigo-500 flex-shrink-0" />}
              {expandedModule === mod.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </div>

            {/* Module expanded content */}
            {expandedModule === mod.id && (
              <div className="border-t border-gray-100 p-4 space-y-5">
                {/* Module settings (draft only) */}
                {isDraft && (
                  <ModuleSettingsPanel
                    mod={mod}
                    onUpdate={(data) => handleUpdateModuleSettings(mod.id, data)}
                  />
                )}

                {/* Content section */}
                <ContentPanel
                  trainingId={id}
                  mod={mod}
                  isDraft={isDraft}
                  uploadingModule={uploadingModule}
                  onUpload={(file, allowDl) => handleUpload(mod.id, file, allowDl)}
                  onReload={reloadModules}
                  onError={setError}
                  onUpdateModule={(data) => handleUpdateModuleSettings(mod.id, data)}
                />

                {/* Quiz section */}
                <QuizPanel
                  trainingId={id}
                  moduleId={mod.id}
                  quiz={mod.quiz || null}
                  hasQuiz={mod.has_quiz}
                  quizRequiredProp={mod.quiz_required_to_advance}
                  isDraft={isDraft}
                  onReload={reloadModules}
                  onError={setError}
                />

                {/* Delete module */}
                {isDraft && (
                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <button onClick={() => handleDeleteModule(mod.id)}
                      className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> Remover modulo
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
          <input type="text" placeholder="Titulo do novo modulo..." className="input-field flex-1"
            value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddModule()} />
          <button onClick={handleAddModule} disabled={addingModule || !newModuleTitle.trim()}
            className="btn-primary flex items-center gap-2 px-4 py-2">
            {addingModule ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Adicionar
          </button>
        </div>
      )}

      {/* Training Final Quiz */}
      <FinalQuizSection trainingId={id} training={training} isDraft={isDraft} onReload={load} onError={setError} />

      {/* Publish Modal */}
      {showPublish && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Publicar Treinamento</h3>
              <button onClick={() => setShowPublish(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-4"><strong>{training.title}</strong> sera publicado e ficara disponivel para as equipes selecionadas.</p>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {teams.map((team) => (
                  <label key={team.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 cursor-pointer">
                    <input type="checkbox" checked={selectedTeams.includes(team.id)} onChange={() => toggleTeam(team.id)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{team.name}</p>
                      <p className="text-xs text-gray-500">{team.members?.length || 0} membros</p>
                    </div>
                  </label>
                ))}
                {teams.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Nenhuma equipe cadastrada.</p>}
              </div>
              {selectedTeams.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  {teams.filter((t) => selectedTeams.includes(t.id)).reduce((sum, t) => sum + (t.members?.length || 0), 0)} profissionais receberao este treinamento.
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowPublish(false)} className="btn-secondary px-4 py-2">Cancelar</button>
              <button onClick={handlePublish} disabled={publishing || selectedTeams.length === 0}
                className="btn-primary flex items-center gap-2 px-4 py-2">
                {publishing && <Loader2 className="w-4 h-4 animate-spin" />} Publicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm animate-slide-up">
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h3 className="font-bold text-gray-900 mb-2">Excluir treinamento?</h3>
              <p className="text-sm text-gray-600 mb-1">
                <strong>{training.title}</strong> sera excluido permanentemente.
              </p>
              <p className="text-xs text-gray-400">
                Todo o historico sera removido: modulos, quizzes, progresso dos profissionais e XP ganho com este treinamento.
              </p>
            </div>
            <div className="flex items-center gap-3 p-5 border-t border-gray-100">
              <button onClick={() => setShowDeleteConfirm(false)} disabled={deleting}
                className="btn-secondary flex-1 px-4 py-2">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Module Settings Panel ──
function ModuleSettingsPanel({ mod, onUpdate }: {
  mod: TrainingModule
  onUpdate: (data: Record<string, unknown>) => void
}) {
  return (
    <div className="p-3 bg-gray-50 rounded-xl space-y-3">
      <p className="text-sm font-medium text-gray-700">Configuracoes do modulo</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Titulo</label>
          <input type="text" className="input-field w-full text-sm" defaultValue={mod.title}
            onBlur={(e) => { if (e.target.value !== mod.title) onUpdate({ title: e.target.value }) }} />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Descricao</label>
          <input type="text" className="input-field w-full text-sm" defaultValue={mod.description || ''} placeholder="Opcional"
            onBlur={(e) => { if (e.target.value !== (mod.description || '')) onUpdate({ description: e.target.value || null }) }} />
        </div>
      </div>
    </div>
  )
}

// ── Video Embed Helpers ──
function parseVideoEmbedUrl(url: string): string | null {
  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`
  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(\d+)/)
  if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  return null
}

// ── Rich Text Section Editor ──
function RichEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInitialMount = useRef(true)

  useEffect(() => {
    if (editorRef.current && isInitialMount.current) {
      editorRef.current.innerHTML = value
      isInitialMount.current = false
    }
  }, [value])

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    editorRef.current?.focus()
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-200 flex-wrap">
        <button type="button" onClick={() => exec('bold')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 font-bold text-sm" title="Negrito">B</button>
        <button type="button" onClick={() => exec('italic')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 italic text-sm" title="Itálico">I</button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" onClick={() => exec('insertUnorderedList')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs" title="Lista">• Lista</button>
        <button type="button" onClick={() => exec('insertOrderedList')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs" title="Lista numerada">1. Lista</button>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <button type="button" onClick={() => exec('formatBlock', 'h3')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs font-semibold" title="Subtítulo">H3</button>
        <button type="button" onClick={() => exec('formatBlock', 'h4')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs font-semibold" title="Subtítulo menor">H4</button>
        <button type="button" onClick={() => exec('formatBlock', 'p')} className="p-1.5 rounded hover:bg-gray-200 text-gray-700 text-xs" title="Parágrafo">¶</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        className="p-3 min-h-[120px] max-h-[300px] overflow-y-auto text-sm text-gray-800 focus:outline-none prose prose-sm max-w-none"
        onInput={() => {
          if (editorRef.current) onChange(editorRef.current.innerHTML)
        }}
      />
    </div>
  )
}

// ── Manual Content Editor Modal ──
function ManualEditorModal({ trainingId, mod, onClose, onSave }: {
  trainingId: string
  mod: TrainingModule
  onClose: () => void
  onSave: () => void
}) {
  const data = mod.content_data as {
    title?: string
    sections?: { heading: string; content: string }[]
    summary?: string
    key_concepts?: string[]
  } | null

  const [title, setTitle] = useState(data?.title || '')
  const [sections, setSections] = useState<{ heading: string; content: string }[]>(
    data?.sections?.map(s => ({ heading: s.heading, content: s.content })) || [{ heading: '', content: '' }]
  )
  const [summary, setSummary] = useState(data?.summary || '')
  const [keyConcepts, setKeyConcepts] = useState(data?.key_concepts?.join(', ') || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const updateSection = (i: number, field: 'heading' | 'content', val: string) => {
    setSections(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))
  }

  const addSection = () => setSections(prev => [...prev, { heading: '', content: '' }])

  const removeSection = (i: number) => {
    if (sections.length <= 1) return
    setSections(prev => prev.filter((_, idx) => idx !== i))
  }

  const moveSection = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= sections.length) return
    setSections(prev => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.updateModuleContent(trainingId, mod.id, {
        title,
        sections,
        summary,
        key_concepts: keyConcepts.split(',').map(c => c.trim()).filter(Boolean),
      })
      onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold text-gray-900">Editar conteudo manualmente</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Title */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Titulo do modulo</label>
            <input type="text" className="input-field w-full" value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          {/* Sections */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Secoes</label>
              <button type="button" onClick={addSection} className="btn-secondary text-xs px-2.5 py-1 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Nova secao
              </button>
            </div>
            {sections.map((sec, i) => (
              <div key={i} className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 font-mono w-6 text-center">{i + 1}</span>
                  <input type="text" className="input-field flex-1 text-sm font-medium" placeholder="Titulo da secao"
                    value={sec.heading} onChange={e => updateSection(i, 'heading', e.target.value)} />
                  <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronUp className="w-4 h-4" /></button>
                  <button type="button" onClick={() => moveSection(i, 1)} disabled={i === sections.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ChevronDown className="w-4 h-4" /></button>
                  <button type="button" onClick={() => removeSection(i)} disabled={sections.length <= 1}
                    className="p-1 text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 className="w-4 h-4" /></button>
                </div>
                <RichEditor value={sec.content} onChange={v => updateSection(i, 'content', v)} />
              </div>
            ))}
          </div>

          {/* Summary */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Resumo</label>
            <textarea className="input-field w-full text-sm" rows={2} value={summary} onChange={e => setSummary(e.target.value)} />
          </div>

          {/* Key Concepts */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Conceitos-chave <span className="font-normal text-gray-400">(separados por virgula)</span></label>
            <input type="text" className="input-field w-full text-sm" value={keyConcepts} onChange={e => setKeyConcepts(e.target.value)}
              placeholder="Ex: RTO, RPO, Backup automatizado" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary px-4 py-2 text-sm flex items-center gap-2">
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : <><Save className="w-4 h-4" /> Salvar conteudo</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── AI Content Editor Modal ──
function AIEditorModal({ trainingId, mod, onClose, onSave }: {
  trainingId: string
  mod: TrainingModule
  onClose: () => void
  onSave: () => void
}) {
  const [prompt, setPrompt] = useState('')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')

  const data = mod.content_data as {
    title?: string
    sections?: { heading: string; content: string }[]
    summary?: string
  } | null

  const handleEdit = async () => {
    if (!prompt.trim()) return
    setEditing(true)
    setError('')
    try {
      await api.editModuleContentAI(trainingId, mod.id, prompt)
      onSave()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao editar com IA')
    } finally {
      setEditing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Wand2 className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-semibold text-gray-900">Editar conteudo com IA</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Current content summary */}
          {data && (
            <div className="p-3 bg-gray-50 rounded-xl space-y-1.5">
              <p className="text-xs font-medium text-gray-500">Conteudo atual</p>
              {data.title && <p className="text-sm font-semibold text-gray-800">{data.title}</p>}
              {data.sections && (
                <div className="flex flex-wrap gap-1.5">
                  {data.sections.map((sec, i) => (
                    <span key={i} className="inline-flex items-center text-xs bg-white border border-gray-200 px-2 py-0.5 rounded-md text-gray-600">
                      {i + 1}. {sec.heading}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Edit prompt */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">
              O que voce gostaria de alterar?
            </label>
            <textarea
              className="input-field w-full text-sm"
              rows={5}
              placeholder="Ex: Adicione uma seção sobre recuperação de desastres. Simplifique a linguagem da seção 2. Inclua mais exemplos práticos em todas as seções..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
            />
            <p className="text-xs text-gray-400 mt-1">A IA vai ajustar o conteudo existente com base nas suas instrucoes.</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="btn-secondary px-4 py-2 text-sm">Cancelar</button>
          <button onClick={handleEdit} disabled={editing || !prompt.trim()}
            className="btn-primary px-4 py-2 text-sm flex items-center gap-2 bg-violet-600 hover:bg-violet-700">
            {editing ? <><Loader2 className="w-4 h-4 animate-spin" /> Editando...</> : <><Wand2 className="w-4 h-4" /> Aplicar com IA</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Content Panel ──
function ContentPanel({ trainingId, mod, isDraft, uploadingModule, onUpload, onReload, onError, onUpdateModule }: {
  trainingId: string
  mod: TrainingModule
  isDraft: boolean
  uploadingModule: string | null
  onUpload: (file: File, allowDownload: boolean) => void
  onReload: () => void
  onError: (msg: string) => void
  onUpdateModule: (data: Record<string, unknown>) => void
}) {
  const [showAiForm, setShowAiForm] = useState(false)
  const [aiOrientation, setAiOrientation] = useState('')
  const [aiFile, setAiFile] = useState<File | null>(null)
  const [aiContentLength, setAiContentLength] = useState<'curto' | 'normal' | 'extendido'>('normal')
  const [generating, setGenerating] = useState(false)
  const [allowDownload, setAllowDownload] = useState(mod.allow_download ?? true)
  const [showManualEditor, setShowManualEditor] = useState(false)
  const [showAiEditor, setShowAiEditor] = useState(false)

  // Video embeds state
  const videos = ((mod.content_data?.videos ?? []) as { url: string; title: string }[])
  const [newVideoUrl, setNewVideoUrl] = useState('')
  const [newVideoTitle, setNewVideoTitle] = useState('')

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      await api.generateModuleContent(trainingId, mod.id, aiOrientation, aiFile || undefined, aiContentLength)
      setShowAiForm(false)
      setAiOrientation('')
      setAiFile(null)
      setAiContentLength('normal')
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao gerar conteudo com IA')
    } finally { setGenerating(false) }
  }

  const handleAddVideo = async () => {
    const url = newVideoUrl.trim()
    if (!url) return
    const embed = parseVideoEmbedUrl(url)
    if (!embed) { onError('URL de video invalida. Use YouTube ou Vimeo.'); return }
    const updated = [...videos, { url, title: newVideoTitle.trim() || 'Video' }]
    const newData = { ...(mod.content_data || {}), videos: updated }
    try {
      await api.updateTrainingModule(trainingId, mod.id, {
        content_data: newData,
        content_type: mod.content_type || 'rich_text',
      })
      setNewVideoUrl('')
      setNewVideoTitle('')
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao adicionar video')
    }
  }

  const handleRemoveVideo = async (index: number) => {
    const updated = videos.filter((_, i) => i !== index)
    const newData = { ...(mod.content_data || {}), videos: updated }
    try {
      await api.updateTrainingModule(trainingId, mod.id, { content_data: newData })
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao remover video')
    }
  }

  // Render AI-generated content preview
  const isScormAI = mod.content_type === 'scorm' && !!mod.content_data?.generated_as_scorm
  const renderAiContent = () => {
    if (!mod.content_data) return null
    const data = mod.content_data as { title?: string; sections?: { heading: string; content: string; video_suggestions?: string[] }[]; summary?: string; key_concepts?: string[] }
    return (
      <div className="p-4 bg-gradient-to-br from-violet-50/50 to-indigo-50/50 rounded-xl border border-violet-100 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {isScormAI && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">
                <Box className="w-3 h-3" /> SCORM interativo
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {isScormAI && (
              <a
                href={api.getScormLaunchUrl(trainingId, mod.id)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-300 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" /> Visualizar
              </a>
            )}
            {isDraft && (
              <>
                <button onClick={() => setShowManualEditor(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-white px-3 py-1.5 rounded-lg border border-gray-200 hover:border-gray-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button onClick={() => setShowAiEditor(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 bg-white px-3 py-1.5 rounded-lg border border-violet-200 hover:border-violet-300 transition-colors">
                  <Wand2 className="w-3.5 h-3.5" /> Editar com IA
                </button>
              </>
            )}
          </div>
        </div>
        {data.title && <h4 className="font-semibold text-gray-900 text-sm">{data.title}</h4>}
        {data.summary && <p className="text-xs text-gray-500 italic">{data.summary}</p>}
        {data.sections && (
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {data.sections.map((sec, i) => (
              <div key={i}>
                <p className="text-xs font-medium text-indigo-700">{sec.heading}</p>
                <p className="text-xs text-gray-600 line-clamp-3">{sec.content}</p>
                {sec.video_suggestions && sec.video_suggestions.length > 0 && (
                  <div className="flex items-center gap-1 mt-1">
                    <Video className="w-3 h-3 text-violet-400" />
                    <span className="text-xs text-violet-500 italic">Sugestao de video: {sec.video_suggestions.join(', ')}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {data.key_concepts && data.key_concepts.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {data.key_concepts.map((c, i) => (
              <span key={i} className="badge-pill bg-violet-100 text-violet-600 text-xs">{c}</span>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">Conteudo</p>

      {/* Existing file */}
      {mod.original_filename ? (
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <FileText className="w-5 h-5 text-gray-400" />
            <span className="text-sm text-gray-700 flex-1">{mod.original_filename}</span>
            {mod.preview_file_path && (
              <a href={api.getModulePreviewUrl(trainingId, mod.id)} target="_blank" rel="noopener noreferrer"
                className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                Preview PDF
              </a>
            )}
            <a href={api.getModuleFileUrl(trainingId, mod.id)} target="_blank" rel="noopener noreferrer"
              className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> Baixar
            </a>
          </div>
          {/* Download toggle */}
          {isDraft && (
            <label className="flex items-center gap-2 cursor-pointer ml-1">
              <input type="checkbox" checked={allowDownload}
                onChange={(e) => {
                  setAllowDownload(e.target.checked)
                  onUpdateModule({ allow_download: e.target.checked })
                }}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="text-xs text-gray-600">Permitir download pelo profissional</span>
            </label>
          )}
          {!isDraft && !mod.allow_download && (
            <p className="text-xs text-amber-600 ml-1">Download desabilitado para profissionais.</p>
          )}
        </div>
      ) : (mod.content_type === 'ai_generated' || (mod.content_type === 'scorm' && mod.content_data?.generated_as_scorm)) && mod.content_data ? (
        renderAiContent()
      ) : mod.content_type === 'rich_text' ? (
        <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
          Conteudo texto rico. {mod.content_data ? 'Disponivel.' : 'Aguardando.'}
        </div>
      ) : (
        <p className="text-sm text-gray-400">Nenhum conteudo adicionado.</p>
      )}

      {/* Video Embeds */}
      {videos.length > 0 && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Video className="w-3.5 h-3.5 text-red-500" /> Videos incorporados ({videos.length})
          </p>
          {videos.map((v, i) => {
            const embedUrl = parseVideoEmbedUrl(v.url)
            return (
              <div key={i} className="p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Video className="w-4 h-4 text-red-400 shrink-0" />
                  <span className="text-sm text-gray-700 flex-1 truncate">{v.title || v.url}</span>
                  {isDraft && (
                    <button onClick={() => handleRemoveVideo(i)} className="text-gray-400 hover:text-red-500">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {embedUrl && (
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe src={embedUrl} className="w-full h-full" allowFullScreen
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add video (draft only) */}
      {isDraft && (
        <div className="mt-3 p-3 border border-dashed border-gray-200 rounded-xl space-y-2">
          <p className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Video className="w-3.5 h-3.5" /> Adicionar video (YouTube / Vimeo)
          </p>
          <div className="flex gap-2">
            <input type="text" className="input-field flex-1 text-sm" placeholder="URL do video..."
              value={newVideoUrl} onChange={(e) => setNewVideoUrl(e.target.value)} />
            <input type="text" className="input-field w-40 text-sm" placeholder="Titulo (opcional)"
              value={newVideoTitle} onChange={(e) => setNewVideoTitle(e.target.value)} />
            <button onClick={handleAddVideo} disabled={!newVideoUrl.trim()}
              className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1 shrink-0">
              <Plus className="w-3.5 h-3.5" /> Adicionar
            </button>
          </div>
        </div>
      )}

      {/* Upload + AI actions */}
      {isDraft && (
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <label className="btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer">
            {uploadingModule === mod.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Enviar arquivo
            <input type="file" className="hidden" accept=".pdf,.pptx,.docx,.ppt,.doc,.zip"
              onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file, allowDownload); e.target.value = '' }}
              disabled={uploadingModule === mod.id} />
          </label>
          <button onClick={() => setShowAiForm(!showAiForm)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
            <Sparkles className="w-4 h-4" /> Criar com IA
          </button>
        </div>
      )}

      {/* AI Generation Form */}
      {showAiForm && (
        <div className="mt-3 p-4 border-2 border-violet-200 rounded-xl bg-violet-50/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-violet-700 flex items-center gap-1.5">
              <Wand2 className="w-4 h-4" /> Gerar conteudo com IA
            </span>
            <button onClick={() => setShowAiForm(false)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Orientacoes (o que a IA deve cobrir)</label>
            <textarea className="input-field w-full text-sm" rows={3} placeholder="Ex: Foque em beneficios do BaaS para PMEs, inclua cenarios praticos..."
              value={aiOrientation} onChange={(e) => setAiOrientation(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1.5">Extensao do conteudo</label>
            <div className="flex gap-2">
              {([
                { value: 'curto' as const, label: 'Curto', desc: '2-3 secoes, 3-5 min' },
                { value: 'normal' as const, label: 'Normal', desc: '4-6 secoes, 8-12 min' },
                { value: 'extendido' as const, label: 'Extendido', desc: '6-10 secoes, 15-25 min' },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setAiContentLength(opt.value)}
                  className={clsx(
                    'flex-1 p-2.5 rounded-lg border-2 text-center transition-all',
                    aiContentLength === opt.value
                      ? 'border-violet-400 bg-violet-100 text-violet-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-violet-200'
                  )}
                >
                  <span className="text-xs font-semibold block">{opt.label}</span>
                  <span className="text-[10px] text-gray-400 block mt-0.5">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 block mb-1">Material de referencia (opcional)</label>
            <label className="btn-secondary inline-flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {aiFile ? aiFile.name : 'Anexar arquivo'}
              <input type="file" className="hidden" accept=".txt,.pdf,.md,.docx"
                onChange={(e) => { setAiFile(e.target.files?.[0] || null); e.target.value = '' }} />
            </label>
            {aiFile && (
              <button onClick={() => setAiFile(null)} className="text-xs text-red-400 hover:text-red-600 ml-2">Remover</button>
            )}
          </div>
          <div className="flex justify-end">
            <button onClick={handleGenerate} disabled={generating}
              className="btn-primary text-sm flex items-center gap-2">
              {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</> : <><Sparkles className="w-4 h-4" /> Gerar conteudo</>}
            </button>
          </div>
        </div>
      )}

      {/* Edit Modals */}
      {showManualEditor && (
        <ManualEditorModal trainingId={trainingId} mod={mod} onClose={() => setShowManualEditor(false)} onSave={onReload} />
      )}
      {showAiEditor && (
        <AIEditorModal trainingId={trainingId} mod={mod} onClose={() => setShowAiEditor(false)} onSave={onReload} />
      )}
    </div>
  )
}

// ── Quiz Panel ──
function QuizPanel({ trainingId, moduleId, quiz, hasQuiz, quizRequiredProp, isDraft, onReload, onError }: {
  trainingId: string
  moduleId: string
  quiz: ModuleQuiz | null
  hasQuiz: boolean
  quizRequiredProp: boolean
  isDraft: boolean
  onReload: () => void
  onError: (msg: string) => void
}) {
  const [creating, setCreating] = useState(false)
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [savingQuiz, setSavingQuiz] = useState(false)
  const [generatingQuiz, setGeneratingQuiz] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiNumQuestions, setAiNumQuestions] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState('intermediario')
  const [aiOrientation, setAiOrientation] = useState('')
  const [passingScore, setPassingScore] = useState(quiz?.passing_score ?? 0.7)
  const [quizRequired, setQuizRequired] = useState(quizRequiredProp)

  useEffect(() => { setPassingScore(quiz?.passing_score ?? 0.7) }, [quiz])
  useEffect(() => { setQuizRequired(quizRequiredProp) }, [quizRequiredProp])

  const handleCreateQuiz = async () => {
    setCreating(true)
    try {
      await api.createModuleQuiz(trainingId, moduleId, { title: 'Quiz', passing_score: 0.7 })
      await api.updateTrainingModule(trainingId, moduleId, { has_quiz: true })
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao criar quiz')
    } finally { setCreating(false) }
  }

  const handleUpdatePassingScore = async (score: number) => {
    setSavingQuiz(true)
    try {
      await api.createModuleQuiz(trainingId, moduleId, { title: quiz?.title || 'Quiz', passing_score: score })
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao atualizar quiz')
    } finally { setSavingQuiz(false) }
  }

  const handleToggleRequired = async (required: boolean) => {
    setQuizRequired(required)
    try {
      await api.updateTrainingModule(trainingId, moduleId, { quiz_required_to_advance: required })
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao atualizar modulo')
    }
  }

  const handleAddQuestion = async (data: QuestionFormData) => {
    try {
      await api.addQuizQuestion(trainingId, moduleId, {
        text: data.text,
        type: data.type,
        options: data.type === 'multiple_choice' ? data.options.filter(o => o.text.trim()) : undefined,
        correct_answer: data.correct_answer || undefined,
        explanation: data.explanation || undefined,
        weight: data.weight,
      })
      setAddingQuestion(false)
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao adicionar pergunta')
    }
  }

  const handleUpdateQuestion = async (questionId: string, data: QuestionFormData) => {
    try {
      await api.updateQuizQuestion(trainingId, moduleId, questionId, {
        text: data.text,
        type: data.type,
        options: data.type === 'multiple_choice' ? data.options.filter(o => o.text.trim()) : undefined,
        correct_answer: data.correct_answer || undefined,
        explanation: data.explanation || undefined,
        weight: data.weight,
      })
      setEditingQuestion(null)
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao atualizar pergunta')
    }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Remover esta pergunta?')) return
    try {
      await api.deleteQuizQuestion(trainingId, moduleId, questionId)
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao remover pergunta')
    }
  }

  const handleGenerateQuiz = async () => {
    setGeneratingQuiz(true)
    setShowAiModal(false)
    try {
      await api.generateModuleQuiz(trainingId, moduleId, {
        num_questions: aiNumQuestions,
        difficulty: aiDifficulty,
        orientation: aiOrientation || undefined,
      })
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Erro ao gerar quiz com IA')
    } finally { setGeneratingQuiz(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
          <ClipboardCheck className="w-4 h-4 text-indigo-500" /> Quiz
        </p>
        {isDraft && !quiz && (
          <div className="flex items-center gap-2">
            <button onClick={handleCreateQuiz} disabled={creating}
              className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Criar quiz
            </button>
            <button onClick={() => setShowAiModal(true)} disabled={generatingQuiz}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 rounded-lg transition-colors">
              {generatingQuiz ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Gerar com IA
            </button>
          </div>
        )}
      </div>

      {/* AI Quiz Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-slide-up">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> Gerar Quiz com IA
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantas perguntas?</label>
                <input type="number" min={3} max={20} value={aiNumQuestions} onChange={e => setAiNumQuestions(Number(e.target.value))}
                  className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nível de dificuldade</label>
                <select value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value)} className="input-field w-full">
                  <option value="facil">Fácil</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="dificil">Difícil</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orientação para a IA</label>
                <textarea value={aiOrientation} onChange={e => setAiOrientation(e.target.value)}
                  placeholder="Descreva o foco das perguntas ou cole perguntas que deseja melhorar..."
                  rows={4} className="input-field w-full resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAiModal(false)} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
              <button onClick={handleGenerateQuiz} className="btn-primary text-sm px-4 py-2 flex items-center gap-1">
                <Sparkles className="w-4 h-4" /> Gerar
              </button>
            </div>
          </div>
        </div>
      )}

      {!quiz ? (
        <p className="text-sm text-gray-400">Nenhum quiz configurado.</p>
      ) : (
        <div className="space-y-3">
          {/* Quiz settings */}
          {isDraft && (
            <div className="p-3 bg-indigo-50/50 rounded-xl space-y-3">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-600">Nota minima:</label>
                  <select
                    className="input-field text-xs py-1 px-2"
                    value={passingScore}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value)
                      setPassingScore(v)
                      handleUpdatePassingScore(v)
                    }}
                    disabled={savingQuiz}
                  >
                    {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(v => (
                      <option key={v} value={v}>{Math.round(v * 100)}%</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={quizRequired}
                    onChange={(e) => handleToggleRequired(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                  <span className="text-xs text-gray-600">Obrigatorio para avancar</span>
                </label>
              </div>
            </div>
          )}

          {/* Read-only quiz info */}
          {!isDraft && (
            <div className="p-3 bg-gray-50 rounded-xl text-sm text-gray-600">
              {quiz.title} · {quiz.questions?.length || 0} perguntas · Nota minima: {Math.round(quiz.passing_score * 100)}%
            </div>
          )}

          {/* Questions list */}
          <div className="space-y-2">
            {(quiz.questions || [])
              .sort((a, b) => a.order - b.order)
              .map((q, idx) => (
                <div key={q.id}>
                  {editingQuestion === q.id && isDraft ? (
                    <QuestionForm
                      initial={questionToFormData(q)}
                      onSave={(data) => handleUpdateQuestion(q.id, data)}
                      onCancel={() => setEditingQuestion(null)}
                      index={idx}
                    />
                  ) : (
                    <QuestionCard
                      question={q}
                      index={idx}
                      isDraft={isDraft}
                      onEdit={() => setEditingQuestion(q.id)}
                      onDelete={() => handleDeleteQuestion(q.id)}
                    />
                  )}
                </div>
              ))}
          </div>

          {/* Add question form */}
          {isDraft && addingQuestion && (
            <QuestionForm
              initial={emptyQuestion}
              onSave={handleAddQuestion}
              onCancel={() => setAddingQuestion(false)}
              index={(quiz.questions?.length || 0)}
            />
          )}

          {/* Add question buttons */}
          {isDraft && !addingQuestion && (
            <div className="flex items-center gap-2">
              <button onClick={() => setAddingQuestion(true)}
                className="flex-1 p-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-1.5">
                <Plus className="w-4 h-4" /> Adicionar pergunta
              </button>
              <button onClick={handleGenerateQuiz} disabled={generatingQuiz}
                className="p-3 border-2 border-dashed border-violet-200 rounded-xl text-sm text-violet-500 hover:border-violet-300 hover:text-violet-600 transition-colors flex items-center justify-center gap-1.5">
                {generatingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Gerar com IA
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Question Card (read-only) ──
function QuestionCard({ question: q, index, isDraft, onEdit, onDelete }: {
  question: QuizQuestion; index: number; isDraft: boolean
  onEdit: () => void; onDelete: () => void
}) {
  const typeLabel = q.type === 'multiple_choice' ? 'Multipla escolha' : q.type === 'true_false' ? 'V ou F' : 'Dissertativa'

  return (
    <div className="p-3 border border-gray-200 rounded-xl group">
      <div className="flex items-start gap-2">
        <span className="text-xs font-bold text-gray-400 mt-0.5 shrink-0">{index + 1}.</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-900">{q.text}</p>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className="badge-pill bg-gray-100 text-gray-500 text-xs">{typeLabel}</span>
            <span className="text-xs text-gray-400 flex items-center gap-0.5">
              <Star className="w-3 h-3" /> Peso: {q.weight}
            </span>
            {q.correct_answer && (
              <span className="text-xs text-emerald-600">Resp: {q.correct_answer}</span>
            )}
          </div>
          {(q.type === 'multiple_choice' || q.type === 'true_false') && q.options && (
            <div className="mt-2 space-y-1">
              {q.options.map((opt, i) => {
                const letter = String.fromCharCode(65 + i)
                const isCorrect = q.correct_answer?.toUpperCase() === letter
                return (
                  <div key={i} className={clsx(
                    'text-xs px-2 py-1 rounded',
                    isCorrect ? 'bg-emerald-50 text-emerald-700 font-medium' : 'text-gray-500'
                  )}>
                    {letter}. {opt.text}
                    {isCorrect && <CheckCircle2 className="w-3 h-3 inline ml-1" />}
                  </div>
                )
              })}
            </div>
          )}
          {q.explanation && (
            <p className="text-xs text-gray-400 mt-1 italic">Explicacao: {q.explanation}</p>
          )}
        </div>
        {isDraft && (
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={onEdit} className="p-1 text-gray-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Question Form (create/edit) ──
function QuestionForm({ initial, onSave, onCancel, index }: {
  initial: QuestionFormData; onSave: (data: QuestionFormData) => void; onCancel: () => void; index: number
}) {
  const [form, setForm] = useState<QuestionFormData>(initial)
  const [saving, setSaving] = useState(false)

  const update = (patch: Partial<QuestionFormData>) => setForm(f => ({ ...f, ...patch }))

  const handleSubmit = async () => {
    if (!form.text.trim()) return
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="p-4 border-2 border-indigo-200 rounded-xl bg-indigo-50/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-indigo-700">Pergunta {index + 1}</span>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      {/* Question text */}
      <textarea
        className="input-field w-full text-sm"
        rows={2}
        placeholder="Texto da pergunta..."
        value={form.text}
        onChange={(e) => update({ text: e.target.value })}
      />

      {/* Type + Weight row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Tipo</label>
          <select className="input-field w-full text-sm" value={form.type}
            onChange={(e) => {
              const type = e.target.value as QuizQuestionType
              update({
                type,
                correct_answer: '',
                options: type === 'multiple_choice'
                  ? [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
                  : type === 'true_false'
                    ? [{ text: 'Verdadeiro' }, { text: 'Falso' }]
                    : [],
              })
            }}>
            <option value="multiple_choice">Multipla escolha</option>
            <option value="true_false">Verdadeiro ou Falso</option>
            <option value="essay">Dissertativa</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Peso</label>
          <input type="number" className="input-field w-full text-sm" value={form.weight} min={0.1} step={0.1}
            onChange={(e) => update({ weight: parseFloat(e.target.value) || 1 })} />
        </div>
        {form.type === 'true_false' && (
          <div>
            <label className="text-xs text-gray-500 block mb-1">Resposta correta</label>
            <select className="input-field w-full text-sm" value={form.correct_answer}
              onChange={(e) => update({ correct_answer: e.target.value })}>
              <option value="">Selecionar...</option>
              <option value="A">Verdadeiro</option>
              <option value="B">Falso</option>
            </select>
          </div>
        )}
      </div>

      {/* Multiple choice options */}
      {form.type === 'multiple_choice' && (
        <div className="space-y-2">
          <label className="text-xs text-gray-500">Opcoes (marque a correta):</label>
          {form.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i)
            const isCorrect = form.correct_answer === letter
            return (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => update({ correct_answer: letter })}
                  className={clsx(
                    'w-7 h-7 rounded-lg text-xs font-bold flex items-center justify-center border-2 transition-colors shrink-0',
                    isCorrect ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-200 text-gray-400 hover:border-emerald-300'
                  )}
                >
                  {letter}
                </button>
                <input
                  type="text"
                  className="input-field flex-1 text-sm"
                  placeholder={`Opcao ${letter}...`}
                  value={opt.text}
                  onChange={(e) => {
                    const newOptions = [...form.options]
                    newOptions[i] = { text: e.target.value }
                    update({ options: newOptions })
                  }}
                />
                {form.options.length > 2 && (
                  <button onClick={() => {
                    const newOptions = form.options.filter((_, j) => j !== i)
                    const newCorrect = form.correct_answer === letter ? '' : form.correct_answer
                    update({ options: newOptions, correct_answer: newCorrect })
                  }} className="text-gray-300 hover:text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            )
          })}
          {form.options.length < 6 && (
            <button onClick={() => update({ options: [...form.options, { text: '' }] })}
              className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1 mt-1">
              <Plus className="w-3 h-3" /> Adicionar opcao
            </button>
          )}
        </div>
      )}

      {/* Explanation */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Explicacao (exibida apos resposta)</label>
        <input type="text" className="input-field w-full text-sm" placeholder="Opcional..."
          value={form.explanation} onChange={(e) => update({ explanation: e.target.value })} />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 pt-1">
        <button onClick={onCancel} className="btn-secondary text-xs px-3 py-1.5">Cancelar</button>
        <button onClick={handleSubmit} disabled={!form.text.trim() || saving}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1">
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
          Salvar
        </button>
      </div>
    </div>
  )
}

// ── Training Final Quiz Section ──
function FinalQuizSection({ trainingId, training, isDraft, onReload, onError }: {
  trainingId: string; training: Training; isDraft: boolean; onReload: () => void; onError: (msg: string) => void
}) {
  const [quiz, setQuiz] = useState<TrainingQuiz | null>(training.final_quiz || null)
  const [creating, setCreating] = useState(false)
  const [generatingQuiz, setGeneratingQuiz] = useState(false)
  const [showAiModal, setShowAiModal] = useState(false)
  const [aiNumQuestions, setAiNumQuestions] = useState(5)
  const [aiDifficulty, setAiDifficulty] = useState('intermediario')
  const [aiOrientation, setAiOrientation] = useState('')
  const [addingQuestion, setAddingQuestion] = useState(false)
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null)
  const [savingQuiz, setSavingQuiz] = useState(false)
  const [passingScore, setPassingScore] = useState(quiz?.passing_score ?? 0.7)
  const [maxAttempts, setMaxAttempts] = useState(quiz?.max_attempts ?? 3)

  useEffect(() => {
    setQuiz(training.final_quiz || null)
    setPassingScore(training.final_quiz?.passing_score ?? 0.7)
    setMaxAttempts(training.final_quiz?.max_attempts ?? 3)
  }, [training])

  const loadQuiz = async () => {
    const q = await api.getTrainingQuiz(trainingId)
    setQuiz(q)
    onReload()
  }

  const handleCreate = async () => {
    setCreating(true)
    try {
      await api.createTrainingQuiz(trainingId)
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao criar avaliação') }
    finally { setCreating(false) }
  }

  const handleDelete = async () => {
    if (!confirm('Remover a avaliação final e todas as perguntas?')) return
    try {
      await api.deleteTrainingQuiz(trainingId)
      setQuiz(null)
      onReload()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao remover avaliação') }
  }

  const handleGenerate = async () => {
    setGeneratingQuiz(true)
    setShowAiModal(false)
    try {
      await api.generateTrainingQuiz(trainingId, {
        num_questions: aiNumQuestions,
        difficulty: aiDifficulty,
        orientation: aiOrientation || undefined,
      })
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao gerar avaliação com IA') }
    finally { setGeneratingQuiz(false) }
  }

  const handleUpdateSettings = async (updates: { passing_score?: number; max_attempts?: number }) => {
    setSavingQuiz(true)
    try {
      await api.updateTrainingQuiz(trainingId, updates)
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao atualizar avaliação') }
    finally { setSavingQuiz(false) }
  }

  const handleAddQuestion = async (data: QuestionFormData) => {
    try {
      await api.addTrainingQuizQuestion(trainingId, {
        text: data.text, type: data.type,
        options: data.type === 'multiple_choice' ? data.options.filter(o => o.text.trim()) : undefined,
        correct_answer: data.correct_answer || undefined,
        explanation: data.explanation || undefined,
        weight: data.weight,
      })
      setAddingQuestion(false)
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao adicionar pergunta') }
  }

  const handleUpdateQuestion = async (questionId: string, data: QuestionFormData) => {
    try {
      await api.updateTrainingQuizQuestion(trainingId, questionId, {
        text: data.text, type: data.type,
        options: data.type === 'multiple_choice' ? data.options.filter(o => o.text.trim()) : undefined,
        correct_answer: data.correct_answer || undefined,
        explanation: data.explanation || undefined,
        weight: data.weight,
      })
      setEditingQuestion(null)
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao atualizar pergunta') }
  }

  const handleDeleteQuestion = async (questionId: string) => {
    if (!confirm('Remover esta pergunta?')) return
    try {
      await api.deleteTrainingQuizQuestion(trainingId, questionId)
      await loadQuiz()
    } catch (err) { onError(err instanceof Error ? err.message : 'Erro ao remover pergunta') }
  }

  return (
    <div className="card p-6 border-2 border-dashed border-violet-200 bg-violet-50/30">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-violet-600" />
          Avaliação Final do Treinamento
        </h3>
        {isDraft && !quiz && (
          <div className="flex items-center gap-2">
            <button onClick={handleCreate} disabled={creating}
              className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              Criar avaliação
            </button>
            <button onClick={() => setShowAiModal(true)} disabled={generatingQuiz}
              className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-violet-600 bg-violet-100 hover:bg-violet-200 rounded-lg transition-colors">
              {generatingQuiz ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Gerar com IA
            </button>
          </div>
        )}
      </div>

      {!quiz ? (
        <p className="text-sm text-gray-500">
          Adicione uma avaliação final para que os profissionais sejam avaliados após concluir todos os módulos.
          A nota influencia diretamente o XP recebido.
        </p>
      ) : (
        <div className="space-y-4">
          {/* Settings */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nota mínima (%)</label>
              <select value={passingScore} disabled={!isDraft || savingQuiz}
                onChange={e => { const v = Number(e.target.value); setPassingScore(v); handleUpdateSettings({ passing_score: v }) }}
                className="input-field w-full text-sm">
                {[0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(v => (
                  <option key={v} value={v}>{Math.round(v * 100)}%</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Máx. tentativas</label>
              <select value={maxAttempts} disabled={!isDraft || savingQuiz}
                onChange={e => { const v = Number(e.target.value); setMaxAttempts(v); handleUpdateSettings({ max_attempts: v }) }}
                className="input-field w-full text-sm">
                <option value={0}>Ilimitado</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
                <option value={5}>5</option>
              </select>
            </div>
            <div className="flex items-end">
              {isDraft && (
                <button onClick={handleDelete} className="text-red-500 hover:text-red-700 text-xs flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Remover avaliação
                </button>
              )}
            </div>
          </div>

          {/* Questions */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">{quiz.questions?.length || 0} perguntas</p>
            {quiz.questions?.map((q, i) => (
              <div key={q.id} className="bg-white rounded-xl p-4 border border-gray-100">
                {editingQuestion === q.id ? (
                  <QuestionForm initial={tqToFormData(q)} onSave={(d) => handleUpdateQuestion(q.id, d)} onCancel={() => setEditingQuestion(null)} index={i} />
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800">{i + 1}. {q.text}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {q.type === 'multiple_choice' ? 'Múltipla escolha' : q.type === 'true_false' ? 'V/F' : 'Dissertativa'}
                        {q.correct_answer && ` · Resp: ${q.correct_answer}`}
                      </p>
                    </div>
                    {isDraft && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setEditingQuestion(q.id)} className="p-1 text-gray-400 hover:text-indigo-600"><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDeleteQuestion(q.id)} className="p-1 text-gray-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add question */}
          {isDraft && (
            addingQuestion ? (
              <QuestionForm initial={emptyQuestion} onSave={handleAddQuestion} onCancel={() => setAddingQuestion(false)} index={(quiz.questions?.length || 0)} />
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setAddingQuestion(true)} className="btn-secondary text-xs px-3 py-1 flex items-center gap-1">
                  <Plus className="w-3 h-3" /> Adicionar pergunta
                </button>
                <button onClick={() => setShowAiModal(true)} disabled={generatingQuiz}
                  className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-violet-600 bg-violet-100 hover:bg-violet-200 rounded-lg transition-colors">
                  {generatingQuiz ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  Gerar com IA
                </button>
              </div>
            )
          )}
        </div>
      )}

      {/* AI Generation Modal */}
      {showAiModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6 animate-slide-up">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> Gerar Avaliação Final com IA
            </h3>
            <p className="text-sm text-gray-500 mb-4">A IA considerará o conteúdo de todos os módulos.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quantas perguntas?</label>
                <input type="number" min={3} max={20} value={aiNumQuestions} onChange={e => setAiNumQuestions(Number(e.target.value))}
                  className="input-field w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nível de dificuldade</label>
                <select value={aiDifficulty} onChange={e => setAiDifficulty(e.target.value)} className="input-field w-full">
                  <option value="facil">Fácil</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="dificil">Difícil</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orientação para a IA</label>
                <textarea value={aiOrientation} onChange={e => setAiOrientation(e.target.value)}
                  placeholder="Descreva o foco das perguntas ou cole perguntas que deseja melhorar..."
                  rows={4} className="input-field w-full resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowAiModal(false)} className="btn-secondary text-sm px-4 py-2">Cancelar</button>
              <button onClick={handleGenerate} className="btn-primary text-sm px-4 py-2 flex items-center gap-1">
                <Sparkles className="w-4 h-4" /> Gerar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function tqToFormData(q: TrainingQuizQuestion): QuestionFormData {
  let options: { text: string }[]
  if (q.options && q.options.length > 0) {
    options = q.options.map(o => ({ text: o.text }))
  } else if (q.type === 'true_false') {
    options = [{ text: 'Verdadeiro' }, { text: 'Falso' }]
  } else {
    options = [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
  }
  return { text: q.text, type: q.type, options, correct_answer: q.correct_answer || '', explanation: q.explanation || '', weight: q.weight }
}

// ── Helpers ──
function questionToFormData(q: QuizQuestion): QuestionFormData {
  let options: { text: string }[]
  if (q.options && q.options.length > 0) {
    options = q.options.map(o => ({ text: o.text }))
  } else if (q.type === 'true_false') {
    options = [{ text: 'Verdadeiro' }, { text: 'Falso' }]
  } else {
    options = [{ text: '' }, { text: '' }, { text: '' }, { text: '' }]
  }
  return {
    text: q.text,
    type: q.type,
    options,
    correct_answer: q.correct_answer || '',
    explanation: q.explanation || '',
    weight: q.weight,
  }
}
