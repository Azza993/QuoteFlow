import { NavLink, Link, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { BookOpen, FileText, LayoutDashboard, LogOut, Plus, Settings, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useData } from '@/hooks/use-data'
import { useAuth } from '@/hooks/use-auth'
import { Button } from './ui/button'

/** Screens where "New quote" is the obvious next thing to do. */
const OVERVIEW_PATHS = new Set(['/', '/quotes', '/customers', '/price-book'])

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/quotes', label: 'Quotes', icon: FileText, end: false },
  { to: '/customers', label: 'Customers', icon: Users, end: false },
  { to: '/price-book', label: 'Price book', icon: BookOpen, end: false },
  { to: '/settings', label: 'Settings', icon: Settings, end: false },
]

export function AppShell({ children }: { children: ReactNode }) {
  const { business, dueFollowUps } = useData()
  const { configured, signOut } = useAuth()
  const { pathname } = useLocation()

  const hideNewQuote = pathname.startsWith('/quotes/new') || pathname.startsWith('/scan')
  const showFloatingNewQuote = OVERVIEW_PATHS.has(pathname)

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/85 backdrop-blur print-hide">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">
              {initials(business.business_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-900">
                {business.business_name || 'QuoteFlow'}
              </span>
              <span className="block text-xs text-ink-500">QuoteFlow</span>
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-ink-100 text-ink-900'
                      : 'text-ink-500 hover:bg-ink-50 hover:text-ink-800',
                  )
                }
              >
                <Icon className="size-4" />
                {label}
                {to === '/' && dueFollowUps.length > 0 ? (
                  <span className="ml-0.5 rounded-full bg-amber-500 px-1.5 text-[0.65rem] font-bold text-white">
                    {dueFollowUps.length}
                  </span>
                ) : null}
              </NavLink>
            ))}
          </nav>

          {!hideNewQuote ? (
            <Button asChild className="ml-auto hidden md:inline-flex">
              <Link to="/quotes/new">
                <Plus /> New quote
              </Link>
            </Button>
          ) : null}

          {configured ? (
            <Button
              variant="ghost"
              size="icon"
              className={hideNewQuote ? 'ml-auto' : ''}
              title="Sign out"
              aria-label="Sign out"
              onClick={() => void signOut()}
            >
              <LogOut />
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-32 pt-6 md:pb-16">{children}</main>

      <MobileNav showNewQuote={showFloatingNewQuote} dueCount={dueFollowUps.length} />
    </div>
  )
}

function MobileNav({ showNewQuote, dueCount }: { showNewQuote: boolean; dueCount: number }) {
  return (
    <>
      {showNewQuote ? (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-30 flex justify-center px-4 md:hidden print-hide">
          <Button asChild size="lg" className="w-full max-w-sm shadow-raised">
            <Link to="/quotes/new">
              <Plus /> New quote
            </Link>
          </Button>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 backdrop-blur md:hidden print-hide">
        <div className="flex h-[4.5rem] items-stretch justify-around px-1 pb-[env(safe-area-inset-bottom)]">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative flex flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[0.7rem] font-medium transition-colors',
                  isActive ? 'text-brand-700' : 'text-ink-500',
                )
              }
            >
              <Icon className="size-5" />
              <span className="truncate">{label}</span>
              {to === '/' && dueCount > 0 ? (
                <span className="absolute right-3 top-2 size-2 rounded-full bg-amber-500" />
              ) : null}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'QF'
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}
