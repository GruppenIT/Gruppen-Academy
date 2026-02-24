'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'
import { api } from './api'
import type { User } from '@/types'

interface AuthContextType {
  user: User | null
  loading: boolean
  /** Configured idle timeout in minutes (0 = disabled). */
  idleTimeoutMinutes: number
  login: (email: string, password: string) => Promise<void>
  loginWithToken: (token?: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  idleTimeoutMinutes: 15,
  login: async () => {},
  loginWithToken: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [idleTimeoutMinutes, setIdleTimeoutMinutes] = useState(15)

  useEffect(() => {
    const init = async () => {
      // With HttpOnly cookies, we always try to fetch the user.
      try {
        const me = await api.getMe()
        api.setAuthenticated(true)
        setUser(me)
      } catch {
        // No valid session — login guard handles redirect
      }
      // Fetch session config (idle timeout) — best-effort
      try {
        const info = await api.getSessionInfo()
        if (info.idle_timeout_minutes > 0) {
          setIdleTimeoutMinutes(info.idle_timeout_minutes)
        }
      } catch {
        // Use default
      }
      setLoading(false)
    }
    init()
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
    <AuthContext.Provider value={{ user, loading, idleTimeoutMinutes, login, loginWithToken, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
