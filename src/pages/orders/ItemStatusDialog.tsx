import { useRef, useState } from 'react'
import { Printer } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import {
  ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, ITEM_STATUS_ORDER, SHADING_LABELS,
} from '../../lib/statusHelpers'
import WorkPrintDialog, { workPrintItems } from '../items/WorkPrintDialog'
import { advanceProductionItems } from '../../lib/productionActions'
import { nextProductionSelection, productionNext, productionSelection } from '../../lib/productionPermissions'

export interface DialogItem {
  id: string
  family: string
  subtype?: string | null
  location: string
  width_m: number
  heights_m: number[]
  item_status: string
  production_version: number
  for_execution: boolean
  issue_kind?: string | null
  // שדות נוספים — נדרשים רק לשם הדפסת דוח עבודה (printWorkOrder), לא לתצוגת הדיאלוג עצמה
  sewing_type?: string | null
  hem_cm?: number | null
  shtaif_cm?: number | null
  is_split?: boolean | null
  fabric_text?: string | null
  mount_type?: string | null
  mechanism_side?: string | null
  color_fabric_text?: string | null
  notes?: string | null
}

interface Props {
  orderId: string
  orderNumber: number | string
  customerName: string
  orderStatus: string
  paymentApproved: boolean | null | undefined
  items: DialogItem[]
  onClose: () => void
  onSaved: () => void
}

export default function ItemStatusDialog({
  orderId, orderNumber, customerName, orderStatus, paymentApproved, items, onClose, onSaved,
}: Props) {
  const { profile } = useAuth()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [newStatus, setNewStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [printOpen, setPrintOpen] = useState(false)
  const operationLock = useRef(false)

  const active = items.filter(i => orderId && i.id)
  const actionable = active.map(item => ({ ...item, order_id:orderId, orders:{ status:orderStatus, payment_approved:paymentApproved } }))
  const eligible = productionSelection(actionable,profile)
  const allowedStatuses = ITEM_STATUS_ORDER.filter(status => selected.size > 0 && Array.from(selected).every(id => {
    const item = actionable.find(i => i.id === id)
    return !!item && productionNext(item,profile) === status
  }))
  const allSelected = eligible.length > 0 && selected.size === eligible.length

  const toggle = (id: string) => {
    if (operationLock.current || !eligible.some(item => item.id === id)) return
    const next = nextProductionSelection(selected,[id])
    if (!next) { setError('ניתן לבחור עד 200 פריטים לקידום בפעולה אחת.'); return }
    setSelected(next)
  }

  const toggleAll = () => {
    if (operationLock.current) return
    const next = nextProductionSelection(selected,eligible.map(item => item.id))
    if (!next) { setError('יותר מ־200 פריטים זמינים. בחרו ידנית עד 200.'); return }
    setSelected(next)
  }

  const apply = async () => {
    if (operationLock.current || !allowedStatuses.includes(newStatus as never)) return
    const chosen = eligible.filter(item => selected.has(item.id))
    if (chosen.length !== selected.size || chosen.length > 200 || !chosen.length) {
      setError('ניתן לקדם עד 200 פריטים מורשים בפעולה אחת.'); return
    }
    operationLock.current = true; setBusy(true); setError(null)
    try {
      await advanceProductionItems(chosen, newStatus)
      onSaved(); onClose()
    } catch (error) {
      setSelected(new Set())
      setError('לא התקבל אישור לפעולה. יש לסגור ולרענן לפני ניסיון נוסף. ' + (error as { message?: string }).message)
    } finally { operationLock.current = false; setBusy(false) }
  }

  const doPrintWork = () => setPrintOpen(true)
  const itemLabel = (item: DialogItem) => {
    if (item.family === 'curtain') return 'וילון'
    return SHADING_LABELS[item.subtype ?? ''] ?? item.subtype ?? 'הצללה'
  }

  return (
    <><div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={() => { if (!operationLock.current) onClose() }}>
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
            <input type="checkbox" checked={allSelected} onChange={toggleAll} disabled={busy || !eligible.length}
                   className="w-4 h-4" />
            בחר פריטים מותרים ({eligible.length})
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
              <input type="checkbox" checked={selected.has(item.id)} disabled={busy || !eligible.some(i => i.id === item.id)} aria-label={`בחר ${item.location}`}
                     onChange={() => toggle(item.id)} className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {itemLabel(item)} — {item.location}
                  {!item.for_execution && (
                    <span className="text-xs text-slate-400 mr-1">(לא לביצוע)</span>
                  )}
                </div>
                <div className="text-xs text-slate-500" dir="ltr">
                  {item.width_m} × {item.heights_m.join('/')} מ׳
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                ITEM_STATUS_COLORS[item.item_status] ?? 'bg-slate-100'
              }`}>
                {ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}
              </span>
            </label>
          ))}
        </div>

        {/* פעולה */}
        <div className="p-4 border-t bg-slate-50 rounded-b-2xl">
          {error && <div role="alert" className="text-red-600 text-sm mb-2">{error}</div>}

          <div className="flex items-center gap-2">
            <select className="input flex-1" value={newStatus}
                    onChange={e => setNewStatus(e.target.value)}
                    disabled={busy || selected.size === 0}>
              <option value="">שנה סטטוס ל...</option>
              {allowedStatuses.map(s => (
                <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>
              ))}
            </select>
            <button className="btn-primary shrink-0"
                    disabled={busy || !allowedStatuses.some(s => s === newStatus)}
                    onClick={apply}>
              {busy ? '...' : `עדכן (${selected.size})`}
            </button>
          </div>

          {/* Print selection is independent of permission to advance a task. */}
          <button className="w-full flex items-center justify-center gap-1.5 text-sm
                             text-brand hover:underline mt-3 disabled:text-slate-300 disabled:no-underline"
                  disabled={busy || !active.length}
                  onClick={doPrintWork}>
            <Printer className="w-4 h-4" /> הדפסת דוח עבודה
          </button>

          <button className="w-full text-center text-sm text-slate-500 hover:text-slate-700 mt-3"
                  disabled={busy} onClick={onClose}>
            סגור
          </button>
        </div>
      </div>
    </div>
    {printOpen && <WorkPrintDialog items={workPrintItems(items,{ id:orderId, order_number:typeof orderNumber === 'number' ? orderNumber : null, customer_name_snapshot:customerName, status:orderStatus, payment_approved:paymentApproved })} onClose={() => setPrintOpen(false)} />}
    </>
  )
}
