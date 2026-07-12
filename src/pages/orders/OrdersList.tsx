import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

type OrderStatus = 'quote' | 'pending_payment' | 'ready' | 'in_production' | 'completed' | 'cancelled'

interface Order {
  id: string
  order_number: number | null
  status: OrderStatus
  is_quote: boolean
  customer_name_snapshot: string
  phone_snapshot: string
  final_total: number
  items_total: number
  created_at: string
  agent_id: string
  profiles?: { full_name: string }
  payments?: { amount: number }[]
}

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'all', label: 'כל ההזמנות', statuses: [] },
  { key: 'quote', label: 'הצעות מחיר', statuses: ['quote'] },
  { key: 'pending', label: 'ממתין לגבייה', statuses: ['pending_payment'] },
  { key: 'ready', label: 'חדש לביצוע', statuses: ['ready'] },
  { key: 'production', label: 'בייצור', statuses: ['in_production'] },
  { key: 'completed', label: 'הושלמו', statuses: ['completed'] },
]

const STATUS_LABELS: Record<OrderStatus, string> = {
  quote: 'הצעת מחיר',
  pending_payment: 'ממתין לגבייה',
  ready: 'חדש לביצוע',
  in_production: 'בייצור',
  completed: 'הושלם',
  cancelled: 'מבוטל',
}

const STATUS_COLORS: Record<OrderStatus, string> = {
  quote: 'bg-slate-100 text-slate-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700',
  in_production: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export default function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select('*, profiles(full_name), payments(amount)')
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const tab = TABS.find(t => t.key === activeTab)!
  const filtered = orders.filter(o => {
    if (tab.statuses.length && !tab.statuses.includes(o.status)) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        o.customer_name_snapshot?.toLowerCase().includes(q) ||
        o.phone_snapshot?.includes(q) ||
        String(o.order_number).includes(q)
      )
    }
    return true
  })

  const paidAmount = (o: Order) =>
    (o.payments ?? []).reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <Link to="/orders/new" className="btn-primary">+ הזמנה חדשה</Link>
      </div>

      <input className="input mb-4" placeholder="חיפוש לפי שם לקוח, טלפון או מספר..."
             value={search} onChange={e => setSearch(e.target.value)} />

      {/* טאבי סטטוס */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {TABS.map(t => (
          <button key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-brand text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
            {t.label}
            <span className="mr-1 text-xs opacity-70">
              ({orders.filter(o => !t.statuses.length || t.statuses.includes(o.status)).length})
            </span>
          </button>
        ))}
      </div>

      {loading && <div className="text-slate-500">טוען הזמנות...</div>}

      {!loading && filtered.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          {orders.length === 0
            ? 'אין עדיין הזמנות. צרו הזמנה ראשונה!'
            : 'לא נמצאו הזמנות בטאב זה.'}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map(o => {
          const paid = paidAmount(o)
          const remaining = o.final_total - paid
          return (
            <Link key={o.id} to={`/orders/${o.id}`}
                  className="card p-4 block hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-base">{o.customer_name_snapshot}</div>
                  <div className="text-sm text-slate-500">{o.phone_snapshot}</div>
                  {o.profiles?.full_name && (
                    <div className="text-xs text-slate-400">סוכן: {o.profiles.full_name}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[o.status]}`}>
                    {STATUS_LABELS[o.status]}
                  </span>
                  {o.order_number && (
                    <span className="text-xs text-slate-400">#{o.order_number}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-3 text-sm">
                <div>
                  <span className="text-slate-500">סה״כ: </span>
                  <span className="font-semibold">₪{o.final_total.toLocaleString()}</span>
                </div>
                {paid > 0 && (
                  <div>
                    <span className="text-slate-500">שולם: </span>
                    <span className="text-green-700 font-medium">₪{paid.toLocaleString()}</span>
                  </div>
                )}
                {remaining > 0 && (
                  <div>
                    <span className="text-slate-500">נשאר: </span>
                    <span className="text-amber-700 font-medium">₪{remaining.toLocaleString()}</span>
                  </div>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1">
                {new Date(o.created_at).toLocaleDateString('he-IL')}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
