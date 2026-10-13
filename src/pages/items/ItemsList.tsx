import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useItemDeepLink } from '../../lib/useItemDeepLink'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import BulkActionBar from './BulkActionBar'
import {
  ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_ORDER, SHADING_LABELS,
  ITEM_ROUTE_LABELS, ItemRoute, getItemRoute, ACTIVE_ORDER_STATUSES,
} from '../../lib/statusHelpers'
import WorkPrintDialog from './WorkPrintDialog'
import { advanceProductionItems } from '../../lib/productionActions'
import { canPrintProduction, nextProductionSelection, productionNext, productionSelection } from '../../lib/productionPermissions'
import SyncOrderDialog from '../orders/SyncOrderDialog'
import ItemAdvanceDialog from '../orders/ItemAdvanceDialog'
import { suggestOrderStatus } from '../../lib/statusHelpers'
import { recalculateOrderStatus } from '../../lib/recalculateOrderStatus'

interface Item {
  id: string
  order_id: string
  family: string
  subtype: string | null
  location: string
  width_m: number
  heights_m: number[]
  sewing_type: string | null
  hem_cm: number | null
  shtaif_cm: number | null
  is_split: boolean | null
  fabric_text: string | null
  mount_type: string | null
  mechanism_side: string | null
  color_fabric_text: string | null
  production_route: 'internal' | 'external' | null
  assigned_worker: string | null
  price: number
  for_execution: boolean
  item_status: string
  production_version: number
  issue_kind?: string | null
  notes: string | null
  sort_order?: number
  orders?: {
    order_number: number | null
    customer_name_snapshot: string
    status: string
    payment_approved: boolean | null
    created_at: string
    profiles?: { full_name: string }
  }
}

const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',       label: 'הכל',      statuses: [] },
  { key: 'new',       label: 'חדש',      statuses: ['new'] },
  { key: 'preparation', label: 'בהכנה', statuses: ['preparation'] },
  { key: 'ready',     label: 'מוכן',     statuses: ['ready'] },
  { key: 'done',      label: 'הושלם',   statuses: ['done'] },
]

// קיבוץ מסך הפריטים — ניתן להרחיב בהמשך (סוג תפירה/בד/סוכן וכו', לא עכשיו)
type GroupBy = 'order' | 'date' | 'type'
const GROUP_LABELS: Record<GroupBy, string> = {
  order: 'לפי הזמנה',
  date: 'לפי תאריך',
  type: 'לפי סוג פריט',
}
// סדר קבוע לקיבוץ "לפי סוג פריט"; ערכים שלא ברשימה (subtype חדש שנוסף בהגדרות) נופלים לסוף לפי א"ב
const TYPE_GROUP_ORDER = ['וילון', 'זברה', 'ונציאני', 'רומי', 'גלילה']

export default function ItemsList() {
  const navigate = useNavigate()
  const [searchParams]=useSearchParams()
  const linkedOrder=searchParams.get('order')
  const { profile } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [activeRoute, setActiveRoute] = useState<'all' | ItemRoute>('all')
  const [groupBy, setGroupBy] = useState<GroupBy>('order')
  const [advanceItem, setAdvanceItem] = useState<Item | null>(null)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [printOpen, setPrintOpen] = useState(false)
  const operationLock = useRef(false)
  const loadingLock = useRef(true)
  const loadVersion = useRef(0)
  useItemDeepLink(!loading)
  useEffect(() => { setActiveTab('all'); setActiveRoute('all'); setSearch(''); setSelected(new Set()) },[linkedOrder])
  const [syncQueue, setSyncQueue] = useState<Array<{
    orderId: string
    orderNumber: number | null
    customerName: string
    orderStatus: string
    itemStatus: string
    suggested: string
    count: number
  }>>([])

  const load = async (clearError = true) => {
    const version = ++loadVersion.current
    loadingLock.current = true
    setSelected(new Set())
    setLoading(true)
    const data: Item[] = []
    try {
      let cursor: string | null = null
      while (true) {
        let query = supabase.from('order_items')
          .select('*, orders!inner(order_number, customer_name_snapshot, status, payment_approved, created_at, profiles!orders_agent_id_fkey(full_name))')
          .order('id').limit(500)
        if (cursor) query = query.gt('id', cursor)
        const { data: page, error } = await query
        if (version !== loadVersion.current) return
        if (error) throw error
        if (!page?.length) break
        data.push(...(page as Item[]))
        cursor = page[page.length - 1].id
      }
    } catch (error) {
      if (version !== loadVersion.current) return
      setItems([])
      setErr('לא ניתן לטעון את הפריטים: ' + (error as { message: string }).message)
      setLoading(false)
      loadingLock.current = false
      return
    }

    // הזמנה עדיין לא פעילה (draft/quote/pending_payment/cancelled) — הפריט לא אמור להופיע
    // כאן עד שההזמנה יצאה מגבייה בפועל (DEFECTS_MAP #20).
    const active = data.filter(i =>
      i.id && i.order_id && ACTIVE_ORDER_STATUSES.includes(i.orders?.status ?? ''))

    // מיון: הזמנות חדשות קודם (לפי מספר הזמנה יורד)
    const sorted = active.sort((a, b) => {
      const na = a.orders?.order_number ?? 0
      const nb = b.orders?.order_number ?? 0
      if (nb !== na) return nb - na
      return (a.sort_order ?? 0) - (b.sort_order ?? 0)
    })

    setItems(sorted)
    if (clearError) setErr(null)
    setLoading(false)
    loadingLock.current = false
  }

  useEffect(() => { void load(); return () => { loadVersion.current++ } }, [profile?.id])
  useEffect(() => { setSelected(new Set()) }, [search, activeTab, activeRoute, groupBy, profile])

  const itemTypeLabel = (i: Item) =>
    i.family === 'curtain' ? 'וילון' : SHADING_LABELS[i.subtype ?? ''] ?? i.subtype ?? 'הצללה'

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return items.filter(i => {
      if (linkedOrder && i.order_id!==linkedOrder) return false
      if (i.item_status === 'cancelled' && activeTab !== 'all') return false
      if (tab.statuses.length && (!i.for_execution || !tab.statuses.includes(i.item_status))) return false
      if (activeRoute !== 'all' && getItemRoute(i.family) !== activeRoute) return false
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
  }, [items, activeTab, activeRoute, search,linkedOrder])

  const selectable = productionSelection(filtered, profile)
  const allSelected = selectable.length > 0 && selectable.every(i => selected.has(i.id))
  const allowedStatuses = ITEM_STATUS_ORDER.filter(status => selected.size > 0 && Array.from(selected).every(id => {
    const item = items.find(i => i.id === id)
    return !!item && productionNext(item, profile) === status
  }))

  // חלוקת filtered לקבוצות תצוגה לפי groupBy — לא משפיע על בחירה/פעולות, רק על הצגה
  const grouped = useMemo(() => {
    if (groupBy === 'order') {
      const map = new Map<string, { label: string; sortKey: number; items: Item[] }>()
      for (const i of filtered) {
        const key = i.order_id
        if (!map.has(key)) {
          map.set(key, {
            label: `#${i.orders?.order_number ?? '—'} — ${i.orders?.customer_name_snapshot ?? ''}`,
            sortKey: i.orders?.order_number ?? 0,
            items: [],
          })
        }
        map.get(key)!.items.push(i)
      }
      return Array.from(map.values()).sort((a, b) => b.sortKey - a.sortKey)
    }

    if (groupBy === 'date') {
      const map = new Map<string, { label: string; items: Item[] }>()
      for (const i of filtered) {
        const d = i.orders?.created_at ? new Date(i.orders.created_at) : null
        const key = d ? d.toISOString().slice(0, 10) : 'unknown'
        if (!map.has(key)) {
          map.set(key, {
            label: d ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'ללא תאריך',
            items: [],
          })
        }
        map.get(key)!.items.push(i)
      }
      return Array.from(map.entries())
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([, g]) => g)
    }

    // type — משפחת פריט (וילון/הצללה), כשהצללה מפורטת לפי subtype
    const map = new Map<string, Item[]>()
    for (const i of filtered) {
      const key = itemTypeLabel(i)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(i)
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => {
        const ia = TYPE_GROUP_ORDER.indexOf(a)
        const ib = TYPE_GROUP_ORDER.indexOf(b)
        if (ia === -1 && ib === -1) return a.localeCompare(b)
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
      .map(([label, items]) => ({ label, items }))
  }, [filtered, groupBy])

  const toggle = (id: string) => {
    if (operationLock.current || loadingLock.current || !selectable.some(i => i.id === id)) return
    const next = nextProductionSelection(selected, [id])
    if (!next) { setErr('ניתן לבחור עד 200 פריטים לקידום בפעולה אחת.'); return }
    setSelected(next)
  }

  const toggleAll = () => {
    if (operationLock.current || loadingLock.current) return
    const next = nextProductionSelection(selected, selectable.map(item => item.id))
    if (!next) { setErr('יותר מ־200 פריטים זמינים. בחרו ידנית עד 200; לא נשלחה פעולה מפוצלת.'); return }
    setSelected(next)
  }

  // בדוק לכל הזמנה שהושפעה — האם כל הפריטים באותו סטטוס? אם כן, הוסף להצעת סנכרון.
  const checkSyncForOrders = async (affectedOrderIds: string[]) => {
    for (const orderId of affectedOrderIds) await recalculateOrderStatus(orderId, profile?.id ?? null)
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

  const applyStatus = async (status: string) => {
    if (operationLock.current || loadingLock.current || !allowedStatuses.includes(status as never)) return
    const chosen = selectable.filter(item => selected.has(item.id))
    if (chosen.length !== selected.size || !chosen.length || chosen.length > 200) {
      setErr('ניתן לקדם עד 200 פריטים מורשים בפעולה אחת.'); return
    }
    operationLock.current = true; setBusy(true); setErr(null)
    try {
      await advanceProductionItems(chosen, status)
      await load()
    } catch (error) {
      setErr('לא התקבל אישור לפעולה. יש לבדוק את הנתונים המעודכנים. ' + (error as { message?: string }).message)
      await load(false)
    } finally { operationLock.current = false; setBusy(false) }
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

  const printSelected = () => setPrintOpen(true)

  return (
    <div className={selected.size > 0 ? 'pb-56 sm:pb-28' : ''}>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">פריטים</h1>
        <span className="text-sm text-slate-500">{filtered.length} פריטים</span>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <button className="btn-ghost text-sm" disabled={busy || loading} onClick={() => void load()}>רענן נתונים</button>
        {linkedOrder && <button className="btn-ghost text-sm" onClick={() => navigate('/items')}>הצג את כל ההזמנות</button>}
        {canPrintProduction(profile) && <button className="btn-ghost text-sm" disabled={busy || loading || !filtered.length} onClick={printSelected}>הוראות עבודה</button>}
      </div>
      <input className="input mb-4" disabled={busy}
             placeholder="חיפוש לפי לקוח, מספר הזמנה, מיקום או בד..."
             value={search} onChange={e => { setSearch(e.target.value); setSelected(new Set()) }} />

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
                (!t.statuses.length || (i.for_execution && t.statuses.includes(i.item_status)))
              ).length})
            </span>
          </button>
        ))}
      </div>

      {/* סינון לפי מסלול */}
      <div className="flex gap-1 mb-3">
        {(['all', 'cutter', 'office'] as const).map(route => (
          <button key={route} onClick={() => setActiveRoute(route)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeRoute === route
                      ? 'bg-slate-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
            {route === 'all' ? 'כל המסלולים' : ITEM_ROUTE_LABELS[route]}
          </button>
        ))}
      </div>

      {/* קיבוץ תצוגה */}
      <div className="flex items-center gap-1 mb-3">
        <span className="text-xs text-slate-400">קיבוץ:</span>
        {(Object.keys(GROUP_LABELS) as GroupBy[]).map(g => (
          <button key={g} onClick={() => setGroupBy(g)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    groupBy === g
                      ? 'bg-slate-700 text-white'
                      : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}>
            {GROUP_LABELS[g]}
          </button>
        ))}
      </div>

      {err && (
        <div role="alert" className="card p-4 mb-3 text-red-600 text-sm">{err}</div>
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
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy || loading}
                   className="w-4 h-4" />
            בחר הכל
          </label>

          {grouped.map(g => (
            <div key={g.label}>
              <div className="bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 flex items-center justify-between">
                <span>{g.label}</span>
                <span className="opacity-60 font-normal">{g.items.length}</span>
              </div>
              <div className="divide-y">
                {g.items.map(i => (
                  <div key={i.id} id={`item-${i.id}`} tabIndex={-1} style={{ scrollMarginTop:'4rem' }}
                       className={`flex items-center gap-2 p-3 hover:bg-slate-50 ${
                         selected.has(i.id) ? 'bg-brand-light' : ''
                       }`}>
                    <input type="checkbox" checked={selected.has(i.id)}
                           aria-label={`בחר ${i.location}`}
                           disabled={busy || loading || !selectable.some(item => item.id === i.id)}
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

                      <div className="text-xs text-slate-600 mt-0.5 flex items-center gap-1">
                        <span>{itemTypeLabel(i)} — {i.location}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          getItemRoute(i.family) === 'cutter'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {ITEM_ROUTE_LABELS[getItemRoute(i.family)]}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 flex flex-wrap gap-x-2 mt-0.5">
                        <span dir="ltr">{i.width_m}×{i.heights_m.join('/')} מ׳</span>
                        {i.sewing_type && <span>{i.sewing_type}</span>}
                        {i.fabric_text && <span>בד: {i.fabric_text}</span>}
                        {i.color_fabric_text && <span>{i.color_fabric_text}</span>}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ITEM_STATUS_COLORS[i.item_status] ?? 'bg-slate-100'
                      }`}>
                        {i.for_execution ? (ITEM_STATUS_LABELS[i.item_status] ?? 'סטטוס מורשת') : 'הצעת מחיר / לא לביצוע'}
                      </span>
                      {i.issue_kind && <span className="text-xs font-semibold text-amber-700">דורש טיפול</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <BulkActionBar
        disabled={busy || loading}
        allowedStatuses={allowedStatuses}
        count={selected.size}
        onApplyStatus={applyStatus}
        onPrintWork={printSelected}
        onClear={() => setSelected(new Set())}
      />
      {printOpen && <WorkPrintDialog items={filtered} onClose={() => setPrintOpen(false)} />}

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

      <ItemAdvanceDialog
        open={!!advanceItem}
        item={advanceItem}
        onClose={() => setAdvanceItem(null)}
        onDone={async () => {
          const orderId = advanceItem?.order_id
          setAdvanceItem(null)
          await load()
          if (orderId) await checkSyncForOrders([orderId])
        }}
      />
    </div>
  )
}
