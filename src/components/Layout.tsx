import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/', label: 'ראשי', end: true },
  { to: '/orders', label: 'הזמנות' },
  { to: '/fabrics', label: 'בדים' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand text-white shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-extrabold text-base tracking-tight">קאירי</span>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to} to={item.to} end={item.end}
                  className={({ isActive }) =>
                    'px-3 py-1.5 rounded-md text-sm font-medium transition-colors ' +
                    (isActive ? 'bg-white/20' : 'hover:bg-white/10')
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden sm:inline text-white/80 text-xs">{profile?.full_name}</span>
            <button onClick={signOut} className="rounded-md px-2 py-1.5 hover:bg-white/10 text-xs">
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-5">{children}</main>
    </div>
  )
}
