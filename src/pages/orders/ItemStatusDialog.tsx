import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_ORDER, SHADING_LABELS,
} from '../../lib/statusHelpers'

export interface DialogItem {
  id: string
  family: string
  subtype?: string | null
  location: string
  width_cm: number
  heights_cm: number[]
  item_status: string
  for_execution: boolean
}

interface Props {
  orderId: string
  orderNumber: number | string
  customerName: string
  items: DialogItem[]
  onClose: () => void
  onSaved: () => void
}

export default function ItemStatusDialog({
  orderId, orderNumber, customerName, items, onClose, onSaved,
}: Props) {
  const { profile } = useAuth()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newStatus, setNewStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const active = items.filter(i => i.item_status !== 'cancelled')
  const allSelected = active.length > 0 && selected.size === active.length

  const toggle = (id: string) => {
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    setSelected(next)
  }

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(active.map(i => i.id)))
  }

  const apply = async () => {
    if (!newStatus || selected.size === 0) return
    setBusy(true); setError(null)

    const ids = Array.from(selected)

    const { error: err } = await supabase
      .from('order_items')
      .update({ item_status: newStatus })
      .in('id', ids)

    if (err) {
      setError('שגיאה בעדכון: ' + err.message)
      setBusy(false)
      return
    }

    // רישום בהיסטוריה
    await supabase.from('order_status_history').insert(
      ids.map(itemId => ({
        order_id: orderId,
        order_item_id: itemId,
        to_status: newStatus,
        changed_by: profile?.id ?? null,
        note: 'עדכון גורף מתוך רשימת ההזמנות',
      }))
    )

    onSaved()
    onClose()
  }

  const itemLabel = (item: DialogItem) => {
    if (item.family === 'curtain') return 'וילון'
    return SHADING_LABELS[item.subtype ?? ''] ?? 'הצללה'
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col"
           onClick={e => e.stopPropagation()}>

        {/* כותרת */}
        <div className="p-5 border-b">
          <h3 className="font-bold text-lg">עדכון סטטוס פריטים</h3>
          <p className="text-sm text-slate-500">
            הזמנה #{orderNumber} — {customerName}
          </p>
        </div>

        {/* בחר הכל */}
        <div className="px-5 py-2 border-b bg-slate-50">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
                   className="w-4 h-4" />
            בחר הכל ({active.length} פריטים)
          </label>
        </div>

        {/* רשימת פריטים */}
        <div className="flex-1 overflow-y-auto divide-y">
          {active.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              אין פריטים בהזמנה זו
            </div>
          )}
          {active.map(item => (
            <label key={item.id}
                   className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-50 ${
                     selected.has(item.id) ? 'bg-brand-light' : ''
                   }`}>
              <input type="checkbox" checked={selected.has(item.id)}
                     onChange={() => toggle(item.id)} className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {itemLabel(item)} — {item.location}
                  {!item.for_execution && (
                    <span className="text-xs text-slate-400 mr-1">(לא לביצוע)</span>
                  )}
                </div>
                <div className="text-xs text-slate-500" dir="ltr">
                  {item.width_cm} × {item.heights_cm.join('/')} ס״מ
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                ITEM_STATUS_COLORS[item.item_status] ?? 'bg-slate-100'
              }`}>
                {ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}
              </span>
            </label>
          ))}
        </div>

        {/* פעולה */}
        <div className="p-4 border-t bg-slate-50 rounded-b-2xl">
          {error && <div className="text-red-600 text-sm mb-2">{error}</div>}

          <div className="flex items-center gap-2">
            <select className="input flex-1" value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    disabled={selected.size === 0}>
              <option value="">שנה סטטוס ל...</option>
              {ITEM_STATUS_ORDER.map(s => (
                <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>
              ))}
              <option value="cancelled">מבוטל</option>
            </select>
            <button className="btn-primary shrink-0"
                    disabled={busy || !newStatus || selected.size === 0}
                    onClick={apply}>
              {busy ? '...' : `עדכן (${selected.size})`}
            </button>
          </div>

          <button className="w-full text-center text-sm text-slate-500 hover:text-slate-700 mt-3"
                  onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
  )
}
