import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useItemDeepLink } from '../../lib/useItemDeepLink'
import { ArrowLeft, Check, Printer } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  ITEM_STATUS_LABELS, ITEM_ROUTE_LABELS, getItemRoute,
  ACTIVE_ORDER_STATUSES, INTERNAL_ITEM_TRACK, EXTERNAL_ITEM_TRACK,
} from '../../lib/statusHelpers'
import WorkPrintDialog from './WorkPrintDialog'
import { advanceProductionItems } from '../../lib/productionActions'
import { canPrintProduction, filterProductionOrders, nextProductionSelection, productionNext, productionSelection } from '../../lib/productionPermissions'

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
  issue_kind: string | null
  production_version: number
  orders?: {
    order_number: number | null
    customer_name_snapshot: string
    status: string
    payment_approved: boolean | null
    created_at: string
    profiles?: { full_name: string }
  }
}

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
  const [searchParams]=useSearchParams()
  const linkedOrder=searchParams.get('order')
  const { profile } = useAuth()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [activeRoute, setActiveRoute] = useState('all')
  const [printOpen, setPrintOpen] = useState(false)
  const operationLock = useRef(false)
  const loadingLock = useRef(true)
  const loadVersion = useRef(0)
  useItemDeepLink(!loading)
  useEffect(() => {
    setActiveTab('all'); setActiveRoute('all'); setSearch(''); setSelected(new Set())
  }, [linkedOrder])

  const load = async (clearError = true) => {
    const version = ++loadVersion.current
    loadingLock.current = true
    setSelected(new Set())
    setLoading(true)
    const data: Item[] = []
    try {
      // Do not truncate a large or mixed order at the Data API row limit.
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
      setSelected(new Set())
      setErr('לא ניתן לטעון את הפריטים: ' + (error as { message: string }).message)
      setLoading(false)
      loadingLock.current = false
      return
    }

    // Production shows active orders with every RLS-visible sibling item.
    const active = data.filter(i =>
      i.id && i.order_id && ACTIVE_ORDER_STATUSES.includes(i.orders?.status ?? ''))

    setItems(active)
    setSelected(new Set())
    if (clearError) setErr(null)
    setLoading(false)
    loadingLock.current = false
  }

  useEffect(() => {
    setItems([])
    setSelected(new Set())
    void load()
    return () => { loadVersion.current++ }
  }, [profile?.id])

  useEffect(() => { setSelected(new Set()) }, [search, activeTab, activeRoute, profile])

  const itemTypeLabel = (i: Item) => i.family === 'curtain' ? 'וילון' : (i.subtype ?? 'הצללה')

  const filtered = useMemo(() => {
    const tab = TABS.find(t => t.key === activeTab)!
    return filterProductionOrders(items, activeRoute, tab.statuses, search).filter(item => !linkedOrder || item.order_id===linkedOrder)
  }, [items, activeTab, activeRoute, search,linkedOrder])

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
    if (operationLock.current || loadingLock.current || !productionSelection(filtered, profile).some(i => i.id === id)) return
    const next = nextProductionSelection(selected, [id])
    if (!next) { setErr('ניתן לבחור עד 200 פריטים לקידום בפעולה אחת. הבחירה לא שונתה.'); return }
    setSelected(next)
  }

  const toggleGroup = (groupItems: Item[]) => {
    if (operationLock.current || loadingLock.current) return
    const eligible = productionSelection(groupItems, profile)
    const next = nextProductionSelection(selected, eligible.map(item => item.id))
    if (!next) { setErr('בקבוצה יש יותר מהמגבלה של 200 פריטים לפעולה. בחרו ידנית עד 200; הקבוצה לא פוצלה.'); return }
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

  const selectedItems = productionSelection(filtered, profile).filter(i => selected.has(i.id))
  const commonNext = selected.size > 0 && selectedItems.length === selected.size
    ? productionNext(selectedItems[0], profile) : null
  const bulkNext = commonNext && selectedItems.every(i =>
    productionNext(i, profile) === commonNext) ? commonNext : null

  // A synchronous ref closes the gap before React renders disabled buttons.
  const mutate = async (chosen: Item[], next: string) => {
    if (operationLock.current || loadingLock.current || !chosen.length || chosen.some(i => productionNext(i, profile) !== next)) return
    if (chosen.length > 200) { setErr('ניתן לקדם עד 200 פריטים בפעולה אחת. הפעולה לא נשלחה.'); return }
    operationLock.current = true
    setBusy(true)
    setErr(null)
    try {
      await advanceProductionItems(chosen, next)
      setSelected(new Set())
      await load()
    } catch (error) {
      setSelected(new Set())
      setErr('לא התקבל אישור לפעולה. רועננו הנתונים; בדקו הרשאה ומצב לפני ניסיון נוסף. ' +
        (error instanceof Error ? error.message : (error as { message?: string })?.message ?? ''))
      await load(false)
    } finally {
      operationLock.current = false
      setBusy(false)
    }
  }

  const advanceSelected = () => {
    if (bulkNext && selectedItems.length === selected.size) void mutate(selectedItems, bulkNext)
  }

  const advanceOne = (item: Item) => {
    const next = productionNext(item, profile)
    if (next) void mutate([item], next)
  }
  return (
    <div className={selected.size > 0 ? 'pb-56 sm:pb-28' : ''}>
      <div className="flex items-end justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">לוח הייצור</h1>
          <div className="text-sm text-slate-500 mt-0.5">
            {orderCount} הזמנות · {filtered.length} פריטים · מסננים מציגים הזמנות עם כל פריטיהן
          </div>
        </div>
        <input className="input w-full sm:w-64" aria-label="חיפוש הזמנות ופריטים" disabled={busy}
               placeholder="לקוח, מספר הזמנה, מיקום, בד…"
               value={search} onChange={e => { setSearch(e.target.value); setSelected(new Set()) }} />
      </div>

      {/* טאבי סינון */}
      <div className="flex gap-1 mb-3">
        {(['all', 'cutter', 'office'] as const).map(route => <button key={route} disabled={busy}
          onClick={() => { setActiveRoute(route); setSelected(new Set()) }}
          className={`px-3 py-1 rounded-full text-xs font-medium ${activeRoute === route ? 'bg-slate-700 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          {route === 'all' ? 'כל המסלולים' : ITEM_ROUTE_LABELS[route]}
        </button>)}
      </div>
      <div className="flex gap-1 mb-4 flex-wrap">
        {TABS.map(t => (
          <button key={t.key} disabled={busy} onClick={() => { setActiveTab(t.key); setSelected(new Set()) }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'bg-brand text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
            {t.label}
          </button>
        ))}
      </div>

      {err && <div role="alert" className="card p-4 mb-3 text-red-600 text-sm">{err}</div>}
      <button className="btn-ghost text-sm mb-3" disabled={busy || loading} onClick={() => void load()}>רענן נתונים</button>
      {linkedOrder && <button className="btn-ghost text-sm mb-3" onClick={() => navigate('/production')}>הצג את כל ההזמנות</button>}
      {canPrintProduction(profile) && <button className="btn-ghost text-sm mb-3 ms-2" disabled={busy || loading || !filtered.length} onClick={() => setPrintOpen(true)}>
        <Printer size={16} className="me-1" aria-hidden="true" /> הדפס הוראות
      </button>}
      {loading && <div className="text-slate-500">טוען...</div>}

      {!loading && groups.length === 0 && (
        <div className="card p-8 text-center text-slate-400">אין פריטים להצגה.</div>
      )}

      {!loading && groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map(g => {
            const executionItems = g.items.filter(i => i.for_execution && i.item_status !== 'cancelled')
            const readyCount = executionItems.filter(i => !i.issue_kind && (i.item_status === 'ready' || i.item_status === 'done')).length
            const allReady = executionItems.length > 0 && readyCount === executionItems.length
            const noneStarted = g.items.every(i => i.item_status === 'new')
            const eligible = productionSelection(g.items, profile)
            const groupSelected = eligible.length > 0 && eligible.every(i => selected.has(i.id))

            return (
              <div key={g.orderId} className="card overflow-hidden">
                {/* כותרת קבוצת הזמנה */}
                <div className={`flex items-center gap-3 p-3 flex-wrap ${allReady ? 'bg-brand-light' : 'bg-slate-50'}`}>
                  <input type="checkbox" checked={groupSelected} disabled={busy || loading || !eligible.length}
                         aria-label={`בחר פריטים מותרים בהזמנה ${g.orderNumber}`}
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
                    const next = productionNext(i, profile)

                    return (
                      <div key={i.id} id={`item-${i.id}`} tabIndex={-1} style={{ scrollMarginTop:'4rem' }}
                           className={`flex items-center gap-3 p-3 flex-wrap ${selected.has(i.id) ? 'bg-brand-light' : ''}`}>
                        <input type="checkbox" checked={selected.has(i.id)} disabled={busy || loading || !eligible.some(item => item.id === i.id)}
                               aria-label={`בחר ${i.location}`}
                               onChange={() => toggleItem(i.id)}
                               className="w-4 h-4 shrink-0" />

                        <div className="flex-1 min-w-0 basis-40 cursor-pointer"
                             onClick={() => navigate(`/orders/${i.order_id}`)}>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold break-words">{i.location}</span>
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
                            {ITEM_STATUS_LABELS[i.item_status] ?? i.item_status}
                          </span>
                        </div>

                        {/* פעולה */}
                        <div className="shrink-0">
                          {next ? (
                            <button
                              disabled={busy || loading}
                              className="text-xs font-bold border border-brand text-brand-dark bg-brand-light rounded-md px-3 py-1.5 hover:bg-brand hover:text-white transition-colors"
                              onClick={e => { e.stopPropagation(); advanceOne(i) }}>
                              {ADVANCE_LABELS[next]}
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500">{!i.for_execution ? 'לא לביצוע · לצפייה בלבד' : i.issue_kind && i.item_status === 'ready' ? 'טיפול פתוח · לצפייה בלבד' : 'לצפייה בלבד'}</span>
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
              disabled={busy || loading || !bulkNext || selected.size > 200} onClick={advanceSelected}>
              <Check size={16} className="inline-block me-1" aria-hidden="true" /> {bulkNext ? ADVANCE_LABELS[bulkNext] : 'אין מעבר משותף לבחירה'}
            </button>
            <button className="border border-white/40 rounded-md px-3 py-2 text-sm font-medium"
                    disabled={busy || loading} onClick={() => setPrintOpen(true)}>
              <Printer size={16} className="inline-block me-1" aria-hidden="true" /> הדפס הוראות
            </button>
            <button className="text-sm text-white/75" disabled={busy} onClick={() => setSelected(new Set())}>
              נקה
            </button>
          </div>
        </div>
      )}
      {printOpen && <WorkPrintDialog items={filtered} onClose={() => setPrintOpen(false)} />}
    </div>
  )
}
