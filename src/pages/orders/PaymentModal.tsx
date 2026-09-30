import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { PAYMENT_ROUTE_OPTIONS, PaymentRoute } from './types'
import { fmt } from '../../lib/statusHelpers'

const RECEIVED_ROUTE_OPTIONS = PAYMENT_ROUTE_OPTIONS.filter(
  option => option.value === 'cash' || option.value === 'check'
)

interface Props {
  orderId: string
  orderNumber: number | string
  customerName: string
  finalTotal: number
  alreadyPaid: number
  onClose: () => void
  onSaved: () => void
}

export default function PaymentModal({
  orderId, orderNumber, customerName, finalTotal, alreadyPaid, onClose, onSaved,
}: Props) {
  const { profile } = useAuth()
  const remaining = finalTotal - alreadyPaid
  const [amount, setAmount] = useState(String(remaining > 0 ? remaining : ''))
  const [route, setRoute] = useState<PaymentRoute | ''>('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    const value = parseFloat(amount)
    if (!value || value <= 0) {
      setError('יש להזין סכום גדול מאפס')
      return
    }
    if (route !== 'cash' && route !== 'check') {
      setError('יש לבחור מזומן או צ׳ק כתשלום שהתקבל')
      return
    }
    setBusy(true); setError(null)

    const method = RECEIVED_ROUTE_OPTIONS.find(option => option.value === route)?.label ?? route

    const { error: err } = await supabase.from('payments').insert({
      order_id: orderId,
      amount: value,
      method,
      payment_route: route,
      payment_status: 'received',
      recorded_by: profile?.id ?? null,
      received_by: profile?.id ?? null,
      paid_at: null,
      note: note || null,
    })

    if (err) {
      setError('שגיאה בשמירת התשלום: ' + err.message)
      setBusy(false)
      return
    }

    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">רישום תשלום שהתקבל</h3>
        <p className="text-sm text-slate-500 mb-4">
          הזמנה #{orderNumber} — {customerName}
        </p>

        {/* סיכום נוכחי */}
        <div className="bg-slate-50 rounded-lg p-3 mb-4 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-600">סה״כ לתשלום</span>
            <span className="font-semibold">{fmt(finalTotal)}</span>
          </div>
          <div className="flex justify-between text-green-700">
            <span>שולם עד כה</span>
            <span>{fmt(alreadyPaid)}</span>
          </div>
          <div className="flex justify-between text-amber-700 font-bold border-t pt-1">
            <span>יתרה</span>
            <span>{fmt(remaining)}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              סכום התשלום (₪) <span className="text-red-500">*</span>
            </label>
            <input className="input font-bold" type="number" min="0" step="0.01" dir="ltr"
                   value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">אמצעי תשלום</label>
            <select className="input" value={route} onChange={e => setRoute(e.target.value as PaymentRoute | '')}>
              <option value="">בחר...</option>
              {RECEIVED_ROUTE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">הערה</label>
            <input className="input" value={note} onChange={e => setNote(e.target.value)}
                   placeholder="אסמכתא, מספר צ׳ק..." />
          </div>
        </div>

        {error && <div className="text-red-600 text-sm mt-3">{error}</div>}

        <div className="flex gap-2 mt-5">
          <button className="btn-primary flex-1" disabled={busy || !route} onClick={save}>
            {busy ? 'שומר...' : 'שמור תשלום'}
          </button>
          <button className="btn-ghost" onClick={onClose}>ביטול</button>
        </div>
      </div>
    </div>
  )
}
