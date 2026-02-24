'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AppShell from '@/components/layout/AppShell'
import { api } from '@/lib/api'
import type { UserParticipationSummary } from '@/types'
import { clsx } from 'clsx'
import {
  ClipboardList, ChevronRight, CheckCircle2, Clock,
  Loader2, FileText, BarChart3,
} from 'lucide-react'

export default function ResultadosPage() {
  const router = useRouter()
  const [participations, setParticipations] = useState<UserParticipationSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getMyParticipations()
        setParticipations(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar resultados')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function scoreColor(score: number | null) {
    if (score === null) return 'text-gray-400'
    if (score >= 7) return 'text-emerald-600'
    if (score >= 5) return 'text-amber-600'
    return 'text-red-600'
  }

  function scoreBg(score: number | null) {
    if (score === null) return 'bg-gray-100'
    if (score >= 7) return 'bg-emerald-50'
    if (score >= 5) return 'bg-amber-50'
    return 'bg-red-50'
  }

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-brand-600" />
          Meus Resultados
        </h1>
        <p className="text-gray-500 mt-1">Veja o historico das suas jornadas e avaliacoes.</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
        </div>
      ) : participations.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
          <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 text-lg font-medium">Nenhuma jornada concluida ainda</p>
          <p className="text-gray-400 text-sm mt-1">Participe de uma jornada para ver seus resultados aqui.</p>
          <button
            onClick={() => router.push('/jornadas')}
            className="btn-primary mt-4"
          >
            Ver Jornadas Disponiveis
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {participations.map(p => (
            <div
              key={p.participation_id}
              className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push(`/resultados/${p.participation_id}`)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Score Circle */}
                  <div className={clsx(
                    'w-14 h-14 rounded-full flex items-center justify-center',
                    scoreBg(p.avg_score),
                  )}>
                    {p.avg_score !== null ? (
                      <span className={clsx('text-lg font-bold', scoreColor(p.avg_score))}>
                        {p.avg_score.toFixed(1)}
                      </span>
                    ) : (
                      <Clock className="w-5 h-5 text-gray-400" />
                    )}
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900">{p.journey_title}</h3>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span className="capitalize">{p.journey_domain}</span>
                      <span>
                        {p.started_at ? new Date(p.started_at).toLocaleDateString('pt-BR') : '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        {p.completed_at
                          ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Concluida</>
                          : <><Clock className="w-3 h-3 text-amber-500" /> Em andamento</>}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  {/* Progress indicators */}
                  <div className="text-right text-xs">
                    <div className="text-gray-500">
                      {p.evaluated_count}/{p.total_responses} avaliadas
                    </div>
                    {p.report_id && (
                      <div className="flex items-center gap-1 text-brand-600 mt-1">
                        <FileText className="w-3 h-3" /> Relatorio disponivel
                      </div>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}
