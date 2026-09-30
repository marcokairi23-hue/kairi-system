import { useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { PaymentRecord } from '../../lib/payments'
import { supabase } from '../../lib/supabase'
import { fmt } from '../../lib/statusHelpers'
import { PAYMENT_ROUTE_OPTIONS } from './types'

interface Props {
  orderNumber: number | string
  customerName: string
  finalTotal: number
  receivedTotal: number
  payments: PaymentRecord[]
  onDone: () => Promise<void> | void
}

export default function PendingPaymentPanel({
  orderNumber,
  customerName,
  finalTotal,
  receivedTotal,
  payments,
  onDone,
}: Props) {
  const { profile } = useAuth()
  const [dialog, setDialog] = useState<'confirm' | 'reject' | null>(null)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pendingPayment = useMemo(
    () => [...payments]
      .filter(payment => payment.payment_status === 'pending')
      .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0],
    [payments]
  )
  const latestRejected = useMemo(
    () => [...payments]
      .filter(payment => payment.payment_status === 'rejected')
      .sort((a, b) => (b.rejected_at ?? '').localeCompare(a.rejected_at ?? ''))[0],
    [payments]
  )
  const canDecide = profile?.role === 'admin' || profile?.role === 'office'
  const routeLabel = pendingPayment
    ? PAYMENT_ROUTE_OPTIONS.find(option => option.value === pendingPayment.payment_route)?.label
      ?? pendingPayment.method
      ?? pendingPayment.payment_route
      ?? '—'
    : '—'
  const remaining = Math.max(0, finalTotal - receivedTotal)

  const closeDialog = () => {
    if (busy) return
    setDialog(null)
    setReason('')
    setError(null)
  }

  const confirmPayment = async () => {
    if (!pendingPayment) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('confirm_pending_payment_v1', {
      p_payment_id: pendingPayment.id,
    })
    if (rpcError) {
      setError(rpcError.message)
      setBusy(false)
      return
    }
    setBusy(false)
    setDialog(null)
    await onDone()
  }

  const rejectPayment = async () => {
    if (!pendingPayment || !reason.trim()) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('reject_pending_payment_v1', {
      p_payment_id: pendingPayment.id,
      p_reason: reason.trim(),
    })
    if (rpcError) {
      setError(rpcError.message)
      setBusy(false)
      return
    }
    setBusy(false)
    setDialog(null)
    setReason('')
    await onDone()
  }

  return (
    <>
      <div className="card p-4 mb-3 border border-amber-200 bg-amber-50">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-amber-900">בקשת מקדמה ממתינה לאישור המשרד</div>
            {pendingPayment ? (
              <div className="mt-2 space-y-1 text-sm text-slate-700">
                <div>מסלול: <strong>{routeLabel}</strong></div>
                <div>סכום מבוקש: <strong>{fmt(pendingPayment.amount)}</strong></div>
                <div>סטטוס: <strong className="text-amber-800">ממתין</strong></div>
                <div>יתרה נוכחית: <strong>{fmt(remaining)}</strong></div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-slate-600">
                אין בקשת תשלום פעילה.
                {latestRejected?.rejection_reason && ` הבקשה האחרונה נדחתה: ${latestRejected.rejection_reason}`}
              </div>
            )}
          </div>

          {pendingPayment && canDecide && (
            <div className="flex shrink-0 gap-2">
              <button className="btn-primary text-sm" onClick={() => setDialog('confirm')}>
                אישור מקדמה
              </button>
              <button className="btn-ghost text-sm text-red-600" onClick={() => setDialog('reject')}>
                דחייה
              </button>
            </div>
          )}
        </div>
        {pendingPayment && !canDecide && (
          <div className="mt-3 text-xs text-slate-500">רק משרד או מנהל יכולים לאשר או לדחות את הבקשה.</div>
        )}
      </div>

      {dialog && pendingPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-1">
              {dialog === 'confirm' ? 'אישור קבלת מקדמה' : 'דחיית בקשת מקדמה'}
            </h3>
            <p className="text-sm text-slate-500 mb-4">
              הזמנה #{orderNumber} — {customerName}
            </p>
            <div className="rounded-xl bg-slate-50 p-3 text-sm space-y-1 mb-4">
              <div className="flex justify-between"><span>מסלול</span><strong>{routeLabel}</strong></div>
              <div className="flex justify-between"><span>סכום מבוקש</span><strong>{fmt(pendingPayment.amount)}</strong></div>
              <div className="flex justify-between"><span>יתרה נוכחית</span><strong>{fmt(remaining)}</strong></div>
            </div>

            {dialog === 'reject' && (
              <label className="block text-sm mb-4">
                סיבת דחייה <span className="text-red-500">*</span>
                <textarea
                  className="input mt-1 min-h-[80px] resize-y"
                  value={reason}
                  onChange={event => setReason(event.target.value)}
                  placeholder="יש להזין סיבה"
                  autoFocus
                />
              </label>
            )}

            {error && <div className="text-red-600 text-sm mb-3">{error}</div>}

            <div className="flex gap-2">
              <button
                className={`flex-1 ${dialog === 'confirm' ? 'btn-primary' : 'rounded-lg bg-red-600 px-4 py-2 font-bold text-white disabled:opacity-50'}`}
                disabled={busy || (dialog === 'reject' && !reason.trim())}
                onClick={dialog === 'confirm' ? confirmPayment : rejectPayment}
              >
                {busy ? 'שומר...' : dialog === 'confirm' ? 'אישור מפורש' : 'דחה בקשה'}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={closeDialog}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
