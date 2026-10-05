import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  ITEM_STATUS_LABELS, ITEM_ROUTE_LABELS, getItemRoute, nextItemStatus,
  ACTIVE_ORDER_STATUSES, INTERNAL_ITEM_TRACK, EXTERNAL_ITEM_TRACK,
} from '../../lib/statusHelpers'
import { printWorkOrder } from './printWork'
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
  item_status: string
  for_execution: boolean
  notes: string | null
  orders?: {
    order_number: number | null
    customer_name_snapshot: string
    status: string
    created_at: string
    profiles?: { full_name: string }
  }
}

interface Worker { id: string; full_name: string }

// טאב סינון עליון (SPEC §4.10) — לא מחליף את קיבוץ ההזמנה, רק מסנן שורות בתוכו
const TABS: { key: string; label: string; statuses: string[] }[] = [
  { key: 'all',  label: 'הכל',    statuses: [] },
  { key: 'new',  label: 'חדש',    statuses: ['new'] },
  { key: 'preparation', label: 'בהכנה', statuses: ['preparation'] },
  { key: 'ready', label: 'מוכן',  statuses: ['ready'] },
  { key: 'done', label: 'הושלם', statuses: ['done'] },
]

// תווית פעולה = שם היעד (כמו ב-V1), לא "▶ קדם" גנרי
const ADVANCE_LABELS: Record<string, string> = {
  preparation: 'העבר להכנה',
  ready: 'סמן כמוכן',
  done: 'סמן כהושלם',
}

const STAGE_COLOR: Record<string, string> = {
  new: '#94a3b8',
  preparation: '#7e22ce',
  ready: '#0f766e',
  done: '#15803d',
}

export default function ProductionBoard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [assignWorker, setAssignWorker] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeRoute, setActiveRoute] = useState('all')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('order_items')
      .select('*, orders(order_number, customer_name_snapshot, status, created_at, profiles!orders_agent_id_fkey(full_name))')

    if (error) {
      console.error('שגיאה בטעינת פריטים:', error)
      setErr('לא ניתן לטעון את הפריטים: ' + error.message)
      setLoading(false)
      return
    }

    // V1: four active item statuses. ACTIVE_ORDER_STATUSES
    // כמו ב-ItemsList (הזמנה שעדיין לא פעילה לא מוצגת).
    const active = ((data ?? []) as Item[]).filter(i =>
      i.id && i.order_id && i.for_execution && ['curtain', 'shading'].includes(i.family) &&
      INTERNAL_ITEM_TRACK.some(s => s === i.item_status) &&
      ACTIVE_ORDER_STATUSES.includes(i.orders?.status ?? ''))

    setItems(active)
    setSelected(previous => new Set([...previous].filter(id => active.some(i => i.id === id))))
    setErr(null)
    setLoading(false)
  }

  useEffect(() => {
    load()
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setWorkers(data ?? []))
  }, [])

  const itemTypeLabel = (i: Item) => i.family === 'curtain' ? 'וילון' : (i.subtype ?? 'הצללה')

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return items.filter(i => {
      if (activeRoute !== 'all' && getItemRoute(i.family) !== activeRoute) return false
      if (tab.statuses.length && !tab.statuses.includes(i.item_status)) return false
      if (search) {
        const q = search.toLowerCase()
        return (
          i.location?.toLowerCase().includes(q) ||
          i.orders?.customer_name_snapshot?.toLowerCase().includes(q) ||
          String(i.orders?.order_number ?? '').includes(q) ||
          i.fabric_text?.toLowerCase().includes(q) || i.color_fabric_text?.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [items, activeTab, activeRoute, search])

  // קיבוץ לפי הזמנה (V1 §2a) — כל קבוצה עם כותרת, סיכום, וקישור לפתיחת ההזמנה
  const groups = useMemo(() => {
    const map = new Map<string, {
      orderId: string; orderNumber: number | null; customerName: string
      createdAt: string; agentName: string; items: Item[]
    }>()
    for (const i of filtered) {
      const key = i.order_id
      if (!map.has(key)) {
        map.set(key, {
          orderId: key,
          orderNumber: i.orders?.order_number ?? null,
          customerName: i.orders?.customer_name_snapshot ?? '',
          createdAt: i.orders?.created_at ?? '',
          agentName: i.orders?.profiles?.full_name ?? '',
          items: [],
        })
      }
      map.get(key)!.items.push(i)
    }
    return Array.from(map.values()).sort((a, b) => (b.orderNumber ?? 0) - (a.orderNumber ?? 0))
  }, [filtered])

  const orderCount = groups.length

  const toggleItem = (id: string) => {
    if (busy || !filtered.some(i => i.id === id)) return
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const toggleGroup = (groupItems: Item[]) => {
    if (busy) return
    const allSelected = groupItems.every(i => selected.has(i.id))
    const next = new Set(selected)
    groupItems.forEach(i => allSelected ? next.delete(i.id) : next.add(i.id))
    setSelected(next)
  }

  // הזמנה יחידה מיוצגת בבחירה הנוכחית? (לתצוגת "הזמנה #X" בפס התחתון, כמו ב-V1)
  const selectedOrderLabel = useMemo(() => {
    const orderIds = new Set(
      Array.from(selected).map(id => items.find(i => i.id === id)?.order_id).filter(Boolean)
    )
    if (orderIds.size !== 1) return null
    const anyItem = items.find(i => orderIds.has(i.order_id))
    return anyItem ? `הזמנה #${anyItem.orders?.order_number ?? '—'}` : null
  }, [selected, items])

  const selectedItems = items.filter(i => selected.has(i.id))
  const commonNext = selected.size > 0 && selectedItems.length === selected.size
    ? nextItemStatus(getItemRoute(selectedItems[0].family), selectedItems[0].item_status) : null
  const bulkNext = commonNext && selectedItems.every(i =>
    i.for_execution && nextItemStatus(getItemRoute(i.family), i.item_status) === commonNext) ? commonNext : null

  // Only a common next V1 transition is allowed for the complete selection.
  const advanceSelected = async () => {
    if (busy || !bulkNext) return
    setBusy(true)
    const affectedOrderIds = new Set<string>()
    let failed = false
    try {
      for (const item of selectedItems) {
        const { data, error } = await supabase.from('order_items').update({ item_status: bulkNext })
          .eq('id', item.id).eq('for_execution', true).eq('item_status', item.item_status).select('id')
        if (error) throw error
        if (!data?.length) throw new Error('הפריט השתנה; יש לרענן את הבחירה')
        affectedOrderIds.add(item.order_id)
        const { error: historyError } = await supabase.from('order_status_history').insert({
          order_id: item.order_id, order_item_id: item.id, from_status: item.item_status,
          to_status: bulkNext, changed_by: profile?.id ?? null, note: 'עדכון גורף מלוח הייצור',
        })
        if (historyError) throw historyError
      }
      setSelected(new Set())
    } catch {
      failed = true
      setErr('העדכון הקבוצתי לא הושלם. יש לרענן ולבדוק את הפריטים.')
    } finally {
      try {
        for (const orderId of affectedOrderIds) await recalculateOrderStatus(orderId, profile?.id ?? null)
      } catch {
        failed = true
        setErr('חישוב סטטוס ההזמנה נכשל. יש לרענן ולבדוק את ההזמנה.')
      }
      setBusy(false)
    }
    // Reload without clearing an update error.
    if (!failed) await load()
  }

  const assignSelected = async (workerId: string) => {
    if (busy || !workerId || !selected.size || selectedItems.length !== selected.size) return
    setBusy(true)
    const ids = Array.from(selected)
    await supabase.from('order_items').update({ assigned_worker: workerId }).in('id', ids)
    setAssignWorker('')
    await load()
    setBusy(false)
  }

  const printSelected = () => {
    const chosen = items.filter(i => selected.has(i.id))
    printWorkOrder(chosen)
  }

  // קידום פריט בודד בלחיצה על כפתור הפעולה בשורה
  const advanceOne = async (item: Item) => {
    if (busy || !item.id || !item.order_id || !item.for_execution) return
    const route = getItemRoute(item.family)
    const next = nextItemStatus(route, item.item_status)
    if (!next) return
    setBusy(true)

    try {
      const updates: Record<string, unknown> = { item_status: next }

      const { data, error } = await supabase.from('order_items').update(updates)
        .eq('id', item.id).eq('for_execution', true).eq('item_status', item.item_status).select('id')
      if (error) throw error
      if (!data?.length) throw new Error('הפריט השתנה; יש לרענן')
      await supabase.from('order_status_history').insert({
        order_id: item.order_id,
        order_item_id: item.id,
        from_status: item.item_status,
        to_status: next,
        changed_by: profile?.id ?? null,
        note: 'קידום פריט מלוח הייצור',
      })

      await recalculateOrderStatus(item.order_id, profile?.id ?? null)
      await load()
    } catch {
      setErr('עדכון הפריט או חישוב סטטוס ההזמנה נכשל. יש לרענן ולבדוק את ההזמנה.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={selected.size > 0 ? 'pb-24' : ''}>
      <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">לוח הייצור</h1>
          <div className="text-sm text-slate-500 mt-0.5">
            {orderCount} הזמנות · {filtered.length} פריטים פעילים
          </div>
        </div>
        <input className="input w-64"
               placeholder="לקוח, מספר הזמנה, מיקום, בד…"
               value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* טאבי סינון */}
      <div className="flex gap-1 mb-3">
        {(['all', 'cutter', 'office'] as const).map(route => <button key={route} disabled={busy}
          onClick={() => { setActiveRoute(route); setSelected(new Set()) }}
          className={`px-3 py-1 rounded-full text-xs font-medium ${activeRoute === route ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          {route === 'all' ? 'כל המסלולים' : ITEM_ROUTE_LABELS[route]}
        </button>)}
      </div>
      <div className="flex gap-1 mb-4">
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setActiveTab(t.key); setSelected(new Set()) }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-brand text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div className="card p-4 mb-3 text-red-600 text-sm">{err}</div>}
      {loading && <div className="text-slate-500">טוען...</div>}

      {!loading && groups.length === 0 && (
        <div className="card p-8 text-center text-slate-400">אין פריטים להצגה.</div>
      )}

      {!loading && groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map(g => {
            const readyCount = g.items.filter(i => i.item_status === 'ready' || i.item_status === 'done').length
            const allReady = readyCount === g.items.length
            const noneStarted = g.items.every(i => i.item_status === 'new')
            const groupSelected = g.items.every(i => selected.has(i.id))

            return (
              <div key={g.orderId} className="card overflow-hidden">
                {/* כותרת קבוצת הזמנה */}
                <div className={`flex items-center gap-3 p-3 flex-wrap ${allReady ? 'bg-brand-light' : 'bg-slate-50'}`}>
                  <input type="checkbox" checked={groupSelected} disabled={busy}
                         onChange={() => toggleGroup(g.items)}
                         className="w-4 h-4 shrink-0" />
                  <div className="flex items-baseline gap-2 flex-wrap flex-1 min-w-0">
                    <span className="font-bold">{g.customerName}</span>
                    <span className="text-xs text-slate-400 font-mono">
                      #{g.orderNumber ?? '—'}{g.agentName && ` · ${g.agentName}`}
                    </span>
                    <span className="text-xs text-slate-600">
                      {g.items.length} פריטים
                      {allReady ? ' · הכל מוכן' : noneStarted ? ' · טרם נכנס למסלול' : ` · ${readyCount} מוכן`}
                    </span>
                  </div>
                  {allReady && (
                    <button className="btn-ghost text-xs px-3 py-1.5"
                            onClick={() => navigate(`/orders/${g.orderId}`)}>
                      פתח הזמנה
                    </button>
                  )}
                  <button className="text-sm font-bold text-brand shrink-0"
                          onClick={() => navigate(`/orders/${g.orderId}`)}>
                    פתח הזמנה <ArrowLeft size={14} className="inline-block" aria-hidden="true" />
                  </button>
                </div>

                {/* שורות פריטים */}
                <div className="divide-y">
                  {g.items.map(i => {
                    const route = getItemRoute(i.family)
                    const track = route === 'cutter' ? INTERNAL_ITEM_TRACK : EXTERNAL_ITEM_TRACK
                    const stepIdx = track.indexOf(i.item_status as never)
                    const next = nextItemStatus(route, i.item_status)
                    const worker = workers.find(w => w.id === i.assigned_worker)

                    return (
                      <div key={i.id}
                           className={`flex items-center gap-3 p-3 flex-wrap ${selected.has(i.id) ? 'bg-brand-light' : ''}`}>
                        <input type="checkbox" checked={selected.has(i.id)} disabled={busy}
                               onChange={() => toggleItem(i.id)}
                               className="w-4 h-4 shrink-0" />

                        <div className="flex-1 min-w-[180px] cursor-pointer"
                             onClick={() => navigate(`/orders/${i.order_id}`)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">{i.location}</span>
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              route === 'cutter' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {ITEM_ROUTE_LABELS[route]}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">
                            {itemTypeLabel(i)}
                            {' · '}<span dir="ltr">{i.width_m}×{i.heights_m?.join('/')}</span> מ׳
                            {i.fabric_text && <> · {i.fabric_text}</>}
                            {i.color_fabric_text && <> · {i.color_fabric_text}</>}
                            {i.mount_type && <> · {i.mount_type}</>}
                            {i.mechanism_side && <> · {i.mechanism_side}</>}
                          </div>
                        </div>

                        {/* שלב — פס התקדמות + תווית, כמו V1 */}
                        <div className="w-32 shrink-0">
                          <div className="flex gap-0.5 mb-1">
                            {track.map((_, idx) => (
                              <span key={idx} className="h-1 flex-1 rounded-sm"
                                    style={{ background: idx <= stepIdx ? STAGE_COLOR[i.item_status] : '#e5e2dc' }} />
                            ))}
                          </div>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-100" style={{ color: STAGE_COLOR[i.item_status] }}>
                            {ITEM_STATUS_LABELS[i.item_status]}
                          </span>
                        </div>

                        {/* אחראי */}
                        <div className="w-24 shrink-0 text-xs text-slate-500 truncate">
                          {worker?.full_name ?? '—'}
                        </div>

                        {/* פעולה */}
                        <div className="shrink-0">
                          {next ? (
                            <button
                              disabled={busy}
                              className="text-xs font-bold border border-brand text-brand-dark bg-brand-light rounded-md px-3 py-1.5 hover:bg-brand hover:text-white transition-colors"
                              onClick={e => { e.stopPropagation(); advanceOne(i) }}>
                              {ADVANCE_LABELS[next]}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">אין פעולה</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* פס פעולות אחד בתחתית — בחירה מרובה (V1) */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 right-0 left-0 z-40 bg-brand text-white shadow-lg">
          <div className="mx-auto max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl px-4 py-3
                          flex items-center gap-3 flex-wrap">
            <span className="text-sm font-bold shrink-0">{selected.size} פריטים נבחרו</span>
            {selectedOrderLabel && (
              <span className="text-xs text-white/70 shrink-0">{selectedOrderLabel}</span>
            )}
            <div className="flex-1" />
            <button className="border border-white/40 rounded-md px-3 py-2 text-sm font-medium"
              disabled={busy || !bulkNext} onClick={advanceSelected}>
              <Check size={16} className="inline-block me-1" aria-hidden="true" /> {bulkNext ? ADVANCE_LABELS[bulkNext] : 'אין מעבר משותף לבחירה'}
            </button>
            <select className="rounded-md px-3 py-2 text-sm bg-transparent border border-white/40 text-white"
                    disabled={busy}
                    value={assignWorker}
                    onChange={e => { setAssignWorker(e.target.value); assignSelected(e.target.value) }}>
              <option value="" className="text-slate-700">שייך עובד</option>
              {workers.map(w => <option key={w.id} value={w.id} className="text-slate-700">{w.full_name}</option>)}
            </select>
            <button className="border border-white/40 rounded-md px-3 py-2 text-sm font-medium"
                    onClick={printSelected}>
              <Printer size={16} className="inline-block me-1" aria-hidden="true" /> הדפס הוראות
            </button>
            <button className="text-sm text-white/75" disabled={busy} onClick={() => setSelected(new Set())}>
              נקה
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
