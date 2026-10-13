import { useRef, useState } from 'react'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useAuth } from '../../lib/auth'
import { canPrintProduction, defaultWorkPrint } from '../../lib/productionPermissions'
import { ITEM_STATUS_LABELS, SHADING_LABELS } from '../../lib/statusHelpers'
import { printWorkOrder, WorkItem } from './printWork'

export interface PrintableItem extends WorkItem {
  id: string
  order_id: string
  for_execution: boolean
  item_status: string
  production_version: number
  orders?: { order_number: number | null; customer_name_snapshot: string; status?: string; payment_approved?: boolean | null }
}

export function workPrintItems<T extends { id: string; family: string; location: string; width_m: number; heights_m: number[]; item_status: string; for_execution: boolean }>(
  items: T[], order: { id: string; order_number: number | null; customer_name_snapshot: string; status?: string; payment_approved?: boolean | null },
): PrintableItem[] {
  return items.map(item => ({ subtype:null, sewing_type:null, hem_cm:null, shtaif_cm:null, is_split:null,
    fabric_text:null, mount_type:null, mechanism_side:null, color_fabric_text:null, notes:null, production_version:0,
    ...item, order_id:order.id, orders:order }))
}

export default function WorkPrintDialog({ items, onClose }: { items: PrintableItem[]; onClose: () => void }) {
  const { profile } = useAuth()
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.filter(item => defaultWorkPrint(item,profile)).map(item => item.id)))
  const [error, setError] = useState<string | null>(null)
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFocus(dialog,onClose)
  if (!canPrintProduction(profile)) return null
  const chosen = items.filter(item => selected.has(item.id))
  const toggle = (id: string) => setSelected(previous => {
    const next = new Set(previous)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const print = () => {
    try { printWorkOrder(chosen); setError(null) }
    catch { setError('לא ניתן לפתוח את ההדפסה. אפשר לנסות שוב בלי לשנות את הפריטים.') }
  }
  return <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4" onClick={onClose}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="work-print-title" className="bg-white rounded-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
      <div className="p-4 border-b">
        <h2 id="work-print-title" className="text-lg font-bold">בחירת פריטים להוראות עבודה</h2>
        <p className="text-xs text-slate-500 mt-1">הדפסה והדפסה חוזרת אינן משנות סטטוס. אפשר להוסיף גלילות באותה בחירה.</p>
      </div>
      <label className="flex items-center gap-2 px-4 py-3 border-b text-sm">
        <input type="checkbox" aria-label="בחר הכל להדפסה" checked={items.length > 0 && chosen.length === items.length}
          onChange={() => setSelected(chosen.length === items.length ? new Set() : new Set(items.map(item => item.id)))} />
        בחר הכל להדפסה ({items.length})
      </label>
      <div className="flex-1 min-h-0 overflow-y-auto divide-y" data-testid="print-list">
        {items.map(item => <label key={item.id} className={`flex gap-3 items-start p-3 cursor-pointer ${selected.has(item.id) ? 'bg-brand-light' : ''}`}>
          <input type="checkbox" className="w-4 h-4 mt-1 shrink-0" checked={selected.has(item.id)} aria-label={`הדפס ${item.location}`} onChange={() => toggle(item.id)} />
          <div className="min-w-0 flex-1 text-sm break-words">
            <div className="font-bold">#{item.orders?.order_number ?? '—'} · {item.orders?.customer_name_snapshot}</div>
            <div>{item.family === 'curtain' ? 'וילון' : SHADING_LABELS[item.subtype ?? ''] ?? item.subtype ?? 'הצללה'} · {item.location}</div>
            <div className="text-xs text-slate-500">בד: {item.fabric_text || item.color_fabric_text || '—'}</div>
            <div className="text-xs text-slate-500 mt-1">{ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}{!item.for_execution && ' · לא לביצוע'}</div>
          </div>
        </label>)}
      </div>
      <div className="p-4 border-t bg-slate-50 shrink-0">
        {error && <div role="alert" className="text-sm text-red-600 mb-2">{error}</div>}
        <div className="flex gap-2 flex-wrap items-center">
          <span className="text-sm flex-1">{chosen.length} מתוך {items.length} להדפסה</span>
          <button className="btn-primary" disabled={!chosen.length} onClick={print}>הדפס הוראות עבודה</button>
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  </div>
}
