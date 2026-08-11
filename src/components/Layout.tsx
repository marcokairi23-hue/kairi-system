import { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../lib/auth'

const navItems = [
  { to: '/', label: 'ראשי', end: true },
  { to: '/orders', label: 'הזמנות' },
  { to: '/items', label: 'פריטים' },
  { to: '/fabrics', label: 'בדים' },
  { to: '/activity', label: 'יומן פעילות' },
]

export default function Layout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth()
  const items = profile?.role === 'admin'
    ? [...navItems, { to: '/users', label: 'משתמשים' }, { to: '/settings', label: 'הגדרות' }]
    : navItems

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand text-white shadow-md sticky top-0 z-20">
        <div className="mx-auto max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl px-4 h-14 flex items-center gap-3">
          <span className="font-extrabold text-base tracking-tight shrink-0">קאירי</span>
          {/* min-w-0 מאפשר ל-flex child להתכווץ מתחת לרוחב התוכן שלו, כדי שה-
              overflow-x-auto יפעל בתוך ה-nav במקום לדחוף את כל העמוד לגלילה אופקית
              (קרה בפועל במסך אייפון — 390px לא מספיק לכל פריטי הניווט בשורה אחת) */}
          <nav className="flex items-center gap-0.5 overflow-x-auto min-w-0 flex-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {items.map((item) => (
              <NavLink
                key={item.to} to={item.to} end={item.end}
                className={({ isActive }) =>
                  'shrink-0 px-2.5 py-1.5 rounded-md text-sm font-medium transition-colors ' +
                  (isActive ? 'bg-white/20' : 'hover:bg-white/10')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm shrink-0">
            <span className="hidden sm:inline text-white/80 text-xs">{profile?.full_name}</span>
            <button onClick={signOut} className="rounded-md px-2 py-1.5 hover:bg-white/10 text-xs">
              יציאה
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl px-4 py-5">{children}</main>
    </div>
  )
}
