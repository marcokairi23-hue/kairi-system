import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { LayoutGrid, List } from 'lucide-react'
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
  ORDER_STATUS_NEXT, ORDER_TO_ITEM_STATUS, suggestOrderStatus, fmt,
} from '../../lib/statusHelpers'

type Order = ActionOrder & { created_at: string }
type SortKey = 'order_number' | 'customer' | 'created_at' | 'total' | 'status'
type ViewMode = 'cards' | 'table'

// כולל balance/quote — משמש ללוגיקת הסינון (filtered) בלבד. שני אלה לא
// מוצגים בשורת הטאבים (PILL_TABS למטה); הם מוצגים ככרטיסיות נפרדות.
const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',        label: 'כל ההזמנות',   statuses: [] },
  { key: 'balance',    label: 'יתרה פתוחה',   statuses: [] },
  { key: 'quote',      label: 'הצעות מחיר',   statuses: ['quote'] },
  { key: 'pending',    label: 'ממתין לגבייה', statuses: ['pending_payment'] },
  { key: 'ready',      label: 'חדש לביצוע',   statuses: ['ready'] },
  { key: 'production', label: 'בייצור',        statuses: ['in_production'] },
  { key: 'installable', label: 'מוכן',         statuses: ['ready_for_install'] },
  { key: 'completed',  label: 'הושלמו',        statuses: ['completed'] },
]

// טאבי סטטוס ההזמנה — כרטיסיות-משנה מתחת ל-3 הכרטיסיות הראשיות
// (הכל/יתרה פתוחה/הצעות מחיר), שיצאו מכאן ל-TOP_CARDS למטה.
const STATUS_CARDS = TABS.filter(t => !['all', 'balance', 'quote'].includes(t.key))

const VIEW_KEY = 'kairi_orders_view'

const hasOpenBalance = (o: ActionOrder) => {
  if (o.status === 'completed' || o.status === 'cancelled') return false
  const paid = (o.payments ?? []).reduce((s, p) => s + p.amount, 0)
  return o.final_total - paid > 0
}

export default function OrdersList() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const activeTab = searchParams.get('tab') || 'all'
  const agentFilter = searchParams.get('agent') || ''
  const paymentFilter = searchParams.get('payment') || ''
  const dateFrom = searchParams.get('from') || ''
  const dateTo = searchParams.get('to') || ''

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const setActiveTab = (v: string) => updateParam('tab', v === 'all' ? '' : v)
  const clearFilters = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('agent')
    next.delete('payment')
    next.delete('from')
    next.delete('to')
    setSearchParams(next)
  }
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

  const paidOf = (o: ActionOrder) =>
    (o.payments ?? []).reduce((s, p) => s + p.amount, 0)

  const paymentStatusOf = (o: ActionOrder): 'paid' | 'partial' | 'unpaid' => {
    const paid = paidOf(o)
    if (paid <= 0) return 'unpaid'
    if (paid >= o.final_total) return 'paid'
    return 'partial'
  }

  // נתוני שתי הכרטיסיות שיצאו משורת הטאבים (יתרה פתוחה / הצעות מחיר)
  const balanceOrders = useMemo(() => orders.filter(hasOpenBalance), [orders])
  const openBalanceTotal = useMemo(
    () => balanceOrders.reduce((sum, o) => sum + (o.final_total - paidOf(o)), 0),
    [balanceOrders]
  )
  const quoteCount = useMemo(() => orders.filter(o => o.status === 'quote').length, [orders])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    orders.forEach(o => {
      if (o.agent_id && o.profiles?.full_name) map.set(o.agent_id, o.profiles.full_name)
    })
    return Array.from(map, ([id, name]) => ({ id, name }))
  }, [orders])

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    let list = orders.filter(o => {
      if (tab.key === 'balance' && !hasOpenBalance(o)) return false
      if (tab.key !== 'balance' && tab.statuses.length && !tab.statuses.includes(o.status)) return false
      if (agentFilter && o.agent_id !== agentFilter) return false
      if (paymentFilter && paymentStatusOf(o) !== paymentFilter) return false
      if (dateFrom && o.created_at < dateFrom) return false
      if (dateTo && o.created_at > dateTo + 'T23:59:59') return false
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
  }, [orders, activeTab, agentFilter, paymentFilter, dateFrom, dateTo, search, sortKey, sortAsc, view])

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">הזמנות</h1>
        <div className="flex items-center gap-2">
          <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('cards')} title="כרטיסיות"
                    className={`px-2.5 py-1.5 grid place-items-center ${
                      view === 'cards' ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}><LayoutGrid className="w-4 h-4" /></button>
            <button onClick={() => setViewMode('table')} title="רשימה"
                    className={`px-2.5 py-1.5 grid place-items-center ${
                      view === 'table' ? 'bg-brand text-white' : 'text-slate-500 hover:bg-slate-50'
                    }`}><List className="w-4 h-4" /></button>
          </div>
          <Link to="/orders/new" className="btn-primary">+ חדשה</Link>
        </div>
      </div>

      <input className="input mb-4"
             placeholder="חיפוש לפי שם לקוח, טלפון או מספר..."
             value={search} onChange={e => setSearch(e.target.value)} />

      {/* 3 כרטיסיות ראשיות: הכל / יתרה פתוחה / הצעות מחיר */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <button onClick={() => setActiveTab('all')}
                className={`card p-3 text-right transition-colors ${
                  activeTab === 'all' ? 'ring-2 ring-brand' : 'hover:shadow-md'
                }`}>
          <div className="text-xs font-bold text-slate-500 mb-1">כל ההזמנות</div>
          <div className="text-lg font-bold">{orders.length}</div>
        </button>

        <button onClick={() => setActiveTab('balance')}
                className={`card p-3 text-right transition-colors ${
                  activeTab === 'balance' ? 'ring-2 ring-brand' : 'hover:shadow-md'
                }`}>
          <div className="text-xs font-bold text-slate-500 mb-1">יתרה פתוחה</div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-lg font-bold text-amber-700">{fmt(openBalanceTotal)}</span>
            <span className="text-xs text-slate-400">{balanceOrders.length}</span>
          </div>
        </button>

        <button onClick={() => setActiveTab('quote')}
                className={`card p-3 text-right transition-colors ${
                  activeTab === 'quote' ? 'ring-2 ring-brand' : 'hover:shadow-md'
                }`}>
          <div className="text-xs font-bold text-slate-500 mb-1">הצעות מחיר</div>
          <div className="text-lg font-bold text-brand">{quoteCount}</div>
        </button>
      </div>

      {/* כרטיסיות-משנה לפי סטטוס — מוזחות (border-r + pr-4), כמו נטינג
          מסך/קומפוננטה ב-ScreenManager, כדי שיהיה ברור שהן כפופות ל-3
          הכרטיסיות שמעליהן ולא באותה רמה. גדולות יותר מ-pill רגיל, אבל
          עדיין קטנות מהכרטיסיות הראשיות (padding/פונט קטנים יותר). */}
      <div className="pr-4 border-r-2 border-slate-200 mb-4">
        <div className="text-xs text-slate-400 mb-1.5">לפי סטטוס</div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {STATUS_CARDS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className={`card p-2.5 text-right transition-colors ${
                      activeTab === t.key ? 'ring-2 ring-brand' : 'hover:shadow-sm'
                    }`}>
              <div className={`text-xs font-medium mb-0.5 ${
                activeTab === t.key ? 'text-brand' : 'text-slate-500'
              }`}>
                {t.label}
              </div>
              <div className="text-base font-bold">
                {orders.filter(o => t.statuses.includes(o.status)).length}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {agentOptions.length > 1 && (
          <select className="input w-auto" value={agentFilter}
                  onChange={e => updateParam('agent', e.target.value)}>
            <option value="">כל הסוכנים</option>
            {agentOptions.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}

        <select className="input w-auto" value={paymentFilter}
                onChange={e => updateParam('payment', e.target.value)}>
          <option value="">כל מצבי התשלום</option>
          <option value="paid">שולם</option>
          <option value="partial">חלקי</option>
          <option value="unpaid">לא שולם</option>
        </select>

        <input type="date" className="input w-auto" value={dateFrom}
               onChange={e => updateParam('from', e.target.value)} />
        <span className="text-slate-400 text-sm">עד</span>
        <input type="date" className="input w-auto" value={dateTo}
               onChange={e => updateParam('to', e.target.value)} />

        {(agentFilter || paymentFilter || dateFrom || dateTo) && (
          <button className="btn-ghost text-sm" onClick={clearFilters}>נקה סינון</button>
        )}
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
