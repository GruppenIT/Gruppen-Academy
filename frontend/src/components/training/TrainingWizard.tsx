'use client'

import { useState, useRef, useCallback } from 'react'
import { api } from '@/lib/api'
import {
  X, ChevronRight, ChevronLeft, Loader2, Sparkles,
  Users, FileText, Upload, FileArchive, Wand2,
  BookOpen, Plus, Trash2, GripVertical, Check,
  AlertCircle, Lightbulb,
} from 'lucide-react'

// ── Types ──

type Audience = 'vendas' | 'suporte' | 'cs' | 'lideranca' | 'geral'
type Level = 'iniciante' | 'intermediario' | 'avancado'
type ContentSource = 'scorm' | 'material' | 'ai'
type ChapterMode = 'single' | 'manual' | 'ai'

interface WizardChapter {
  title: string
  description: string
}

interface WizardState {
  // Step 1 – Audience
  title: string
  description: string
  audience: Audience
  level: Level
  // Step 2 – Content source
  contentSource: ContentSource | null
  scormFile: File | null
  materialFile: File | null
  // Step 3 – Chapters
  chapterMode: ChapterMode | null
  orientation: string
  chapters: WizardChapter[]
  aiSuggestionLoaded: boolean
  aiRationale: string
  // Computed
  estimatedDuration: number
  xpReward: number
}

const initialState: WizardState = {
  title: '',
  description: '',
  audience: 'vendas',
  level: 'intermediario',
  contentSource: null,
  scormFile: null,
  materialFile: null,
  chapterMode: null,
  orientation: '',
  chapters: [],
  aiSuggestionLoaded: false,
  aiRationale: '',
  estimatedDuration: 60,
  xpReward: 100,
}

const AUDIENCE_OPTIONS: { value: Audience; label: string; icon: string; desc: string }[] = [
  { value: 'vendas', label: 'Vendas', icon: '💼', desc: 'Time comercial e vendas consultivas' },
  { value: 'suporte', label: 'Suporte', icon: '🛠️', desc: 'Suporte técnico e atendimento' },
  { value: 'cs', label: 'Customer Success', icon: '🤝', desc: 'Sucesso do cliente e retenção' },
  { value: 'lideranca', label: 'Liderança', icon: '🎯', desc: 'Gestão de pessoas e liderança' },
  { value: 'geral', label: 'Geral', icon: '📚', desc: 'Conteúdo para toda a empresa' },
]

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'iniciante', label: 'Iniciante' },
  { value: 'intermediario', label: 'Intermediário' },
  { value: 'avancado', label: 'Avançado' },
]

// ── Component ──

export default function TrainingWizard({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<WizardState>(initialState)
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scormInputRef = useRef<HTMLInputElement>(null)

  const update = useCallback((patch: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...patch }))
  }, [])

  // ── Step calculations ──

  const totalSteps = state.contentSource === 'scorm' ? 2 : 4
  const stepLabels = state.contentSource === 'scorm'
    ? ['Público-alvo', 'Importar SCORM']
    : ['Público-alvo', 'Fonte do conteúdo', 'Capítulos', 'Revisão']

  const canAdvance = (): boolean => {
    if (step === 1) return state.title.trim().length > 0
    if (step === 2) {
      if (state.contentSource === 'scorm') return state.scormFile !== null
      return state.contentSource !== null
    }
    if (step === 3) {
      if (state.chapterMode === 'single') return true
      if (state.chapterMode === 'manual') return state.chapters.length > 0 && state.chapters.every((c) => c.title.trim().length > 0)
      if (state.chapterMode === 'ai') return state.aiSuggestionLoaded && state.chapters.length > 0
      return false
    }
    return true
  }

  // ── AI suggest structure ──

  const suggestStructure = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await api.wizardSuggestStructure({
        title: state.title || undefined,
        description: state.description || undefined,
        domain: state.audience,
        participant_level: state.level,
        orientation: state.orientation || undefined,
        reference_file: state.materialFile || undefined,
      })
      update({
        chapters: result.chapters.map((c) => ({
          title: c.title,
          description: c.description || '',
        })),
        estimatedDuration: result.total_estimated_duration_minutes || 60,
        aiSuggestionLoaded: true,
        aiRationale: result.rationale || '',
        title: state.title || result.suggested_title || state.title,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar sugestão')
    } finally {
      setLoading(false)
    }
  }

  // ── Final create ──

  const handleCreate = async () => {
    setLoading(true)
    setError('')
    try {
      if (state.contentSource === 'scorm' && state.scormFile) {
        const t = await api.importScormTraining(state.scormFile, {
          title: state.title || undefined,
          description: state.description || undefined,
          domain: state.audience,
          participant_level: state.level,
          estimated_duration_minutes: state.estimatedDuration,
          xp_reward: state.xpReward,
        })
        window.location.href = `/admin/treinamentos/${t.id}`
        return
      }

      const chapters = state.chapterMode === 'single'
        ? [{ title: state.title, description: state.description || undefined }]
        : state.chapters.map((c) => ({
            title: c.title,
            description: c.description || undefined,
          }))

      const t = await api.wizardCreateTraining({
        title: state.title,
        description: state.description || undefined,
        domain: state.audience,
        participant_level: state.level,
        estimated_duration_minutes: state.estimatedDuration,
        xp_reward: state.xpReward,
        chapters,
      })
      window.location.href = `/admin/treinamentos/${t.id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar treinamento')
      setLoading(false)
    }
  }

  const handleNext = () => {
    setError('')
    if (step === totalSteps) {
      handleCreate()
      return
    }
    // If SCORM selected on step 2, go to create
    if (step === 2 && state.contentSource === 'scorm') {
      handleCreate()
      return
    }
    setStep((s) => s + 1)
  }

  const handleBack = () => {
    setError('')
    if (step === 1) { onClose(); return }
    // If going back from step 3 with AI suggestions, reset them
    if (step === 3) {
      update({ chapterMode: null, aiSuggestionLoaded: false, chapters: [], aiRationale: '' })
    }
    setStep((s) => s - 1)
  }

  // ── Chapter management ──

  const addChapter = () => {
    update({ chapters: [...state.chapters, { title: '', description: '' }] })
  }

  const removeChapter = (idx: number) => {
    update({ chapters: state.chapters.filter((_, i) => i !== idx) })
  }

  const updateChapter = (idx: number, patch: Partial<WizardChapter>) => {
    const updated = state.chapters.map((c, i) => (i === idx ? { ...c, ...patch } : c))
    update({ chapters: updated })
  }

  // ── Render ──

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
              <Wand2 className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900">Magic Wizard</h3>
              <p className="text-xs text-gray-500">Criação guiada de treinamento</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="px-5 pt-4">
          <div className="flex items-center gap-1 mb-2">
            {stepLabels.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className="flex items-center gap-2 flex-1">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      i + 1 < step
                        ? 'bg-emerald-500 text-white'
                        : i + 1 === step
                        ? 'bg-brand-600 text-white shadow-lg shadow-brand-600/30'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {i + 1 < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${
                    i + 1 <= step ? 'text-gray-700' : 'text-gray-400'
                  }`}>
                    {label}
                  </span>
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`h-0.5 flex-1 mx-2 rounded-full transition-all ${
                    i + 1 < step ? 'bg-emerald-400' : 'bg-gray-100'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm mb-4 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && <StepAudience state={state} update={update} />}
          {step === 2 && (
            <StepContentSource
              state={state}
              update={update}
              fileInputRef={fileInputRef}
              scormInputRef={scormInputRef}
            />
          )}
          {step === 3 && (
            <StepChapters
              state={state}
              update={update}
              loading={loading}
              onSuggest={suggestStructure}
              addChapter={addChapter}
              removeChapter={removeChapter}
              updateChapter={updateChapter}
            />
          )}
          {step === 4 && <StepReview state={state} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-100">
          <button onClick={handleBack} className="btn-secondary flex items-center gap-2 px-4 py-2">
            <ChevronLeft className="w-4 h-4" />
            {step === 1 ? 'Cancelar' : 'Voltar'}
          </button>
          <button
            onClick={handleNext}
            disabled={!canAdvance() || loading}
            className="btn-primary flex items-center gap-2 px-5 py-2.5"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : step === totalSteps || (step === 2 && state.contentSource === 'scorm') ? (
              <Sparkles className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            {loading
              ? 'Processando...'
              : step === totalSteps || (step === 2 && state.contentSource === 'scorm')
              ? 'Criar Treinamento'
              : 'Continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}


// ── Step 1: Audience ──

function StepAudience({
  state,
  update,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">Título do treinamento</h4>
        <input
          type="text"
          className="input-field w-full"
          placeholder="Ex.: Fundamentos de BaaS para Vendas"
          value={state.title}
          onChange={(e) => update({ title: e.target.value })}
          autoFocus
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">
          Descrição <span className="text-xs text-gray-400 font-normal">(opcional)</span>
        </h4>
        <textarea
          className="input-field w-full"
          rows={2}
          placeholder="Breve descrição do objetivo do treinamento..."
          value={state.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Público-alvo</h4>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {AUDIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ audience: opt.value })}
              className={`p-3 rounded-xl border-2 text-left transition-all ${
                state.audience === opt.value
                  ? 'border-brand-500 bg-brand-50 shadow-sm'
                  : 'border-gray-100 hover:border-gray-200 bg-white'
              }`}
            >
              <span className="text-lg">{opt.icon}</span>
              <p className={`text-sm font-medium mt-1 ${
                state.audience === opt.value ? 'text-brand-700' : 'text-gray-900'
              }`}>
                {opt.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 leading-snug">{opt.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-2">Nível dos participantes</h4>
        <div className="flex gap-2">
          {LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => update({ level: opt.value })}
              className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium border-2 transition-all ${
                state.level === opt.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-100 text-gray-600 hover:border-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}


// ── Step 2: Content Source ──

function StepContentSource({
  state,
  update,
  fileInputRef,
  scormInputRef,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  scormInputRef: React.RefObject<HTMLInputElement>
}) {
  const [dragOver, setDragOver] = useState(false)

  const handleScormDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f && (f.name.endsWith('.zip') || f.type.includes('zip'))) {
      update({ scormFile: f, contentSource: 'scorm' })
    }
  }

  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-900">Você já tem conteúdo pronto?</h4>
      <p className="text-xs text-gray-500 -mt-2">Escolha a opção que melhor descreve sua situação.</p>

      {/* SCORM option */}
      <button
        onClick={() => update({ contentSource: 'scorm', materialFile: null })}
        className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4 ${
          state.contentSource === 'scorm'
            ? 'border-emerald-500 bg-emerald-50/50'
            : 'border-gray-100 hover:border-gray-200'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          state.contentSource === 'scorm' ? 'bg-emerald-100' : 'bg-gray-100'
        }`}>
          <FileArchive className={`w-5 h-5 ${state.contentSource === 'scorm' ? 'text-emerald-600' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Tenho um pacote SCORM (.zip)</p>
          <p className="text-xs text-gray-500 mt-0.5">Já possuo conteúdo pronto em formato SCORM 1.2 ou 2004</p>
        </div>
      </button>

      {/* SCORM upload zone */}
      {state.contentSource === 'scorm' && (
        <div
          className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${
            dragOver ? 'border-emerald-400 bg-emerald-50' : state.scormFile ? 'border-emerald-300 bg-emerald-50/50' : 'border-gray-200 hover:border-gray-300'
          }`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleScormDrop}
          onClick={() => scormInputRef.current?.click()}
        >
          {state.scormFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileArchive className="w-6 h-6 text-emerald-500" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{state.scormFile.name}</p>
                <p className="text-xs text-gray-500">{(state.scormFile.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); update({ scormFile: null }) }}
                className="p-1 text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-600">Arraste o arquivo .zip ou clique para selecionar</p>
            </>
          )}
          <input
            ref={scormInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) update({ scormFile: f })
              e.target.value = ''
            }}
          />
        </div>
      )}

      {/* Material option */}
      <button
        onClick={() => update({ contentSource: 'material', scormFile: null })}
        className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4 ${
          state.contentSource === 'material'
            ? 'border-blue-500 bg-blue-50/50'
            : 'border-gray-100 hover:border-gray-200'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          state.contentSource === 'material' ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          <FileText className={`w-5 h-5 ${state.contentSource === 'material' ? 'text-blue-600' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Tenho materiais (PDF, PPTX, etc.)</p>
          <p className="text-xs text-gray-500 mt-0.5">Já tenho documentos que servem de base para o conteúdo</p>
        </div>
      </button>

      {/* Material upload */}
      {state.contentSource === 'material' && (
        <div className="pl-14">
          <div
            className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer border-gray-200 hover:border-blue-300 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {state.materialFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-5 h-5 text-blue-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900">{state.materialFile.name}</p>
                  <p className="text-xs text-gray-500">{(state.materialFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); update({ materialFile: null }) }}
                  className="p-1 text-gray-400 hover:text-red-500"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="w-5 h-5 text-gray-300 mx-auto mb-1" />
                <p className="text-xs text-gray-500">Clique para anexar PDF, PPTX, DOCX, TXT</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) update({ materialFile: f })
                e.target.value = ''
              }}
            />
          </div>
        </div>
      )}

      {/* AI from scratch option */}
      <button
        onClick={() => update({ contentSource: 'ai', scormFile: null, materialFile: null })}
        className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-4 ${
          state.contentSource === 'ai'
            ? 'border-violet-500 bg-violet-50/50'
            : 'border-gray-100 hover:border-gray-200'
        }`}
      >
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          state.contentSource === 'ai' ? 'bg-violet-100' : 'bg-gray-100'
        }`}>
          <Sparkles className={`w-5 h-5 ${state.contentSource === 'ai' ? 'text-violet-600' : 'text-gray-400'}`} />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">Quero criar do zero com IA</p>
          <p className="text-xs text-gray-500 mt-0.5">A IA ajudará a estruturar e gerar o conteúdo</p>
        </div>
      </button>
    </div>
  )
}


// ── Step 3: Chapters ──

function StepChapters({
  state,
  update,
  loading,
  onSuggest,
  addChapter,
  removeChapter,
  updateChapter,
}: {
  state: WizardState
  update: (p: Partial<WizardState>) => void
  loading: boolean
  onSuggest: () => void
  addChapter: () => void
  removeChapter: (i: number) => void
  updateChapter: (i: number, p: Partial<WizardChapter>) => void
}) {
  // If no mode selected yet
  if (!state.chapterMode) {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900">Estrutura do treinamento</h4>
        <p className="text-xs text-gray-500 -mt-2">Como deseja organizar os capítulos?</p>

        <button
          onClick={() => update({ chapterMode: 'single', chapters: [] })}
          className="w-full p-4 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-left transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <BookOpen className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Capítulo único</p>
            <p className="text-xs text-gray-500 mt-0.5">O treinamento terá apenas um módulo de conteúdo</p>
          </div>
        </button>

        <button
          onClick={() => update({ chapterMode: 'manual', chapters: [{ title: '', description: '' }] })}
          className="w-full p-4 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-left transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Múltiplos capítulos - definir manualmente</p>
            <p className="text-xs text-gray-500 mt-0.5">Eu sei quais capítulos quero criar</p>
          </div>
        </button>

        <button
          onClick={() => update({ chapterMode: 'ai', chapters: [] })}
          className="w-full p-4 rounded-xl border-2 border-gray-100 hover:border-gray-200 text-left transition-all flex items-start gap-4"
        >
          <div className="w-10 h-10 rounded-lg bg-violet-50 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-violet-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">Múltiplos capítulos - sugerir com IA</p>
            <p className="text-xs text-gray-500 mt-0.5">Descreva o treinamento e a IA sugere a estrutura ideal</p>
          </div>
        </button>
      </div>
    )
  }

  // Single chapter: nothing else to configure
  if (state.chapterMode === 'single') {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-800">Capítulo único selecionado</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              O treinamento será criado com um módulo intitulado &quot;{state.title}&quot;.
              Você poderá adicionar mais módulos depois na tela de edição.
            </p>
          </div>
        </div>
        <button
          onClick={() => update({ chapterMode: null, chapters: [] })}
          className="text-sm text-brand-600 hover:text-brand-700 font-medium"
        >
          Alterar estrutura
        </button>
      </div>
    )
  }

  // AI suggestion mode
  if (state.chapterMode === 'ai') {
    return (
      <div className="space-y-4">
        <h4 className="text-sm font-semibold text-gray-900">Geração de capítulos com IA</h4>

        {!state.aiSuggestionLoaded && (
          <>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">
                Descreva o treinamento e o que deseja cobrir
              </label>
              <textarea
                className="input-field w-full"
                rows={4}
                placeholder="Ex.: Treinamento sobre BaaS (Backup como Serviço) para o time de vendas. Deve cobrir conceitos técnicos, diferenciais, objeções comuns e como posicionar o produto em reuniões com CTO/CIO..."
                value={state.orientation}
                onChange={(e) => update({ orientation: e.target.value })}
              />
            </div>

            {state.contentSource === 'material' && state.materialFile && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs">
                <FileText className="w-4 h-4" />
                <span>Arquivo de referência: <strong>{state.materialFile.name}</strong> (será usado como base)</span>
              </div>
            )}

            {!state.contentSource?.includes('material') && (
              <div className="text-xs text-gray-500 flex items-start gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>Quanto mais detalhes fornecer, melhor será a sugestão da IA.</span>
              </div>
            )}

            <button
              onClick={onSuggest}
              disabled={loading || (!state.orientation.trim() && !state.materialFile)}
              className="btn-primary flex items-center gap-2 w-full justify-center"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              {loading ? 'Gerando sugestão...' : 'Gerar estrutura com IA'}
            </button>
          </>
        )}

        {state.aiSuggestionLoaded && (
          <>
            {state.aiRationale && (
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-xs text-violet-700 flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.aiRationale}</span>
              </div>
            )}

            <ChapterList
              chapters={state.chapters}
              addChapter={addChapter}
              removeChapter={removeChapter}
              updateChapter={updateChapter}
            />

            <button
              onClick={() => update({ aiSuggestionLoaded: false, chapters: [], aiRationale: '' })}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Gerar novamente
            </button>
          </>
        )}

        <button
          onClick={() => update({ chapterMode: null, chapters: [], aiSuggestionLoaded: false, aiRationale: '' })}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Alterar modo de criação
        </button>
      </div>
    )
  }

  // Manual mode
  return (
    <div className="space-y-4">
      <h4 className="text-sm font-semibold text-gray-900">Defina os capítulos</h4>

      <ChapterList
        chapters={state.chapters}
        addChapter={addChapter}
        removeChapter={removeChapter}
        updateChapter={updateChapter}
      />

      <button
        onClick={() => update({ chapterMode: null, chapters: [] })}
        className="text-xs text-gray-400 hover:text-gray-600"
      >
        Alterar modo de criação
      </button>
    </div>
  )
}


// ── Chapter List (shared) ──

function ChapterList({
  chapters,
  addChapter,
  removeChapter,
  updateChapter,
}: {
  chapters: WizardChapter[]
  addChapter: () => void
  removeChapter: (i: number) => void
  updateChapter: (i: number, p: Partial<WizardChapter>) => void
}) {
  return (
    <div className="space-y-2">
      {chapters.map((ch, i) => (
        <div key={i} className="flex items-start gap-2 p-3 rounded-xl bg-gray-50 border border-gray-100">
          <div className="flex items-center gap-1 mt-2.5 shrink-0">
            <GripVertical className="w-4 h-4 text-gray-300" />
            <span className="text-xs font-bold text-gray-400 w-5">{i + 1}.</span>
          </div>
          <div className="flex-1 space-y-1.5">
            <input
              type="text"
              className="input-field w-full !py-2 text-sm"
              placeholder={`Título do capítulo ${i + 1}`}
              value={ch.title}
              onChange={(e) => updateChapter(i, { title: e.target.value })}
            />
            <input
              type="text"
              className="input-field w-full !py-1.5 text-xs !border-gray-100"
              placeholder="Descrição breve (opcional)"
              value={ch.description}
              onChange={(e) => updateChapter(i, { description: e.target.value })}
            />
          </div>
          {chapters.length > 1 && (
            <button
              onClick={() => removeChapter(i)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors mt-2"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
      <button
        onClick={addChapter}
        className="w-full p-2.5 rounded-xl border-2 border-dashed border-gray-200 text-sm text-gray-500 hover:border-brand-300 hover:text-brand-600 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Adicionar capítulo
      </button>
    </div>
  )
}


// ── Step 4: Review ──

function StepReview({ state }: { state: WizardState }) {
  const chapters = state.chapterMode === 'single'
    ? [{ title: state.title, description: state.description }]
    : state.chapters

  return (
    <div className="space-y-5">
      <h4 className="text-sm font-semibold text-gray-900">Revisão antes de criar</h4>

      <div className="space-y-3">
        {/* Training info */}
        <div className="p-4 rounded-xl bg-gray-50 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Título</span>
            <span className="text-sm font-semibold text-gray-900">{state.title}</span>
          </div>
          {state.description && (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Descrição</span>
              <span className="text-sm text-gray-700 text-right max-w-[60%]">{state.description}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Público</span>
            <span className="text-sm text-gray-700">
              {AUDIENCE_OPTIONS.find((o) => o.value === state.audience)?.label || state.audience}
              {' · '}
              {LEVEL_OPTIONS.find((o) => o.value === state.level)?.label || state.level}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Duração estimada</span>
            <span className="text-sm text-gray-700">{state.estimatedDuration} min</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">XP</span>
            <span className="text-sm text-gray-700">{state.xpReward} pontos</span>
          </div>
        </div>

        {/* Chapters */}
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            {chapters.length} {chapters.length === 1 ? 'capítulo' : 'capítulos'}
          </p>
          <div className="space-y-1.5">
            {chapters.map((ch, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-brand-600">{i + 1}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{ch.title}</p>
                  {ch.description && (
                    <p className="text-xs text-gray-500 truncate">{ch.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {state.contentSource === 'material' && state.materialFile && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-700 text-xs">
            <FileText className="w-4 h-4" />
            <span>Material de referência anexado: <strong>{state.materialFile.name}</strong></span>
          </div>
        )}

        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
          <Lightbulb className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            O treinamento será criado em <strong>rascunho</strong>. Você poderá editar o conteúdo de cada
            capítulo, adicionar quizzes e publicar quando estiver pronto.
          </span>
        </div>
      </div>
    </div>
  )
}
