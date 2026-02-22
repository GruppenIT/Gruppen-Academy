'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth'
import { clsx } from 'clsx'
import {
  LayoutDashboard, Route, BookOpen, MessageSquareMore,
  Trophy, User, Settings, LogOut, GraduationCap, Shield, ClipboardList, BarChart3, LibraryBig,
} from 'lucide-react'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: null },
  { href: '/jornadas', label: 'Jornadas', icon: Route, roles: null },
  { href: '/treinamentos', label: 'Treinamentos', icon: LibraryBig, roles: null },
  { href: '/resultados', label: 'Meus Resultados', icon: ClipboardList, roles: null },
  { href: '/trilhas', label: 'Trilhas', icon: BookOpen, roles: null },
  { href: '/tutor', label: 'Tutor IA', icon: MessageSquareMore, roles: null },
  { href: '/ranking', label: 'Ranking', icon: Trophy, roles: null },
  { href: '/perfil', label: 'Meu Perfil', icon: User, roles: null },
]

const adminItems = [
  { href: '/gestor', label: 'Gestor', icon: BarChart3, roles: ['manager', 'admin', 'super_admin'] },
  { href: '/admin', label: 'Admin', icon: Settings, roles: ['admin', 'super_admin'] },
]

export default function Sidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const allItems = [...navItems, ...adminItems].filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-64 bg-white border-r border-gray-100 flex flex-col z-30">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-600 rounded-xl flex items-center justify-center">
            <GraduationCap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-none">Gruppen</h1>
            <span className="text-xs text-brand-600 font-medium">Academy</span>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {allItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon className={clsx('w-5 h-5', isActive ? 'text-brand-600' : 'text-gray-400')} />
              {item.label}
              {item.href === '/ranking' && (
                <span className="ml-auto badge-pill bg-gold-400/20 text-gold-600">
                  <Trophy className="w-3 h-3" /> Top
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User + Security badge */}
      <div className="p-3 border-t border-gray-100">
        <div className="flex items-center gap-2 px-3 py-2 mb-2">
          <Shield className="w-4 h-4 text-emerald-500" />
          <span className="text-xs text-gray-500">Ambiente seguro</span>
        </div>
        {user && (
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-bold">
              {user.full_name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.full_name}</p>
              <p className="text-xs text-gray-500 truncate">{user.role}</p>
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-red-500 transition-colors" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
