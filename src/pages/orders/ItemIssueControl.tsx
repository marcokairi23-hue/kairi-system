import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { recalculateOrderStatus } from '../../lib/recalculateOrderStatus'
import { useAuth } from '../../lib/auth'

export interface ItemIssue { id: string; issue_kind?: string | null; issue_note?: string | null }
const kinds: Record<string, string> = { defect: 'תקלה בפריט', wrong_dimensions: 'מידות שגויות', missing_delivery: 'פריט שלא סופק' }

export default function ItemIssueControl({ item, orderId, onSaved }: { item: ItemIssue; orderId: string; onSaved: () => Promise<void> }) {
  const { profile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [kind, setKind] = useState(item.issue_kind ?? 'defect')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (resolve: boolean) => {
    if (!note.trim() || busy) return
    setBusy(true); setError('')
    let query = supabase.from('order_items')
      .update({ issue_kind: resolve ? null : kind, issue_note: note.trim() })
      .eq('id', item.id).eq('order_id', orderId)
    query = item.issue_kind ? query.eq('issue_kind', item.issue_kind) : query.is('issue_kind', null)
    const { data, error: updateError } = await query.select('id')
    if (updateError || !data?.length) { setError('הטיפול לא נשמר. בדוק הרשאות ורענן את ההזמנה.'); setBusy(false); return }
    try {
      await recalculateOrderStatus(orderId, profile?.id ?? null)
      await onSaved()
      setEditing(false); setNote('')
    } catch { setError('הדיווח נשמר, אך עדכון ההזמנה נכשל. יש לרענן לפני פעולה נוספת.') }
    setBusy(false)
  }
  return <div className="mt-2 text-xs">
    {item.issue_kind && <div className="rounded bg-amber-50 text-amber-900 p-2" role="status">
      <strong>דורש טיפול: {kinds[item.issue_kind] ?? item.issue_kind}</strong>
      <p>{item.issue_note}</p>
    </div>}
    {!editing ? <button className="text-brand underline mt-1" onClick={() => { setNote(''); setEditing(true) }}>
      {item.issue_kind ? 'עדכון או סגירת טיפול' : 'דיווח על תקלה / מידות / אספקה חסרה'}
    </button> : <div className="space-y-2 mt-2">
      <select className="input" aria-label="סוג טיפול" value={kind} onChange={e => setKind(e.target.value)} disabled={busy}>
        {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <textarea className="input" aria-label="פירוט הדיווח או פתרון התקלה" value={note} onChange={e => setNote(e.target.value)}
        placeholder="פירוט הדיווח, או מה תוקן לפני סגירת הטיפול..." disabled={busy} />
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" disabled={busy || !note.trim()} onClick={() => save(false)}>שמירת דיווח</button>
        {item.issue_kind && <button className="btn-primary" disabled={busy || !note.trim()} onClick={() => save(true)}>הטיפול הושלם</button>}
        <button className="btn-ghost" disabled={busy} onClick={() => setEditing(false)}>ביטול</button>
      </div>
    </div>}
    {error && <p className="text-red-600 mt-1" role="alert">{error}</p>}
  </div>
}
