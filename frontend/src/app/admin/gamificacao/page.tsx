'use client'

import { useEffect, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import type { Badge, User } from '@/types'
import {
  Plus, Search, X, Loader2, Award, Zap, Gift, Users,
} from 'lucide-react'

type ModalMode = 'create-badge' | 'award-badge' | 'add-points' | null

export default function AdminGamificacaoPage() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [modalMode, setModalMode] = useState<ModalMode>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Badge form
  const [bName, setBName] = useState('')
  const [bDesc, setBDesc] = useState('')
  const [bIcon, setBIcon] = useState('')
  const [bCriteria, setBCriteria] = useState('')
  const [bThreshold, setBThreshold] = useState<number | ''>('')

  // Award form
  const [awardBadgeId, setAwardBadgeId] = useState('')
  const [awardUserId, setAwardUserId] = useState('')

  // Points form
  const [ptUserId, setPtUserId] = useState('')
  const [ptPoints, setPtPoints] = useState(10)
  const [ptSource, setPtSource] = useState('manual')
  const [ptDesc, setPtDesc] = useState('')

  const load = useCallback(async () => {
    try {
      const [b, u] = await Promise.all([api.getBadges(), api.getUsers(0, 200)])
      setBadges(b); setUsers(u)
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openCreateBadge = () => {
    setBName(''); setBDesc(''); setBIcon(''); setBCriteria(''); setBThreshold('')
    setError(''); setSuccess(''); setModalMode('create-badge')
  }
  const openAwardBadge = () => {
    setAwardBadgeId(badges[0]?.id || ''); setAwardUserId(users[0]?.id || '')
    setError(''); setSuccess(''); setModalMode('award-badge')
  }
  const openAddPoints = () => {
    setPtUserId(users[0]?.id || ''); setPtPoints(10); setPtSource('manual'); setPtDesc('')
    setError(''); setSuccess(''); setModalMode('add-points')
  }

  const closeModal = () => { setModalMode(null); setError(''); setSuccess('') }

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true)
    try {
      if (modalMode === 'create-badge') {
        if (!bName || !bCriteria) { setError('Nome e criterio sao obrigatorios.'); setSaving(false); return }
        await api.createBadge({
          name: bName, description: bDesc, icon: bIcon || undefined,
          criteria: bCriteria, points_threshold: bThreshold === '' ? undefined : bThreshold,
        })
        closeModal(); load()
      } else if (modalMode === 'award-badge') {
        if (!awardBadgeId || !awardUserId) { setError('Selecione badge e usuario.'); setSaving(false); return }
        await api.awardBadge(awardBadgeId, awardUserId)
        setSuccess('Badge concedido com sucesso!')
      } else if (modalMode === 'add-points') {
        if (!ptUserId || !ptPoints) { setError('Selecione usuario e pontos.'); setSaving(false); return }
        await api.createScore({ user_id: ptUserId, points: ptPoints, source: ptSource, description: ptDesc || undefined })
        setSuccess('Pontos adicionados com sucesso!')
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Erro ao salvar') } finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Award className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-bold text-gray-900">Gamificacao</h2>
        </div>
        <div className="flex gap-2">
          <button onClick={openAddPoints} className="btn-secondary flex items-center gap-2 text-sm">
            <Zap className="w-4 h-4" /> Dar Pontos
          </button>
          <button onClick={openAwardBadge} className="btn-secondary flex items-center gap-2 text-sm">
            <Gift className="w-4 h-4" /> Conceder Badge
          </button>
          <button onClick={openCreateBadge} className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Novo Badge
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-brand-600 animate-spin" /></div>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4" /> Badges ({badges.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {badges.map((b) => (
              <div key={b.id} className="card p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-xl bg-gold-400/10 flex items-center justify-center text-2xl">
                    {b.icon || <Award className="w-6 h-6 text-gold-600" />}
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{b.name}</h4>
                    {b.points_threshold && (
                      <span className="badge-pill bg-gold-400/15 text-gold-600 text-xs flex items-center gap-1 w-fit">
                        <Zap className="w-3 h-3" /> {b.points_threshold} XP
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-gray-500 mb-2">{b.description}</p>
                <p className="text-xs text-gray-400">Criterio: {b.criteria}</p>
              </div>
            ))}
            {badges.length === 0 && (
              <div className="col-span-full text-center py-12 text-sm text-gray-400">Nenhum badge criado ainda.</div>
            )}
          </div>
        </>
      )}

      {/* Modal */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-slide-up">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">
                {modalMode === 'create-badge' ? 'Novo Badge' : modalMode === 'award-badge' ? 'Conceder Badge' : 'Adicionar Pontos'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 rounded-xl bg-red-50 text-red-700 text-sm">{error}</div>}
              {success && <div className="p-3 rounded-xl bg-emerald-50 text-emerald-700 text-sm">{success}</div>}

              {modalMode === 'create-badge' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Nome *</label>
                    <input type="text" className="input-field w-full" value={bName} onChange={(e) => setBName(e.target.value)} placeholder="Ex: Consultor BaaS" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                    <textarea className="input-field w-full h-20 resize-none" value={bDesc} onChange={(e) => setBDesc(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Icone (emoji)</label>
                      <input type="text" className="input-field w-full" value={bIcon} onChange={(e) => setBIcon(e.target.value)} placeholder="Ex: 🛡️" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">XP minimo</label>
                      <input type="number" className="input-field w-full" value={bThreshold} onChange={(e) => setBThreshold(e.target.value === '' ? '' : Number(e.target.value))} />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Criterio *</label>
                    <input type="text" className="input-field w-full" value={bCriteria} onChange={(e) => setBCriteria(e.target.value)} placeholder="Ex: Completar jornada BaaS com nota >= 80%" />
                  </div>
                </>
              ) : modalMode === 'award-badge' ? (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Badge</label>
                    <select className="input-field w-full" value={awardBadgeId} onChange={(e) => setAwardBadgeId(e.target.value)}>
                      {badges.map((b) => <option key={b.id} value={b.id}>{b.icon || '🏆'} {b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Usuario</label>
                    <select className="input-field w-full" value={awardUserId} onChange={(e) => setAwardUserId(e.target.value)}>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Usuario</label>
                    <select className="input-field w-full" value={ptUserId} onChange={(e) => setPtUserId(e.target.value)}>
                      {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>)}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Pontos</label>
                      <input type="number" className="input-field w-full" value={ptPoints} onChange={(e) => setPtPoints(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Origem</label>
                      <input type="text" className="input-field w-full" value={ptSource} onChange={(e) => setPtSource(e.target.value)} placeholder="manual" />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Descricao</label>
                    <input type="text" className="input-field w-full" value={ptDesc} onChange={(e) => setPtDesc(e.target.value)} placeholder="Ex: Bonus por desempenho" />
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button onClick={closeModal} className="btn-secondary px-4 py-2">Fechar</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center gap-2 px-4 py-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                {modalMode === 'create-badge' ? 'Criar Badge' : modalMode === 'award-badge' ? 'Conceder' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
