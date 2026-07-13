import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { printOrder, buildFormFromOrder } from './printOrder'
import { ORDER_STATUS_NEXT, ORDER_STATUS_LABELS, SHADING_LABELS, fmt } from '../../lib/statusHelpers'

export interface ActionOrder {
  id: string
  order_number: number | null
  status: string
  customer_name_snapshot: string
  phone_snapshot: string
  address_snapshot: string
  items_total: number
  installation_fee: number
  discount: number
  final_total: number
  send_email: string | null
  signature_name: string | null
  notes: string | null
  profiles?: { full_name: string }
  order_items?: Array<{
    id: string
    family: string
    subtype?: string | null
    location: string
    width_cm: number
    heights_cm: number[]
    sewing_type?: string
    hem_cm?: number
    shtaif_cm?: number
    is_split?: boolean
    fabric_text?: string
    mount_type?: string
    mechanism_side?: string
    color_fabric_text?: string
    price: number
    for_execution: boolean
    item_status: string
    notes?: string
  }>
  payments?: Array<{ amount: number; method: string }>
}

interface Props {
  order: ActionOrder
  compact?: boolean
  onPayment: () => void
  onItemStatus: () => void
  onRefresh: () => void
}

export default function OrderActions({
  order, compact = false, onPayment, onItemStatus, onRefresh,
}: Props) {
  const navigate = useNavigate()
  const { profile } = useAuth()

  const orderNum = order.order_number ?? 'טיוטה'
  const paid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const remaining = order.final_total - paid
  const nextStatus = ORDER_STATUS_NEXT[order.status]

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }

  const doPrint = (e: React.MouseEvent, withPrices: boolean) => {
    stop(e)
    const form = buildFormFromOrder(order)
    printOrder(form, orderNum, withPrices)
  }

  const doWhatsApp = (e: React.MouseEvent) => {
    stop(e)
    const phone = String(order.phone_snapshot).replace(/\D/g, '').replace(/^0/, '972')
    const items = (order.order_items ?? [])
      .filter(i => i.for_execution)
      .map(i => {
        const label = i.family === 'curtain'
          ? 'וילון'
          : SHADING_LABELS[i.subtype ?? ''] ?? 'הצללה'
        return `• ${label} ${i.location} — ${i.width_cm}×${i.heights_cm.join('/')} ס״מ`
      }).join('\n')

    const text = `שלום ${order.customer_name_snapshot} 😊
הזמנה מספר #${orderNum} מקאירי וילונות:

${items}

סה״כ לתשלום: ${fmt(order.final_total)}
${paid > 0 ? `שולם: ${fmt(paid)}\nנשאר: ${fmt(remaining)}` : ''}

תודה! 🙏`

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const doAdvance = async (e: React.MouseEvent) => {
    stop(e)
    if (!nextStatus) return
    await supabase.from('orders').update({ status: nextStatus }).eq('id', order.id)
    await supabase.from('order_status_history').insert({
      order_id: order.id,
      from_status: order.status,
      to_status: nextStatus,
      changed_by: profile?.id ?? null,
      note: 'קידום מהיר מהרשימה',
    })
    onRefresh()
  }

  const btn = compact
    ? 'w-8 h-8 grid place-items-center rounded-md hover:bg-slate-100 text-base'
    : 'flex-1 py-1.5 rounded-md hover:bg-slate-100 text-sm flex items-center justify-center gap-1'

  return (
    <div className={compact ? 'flex items-center gap-0.5' : 'flex items-center gap-1 border-t pt-2 mt-2'}>
      <button className={btn} title="הדפס ללקוח"
              onClick={e => doPrint(e, true)}>
        🖨️{!compact && <span className="text-xs">הדפס</span>}
      </button>

      <button className={btn} title="הוראות עבודה"
              onClick={e => doPrint(e, false)}>
        🔧{!compact && <span className="text-xs">עבודה</span>}
      </button>

      <button className={btn} title="שלח ב-WhatsApp"
              onClick={doWhatsApp}>
        💬{!compact && <span className="text-xs">שלח</span>}
      </button>

      <button className={btn} title="עריכה"
              onClick={e => { stop(e); navigate(`/orders/${order.id}/edit`) }}>
        ✏️{!compact && <span className="text-xs">ערוך</span>}
      </button>

      <button className={btn} title="הוספת תשלום"
              onClick={e => { stop(e); onPayment() }}>
        💰{!compact && <span className="text-xs">תשלום</span>}
      </button>

      <button className={btn} title="עדכון סטטוס פריטים"
              onClick={e => { stop(e); onItemStatus() }}>
        📋{!compact && <span className="text-xs">פריטים</span>}
      </button>

      {nextStatus && (
        <button className={btn}
                title={`קדם ל: ${ORDER_STATUS_LABELS[nextStatus]}`}
                onClick={doAdvance}>
          ➡️{!compact && <span className="text-xs">קדם</span>}
        </button>
      )}
    </div>
  )
}
