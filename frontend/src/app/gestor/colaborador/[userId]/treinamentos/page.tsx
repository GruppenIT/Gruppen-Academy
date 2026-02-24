'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { UserEnrollmentSummary, EnrollmentStatus } from '@/types'
import { clsx } from 'clsx'
import {
  ArrowLeft, LibraryBig, Loader2, CheckCircle2,
  PlayCircle, Circle, RotateCcw, Clock,
} from 'lucide-react'

const statusConfig: Record<EnrollmentStatus, { label: string; cls: string; icon: typeof Circle }> = {
  pending: { label: 'Novo', cls: 'bg-blue-50 text-blue-600', icon: Circle },
  in_progress: { label: 'Em andamento', cls: 'bg-amber-50 text-amber-600', icon: PlayCircle },
  completed: { label: 'Concluido', cls: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2 },
}

export default function ColaboradorTreinamentosPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const userId = params.userId as string

  const [enrollments, setEnrollments] = useState<UserEnrollmentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [resetting, setResetting] = useState<string | null>(null)
  const [confirmReset, setConfirmReset] = useState<string | null>(null)
  const [success, setSuccess] = useState('')

  // Extract user name from first enrollment or URL
  const userName = enrollments.length > 0 ? null : null // will show after load

  useEffect(() => {
    if (!authLoading && user && !['manager', 'admin', 'super_admin'].includes(user.role)) {
      router.push('/dashboard')
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (!userId) return
    api.getUserEnrollments(userId)
      .then(setEnrollments)
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar treinamentos'))
      .finally(() => setLoading(false))
  }, [userId])

  const handleReset = async (enrollment: UserEnrollmentSummary) => {
    setResetting(enrollment.enrollment_id)
    setError('')
    try {
      await api.resetEnrollment(enrollment.training_id, enrollment.enrollment_id)
      setSuccess(`"${enrollment.training_title}" foi resetado. O colaborador pode refaze-lo.`)
      setConfirmReset(null)
      // Reload
      const updated = await api.getUserEnrollments(userId)
      setEnrollments(updated)
      setTimeout(() => setSuccess(''), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao resetar treinamento')
    } finally {
      setResetting(null)
    }
  }

  if (authLoading || !user || !['manager', 'admin', 'super_admin'].includes(user.role)) {
    return null
  }

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push('/gestor')}
          className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-3 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar ao dashboard
        </button>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <LibraryBig className="w-6 h-6 text-purple-600" />
          Treinamentos do Colaborador
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          Historico de treinamentos e opcao de refazer.
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">x</button>
        </div>
      )}

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl mb-4 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : enrollments.length === 0 ? (
        <div className="text-center py-16">
          <LibraryBig className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-600 mb-1">Nenhum treinamento encontrado</h3>
          <p className="text-sm text-gray-400">Este colaborador ainda nao foi inscrito em treinamentos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {enrollments.map((e) => {
            const st = statusConfig[e.status]
            const StatusIcon = st.icon
            const progress = e.total_modules > 0
              ? Math.round((e.completed_modules / e.total_modules) * 100)
              : 0

            return (
              <div key={e.enrollment_id} className="card p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{e.training_title}</h3>
                      <span className={clsx('badge-pill text-xs flex items-center gap-1', st.cls)}>
                        <StatusIcon className="w-3 h-3" />
                        {st.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                      <span className="badge-pill bg-gray-100 text-gray-500">{e.domain}</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        Inscrito em {new Date(e.enrolled_at).toLocaleDateString('pt-BR')}
                      </span>
                      {e.completed_at && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Concluido em {new Date(e.completed_at).toLocaleDateString('pt-BR')}
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="max-w-sm">
                      <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                        <span>{e.completed_modules}/{e.total_modules} modulos</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={clsx(
                            'h-full rounded-full transition-all duration-300',
                            e.status === 'completed' ? 'bg-emerald-500' : 'bg-brand-500'
                          )}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Reset button */}
                  <div className="ml-4 shrink-0">
                    {confirmReset === e.enrollment_id ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Confirmar?</span>
                        <button
                          onClick={() => handleReset(e)}
                          disabled={resetting === e.enrollment_id}
                          className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 flex items-center gap-1"
                        >
                          {resetting === e.enrollment_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCcw className="w-3 h-3" />
                          )}
                          Sim, refazer
                        </button>
                        <button
                          onClick={() => setConfirmReset(null)}
                          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmReset(e.enrollment_id)}
                        className="text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1 bg-brand-50 px-3 py-1.5 rounded-lg"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Refazer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AppShell>
  )
}
