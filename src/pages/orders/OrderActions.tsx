import { useNavigate } from 'react-router-dom'
import { Printer, Wrench, MessageCircle, Pencil, Wallet, ClipboardList, ArrowLeft } from 'lucide-react'
import { printOrder, buildFormFromOrder } from './printOrder'
import { getSignatureDataUrl } from '../../lib/uploadSignature'
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
  signature_url: string | null
  agent_signature_url: string | null
  agent_id: string | null
  notes: string | null
  profiles?: { full_name: string }
  order_items?: Array<{
    id: string
    family: string
    subtype?: string | null
    location: string
    width_m: number
    heights_m: number[]
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
  onAdvance: () => void
}

export default function OrderActions({
  order, compact = false, onPayment, onItemStatus, onAdvance,
}: Props) {
  const navigate = useNavigate()

  const orderNum = order.order_number ?? 'טיוטה'
  const paid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const remaining = order.final_total - paid
  const nextStatus = ORDER_STATUS_NEXT[order.status]

  const stop = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation() }

  const doPrint = async (e: React.MouseEvent, withPrices: boolean) => {
    stop(e)
    const form = buildFormFromOrder(order)
    if (withPrices && order.signature_url) {
      form.signatureDataUrl = await getSignatureDataUrl(order.signature_url)
    }
    if (withPrices && order.agent_signature_url) {
      form.agentSignatureDataUrl = await getSignatureDataUrl(order.agent_signature_url)
    }
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
          : SHADING_LABELS[i.subtype ?? ''] ?? i.subtype ?? 'הצללה'
        return `• ${label} ${i.location} — ${i.width_m}×${i.heights_m.join('/')} מ׳`
      }).join('\n')

    const text = `שלום ${order.customer_name_snapshot} 😊
הזמנה מספר #${orderNum} מקאירי וילונות:

${items}

סה״כ לתשלום: ${fmt(order.final_total)}
${paid > 0 ? `שולם: ${fmt(paid)}\nנשאר: ${fmt(remaining)}` : ''}

תודה! 🙏`

    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const btn = compact
    ? 'w-8 h-8 grid place-items-center rounded-md hover:bg-slate-100'
    // min-w במקום flex-1 בלבד: flex-1 לבדו לא מצטמצם מתחת לרוחב התוכן הטבעי שלו
    // (min-width: auto כברירת מחדל), מה שגרם לגלישה אופקית של כל העמוד במסך אייפון
    // (390px) — 7 כפתורים בשורה אחת לא נכנסים. flex-wrap בהורה + min-w פה פותרים.
    : 'flex-1 min-w-[70px] py-1.5 rounded-md hover:bg-slate-100 text-sm flex items-center justify-center gap-1'

  // כל האייקונים בצבע ה-brand (כמו ה-nav bar), 18px — עקבי בין תצוגת כרטיסיות לרשימה.
  const icon = 'w-[18px] h-[18px] text-brand'

  return (
    <div className={compact ? 'flex items-center gap-0.5' : 'flex flex-wrap items-center gap-1 border-t pt-2 mt-2'}>
      <button className={btn} title="הדפס ללקוח" onClick={e => doPrint(e, true)}>
        <Printer className={icon} />{!compact && <span className="text-xs">הדפס</span>}
      </button>

      <button className={btn} title="הוראות עבודה" onClick={e => doPrint(e, false)}>
        <Wrench className={icon} />{!compact && <span className="text-xs">עבודה</span>}
      </button>

      <button className={btn} title="שלח ב-WhatsApp" onClick={doWhatsApp}>
        <MessageCircle className={icon} />{!compact && <span className="text-xs">שלח</span>}
      </button>

      <button className={btn} title="עריכה"
              onClick={e => { stop(e); navigate(`/orders/${order.id}/edit`) }}>
        <Pencil className={icon} />{!compact && <span className="text-xs">ערוך</span>}
      </button>

      <button className={btn} title="הוספת תשלום"
              onClick={e => { stop(e); onPayment() }}>
        <Wallet className={icon} />{!compact && <span className="text-xs">תשלום</span>}
      </button>

      {/* מוצג בדיוק כמו "קדם" (nextStatus קיים) — כדי לבחון אותו כתחלופה מעשית לקידום
          סטטוס ההזמנה, כולל בשני הסטטוסים שבהם רק "קדם" הופיע עד כה: quote/pending_payment. */}
      {nextStatus && (
        <button className={btn} title="פריטים בהזמנה"
                onClick={e => { stop(e); onItemStatus() }}>
          <ClipboardList className={icon} />{!compact && <span className="text-xs">פריטים</span>}
        </button>
      )}

      {nextStatus && (
        <button className={btn}
                title={`קדם ל: ${ORDER_STATUS_LABELS[nextStatus]}`}
                onClick={e => { stop(e); onAdvance() }}>
          <ArrowLeft className={icon} />{!compact && <span className="text-xs">קדם</span>}
        </button>
      )}
    </div>
  )
}
