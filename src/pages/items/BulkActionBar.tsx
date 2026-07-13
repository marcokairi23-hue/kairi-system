import { useState } from 'react'
import { ITEM_STATUS_LABELS, ITEM_STATUS_ORDER } from '../../lib/statusHelpers'

interface Props {
  count: number
  onApplyStatus: (status: string) => Promise<void>
  onPrintWork: () => void
  onClear: () => void
}

export default function BulkActionBar({ count, onApplyStatus, onPrintWork, onClear }: Props) {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const apply = async () => {
    if (!status) return
    setBusy(true)
    await onApplyStatus(status)
    setStatus('')
    setBusy(false)
  }

  if (count === 0) return null

  return (
    <div className="fixed bottom-0 right-0 left-0 z-40 bg-white border-t shadow-lg">
      <div className="mx-auto max-w-2xl px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-brand shrink-0">
            {count} נבחרו
          </span>

          <select className="input flex-1 min-w-[120px]" value={status}
                  onChange={e => setStatus(e.target.value)}>
            <option value="">שנה סטטוס ל...</option>
            {ITEM_STATUS_ORDER.map(s => (
              <option key={s} value={s}>{ITEM_STATUS_LABELS[s]}</option>
            ))}
            <option value="cancelled">מבוטל</option>
          </select>

          <button className="btn-primary shrink-0 text-sm py-2"
                  disabled={!status || busy} onClick={apply}>
            {busy ? '...' : 'עדכן'}
          </button>

          <button className="btn-ghost shrink-0 text-sm py-2" onClick={onPrintWork}>
            🔧 הוראות עבודה
          </button>

          <button className="text-slate-400 hover:text-slate-600 px-2 shrink-0"
                  onClick={onClear} title="נקה בחירה">
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
