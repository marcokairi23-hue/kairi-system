import { useEffect, useRef, useState } from 'react'
import { CircleCheck, Wallet } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { fmt } from '../../lib/statusHelpers'

interface CollectionPayment {
  id: string
  amount: number
  method: string | null
  payment_route: string | null
  payment_status: string
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
  const [agentFilter, setAgentFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [agents, setAgents] = useState<{ id: string; full_name: string }[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const confirming = useRef(false)

  const load = async () => {
    setLoading(true)
    const { data, error: loadError } = await supabase.from('payments')
      .select('id, amount, method, payment_route, payment_status, received_by, paid_at, collection_status, office_received_by, office_received_at, orders!inner(order_number, customer_name_snapshot, is_quote, payment_route, payment_approved, payment_approved_by, payment_approved_at)')
      .eq('payment_status', 'received').in('payment_route', ['cash', 'check'])
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
      p.payment_status === 'received' && ['cash', 'check'].includes(p.payment_route ?? '') &&
      (p.collection_status === 'at_agent' || p.collection_status === 'received_office') &&
      ['cash', 'check'].includes(p.orders.payment_route ?? '') &&
      p.method === p.orders.payment_route && p.payment_route === p.method && p.amount > 0 &&
      !!p.orders.payment_approved_by && !!p.orders.payment_approved_at &&
      p.received_by === p.orders.payment_approved_by &&
      new Date(p.paid_at).getTime() === new Date(p.orders.payment_approved_at).getTime())
    setPayments(rows)
    const { data: profiles, error: profilesError } = await supabase.from('profiles').select('id, full_name, role')
    if (profilesError) setError('שגיאה בטעינת הסוכנים: ' + profilesError.message)
    setNames(Object.fromEntries((profiles ?? []).map(p => [p.id, p.full_name])))
    const agentIds = new Set(rows.map(p => p.orders.payment_approved_by))
    setAgents((profiles ?? []).filter(p => p.role === 'sales' || agentIds.has(p.id))
      .map(p => ({ id: p.id, full_name: p.full_name })))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const visible = payments.filter(p =>
    (tab === 'all' || p.collection_status === tab) &&
    (agentFilter === 'all' || p.orders.payment_approved_by === agentFilter) &&
    (methodFilter === 'all' || p.payment_route === methodFilter))
  const eligible = visible.filter(p => p.collection_status === 'at_agent')
  const selectedPayments = eligible.filter(p => selected.has(p.id))
  const selectedTotal = selectedPayments.reduce((sum, p) => sum + Number(p.amount), 0)
  const selectedAgents = new Set(selectedPayments.map(p => p.orders.payment_approved_by))
  // A single UPDATE persists one shared receipt timestamp for the entire group.
  // Group by agent and office confirmer too, so unrelated deliveries stay separate.
  const receiptGroups = new Map<string, CollectionPayment[]>()
  for (const payment of payments) {
    if (payment.collection_status !== 'received_office' || !payment.office_received_by || !payment.office_received_at) continue
    const key = JSON.stringify([payment.orders.payment_approved_by, payment.office_received_by, payment.office_received_at])
    receiptGroups.set(key, [...(receiptGroups.get(key) ?? []), payment])
  }
  const visibleIds = new Set(visible.map(p => p.id))
  const visibleGroups = [...receiptGroups.entries()].filter(([, group]) => group.some(p => visibleIds.has(p.id)))
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
    if (!canConfirm || !profile?.id || busy || confirming.current || selected.size === 0) return
    const ids = [...selected]
    if (!ids.every(id => eligible.some(p => p.id === id))) return
    if (selectedAgents.size !== 1) {
      setError('יש לבחור תשלומים של סוכן אחד בלבד לאישור קבלה משותפת.')
      return
    }
    confirming.current = true
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
      confirming.current = false
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
      <div className="flex flex-wrap gap-3 mb-4">
        <label className="text-sm space-y-1">
          <span className="block">סוכן</span>
          <select className="input" value={agentFilter} disabled={busy}
            onChange={e => { setAgentFilter(e.target.value); setSelected(new Set()) }}>
            <option value="all">הכל</option>
            {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.full_name || agent.id}</option>)}
          </select>
        </label>
        <label className="text-sm space-y-1">
          <span className="block">סוג תשלום</span>
          <select className="input" value={methodFilter} disabled={busy}
            onChange={e => { setMethodFilter(e.target.value); setSelected(new Set()) }}>
            <option value="all">הכל</option>
            <option value="cash">מזומן</option>
            <option value="check">צ׳ק</option>
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>}
      {selectedPayments.length > 0 && <div className="card p-4 mb-4">
        <p className="font-bold">{selectedPayments.length} תשלומים נבחרו · סה״כ: {fmt(selectedTotal)}</p>
        <ul className="mt-2 space-y-1 text-sm">
          {selectedPayments.map(p => <li key={p.id}>הזמנה #{p.orders.order_number ?? 'טיוטה'} — {p.orders.customer_name_snapshot} · {METHODS[p.payment_route ?? '']} · {fmt(p.amount)}</li>)}
        </ul>
        {selectedAgents.size > 1 && <p className="text-amber-800 text-sm mt-2">יש לבחור תשלומים של סוכן אחד בלבד לאישור קבלה משותפת.</p>}
      </div>}
      {canConfirm && <div className="flex flex-wrap items-center gap-3 mb-4">
        <label className="flex gap-2 items-center text-sm"><input type="checkbox" disabled={busy || !eligible.length} checked={allSelected}
          onChange={() => setSelected(allSelected ? new Set() : new Set(eligible.map(p => p.id)))} /> בחר הכל המוצג</label>
        <button className="btn-ghost text-sm" disabled={busy} onClick={() => setSelected(new Set())}>נקה בחירה</button>
        <button className="btn-primary text-sm" disabled={busy || !selectedPayments.length || selectedAgents.size !== 1} onClick={confirm}>
          <CircleCheck size={16} className="inline-block me-1" aria-hidden="true" /> {busy ? 'מאשר...' : `אשר קבלה מהסוכן (${selectedPayments.length})`}
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
      {!loading && visibleGroups.length > 0 && <section className="mt-6">
        <h2 className="text-lg font-bold mb-3">קבלות מהסוכנים</h2>
        <div className="space-y-3">{visibleGroups.map(([key, group]) => {
          const first = group[0]
          return <div key={key} className="card p-4">
            <p className="font-bold">סוכן: {names[first.orders.payment_approved_by ?? ''] ?? first.orders.payment_approved_by}</p>
            <p className="text-sm mt-1">התקבל במשרד: {dateLabel(first.office_received_at)} · אושר על ידי: {names[first.office_received_by ?? ''] ?? first.office_received_by}</p>
            <p className="text-sm font-medium mt-1">{group.length} תשלומים · סה״כ הקבלה: {fmt(group.reduce((sum, p) => sum + Number(p.amount), 0))}</p>
            <ul className="text-sm space-y-1 mt-2">{group.map(p => <li key={p.id}>הזמנה #{p.orders.order_number ?? 'טיוטה'} — {p.orders.customer_name_snapshot} · {METHODS[p.payment_route ?? '']} · {fmt(p.amount)}</li>)}</ul>
          </div>
        })}</div>
      </section>}
    </div>
  )
}
