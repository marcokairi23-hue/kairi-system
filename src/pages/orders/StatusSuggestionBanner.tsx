import { useState } from 'react'
import { useAuth } from '../../lib/auth'
import { ORDER_STATUS_LABELS } from '../../lib/statusHelpers'
import { recalculateOrderStatus } from '../../lib/recalculateOrderStatus'

interface StatusSuggestionBannerProps {
  orderId: string
  currentStatus: string
  suggestedStatus: string
  reason: string
  onApplied?: (newStatus: string) => void
}

export default function StatusSuggestionBanner({
  orderId,
  suggestedStatus,
  reason,
  onApplied,
}: StatusSuggestionBannerProps) {
  const { profile } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (dismissed || suggestedStatus === 'cancelled' || !ORDER_STATUS_LABELS[suggestedStatus]) return null

  const suggestedLabel = ORDER_STATUS_LABELS[suggestedStatus] ?? suggestedStatus

  const apply = async () => {
    setApplying(true)
    setError(null)
    try {
      const status = await recalculateOrderStatus(orderId, profile?.id ?? null)
      setApplying(false)
      onApplied?.(status)
    } catch {
      setError('שגיאה בעדכון הסטטוס')
      setApplying(false)
    }
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
