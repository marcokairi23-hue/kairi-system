import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { ORDER_STATUS_LABELS } from '../../lib/statusHelpers'

interface StatusSuggestionBannerProps {
  orderId: string
  currentStatus: string
  suggestedStatus: string
  reason: string
  onApplied?: (newStatus: string) => void
}

export default function StatusSuggestionBanner({
  orderId,
  currentStatus,
  suggestedStatus,
  reason,
  onApplied,
}: StatusSuggestionBannerProps) {
  const { profile } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed) return null

  const suggestedLabel = ORDER_STATUS_LABELS[suggestedStatus] ?? suggestedStatus

  const apply = async () => {
    setApplying(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('orders')
      .update({ status: suggestedStatus })
      .eq('id', orderId)

    if (updateError) {
      setError('שגיאה בעדכון הסטטוס')
      setApplying(false)
      return
    }

    await supabase.from('order_status_history').insert({
      order_id: orderId,
      from_status: currentStatus,
      to_status: suggestedStatus,
      changed_by: profile?.id ?? null,
      note: reason,
    })

    setApplying(false)
    onApplied?.(suggestedStatus)
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
      <div className="text-blue-900">
        <span>{reason}</span>
        {error && <span className="mr-2 text-red-600">— {error}</span>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={apply}
          disabled={applying}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {applying ? 'מעדכן...' : `שנה ל${suggestedLabel}`}
        </button>
        <button
          onClick={() => setDismissed(true)}
          disabled={applying}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          התעלם
        </button>
      </div>
    </div>
  )
}
