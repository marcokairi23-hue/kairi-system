// ============================================================
// מודל הסטטוסים המרכזי — הזמנות ופריטים
// ============================================================

// ---------- סטטוסי הזמנה ----------
export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  quote: 'הצעת מחיר',
  pending_payment: 'ממתין לגבייה',
  ready: 'חדש לביצוע',
  in_production: 'בייצור',
  ready_for_install: 'מוכן',
  picked_by_installer: 'נאסף ע"י מתקין',
  completed: 'הושלם',
  cancelled: 'מבוטל',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  quote: 'bg-slate-100 text-slate-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700',
  in_production: 'bg-purple-100 text-purple-700',
  ready_for_install: 'bg-teal-100 text-teal-700',
  picked_by_installer: 'bg-indigo-100 text-indigo-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

// הזמנה "פעילה" (יצאה מתהליך המכירה/גבייה, יש לה עבודה בפועל) — משמש למסך הפריטים
// (DEFECTS_MAP #20): פריט לא אמור להופיע שם כל עוד ההזמנה שלו עדיין quote/pending_payment/draft.
export const ACTIVE_ORDER_STATUSES = ['ready', 'in_production', 'ready_for_install', 'picked_by_installer', 'completed']

// זרימת הסטטוסים: מה הבא בתור
export const ORDER_STATUS_NEXT: Record<string, string | undefined> = {
  quote: 'pending_payment',
  pending_payment: 'ready',
  ready: 'in_production',
  in_production: 'ready_for_install',
  ready_for_install: 'picked_by_installer',
  picked_by_installer: 'completed',
}

// ---------- סטטוסי פריט ----------
// חדש → נגזר → במתפרה → מוכן → הותקן
export const ITEM_STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  cut: 'נגזר',
  sewing: 'במתפרה',
  ordered_from_supplier: 'הוזמן מספק',
  arrived: 'הגיע מספק',
  ready: 'מוכן',
  installed: 'הותקן',
  cancelled: 'מבוטל',
}

export const ITEM_STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  cut: 'bg-amber-100 text-amber-700',
  sewing: 'bg-purple-100 text-purple-700',
  ordered_from_supplier: 'bg-amber-100 text-amber-700',
  arrived: 'bg-purple-100 text-purple-700',
  ready: 'bg-teal-100 text-teal-700',
  installed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const ITEM_STATUS_ORDER = ['new', 'cut', 'sewing', 'ordered_from_supplier', 'arrived', 'ready', 'installed'] as const

// ---------- מסלול ייצור פר-פריט (פנימי/חיצוני), לפי production_route ----------
export const INTERNAL_ITEM_TRACK = ['new', 'cut', 'sewing', 'ready'] as const
export const EXTERNAL_ITEM_TRACK = ['new', 'ordered_from_supplier', 'arrived', 'ready'] as const

// הצעד הבא במסלול של הפריט (לפי production_route), או null אם הגיע ל"מוכן"/לא במסלול
export function nextItemStatus(
  route: 'cutter' | 'office',
  currentStatus: string
): string | null {
  const track = route === 'cutter' ? INTERNAL_ITEM_TRACK : EXTERNAL_ITEM_TRACK
  const idx = track.indexOf(currentStatus as never)
  if (idx === -1 || idx === track.length - 1) return null
  return track[idx + 1]
}

// עמודת התאריך הייעודית שיש לעדכן במעבר הספציפי הזה (אם קיימת)
export function dateColumnForTransition(from: string, to: string): string | null {
  if (from === 'new' && to === 'cut') return 'date_cut'
  if (from === 'new' && to === 'ordered_from_supplier') return 'date_sent'
  if (from === 'ordered_from_supplier' && to === 'arrived') return 'date_returned'
  return null
}

// ---------- המיפוי: סטטוס הזמנה → סטטוס פריט מוצע ----------
// כשמקדמים הזמנה, זה הסטטוס שיוצע לפריטים שלה
export const ORDER_TO_ITEM_STATUS: Record<string, string | undefined> = {
  ready: 'new',                    // חדש לביצוע → הפריטים "חדש" (טרם נגזרו)
  in_production: 'sewing',         // בייצור → הפריטים "במתפרה"
  ready_for_install: 'ready',      // מוכן → הפריטים "מוכן"
  completed: 'installed',          // הושלם → הפריטים "הותקן"
}

// ---------- הכיוון ההפוך: כל הפריטים בסטטוס X → הזמנה מוצעת ----------
export const ITEM_TO_ORDER_STATUS: Record<string, string | undefined> = {
  ready: 'ready_for_install',      // כל הפריטים מוכנים → ההזמנה "מוכן"
  installed: 'completed',          // כל הפריטים הותקנו → ההזמנה "הושלם"
  sewing: 'in_production',         // כל הפריטים במתפרה → ההזמנה "בייצור"
  cut: 'in_production',            // כל הפריטים נגזרו → ההזמנה "בייצור"
}

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

// המקור האמיתי הוא production_route ('internal'/'external') מה-DB.
// fallback ל-family רק אם השדה חסר (לא אמור לקרות בפריטים חדשים).
export function resolveItemRoute(
  productionRoute: 'internal' | 'external' | null | undefined,
  family: string
): ItemRoute {
  if (productionRoute === 'internal') return 'cutter'
  if (productionRoute === 'external') return 'office'
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
    i => i.item_status === 'ready' || i.item_status === 'installed'
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
