import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import OrderCardView from './OrderCardView'
import OrderTableView from './OrderTableView'
import PaymentModal from './PaymentModal'
import ItemStatusDialog, { DialogItem } from './ItemStatusDialog'
import SyncItemsDialog from './SyncItemsDialog'
import SyncOrderDialog from './SyncOrderDialog'
import { ActionOrder } from './OrderActions'
import {
  ORDER_STATUS_NEXT, ORDER_TO_ITEM_STATUS, suggestOrderStatus,
} from '../../lib/statusHelpers'

type Order = ActionOrder & { created_at: string }
type SortKey = 'order_number' | 'customer' | 'created_at' | 'total' | 'status'
type ViewMode = 'cards' | 'table'

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',        label: 'כל ההזמנות',   statuses: [] },
  { key: 'quote',      label: 'הצעות מחיר',   statuses: ['quote'] },
  { key: 'pending',    label: 'ממתין לגבייה', statuses: ['pending_payment'] },
  { key: 'ready',      label: 'חדש לביצוע',   statuses: ['ready'] },
  { key: 'production', label: 'בייצור',        statuses: ['in_production'] },
  { key: 'installable', label: 'מוכן',         statuses: ['ready_for_install'] },
  { key: 'completed',  label: 'הושלמו',        statuses: ['completed'] },
]

const VIEW_KEY = 'kairi_orders_view'

export default function OrdersList() {
  const { profile } = useAuth()
  const [searchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'all')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'cards'
  )
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortAsc, setSortAsc] = useState(false)

  const [paymentOrder, setPaymentOrder] = useState<ActionOrder | null>(null)
  const [itemsOrder, setItemsOrder] = useState<ActionOrder | null>(null)

  // דיאלוג סנכרון: הזמנה → פריטים
  const [syncItems, setSyncItems] = useState<{
    order: ActionOrder
    newStatus: string
    itemStatus: string
    count: number
  } | null>(null)

  // דיאלוג סנכרון: פריטים → הזמנה
  const [syncOrder, setSyncOrder] = useState<{
    order: ActionOrder
    itemStatus: string
    suggested: string
    count: number
  } | null>(null)

  const load = async () => {
    const { data, error } = await supabase
      .from('orders')
      .select('*, profiles!orders_agent_id_fkey(full_name), order_items(*), payments(*)')
      .order('created_at', { ascending: false })
    if (error) console.error('שגיאה בטעינת הזמנות:', error)
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

  // ---------- קידום סטטוס הזמנה ----------
  const handleAdvance = (order: ActionOrder) => {
    const next = ORDER_STATUS_NEXT[order.status]
    if (!next) return

    const suggestedItemStatus = ORDER_TO_ITEM_STATUS[next]
    const activeItems = (order.order_items ?? [])
      .filter(i => i.for_execution && i.item_status !== 'cancelled')

    // אם יש פריטים ויש סטטוס פריט מוצע — שאל
    if (suggestedItemStatus && activeItems.length > 0) {
      setSyncItems({
        order,
        newStatus: next,
        itemStatus: suggestedItemStatus,
        count: activeItems.length,
      })
    } else {
      // אין פריטים — קדם ישירות
      advanceOrder(order, next, false, null)
    }
  }

  const advanceOrder = async (
    order: ActionOrder,
    newStatus: string,
    syncItemsToo: boolean,
    itemStatus: string | null
  ) => {
    // עדכון ההזמנה
    await supabase.from('orders').update({ status: newStatus }).eq('id', order.id)
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: order.status,
      to_status: newStatus,
      changed_by: profile?.id ?? null,
      note: 'קידום מהרשימה',
    })

    // עדכון הפריטים (אם ביקשו)
    if (syncItemsToo && itemStatus) {
      const ids = (order.order_items ?? [])
        .filter(i => i.for_execution && i.item_status !== 'cancelled')
        .map(i => i.id)

      if (ids.length) {
        await supabase.from('order_items')
          .update({ item_status: itemStatus })
          .in('id', ids)

        await supabase.from('order_status_history').insert(
          ids.map(itemId => ({
            order_id: order.id,
            order_item_id: itemId,
            to_status: itemStatus,
            changed_by: profile?.id ?? null,
            note: 'סנכרון אוטומטי עם סטטוס ההזמנה',
          }))
        )
      }
    }

    setSyncItems(null)
    await load()
  }

  // ---------- אחרי עדכון פריטים: בדוק אם לקדם הזמנה ----------
  const afterItemsUpdate = async (orderId: string) => {
    await load()

    // שלוף מחדש את ההזמנה המעודכנת
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!orders_agent_id_fkey(full_name), order_items(*), payments(*)')
      .eq('id', orderId)
      .single()

    if (!data) return
    const order = data as Order

    const activeItems = (order.order_items ?? [])
      .filter(i => i.for_execution && i.item_status !== 'cancelled')

    const suggestion = suggestOrderStatus(activeItems, order.status)
    if (suggestion) {
      setSyncOrder({
        order,
        itemStatus: activeItems[0].item_status,
        suggested: suggestion.suggested,
        count: activeItems.length,
      })
    }
  }

  const confirmSyncOrder = async () => {
    if (!syncOrder) return
    await supabase.from('orders')
      .update({ status: syncOrder.suggested })
      .eq('id', syncOrder.order.id)

    await supabase.from('order_status_history').insert({
      order_id: syncOrder.order.id,
      from_status: syncOrder.order.status,
      to_status: syncOrder.suggested,
      changed_by: profile?.id ?? null,
      note: 'סנכרון אוטומטי — כל הפריטים עודכנו',
    })

    setSyncOrder(null)
    await load()
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
                         onAdvance={handleAdvance} />
        ) : (
          <OrderTableView orders={filtered}
                          sortKey={sortKey} sortAsc={sortAsc} onSort={onSort}
                          onPayment={setPaymentOrder}
                          onItemStatus={setItemsOrder}
                          onAdvance={handleAdvance} />
        )
      )}

      {/* מודל תשלום */}
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

      {/* דיאלוג סטטוס פריטים */}
      {itemsOrder && (
        <ItemStatusDialog
          orderId={itemsOrder.id}
          orderNumber={itemsOrder.order_number ?? 'טיוטה'}
          customerName={itemsOrder.customer_name_snapshot}
          items={(itemsOrder.order_items ?? []) as DialogItem[]}
          onClose={() => setItemsOrder(null)}
          onSaved={() => afterItemsUpdate(itemsOrder.id)}
        />
      )}

      {/* דיאלוג: הזמנה קודמה → לעדכן פריטים? */}
      {syncItems && (
        <SyncItemsDialog
          orderNumber={syncItems.order.order_number ?? 'טיוטה'}
          customerName={syncItems.order.customer_name_snapshot}
          newOrderStatus={syncItems.newStatus}
          suggestedItemStatus={syncItems.itemStatus}
          itemCount={syncItems.count}
          onConfirm={(sync) =>
            advanceOrder(syncItems.order, syncItems.newStatus, sync, syncItems.itemStatus)
          }
          onCancel={() => setSyncItems(null)}
        />
      )}

      {/* דיאלוג: כל הפריטים עודכנו → לקדם הזמנה? */}
      {syncOrder && (
        <SyncOrderDialog
          orderNumber={syncOrder.order.order_number ?? 'טיוטה'}
          customerName={syncOrder.order.customer_name_snapshot}
          itemStatus={syncOrder.itemStatus}
          suggestedOrderStatus={syncOrder.suggested}
          itemCount={syncOrder.count}
          onConfirm={confirmSyncOrder}
          onCancel={() => setSyncOrder(null)}
        />
      )}
    </div>
  )
}
