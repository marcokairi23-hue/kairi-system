// ============================================================
// מודל הסטטוסים המרכזי — הזמנות ופריטים
// ============================================================

// ---------- סטטוסי הזמנה ----------
export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  quote: 'הצעת מחיר',
  waiting_payment: 'ממתין לגבייה',
  new_execution: 'חדש לביצוע',
  in_execution: 'בביצוע',
  ready: 'מוכן',
  completed: 'הושלם',
  cancelled: 'מבוטל',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  quote: 'bg-slate-100 text-slate-700',
  waiting_payment: 'bg-amber-100 text-amber-700',
  new_execution: 'bg-blue-100 text-blue-700',
  in_execution: 'bg-purple-100 text-purple-700',
  ready: 'bg-teal-100 text-teal-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

// הזמנה "פעילה" (יצאה מתהליך המכירה/גבייה, יש לה עבודה בפועל) — משמש למסך הפריטים
// (DEFECTS_MAP #20): פריט לא אמור להופיע שם כל עוד ההזמנה שלו עדיין quote/pending_payment/draft.
export const ACTIVE_ORDER_STATUSES = ['new_execution', 'in_execution', 'ready', 'completed']

// זרימת הסטטוסים: מה הבא בתור
export const ORDER_STATUS_NEXT: Record<string, string | undefined> = {}

export type V1OrderStatus = 'draft' | 'quote' | 'waiting_payment' | 'new_execution' | 'in_execution' | 'ready' | 'completed'

export interface OrderStatusInput {
  status?: string
  payment_approved?: boolean | null
  final_total: number
  order_items?: ItemLike[]
  payments?: { amount: number }[]
}

export function deriveV1OrderStatus(order: OrderStatusInput, submitted = true): V1OrderStatus | 'cancelled' {
  if (!submitted || order.status === 'draft') return 'draft'
  if (order.status === 'cancelled') return 'cancelled'
  const execution = (order.order_items ?? []).filter(i => i.for_execution && i.item_status !== 'cancelled')
  if (execution.length === 0) return 'quote'
  if (order.payment_approved !== true) return 'waiting_payment'
  if (execution.every(i => i.item_status === 'new')) return 'new_execution'
  if (execution.every(i => i.item_status === 'ready')) return 'ready'
  const paid = (order.payments ?? []).reduce((sum, p) => sum + Number(p.amount), 0)
  // Allow only floating-point summation error, not a rounded-away outstanding amount.
  const zeroBalance = Math.abs(order.final_total - paid) <= Number.EPSILON * Math.max(1, Math.abs(order.final_total), Math.abs(paid)) * ((order.payments?.length ?? 0) + 1)
  if (execution.every(i => i.item_status === 'done') && Number.isFinite(paid) && Number.isFinite(order.final_total) && zeroBalance) return 'completed'
  return 'in_execution'
}

// ---------- סטטוסי פריט ----------
// Active V1 workflow; cancelled is display-only legacy compatibility.
export const ITEM_STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  preparation: 'בהכנה',
  ready: 'מוכן',
  done: 'הושלם',
  cancelled: 'מבוטל',
}

export const ITEM_STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  preparation: 'bg-purple-100 text-purple-700',
  ready: 'bg-teal-100 text-teal-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const ITEM_STATUS_ORDER = ['new', 'preparation', 'ready', 'done'] as const

// The V1 status sequence is independent of production route.
export const INTERNAL_ITEM_TRACK = ITEM_STATUS_ORDER
export const EXTERNAL_ITEM_TRACK = ITEM_STATUS_ORDER

// Keep the existing call signature; done and legacy values have no next step.
export function nextItemStatus(
  _route: 'cutter' | 'office',
  currentStatus: string
): string | null {
  const track = ITEM_STATUS_ORDER
  const idx = track.indexOf(currentStatus as never)
  if (idx === -1 || idx === track.length - 1) return null
  return track[idx + 1]
}

// Legacy route-specific timestamps do not represent V1 status transitions.
export function dateColumnForTransition(_from: string, _to: string): string | null {
  return null
}

export function canTransitionItemStatus(from: string, to: string): boolean {
  return nextItemStatus('cutter', from) === to
}

// ---------- המיפוי: סטטוס הזמנה → סטטוס פריט מוצע ----------
// V1 item statuses are not synchronized with the legacy order workflow.
export const ORDER_TO_ITEM_STATUS: Record<string, string | undefined> = {}

// ---------- הכיוון ההפוך: כל הפריטים בסטטוס X → הזמנה מוצעת ----------
export const ITEM_TO_ORDER_STATUS: Record<string, string | undefined> = {}

export const SHADING_LABELS: Record<string, string> = {
  zebra: 'זברה',
  venetian: 'ונציאני',
  roman: 'רומי',
  roller: 'גלילה',
}

// ---------- ניתוב פריט לפי family ----------
// וילון → לביצוע הגוזר (ייצור פנימי). כל סוגי ההצללה → לביצוע המשרד (רכש מספק).
export type ItemRoute = 'cutter' | 'office'

export const ITEM_ROUTE_LABELS: Record<ItemRoute, string> = {
  cutter: 'לגוזר',
  office: 'למשרד',
}

export function getItemRoute(family: string): ItemRoute {
  return family === 'curtain' ? 'cutter' : 'office'
}

// V1 derives routing from family. Keep the legacy argument for compatibility only.
export function resolveItemRoute(
  _productionRoute: 'internal' | 'external' | null | undefined,
  family: string
): ItemRoute {
  return getItemRoute(family)
}

// ============================================================
// חישובי התקדמות
// ============================================================

export interface ItemLike {
  item_status: string
  for_execution: boolean
}

export interface ItemProgress {
  total: number
  done: number
  label: string
  percent: number
  isPartial: boolean
  isComplete: boolean
}

export function calcProgress(items: ItemLike[] = []): ItemProgress {
  const relevant = items.filter(i => i.for_execution && i.item_status !== 'cancelled')
  const total = relevant.length
  const done = relevant.filter(
    i => i.item_status === 'ready' || i.item_status === 'done'
  ).length

  return {
    total,
    done,
    label: total > 0 ? `${done}/${total} מוכנים` : 'אין פריטים',
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    isPartial: done > 0 && done < total,
    isComplete: total > 0 && done === total,
  }
}

// בודק אם כל הפריטים באותו סטטוס — ומחזיר את הסטטוס המוצע להזמנה
export function suggestOrderStatus(
  items: ItemLike[] = [],
  currentOrderStatus: string
): { suggested: string; label: string } | null {
  const relevant = items.filter(i => i.for_execution && i.item_status !== 'cancelled')
  if (relevant.length === 0) return null

  const firstStatus = relevant[0].item_status
  const allSame = relevant.every(i => i.item_status === firstStatus)
  if (!allSame) return null

  const suggested = ITEM_TO_ORDER_STATUS[firstStatus]
  if (!suggested || suggested === currentOrderStatus) return null

  return {
    suggested,
    label: ORDER_STATUS_LABELS[suggested] ?? suggested,
  }
}

// פורמט מחיר
export const fmt = (n: number) => `₪${(n ?? 0).toLocaleString()}`
