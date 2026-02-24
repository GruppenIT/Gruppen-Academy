'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Loader2, AlertCircle, GraduationCap } from 'lucide-react'

function LoadingSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 bg-brand-100 rounded-xl flex items-center justify-center mx-auto">
          <GraduationCap className="w-6 h-6 text-brand-600" />
        </div>
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Autenticando...</span>
        </div>
      </div>
    </div>
  )
}

function SSOCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { loginWithToken } = useAuth()
  const [error, setError] = useState('')

  useEffect(() => {
    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const errorParam = searchParams.get('error')
    const errorDesc = searchParams.get('error_description')

    if (errorParam) {
      setError(errorDesc || `Erro do Azure AD: ${errorParam}`)
      return
    }

    if (!code || !state) {
      setError('Parâmetros de autenticação ausentes. Tente novamente.')
      return
    }

    // Validate state matches what we stored
    const savedState = sessionStorage.getItem('sso_state')
    if (savedState && savedState !== state) {
      setError('Estado de autenticação inválido. Tente novamente.')
      return
    }
    sessionStorage.removeItem('sso_state')

    api.ssoCallback(code, state)
      .then(async () => {
        // Cookie is set by the backend response; just refresh user state
        await loginWithToken()
        router.replace('/dashboard')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Falha na autenticação SSO.')
      })
  }, [searchParams, router, loginWithToken])

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900 mb-2">Falha na autenticação</h1>
            <p className="text-sm text-gray-600">{error}</p>
          </div>
          <button
            onClick={() => router.replace('/login')}
            className="btn-primary mx-auto px-6"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    )
  }

  return <LoadingSpinner />
}

export default function SSOCallbackPage() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <SSOCallbackContent />
    </Suspense>
  )
}
