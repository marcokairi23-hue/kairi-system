import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import {
  ITEM_STATUS_LABELS, resolveAuthoritativeItemRoute, nextItemStatus, dateColumnForTransition,
} from '../../lib/statusHelpers'

interface AdvanceDialogItem {
  id: string
  order_id: string
  family: string
  location: string
  production_route: 'internal' | 'external' | null
  routing_state: string | null
  routing_owner: string | null
  item_status: string
  assigned_worker: string | null
}

interface ItemAdvanceDialogProps {
  open: boolean
  item: AdvanceDialogItem | null
  onDone: () => void
  onClose: () => void
}

interface Worker {
  id: string
  full_name: string
}

export default function ItemAdvanceDialog({ open, item, onDone, onClose }: ItemAdvanceDialogProps) {
  const { profile } = useAuth()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      supabase.from('profiles').select('id, full_name').order('full_name')
        .then(({ data }) => setWorkers(data ?? []))
      setSelectedWorker(item?.assigned_worker ?? '')
    }
  }, [open, item?.assigned_worker])

  if (!open || !item) return null

  const route = resolveAuthoritativeItemRoute(item.routing_state, item.routing_owner, item.production_route)
  const next = route ? nextItemStatus(route, item.item_status) : null

  const confirm = async () => {
    if (!next) return
    setSaving(true)
    setError(null)

    const dateColumn = dateColumnForTransition(item.item_status, next)
    const updates: Record<string, unknown> = { item_status: next }
    if (dateColumn) updates[dateColumn] = new Date().toISOString()
    if (selectedWorker) updates.assigned_worker = selectedWorker

    const { error: updateError } = await supabase
      .from('order_items').update(updates).eq('id', item.id)
    if (updateError) {
      setError('לא ניתן לקדם את הפריט: ' + updateError.message)
      setSaving(false)
      return
    }

    await supabase.from('order_status_history').insert({
      order_id: item.order_id,
      order_item_id: item.id,
      from_status: item.item_status,
      to_status: next,
      changed_by: profile?.id ?? null,
      note: 'קידום פריט',
    })

    setSaving(false)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h3 className="font-bold text-lg mb-1 text-center">קידום פריט</h3>
        <p className="text-sm text-slate-500 text-center mb-4">{item.location || 'ללא מיקום'}</p>

        {next ? (
          <p className="text-center mb-4">
            מ-<strong>{ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}</strong>
            {' '}ל-<strong>{ITEM_STATUS_LABELS[next] ?? next}</strong>?
          </p>
        ) : (
          <p className="text-center text-slate-400 mb-4">הפריט כבר בסוף המסלול</p>
        )}

        <label className="block text-xs font-medium text-slate-600 mb-1">שיוך עובד אחראי (אופציונלי)</label>
        {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
        <select className="input mb-4" value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)}>
          <option value="">ללא שיוך</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.full_name}</option>)}
        </select>

        <div className="flex gap-2">
          <button className="btn-primary flex-1" disabled={!next || saving} onClick={confirm}>
            {saving ? 'מעדכן...' : 'אישור'}
          </button>
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}
