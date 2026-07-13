// קבועים משותפים לסטטוסים — הזמנות ופריטים

export const ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'טיוטה',
  quote: 'הצעת מחיר',
  pending_payment: 'ממתין לגבייה',
  ready: 'חדש לביצוע',
  in_production: 'בייצור',
  completed: 'הושלם',
  cancelled: 'מבוטל',
}

export const ORDER_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  quote: 'bg-slate-100 text-slate-700',
  pending_payment: 'bg-amber-100 text-amber-700',
  ready: 'bg-blue-100 text-blue-700',
  in_production: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const ORDER_STATUS_NEXT: Record<string, string | undefined> = {
  quote: 'pending_payment',
  pending_payment: 'ready',
  ready: 'in_production',
  in_production: 'completed',
}

export const ITEM_STATUS_LABELS: Record<string, string> = {
  new: 'חדש',
  cut: 'נגזר',
  sewing: 'בתפירה',
  ready: 'מוכן',
  installed: 'הותקן',
  cancelled: 'מבוטל',
}

export const ITEM_STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  cut: 'bg-amber-100 text-amber-700',
  sewing: 'bg-purple-100 text-purple-700',
  ready: 'bg-green-100 text-green-700',
  installed: 'bg-teal-100 text-teal-700',
  cancelled: 'bg-red-100 text-red-700',
}

export const ITEM_STATUS_ORDER = ['new', 'cut', 'sewing', 'ready', 'installed'] as const

export const SHADING_LABELS: Record<string, string> = {
  zebra: 'זברה',
  venetian: 'ונציאני',
  roman: 'רומי',
  roller: 'גלילה',
}

// חישוב התקדמות פריטים בהזמנה
export interface ItemProgress {
  total: number
  done: number      // מוכן או הותקן
  label: string     // "4/6 מוכנים"
  percent: number
  isPartial: boolean
  isComplete: boolean
}

export function calcProgress(
  items: Array<{ item_status: string; for_execution: boolean }> = []
): ItemProgress {
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

// פורמט מחיר
export const fmt = (n: number) => `₪${(n ?? 0).toLocaleString()}`
