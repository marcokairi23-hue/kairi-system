import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { ORDER_STATUS_LABELS, ITEM_STATUS_LABELS } from '../../lib/statusHelpers'

const PAGE_SIZE = 50

export interface ActivityRow {
  id: string
  order_id: string
  order_item_id: string | null
  from_status: string | null
  to_status: string
  changed_at: string
  note: string | null
  profiles: { full_name: string } | null
  orders: { order_number: number | null } | null
  order_items: { location: string } | null
}

function describe(row: ActivityRow): string {
  if (row.order_item_id) {
    const loc = row.order_items?.location
    return `פריט${loc ? ` "${loc}"` : ''} → ${ITEM_STATUS_LABELS[row.to_status] ?? row.to_status}`
  }
  if (row.from_status) {
    return `סטטוס: ${ORDER_STATUS_LABELS[row.from_status] ?? row.from_status} → ${ORDER_STATUS_LABELS[row.to_status] ?? row.to_status}`
  }
  return row.note || `→ ${ORDER_STATUS_LABELS[row.to_status] ?? row.to_status}`
}

function dayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
}

export function ActivityRowLine({ row, showOrderNumber = true }: { row: ActivityRow; showOrderNumber?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm border-b border-slate-100 last:border-0">
      <span className="text-slate-400 w-12 shrink-0">{timeLabel(row.changed_at)}</span>
      <span className="w-24 shrink-0 font-medium">{row.profiles?.full_name ?? '—'}</span>
      <span className="flex-1">{describe(row)}</span>
      {showOrderNumber && row.orders?.order_number && (
        <Link to={`/orders/${row.order_id}`} className="text-brand shrink-0">
          #{row.orders.order_number}
        </Link>
      )}
    </div>
  )
}

export default function ActivityLog() {
  const [rows, setRows] = useState<ActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [users, setUsers] = useState<{ id: string; full_name: string }[]>([])
  const [userFilter, setUserFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'order' | 'item'>('all')

  useEffect(() => {
    supabase.from('profiles').select('id, full_name').then(({ data }) => setUsers(data ?? []))
  }, [])

  const load = async (offset: number) => {
    setLoading(true)
    let query = supabase
      .from('order_status_history')
      .select('*, profiles(full_name), orders(order_number), order_items(location)')
      .order('changed_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (userFilter) query = query.eq('changed_by', userFilter)
    if (typeFilter === 'order') query = query.is('order_item_id', null)
    if (typeFilter === 'item') query = query.not('order_item_id', 'is', null)

    const { data } = await query
    const page = (data ?? []) as unknown as ActivityRow[]
    if (offset === 0) setRows(page)
    else setRows(prev => [...prev, ...page])
    setHasMore(page.length === PAGE_SIZE)
    setLoading(false)
  }

  useEffect(() => { load(0) }, [userFilter, typeFilter])

  const grouped = rows.reduce<Record<string, ActivityRow[]>>((acc, row) => {
    const key = dayLabel(row.changed_at)
    acc[key] = acc[key] ?? []
    acc[key].push(row)
    return acc
  }, {})

  return (
    <div>
      <h1 className="text-lg font-bold mb-4">יומן פעילות</h1>

      <div className="flex gap-2 mb-4">
        <select className="input" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">כל המשתמשים</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <select className="input" value={typeFilter} onChange={e => setTypeFilter(e.target.value as any)}>
          <option value="all">הכל</option>
          <option value="order">הזמנות</option>
          <option value="item">פריטים</option>
        </select>
      </div>

      {loading && rows.length === 0 && <p className="text-slate-400 text-sm">טוען…</p>}
      {!loading && rows.length === 0 && <p className="text-slate-400 text-sm">אין פעילות</p>}

      {Object.entries(grouped).map(([day, dayRows]) => (
        <div key={day} className="card mb-3">
          <div className="text-xs text-slate-500 font-medium mb-1">{day}</div>
          {dayRows.map(row => <ActivityRowLine key={row.id} row={row} />)}
        </div>
      ))}

      {hasMore && (
        <button
          className="btn-ghost text-sm w-full"
          disabled={loading}
          onClick={() => load(rows.length)}
        >
          {loading ? 'טוען…' : 'טען עוד'}
        </button>
      )}
    </div>
  )
}
