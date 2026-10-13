import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { advanceProductionItems } from '../../lib/productionActions'
import { ProductionItem, productionNext } from '../../lib/productionPermissions'
import { ITEM_STATUS_LABELS } from '../../lib/statusHelpers'

interface AdvanceDialogItem extends ProductionItem { location: string }
interface Props { open: boolean; item: AdvanceDialogItem | null; onDone: () => void; onClose: () => void }

export default function ItemAdvanceDialog({ open, item, onDone, onClose }: Props) {
  const { profile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const operationLock = useRef(false)
  useEffect(() => { setError(null) },[open,item?.id])
  if (!open || !item) return null
  const next = productionNext(item,profile)
  const confirm = async () => {
    if (!next || operationLock.current) return
    operationLock.current = true; setSaving(true); setError(null)
    try { await advanceProductionItems([item],next); onDone() }
    catch (error) { setError('לא התקבל אישור לפעולה. יש לרענן. ' + (error as { message?: string }).message) }
    finally { operationLock.current = false; setSaving(false) }
  }
  return <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
    <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
      <h3 className="font-bold text-lg mb-1 text-center">קידום פריט</h3>
      <p className="text-sm text-slate-500 text-center mb-4">{item.location || 'ללא מיקום'}</p>
      {next ? <p className="text-center mb-4">מ־<strong>{ITEM_STATUS_LABELS[item.item_status]}</strong> ל־<strong>{ITEM_STATUS_LABELS[next]}</strong>?</p>
        : <p className="text-center text-slate-500 mb-4">אין פעולה מורשית במצב הנוכחי</p>}
      {error && <div role="alert" className="text-red-600 text-sm mb-3">{error}</div>}
      <div className="flex gap-2">
        <button className="btn-primary flex-1" disabled={!next || saving} onClick={confirm}>{saving ? 'מעדכן...' : 'אישור'}</button>
        <button className="btn-ghost" disabled={saving} onClick={onClose}>ביטול</button>
      </div>
    </div>
  </div>
}
