import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/statusHelpers'

interface CreditTransaction {
  sale_id: string
  order_id: string | null
  order_number: string
  amount: number
  status: 'review' | 'recorded'
  reason: string
  payment_id: string | null
  created_at: string
  orders: { order_number: number | null; customer_name_snapshot: string } | null
}
type Group = 'pending' | 'unassigned' | 'approved'
const groups: { key: Group; label: string; color: string }[] = [
  { key: 'pending', label: 'ממתינות לאישור', color: 'bg-amber-100 text-amber-800' },
  { key: 'unassigned', label: 'ללא שיוך', color: 'bg-red-100 text-red-700' },
  { key: 'approved', label: 'מאושרות', color: 'bg-green-100 text-green-700' },
]
const groupOf = (transaction: CreditTransaction): Group => {
  if (transaction.status === 'recorded' && transaction.payment_id) return 'approved'
  if (!transaction.order_id || transaction.reason === 'PHONE_MISMATCH') return 'unassigned'
  return 'pending'
}
const reasons: Record<string, string> = {
  REVIEW_MODE: 'נקלטה במצב בדיקה — לא נרשם תקבול',
  ORDER_NOT_FOUND: 'לא נמצאה הזמנה מתאימה',
  PHONE_MISMATCH: 'מספר הטלפון אינו תואם להזמנה — נדרש בירור שיוך',
  ORDER_NOT_PAYABLE: 'ההזמנה המזוהה אינה זמינה לתשלום',
  EXCEEDS_BALANCE: 'סכום העסקה גדול מיתרת ההזמנה',
  VERIFIED: 'תקבול מאומת נרשם בהזמנה',
}

export default function CreditTransactions() {
  const [transactions, setTransactions] = useState<CreditTransaction[]>([])
  const [filter, setFilter] = useState<'all' | Group>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    setLoading(true); setError('')
    const { data, error: loadError } = await supabase.from('icredit_events')
      .select('sale_id, order_id, order_number, amount, status, reason, payment_id, created_at, orders(order_number, customer_name_snapshot)')
      .order('created_at', { ascending: false })
    if (loadError) {
      setTransactions([])
      setError('לא ניתן לטעון את עסקאות האשראי. נסה לרענן את הרשימה.')
    } else setTransactions((data ?? []) as unknown as CreditTransaction[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])
  const visible = transactions.filter(transaction => filter === 'all' || groupOf(transaction) === filter)
  return <section aria-label="עסקאות אשראי">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 className="text-lg font-bold">עסקאות אשראי — iCredit</h2>
      <button className="btn-ghost text-sm" disabled={loading} onClick={() => { void load() }}>רענון עסקאות</button>
    </div>
    <p className="text-sm text-slate-600 mb-4">מעקב אחר עסקאות שאומתו מול iCredit. זיהוי הזמנה הוא ראשוני; עסקאות שנקלטו במצב בדיקה אינן מקטינות את היתרה.</p>
    <div className="mb-4 rounded-xl bg-slate-50 border border-slate-200 p-3">
    <p className="text-xs font-semibold text-slate-500 mb-2">מצב שיוך ואישור העסקה</p>
    <div className="flex flex-wrap gap-2" aria-label="סינון לפי מצב טיפול">
      {[{ key: 'all' as const, label: 'הכל' }, ...groups].map(group => <button
        key={group.key} aria-pressed={filter === group.key} onClick={() => setFilter(group.key)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium ${filter === group.key ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
        {group.label} ({group.key === 'all' ? transactions.length : transactions.filter(transaction => groupOf(transaction) === group.key).length})
      </button>)}
    </div>
    </div>
    {error && <p role="alert" className="text-red-600 text-sm mb-3">{error}</p>}
    {loading ? <p className="text-slate-500">טוען עסקאות אשראי...</p> : !error && visible.length === 0 ?
      <div className="card p-6 text-center text-slate-500">אין עסקאות אשראי בקבוצה זו</div> :
      <div className="space-y-3">{visible.map(transaction => {
        const group = groups.find(group => group.key === groupOf(transaction))!
        return <article key={transaction.sale_id} className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <span className="font-bold text-lg">{fmt(Number(transaction.amount))}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${group.color}`}>{group.label}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            <span>מועד קליטה: {new Date(transaction.created_at).toLocaleString('he-IL')}</span>
            <span>הזמנה מזוהה: {group.key !== 'unassigned' && transaction.order_id && transaction.orders ?
              <Link className="text-brand underline" to={`/orders/${transaction.order_id}`}>#{transaction.orders.order_number ?? transaction.order_number} — {transaction.orders.customer_name_snapshot}</Link>
              : 'ללא שיוך'}</span>
            {group.key === 'unassigned' && transaction.order_number && <span>מספר הזמנה שהתקבל: {transaction.order_number}</span>}
            <span className="sm:col-span-2">תוצאת בדיקה: {reasons[transaction.reason] ?? 'נדרש בירור'}</span>
            <span className="sm:col-span-2 break-all text-xs text-slate-500">מזהה עסקה: <bdi>{transaction.sale_id}</bdi></span>
          </div>
        </article>
      })}</div>}
  </section>
}
