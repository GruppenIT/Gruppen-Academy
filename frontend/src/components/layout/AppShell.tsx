'use client'

import { useAuth } from '@/lib/auth'
import { useIdleTimeout } from '@/lib/useIdleTimeout'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import Sidebar from './Sidebar'
import { Loader2, Clock } from 'lucide-react'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading, idleTimeoutMinutes, logout } = useAuth()
  const router = useRouter()

  const handleIdle = useCallback(() => {
    logout()
  }, [logout])

  const { showWarning, remainingSeconds, dismiss } = useIdleTimeout({
    timeoutMinutes: user ? idleTimeoutMinutes : 0,
    warningMinutes: 2,
    onIdle: handleIdle,
  })

  useEffect(() => {
    if (!loading && !user) router.push('/login')
  }, [loading, user, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-brand-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  const formatRemaining = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return m > 0 ? `${m}m ${sec.toString().padStart(2, '0')}s` : `${sec}s`
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-64 p-8">
        {children}
      </main>

      {/* Idle timeout warning */}
      {showWarning && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-900">
              Sessão expirando
            </h3>
            <p className="text-sm text-gray-600">
              Sua sessão será encerrada por inatividade em{' '}
              <span className="font-bold text-amber-600">
                {formatRemaining(remainingSeconds)}
              </span>.
            </p>
            <button
              onClick={dismiss}
              className="btn-primary w-full py-2.5"
            >
              Continuar conectado
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
