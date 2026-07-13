import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import OrderCardView from './OrderCardView'
import OrderTableView from './OrderTableView'
import PaymentModal from './PaymentModal'
import ItemStatusDialog, { DialogItem } from './ItemStatusDialog'
import { ActionOrder } from './OrderActions'

type Order = ActionOrder & { created_at: string }
type SortKey = 'order_number' | 'customer' | 'created_at' | 'total' | 'status'
type ViewMode = 'cards' | 'table'

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',        label: 'כל ההזמנות',   statuses: [] },
  { key: 'quote',      label: 'הצעות מחיר',   statuses: ['quote'] },
  { key: 'pending',    label: 'ממתין לגבייה', statuses: ['pending_payment'] },
  { key: 'ready',      label: 'חדש לביצוע',   statuses: ['ready'] },
  { key: 'production', label: 'בייצור',        statuses: ['in_production'] },
  { key: 'completed',  label: 'הושלמו',        statuses: ['completed'] },
]

const VIEW_KEY = 'kairi_orders_view'

export default function OrdersList() {
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'cards'
  )
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  const [paymentOrder, setPaymentOrder] = useState<ActionOrder | null>(null)
  const [itemsOrder, setItemsOrder] = useState<ActionOrder | null>(null)

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles(full_name), order_items(*), payments(*)')
      .order('created_at', { ascending: false })
    setOrders((data ?? []) as Order[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const setViewMode = (v: ViewMode) => {
    setView(v)
    localStorage.setItem(VIEW_KEY, v)
  }

  const onSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc(!sortAsc)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    let list = orders.filter(o => {
      if (tab.statuses.length && !tab.statuses.includes(o.status)) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          o.customer_name_snapshot?.toLowerCase().includes(q) ||
          o.phone_snapshot?.includes(q) ||
          String(o.order_number ?? '').includes(q)
        )
      }
      return true
    })

    if (view === 'table') {
      list = [...list].sort((a, b) => {
        let cmp = 0
        switch (sortKey) {
          case 'order_number':
            cmp = (a.order_number ?? 0) - (b.order_number ?? 0); break
          case 'customer':
            cmp = a.customer_name_snapshot.localeCompare(b.customer_name_snapshot, 'he'); break
          case 'total':
            cmp = a.final_total - b.final_total; break
          case 'status':
            cmp = a.status.localeCompare(b.status); break
          case 'created_at':
            cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime(); break
        }
        return sortAsc ? cmp : -cmp
      })
    }

    return list
  }, [orders, activeTab, search, sortKey, sortAsc, view])

  const paidOf = (o: ActionOrder) =>
    (o.payments ?? []).reduce((s, p) => s + p.amount, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('cards')} title="כרטיסיות"
                    className={`px-2.5 py-1.5 text-sm ${
                      view === 'cards' ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}>▦</button>
            <button onClick={() => setViewMode('table')} title="רשימה"
                    className={`px-2.5 py-1.5 text-sm ${
                      view === 'table' ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}>☰</button>
          </div>
          <Link to="/orders/new" className="btn-primary">+ חדשה</Link>
        </div>
      </div>

      <input className="input mb-4"
             placeholder="חיפוש לפי שם לקוח, טלפון או מספר..."
             value={search} onChange={e => setSearch(e.target.value)} />

      <div className="flex gap-1 overflow-x-auto pb-2 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
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

      {!loading && filtered.length > 0 && (
        view === 'cards' ? (
          <OrderCardView orders={filtered}
                         onPayment={setPaymentOrder}
                         onItemStatus={setItemsOrder}
                         onRefresh={load} />
        ) : (
          <OrderTableView orders={filtered}
                          sortKey={sortKey} sortAsc={sortAsc} onSort={onSort}
                          onPayment={setPaymentOrder}
                          onItemStatus={setItemsOrder}
                          onRefresh={load} />
        )
      )}

      {paymentOrder && (
        <PaymentModal
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.order_number ?? 'טיוטה'}
          customerName={paymentOrder.customer_name_snapshot}
          finalTotal={paymentOrder.final_total}
          alreadyPaid={paidOf(paymentOrder)}
          onClose={() => setPaymentOrder(null)}
          onSaved={load}
        />
      )}

      {itemsOrder && (
        <ItemStatusDialog
          orderId={itemsOrder.id}
          orderNumber={itemsOrder.order_number ?? 'טיוטה'}
          customerName={itemsOrder.customer_name_snapshot}
          items={(itemsOrder.order_items ?? []) as DialogItem[]}
          onClose={() => setItemsOrder(null)}
          onSaved={load}
        />
      )}
    </div>
  )
}
