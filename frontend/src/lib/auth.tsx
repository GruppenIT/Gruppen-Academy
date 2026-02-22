'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { api } from './api'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithToken: (token?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {},
  loginWithToken: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // With HttpOnly cookies, we always try to fetch the user.
    // The cookie is sent automatically — no client-side token to check.
    api.getMe()
      .then((me) => {
        api.setAuthenticated(true)
        setUser(me)
      })
      .catch(() => {
        // No valid session — stay on current page (login guard handles redirect)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    await api.login(email, password)
    const me = await api.getMe()
    setUser(me)
  }

  const loginWithToken = useCallback(async (_token?: string) => {
    // With HttpOnly cookies the token is already stored by the browser.
    // We just need to fetch the user profile to update React state.
    api.setAuthenticated(true)
    const me = await api.getMe()
    setUser(me)
  }, [])

  const logout = () => {
    api.logout().finally(() => {
      setUser(null)
      window.location.href = '/login'
    })
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
