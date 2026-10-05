import { useEffect, useState } from 'react'
import { CircleCheck, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmt } from '../../lib/statusHelpers'

interface CollectionPayment {
  id: string
  amount: number
  method: string | null
  received_by: string | null
  paid_at: string
  collection_status: 'at_agent' | 'received_office'
  office_received_by: string | null
  office_received_at: string | null
  orders: {
    order_number: number | null
    customer_name_snapshot: string
    is_quote: boolean
    payment_route: string | null
    payment_approved: boolean | null
    payment_approved_by: string | null
    payment_approved_at: string | null
  }
}

const METHODS: Record<string, string> = { cash: 'מזומן', check: 'צ׳ק' }
const dateLabel = (value: string | null) => value ? new Date(value).toLocaleString('he-IL') : '—'

export default function Collections() {
  const { profile } = useAuth()
  const canConfirm = profile?.role === 'office' || profile?.role === 'admin'
  const [payments, setPayments] = useState<CollectionPayment[]>([])
  const [names, setNames] = useState<Record<string, string>>({})
  const [tab, setTab] = useState('at_agent')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('payments')
      .select('id, amount, method, received_by, paid_at, collection_status, office_received_by, office_received_at, orders!inner(order_number, customer_name_snapshot, is_quote, payment_route, payment_approved, payment_approved_by, payment_approved_at)')
      .in('orders.payment_route', ['cash', 'check']).eq('orders.payment_approved', true)
      .eq('orders.is_quote', false).order('paid_at', { ascending: false })
    if (loadError) {
      setError('שגיאה בטעינת הגבייה: ' + loadError.message)
      setLoading(false)
      return
    }
    // Identify actual agent-approved cash/check receipts, not other payments on the order.
    const rows = ((data ?? []) as unknown as CollectionPayment[]).filter(p =>
      p.orders && !p.orders.is_quote && p.orders.payment_approved === true &&
      ['cash', 'check'].includes(p.orders.payment_route ?? '') &&
      p.method === p.orders.payment_route && p.amount > 0 &&
      !!p.orders.payment_approved_by && !!p.orders.payment_approved_at &&
      p.received_by === p.orders.payment_approved_by &&
      new Date(p.paid_at).getTime() === new Date(p.orders.payment_approved_at).getTime())
    setPayments(rows)
    const ids = [...new Set(rows.flatMap(p => [p.orders.payment_approved_by, p.office_received_by]).filter((id): id is string => !!id))]
    if (ids.length) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', ids)
      setNames(Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name])))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const visible = payments.filter(p => tab === 'all' || p.collection_status === tab)
  const eligible = visible.filter(p => p.collection_status === 'at_agent')
  const allSelected = eligible.length > 0 && eligible.every(p => selected.has(p.id))
  const toggle = (id: string) => {
    if (!canConfirm || busy || !eligible.some(p => p.id === id)) return
    setSelected(previous => {
      const next = new Set(previous)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const confirm = async () => {
    if (!canConfirm || !profile?.id || busy || selected.size === 0) return
    const ids = [...selected]
    if (!ids.every(id => eligible.some(p => p.id === id))) return
    setBusy(true); setError(null)
    try {
      const { data, error: updateError } = await supabase.from('payments').update({
        collection_status: 'received_office', office_received_by: profile.id,
        office_received_at: new Date().toISOString(),
      }).in('id', ids).eq('collection_status', 'at_agent').select('id')
      if (updateError) throw updateError
      setSelected(new Set())
      await load()
      if ((data ?? []).length !== ids.length) setError('חלק מהתקבולים כבר עודכנו או שאינם זמינים לאישור. הרשימה רועננה.')
    } catch (err) {
      setError('שגיאה באישור הקבלה: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 flex items-center gap-2"><Wallet size={24} aria-hidden="true" /> גבייה</h1>
      <div className="flex flex-wrap gap-2 mb-4">
        {[['at_agent', 'אצל הסוכן'], ['received_office', 'התקבל במשרד'], ['all', 'הכל']].map(([value, label]) => (
          <button key={value} disabled={busy} onClick={() => { setTab(value); setSelected(new Set()) }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === value ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      {error && <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>}
      {canConfirm && <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" disabled={busy || !eligible.length} checked={allSelected}
          onChange={() => setSelected(allSelected ? new Set() : new Set(eligible.map(p => p.id)))} /> בחר הכל המוצג</label>
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => setSelected(new Set())}>נקה בחירה</button>
        <button className="btn-primary text-sm" disabled={busy || !selected.size} onClick={confirm}>
          <CircleCheck size={16} className="inline-block me-1" aria-hidden="true" /> {busy ? 'מאשר...' : `אשר קבלה מהסוכן (${selected.size})`}
        </button>
      </div>}
      {loading ? <p className="text-slate-500">טוען...</p> : visible.length === 0 ? <div className="card p-6 text-center text-slate-500">אין תקבולים להצגה</div> : (
        <div className="space-y-3">{visible.map(p => <div key={p.id} className="card p-4">
          <div className="flex items-center gap-3 mb-2">
            {canConfirm && <input type="checkbox" checked={selected.has(p.id)} disabled={busy || p.collection_status !== 'at_agent'}
              aria-label={`בחר תקבול להזמנה ${p.orders.order_number ?? 'טיוטה'}`} onChange={() => toggle(p.id)} />}
            <span className="font-bold">הזמנה #{p.orders.order_number ?? 'טיוטה'} — {p.orders.customer_name_snapshot}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <span>סוכן: {names[p.orders.payment_approved_by ?? ''] ?? p.orders.payment_approved_by ?? '—'}</span>
            <span>{METHODS[p.method ?? '']} · {fmt(p.amount)}</span>
            <span>מצב: <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.collection_status === 'at_agent' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>{p.collection_status === 'at_agent' ? 'אצל הסוכן' : 'התקבל במשרד'}</span></span>
            <span>אישור הסוכן: {dateLabel(p.orders.payment_approved_at)}</span>
            <span>אישור המשרד: {dateLabel(p.office_received_at)}</span>
            <span>מאשר במשרד: {names[p.office_received_by ?? ''] ?? p.office_received_by ?? '—'}</span>
          </div>
        </div>)}</div>
      )}
    </div>
  )
}
