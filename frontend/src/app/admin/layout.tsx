'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'
import AppShell from '@/components/layout/AppShell'
import { clsx } from 'clsx'
import {
  Users, Package, Brain, Route, BookOpen, Award, BarChart3, Settings,
} from 'lucide-react'

const adminTabs = [
  { href: '/admin', label: 'Usuarios', icon: Users },
  { href: '/admin/produtos', label: 'Produtos', icon: Package },
  { href: '/admin/competencias', label: 'Competencias', icon: Brain },
  { href: '/admin/jornadas', label: 'Jornadas', icon: Route },
  { href: '/admin/trilhas', label: 'Trilhas', icon: BookOpen },
  { href: '/admin/gamificacao', label: 'Gamificacao', icon: Award },
  { href: '/admin/relatorios', label: 'Relatorios', icon: BarChart3 },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user && !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      router.push('/dashboard')
    }
  }, [loading, user, router])

  if (loading || !user || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
    return null
  }

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-brand-600" />
            Administracao
          </h1>
          <p className="text-gray-500 mt-1">Gerencie a plataforma Gruppen Academy.</p>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {adminTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = pathname === tab.href ||
              (tab.href !== '/admin' && pathname.startsWith(tab.href))
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={clsx(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 whitespace-nowrap transition-colors',
                  isActive
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>

      {children}
    </AppShell>
  )
}
