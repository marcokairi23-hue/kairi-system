import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import BulkActionBar from './BulkActionBar'
import {
  ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_ORDER, SHADING_LABELS,
} from '../../lib/statusHelpers'
import { printWorkOrder } from './printWork'
import SyncOrderDialog from '../orders/SyncOrderDialog'
import { suggestOrderStatus } from '../../lib/statusHelpers'

interface Item {
  id: string
  order_id: string
  family: string
  subtype: string | null
  location: string
  width_cm: number
  heights_cm: number[]
  sewing_type: string | null
  hem_cm: number | null
  shtaif_cm: number | null
  is_split: boolean | null
  fabric_text: string | null
  mount_type: string | null
  mechanism_side: string | null
  color_fabric_text: string | null
  price: number
  for_execution: boolean
  item_status: string
  notes: string | null
  sort_order?: number
  orders?: {
    order_number: number | null
    customer_name_snapshot: string
    status: string
    profiles?: { full_name: string }
  }
}

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',       label: 'הכל',      statuses: [] },
  { key: 'new',       label: 'חדש',      statuses: ['new'] },
  { key: 'cut',       label: 'נגזר',     statuses: ['cut'] },
  { key: 'sewing',    label: 'בתפירה',   statuses: ['sewing'] },
  { key: 'ready',     label: 'מוכן',     statuses: ['ready'] },
  { key: 'installed', label: 'הותקן',    statuses: ['installed'] },
]

export default function ItemsList() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const [syncQueue, setSyncQueue] = useState<Array<{
    orderId: string
    orderNumber: number | null
    customerName: string
    orderStatus: string
    itemStatus: string
    suggested: string
    count: number
  }>>([])

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('order_items')
      .select('*, orders(order_number, customer_name_snapshot, status, profiles!orders_agent_id_fkey(full_name))')

    if (error) {
      console.error('שגיאה בטעינת פריטים:', error)
      setErr('לא ניתן לטעון את הפריטים: ' + error.message)
      setLoading(false)
      return
    }

    // מיון: הזמנות חדשות קודם (לפי מספר הזמנה יורד)
    const sorted = ((data ?? []) as Item[]).sort((a, b) => {
      const na = a.orders?.order_number ?? 0
      const nb = b.orders?.order_number ?? 0
      if (nb !== na) return nb - na
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })

    setItems(sorted)
    setErr(null)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return items.filter(i => {
      if (i.item_status === 'cancelled' && activeTab !== 'all') return false
      if (tab.statuses.length && !tab.statuses.includes(i.item_status)) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          i.location?.toLowerCase().includes(q) ||
          i.orders?.customer_name_snapshot?.toLowerCase().includes(q) ||
          String(i.orders?.order_number ?? '').includes(q) ||
          i.fabric_text?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, activeTab, search])

  const allSelected = filtered.length > 0 && selected.size === filtered.length

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(filtered.map(i => i.id)))
  }

  const applyStatus = async (status: string) => {
    const ids = Array.from(selected)
    await supabase.from('order_items').update({ item_status: status }).in('id', ids)

    // רישום היסטוריה
    const rows = ids.map(itemId => {
      const item = items.find(i => i.id === itemId)
      return {
        order_id: item?.order_id,
        order_item_id: itemId,
        to_status: status,
        changed_by: profile?.id ?? null,
        note: 'עדכון גורף ממסך פריטים',
      }
    }).filter(r => r.order_id)

    if (rows.length) await supabase.from('order_status_history').insert(rows)

    // אילו הזמנות הושפעו?
    const affectedOrderIds = Array.from(new Set(
      ids.map(id => items.find(i => i.id === id)?.order_id).filter(Boolean) as string[]
    ))

    setSelected(new Set())
    await load()

    // בדוק לכל הזמנה שהושפעה — האם כל הפריטים באותו סטטוס?
    const queue: typeof syncQueue = []

    for (const orderId of affectedOrderIds) {
      const { data } = await supabase
        .from('orders')
        .select('id, order_number, customer_name_snapshot, status, order_items(item_status, for_execution)')
        .eq('id', orderId)
        .single()

      if (!data) continue

      const activeItems = (data.order_items ?? [])
        .filter((i: { for_execution: boolean; item_status: string }) =>
          i.for_execution && i.item_status !== 'cancelled')

      const suggestion = suggestOrderStatus(activeItems, data.status)
      if (suggestion) {
        queue.push({
          orderId: data.id,
          orderNumber: data.order_number,
          customerName: data.customer_name_snapshot,
          orderStatus: data.status,
          itemStatus: activeItems[0].item_status,
          suggested: suggestion.suggested,
          count: activeItems.length,
        })
      }
    }

    if (queue.length) setSyncQueue(queue)
  }

  // אישור קידום הזמנה מהתור
  const confirmSync = async () => {
    const current = syncQueue[0]
    if (!current) return

    await supabase.from('orders')
      .update({ status: current.suggested })
      .eq('id', current.orderId)

    await supabase.from('order_status_history').insert({
      order_id: current.orderId,
      from_status: current.orderStatus,
      to_status: current.suggested,
      changed_by: profile?.id ?? null,
      note: 'סנכרון אוטומטי — כל הפריטים עודכנו',
    })

    setSyncQueue(q => q.slice(1))
    await load()
  }

  const skipSync = () => setSyncQueue(q => q.slice(1))

  const printSelected = () => {
    const chosen = items.filter(i => selected.has(i.id))
    printWorkOrder(chosen)
  }

  const itemTypeLabel = (i: Item) =>
    i.family === 'curtain' ? 'וילון' : SHADING_LABELS[i.subtype ?? ''] ?? 'הצללה'

  return (
    <div className={selected.size > 0 ? 'pb-24' : ''}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">פריטים</h1>
        <span className="text-sm text-slate-500">{filtered.length} פריטים</span>
      </div>

      <input className="input mb-4"
             placeholder="חיפוש לפי לקוח, מספר הזמנה, מיקום או בד..."
             value={search} onChange={e => setSearch(e.target.value)} />

      {/* טאבי סטטוס */}
      <div className="flex gap-1 overflow-x-auto pb-2 mb-3">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSelected(new Set()) }}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-brand text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
            {t.label}
            <span className="mr-1 text-xs opacity-70">
              ({items.filter(i =>
                i.item_status !== 'cancelled' &&
                (!t.statuses.length || t.statuses.includes(i.item_status))
              ).length})
            </span>
          </button>
        ))}
      </div>

      {err && (
        <div className="card p-4 mb-3 text-red-600 text-sm">{err}</div>
      )}

      {loading && <div className="text-slate-500">טוען פריטים...</div>}

      {!loading && filtered.length === 0 && (
        <div className="card p-8 text-center text-slate-400">
          {items.length === 0
            ? 'אין עדיין פריטים במערכת.'
            : 'לא נמצאו פריטים בטאב זה.'}
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="card overflow-hidden">
          {/* בחר הכל */}
          <label className="flex items-center gap-2 px-3 py-2 border-b bg-slate-50
                            text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
                   className="w-4 h-4" />
            בחר הכל
          </label>

          <div className="divide-y">
            {filtered.map(i => (
              <div key={i.id}
                   className={`flex items-center gap-2 p-3 hover:bg-slate-50 ${
                     selected.has(i.id) ? 'bg-brand-light' : ''
                   }`}>
                <input type="checkbox" checked={selected.has(i.id)}
                       onChange={() => toggle(i.id)}
                       className="w-4 h-4 shrink-0" />

                <div className="flex-1 min-w-0 cursor-pointer"
                     onClick={() => navigate(`/orders/${i.order_id}`)}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs text-brand font-bold">
                      #{i.orders?.order_number ?? '—'}
                    </span>
                    <span className="text-sm font-medium truncate">
                      {i.orders?.customer_name_snapshot}
                    </span>
                    {!i.for_execution && (
                      <span className="text-xs text-slate-400">(לא לביצוע)</span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 mt-0.5">
                    {itemTypeLabel(i)} — {i.location}
                  </div>

                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                    <span dir="ltr">{i.width_cm}×{i.heights_cm.join('/')} ס״מ</span>
                    {i.sewing_type && <span>{i.sewing_type}</span>}
                    {i.fabric_text && <span>בד: {i.fabric_text}</span>}
                    {i.color_fabric_text && <span>{i.color_fabric_text}</span>}
                  </div>
                </div>

                <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                  ITEM_STATUS_COLORS[i.item_status] ?? 'bg-slate-100'
                }`}>
                  {ITEM_STATUS_LABELS[i.item_status] ?? i.item_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <BulkActionBar
        count={selected.size}
        onApplyStatus={applyStatus}
        onPrintWork={printSelected}
        onClear={() => setSelected(new Set())}
      />

      {/* דיאלוג: כל הפריטים בהזמנה עודכנו → לקדם את ההזמנה? */}
      {syncQueue.length > 0 && (
        <SyncOrderDialog
          orderNumber={syncQueue[0].orderNumber ?? 'טיוטה'}
          customerName={syncQueue[0].customerName}
          itemStatus={syncQueue[0].itemStatus}
          suggestedOrderStatus={syncQueue[0].suggested}
          itemCount={syncQueue[0].count}
          onConfirm={confirmSync}
          onCancel={skipSync}
        />
      )}
    </div>
  )
}
