import { useEffect, useState } from 'react'
import { SHADING_LABELS } from '../../lib/statusHelpers'

export interface SelectableItem {
  id: string
  family: 'curtain' | 'shading'
  location: string
  subtype?: string
  price: number
  for_execution: boolean
}

interface ItemSelectionDialogProps {
  open: boolean
  items: SelectableItem[]
  orderTotal: number
  stage: 'agent' | 'office'
  onConfirm: (selectedIds: Set<string>) => void
  onClose: () => void
}

const itemLabel = (item: SelectableItem) => {
  if (item.family === 'shading') {
    const subtypeLabel = (item.subtype && SHADING_LABELS[item.subtype]) ?? item.subtype
    return `${item.location || 'ללא מיקום'} — ${subtypeLabel}`
  }
  return item.location || 'ללא מיקום'
}

export default function ItemSelectionDialog({
  open,
  items,
  orderTotal,
  onConfirm,
  onClose,
}: ItemSelectionDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (open) setSelected(new Set(items.filter(i => i.for_execution).map(i => i.id)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(items.map(i => i.id)))
  const clearAll = () => setSelected(new Set())

  const selectedTotal = items
    .filter(i => selected.has(i.id))
    .reduce((s, i) => s + (i.price || 0), 0)

  const overBudget = selectedTotal > orderTotal

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
        <h3 className="font-bold text-lg mb-1 text-center">בחירת פריטים לביצוע</h3>
        <p className="text-xs text-slate-500 text-center mb-4">
          אילו פריטים עוברים לייצור בשלב זה?
        </p>

        <div className="flex justify-between mb-2">
          <button className="text-xs text-blue-600 hover:underline" onClick={selectAll}>
            בחר הכל
          </button>
          <button className="text-xs text-slate-500 hover:underline" onClick={clearAll}>
            נקה הכל
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1 mb-3">
          {items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">אין פריטים בהזמנה</div>
          ) : (
            items.map(item => (
              <label
                key={item.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  {itemLabel(item)}
                </span>
                <span className="text-slate-500">₪{(item.price || 0).toLocaleString()}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex items-center justify-between text-sm font-medium mb-2">
          <span>סה״כ נבחר</span>
          <span>₪{selectedTotal.toLocaleString()}</span>
        </div>

        {overBudget && (
          <div className="rounded-lg border border-orange-300 bg-orange-50 text-orange-800 text-xs px-3 py-2 mb-3">
            סכום הפריטים הנבחרים (₪{selectedTotal.toLocaleString()}) גבוה מסכום ההזמנה
            (₪{orderTotal.toLocaleString()}). ניתן להמשיך בכל זאת.
          </div>
        )}

        <div className="flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={() => onConfirm(selected)}
          >
            אישור
          </button>
          <button className="btn-ghost" onClick={onClose}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
