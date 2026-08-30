import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { ActivityRow, ActivityRowLine, fetchActivity } from './activity/ActivityLog'
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, calcProgress, fmt } from '../lib/statusHelpers'
import { useFeature } from '../lib/featureFlags'

const STATUS_CARDS: { tab: string; status: string }[] = [
  { tab: 'quote', status: 'quote' },
  { tab: 'pending', status: 'pending_payment' },
  { tab: 'ready', status: 'ready' },
  { tab: 'production', status: 'in_production' },
  { tab: 'installable', status: 'ready_for_install' },
  { tab: 'completed', status: 'completed' },
]

const DEFAULT_STUCK_DAYS = 7

interface DashOrder {
  id: string
  order_number: number | null
  status: string
  customer_name_snapshot: string
  final_total: number
  created_at: string
  order_items?: Array<{ item_status: string; for_execution: boolean }>
  payments?: Array<{ amount: number }>
}

export default function Dashboard() {
  const { profile } = useAuth()
  const canEditThreshold = profile?.role === 'admin'

  // hooks נקראים כאן בסדר קבוע (7 המפתחות הקבועים תחת dashboard) — לא בתוך .map/.filter
  const showBalance = useFeature('balance')
  const showStatusCards = useFeature('statusCards')
  const showNewOrderBtn = useFeature('newOrderBtn')
  const showStuck = useFeature('stuck')
  const showInProduction = useFeature('inProduction')
  const showRecentActivity = useFeature('recentActivity')
  const showShortcuts = useFeature('shortcuts')

  const [orders, setOrders] = useState<DashOrder[]>([])
  const [lastChange, setLastChange] = useState<Map<string, string>>(new Map())
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [stuckDays, setStuckDays] = useState(DEFAULT_STUCK_DAYS)
  const [stuckDaysInput, setStuckDaysInput] = useState(String(DEFAULT_STUCK_DAYS))

  useEffect(() => {
    const load = async () => {
      const [ordersRes, historyRes, settingsRes, activityRows] = await Promise.all([
        supabase.from('orders').select('id, order_number, status, customer_name_snapshot, final_total, created_at, order_items(item_status, for_execution), payments(amount)'),
        supabase.from('order_status_history').select('order_id, changed_at').order('changed_at', { ascending: false }),
        supabase.from('settings').select('value').eq('key', 'stuck_order_days').maybeSingle(),
        fetchActivity({ perSourceLimit: 10 }),
      ])

      setOrders((ordersRes.data ?? []) as DashOrder[])

      const map = new Map<string, string>()
      for (const h of historyRes.data ?? []) {
        if (!map.has(h.order_id)) map.set(h.order_id, h.changed_at)
      }
      setLastChange(map)

      const days = typeof settingsRes.data?.value === 'number' ? settingsRes.data.value : DEFAULT_STUCK_DAYS
      setStuckDays(days)
      setStuckDaysInput(String(days))

      setActivity(activityRows.slice(0, 10))
      setLoading(false)
    }
    load()
  }, [])

  const saveStuckDays = async () => {
    const n = parseInt(stuckDaysInput, 10)
    if (isNaN(n) || n <= 0) { setStuckDaysInput(String(stuckDays)); return }
    setStuckDays(n)
    await supabase.from('settings').upsert({ key: 'stuck_order_days', value: n, updated_at: new Date().toISOString() })
  }

  const activeOrders = orders.filter(o => o.status !== 'completed' && o.status !== 'cancelled')

  const openBalance = activeOrders.reduce((sum, o) => {
    const paid = (o.payments ?? []).reduce((s, p) => s + p.amount, 0)
    return sum + Math.max(0, o.final_total - paid)
  }, 0)

  const countByStatus = (status: string) => orders.filter(o => o.status === status).length

  const inProduction = orders
    .filter(o => o.status === 'in_production' || o.status === 'ready_for_install')

  const stuckMs = stuckDays * 86400000
  const now = Date.now()
  const stuckOrders = activeOrders
    .map(o => ({ order: o, since: lastChange.get(o.id) ?? o.created_at }))
    .filter(x => now - new Date(x.since).getTime() > stuckMs)
    .sort((a, b) => a.since.localeCompare(b.since))

  if (loading) return <p className="text-slate-400 text-sm">טוען…</p>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">שלום, {profile?.full_name}</h1>
      <p className="text-slate-500 mb-6">מה עושים היום?</p>

      {/* יתרות + סטטוסים */}
      {showBalance && (
        <Link to="/orders?tab=balance" className="card p-4 mb-3 block hover:shadow-md transition-shadow">
          <div className="text-xs font-bold text-slate-500 mb-1">יתרות פתוחות לגבייה</div>
          <div className="text-2xl font-bold text-brand">{fmt(openBalance)}</div>
        </Link>
      )}

      {showStatusCards && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
          {STATUS_CARDS.map(c => (
            <Link key={c.tab} to={`/orders?tab=${c.tab}`} className="card p-3 hover:shadow-md transition-shadow">
              <div className="text-xl font-bold">{countByStatus(c.status)}</div>
              <div className="text-xs text-slate-500">{ORDER_STATUS_LABELS[c.status]}</div>
            </Link>
          ))}
        </div>
      )}

      {/* שלושת פאנלי המעקב — מוערמים בנייד, זה-לצד-זה מ-lg ומעלה */}
      {(showStuck || showInProduction || showRecentActivity) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-3">
          {/* הזמנות תקועות */}
          {showStuck && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-bold text-slate-500">הזמנות תקועות</div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span>סף:</span>
                  {canEditThreshold ? (
                    <input
                      type="number"
                      className="input w-14 py-1 text-xs"
                      value={stuckDaysInput}
                      onChange={e => setStuckDaysInput(e.target.value)}
                      onBlur={saveStuckDays}
                    />
                  ) : (
                    <span className="font-medium">{stuckDays}</span>
                  )}
                  <span>ימים</span>
                </div>
              </div>
              {stuckOrders.length === 0 && <p className="text-slate-400 text-sm">אין הזמנות תקועות</p>}
              {stuckOrders.map(({ order, since }) => (
                <Link key={order.id} to={`/orders/${order.id}`}
                      className="flex items-center justify-between py-1.5 text-sm border-b border-slate-100 last:border-0">
                  <span>#{order.order_number} {order.customer_name_snapshot}</span>
                  <span className="text-amber-700 text-xs">
                    {Math.floor((now - new Date(since).getTime()) / 86400000)} ימים ללא שינוי
                  </span>
                </Link>
              ))}
            </div>
          )}

          {/* בייצור עכשיו */}
          {showInProduction && (
            <div className="card p-4">
              <div className="text-xs font-bold text-slate-500 mb-2">בייצור עכשיו</div>
              {inProduction.length === 0 && <p className="text-slate-400 text-sm">אין הזמנות בייצור כרגע</p>}
              {inProduction.map(o => {
                const prog = calcProgress(o.order_items)
                return (
                  <Link key={o.id} to={`/orders/${o.id}`} className="block py-2 border-b border-slate-100 last:border-0">
                    <div className="flex items-center justify-between text-sm">
                      <span>#{o.order_number} {o.customer_name_snapshot}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ORDER_STATUS_COLORS[o.status] ?? 'bg-slate-100'}`}>
                        {ORDER_STATUS_LABELS[o.status]}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{prog.label}</div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* פעילות אחרונה */}
          {showRecentActivity && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-bold text-slate-500">פעילות אחרונה</div>
                <Link to="/activity" className="text-xs text-brand">כל הפעילות</Link>
              </div>
              {activity.length === 0 && <p className="text-slate-400 text-sm">אין פעילות</p>}
              {activity.map(row => <ActivityRowLine key={`${row.source}-${row.id}`} row={row} />)}
            </div>
          )}
        </div>
      )}

      {/* קיצורי דרך */}
      {(showNewOrderBtn || showShortcuts) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {showNewOrderBtn && (
            <Link to="/orders/new" className="card p-5 hover:shadow-md transition-shadow
                                              border-2 border-brand">
              <div className="text-lg font-bold text-brand">+ הזמנה חדשה</div>
              <div className="text-sm text-slate-500 mt-1">
                מילוי טופס הזמנה בשטח
              </div>
            </Link>
          )}

          {showShortcuts && (
            <>
              <Link to="/orders" className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-lg font-bold">הזמנות</div>
                <div className="text-sm text-slate-500 mt-1">
                  רשימה, סטטוסים, תשלומים ומעקב
                </div>
              </Link>

              <Link to="/items" className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-lg font-bold">פריטים</div>
                <div className="text-sm text-slate-500 mt-1">
                  מעקב ייצור לפי פריט — גזירה, תפירה, מוכן
                </div>
              </Link>

              <Link to="/fabrics" className="card p-5 hover:shadow-md transition-shadow">
                <div className="text-lg font-bold">קטלוג בדים</div>
                <div className="text-sm text-slate-500 mt-1">
                  חיפוש בדים, מחירים ותמונות
                </div>
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
