import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { buildFormFromOrder } from './printOrder'

const SHADING_LABELS: Record<string, string> = {
  zebra: 'זברה', venetian: 'ונציאני', roman: 'רומי', roller: 'גלילה',
}

interface Order {
  id: string
  order_number: number
  status: string
  customer_name_snapshot: string
  phone_snapshot: string
  address_snapshot: string
  items_total: number
  installation_fee: number
  discount: number
  final_total: number
  signature_name: string | null
  notes: string | null
  created_at: string
  profiles?: { full_name: string }
  order_items?: Array<{
    family: string
    subtype?: string
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
    notes?: string
  }>
  payments?: { amount: number; method: string }[]
}

export default function PrintOrder() {
  const { orderNumber } = useParams()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, profiles(full_name), order_items(*), payments(*)')
      .eq('order_number', orderNumber)
      .single()
      .then(({ data }) => {
        if (!data) { setNotFound(true); setLoading(false); return }
        setOrder(data as Order)
        setLoading(false)
      })
  }, [orderNumber])

  useEffect(() => {
    if (order) {
      document.title = `הזמנה #${order.order_number} — ${order.customer_name_snapshot}`
      setTimeout(() => window.print(), 600)
    }
  }, [order])

  if (loading) return (
    <div style={{ fontFamily: 'Heebo, Arial, sans-serif', textAlign: 'center', padding: '60px', direction: 'rtl' }}>
      טוען הזמנה...
    </div>
  )

  if (notFound) return (
    <div style={{ fontFamily: 'Heebo, Arial, sans-serif', textAlign: 'center', padding: '60px', direction: 'rtl' }}>
      <h2>הזמנה #{orderNumber} לא נמצאה</h2>
    </div>
  )

  if (!order) return null

  const paid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const remaining = order.final_total - paid
  const curtains = (order.order_items ?? []).filter(i => i.family === 'curtain')
  const shadings = (order.order_items ?? []).filter(i => i.family === 'shading')

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Heebo', Arial, sans-serif; font-size: 12px; color: #1a1a1a; direction: rtl; background: white; }
        .page { max-width: 210mm; margin: 0 auto; padding: 15mm; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #1F6E6B; padding-bottom: 12px; }
        .logo { font-size: 24px; font-weight: 800; color: #1F6E6B; }
        .logo-sub { font-size: 10px; color: #666; margin-top: 2px; }
        .order-meta { text-align: left; font-size: 11px; line-height: 1.9; }
        .order-meta strong { font-size: 14px; color: #1F6E6B; display: block; }
        .customer-block { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #f8f9fa; border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 11px; }
        .field label { font-weight: 600; color: #555; margin-left: 4px; }
        h3 { background: #1F6E6B; color: white; padding: 5px 10px; border-radius: 4px; margin: 12px 0 6px; font-size: 12px; }
        h3.shading { background: #EA8C1F; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
        th { background: #e8f5f5; padding: 5px 4px; font-weight: 600; text-align: right; border: 1px solid #ccc; }
        td { padding: 4px; border: 1px solid #ddd; vertical-align: top; }
        tr:nth-child(even) td { background: #fafafa; }
        .price-section { margin-top: 14px; display: flex; justify-content: flex-end; }
        .price-table { width: 260px; border-collapse: collapse; }
        .price-table td { padding: 5px 8px; border: 1px solid #ddd; font-size: 12px; }
        .price-table .total-row td { font-weight: 700; font-size: 14px; background: #e8f5f5; }
        .price-table .remaining-row td { font-weight: 700; color: #c0392b; }
        .price-table .note-row td { color: #888; font-size: 10px; }
        .notes-box { margin-top: 12px; border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; font-size: 11px; }
        .legal { margin-top: 16px; font-size: 10px; color: #555; border-top: 1px solid #eee; padding-top: 10px; line-height: 1.7; }
        .signature-block { display: flex; justify-content: space-between; margin-top: 24px; }
        .sig-line { border-top: 1px solid #333; width: 180px; padding-top: 6px; font-size: 10px; color: #555; text-align: center; }
        .print-btn { position: fixed; top: 16px; left: 16px; background: #1F6E6B; color: white; border: none; padding: 10px 20px; border-radius: 8px; font-family: inherit; font-size: 14px; cursor: pointer; z-index: 999; }
        @media print {
          .print-btn { display: none !important; }
          body { font-size: 11px; }
          .page { padding: 8mm 10mm; }
          @page { size: A4; margin: 0; }
        }
      `}</style>

      <button className="print-btn" onClick={() => window.print()}>🖨️ הדפס / שמור PDF</button>

      <div className="page">
        <div className="header">
          <div>
            <div className="logo">מרקו קאירי</div>
            <div className="logo-sub">וילונות ובדים בהתאמה אישית</div>
            <div className="logo-sub">050-877-1720 | marcokairi.com</div>
          </div>
          <div className="order-meta">
            <strong>הזמנה / הצעת מחיר</strong>
            מספר הזמנה: {order.order_number}<br />
            תאריך: {new Date(order.created_at).toLocaleDateString('he-IL')}<br />
            סוכן: {order.profiles?.full_name}
          </div>
        </div>

        <div className="customer-block">
          <div className="field"><label>שם לקוח:</label>{order.customer_name_snapshot}</div>
          <div className="field"><label>טלפון:</label>{order.phone_snapshot}</div>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>כתובת:</label>{order.address_snapshot}
          </div>
        </div>

        {curtains.length > 0 && (
          <>
            <h3>מידות וילונות</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>מיקום</th><th>סוג תפירה</th>
                  <th>רוחב</th><th>גובה/ים</th><th>שטייף</th>
                  <th>מכפלת</th><th>חצוי</th><th>בד</th>
                  <th>ביצוע</th><th>עלות</th><th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {curtains.map((item, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{item.location}</td>
                    <td>{item.sewing_type}</td>
                    <td dir="ltr">{item.width_cm}</td>
                    <td dir="ltr">{item.heights_cm.join(', ')}</td>
                    <td>{item.shtaif_cm}</td>
                    <td>{item.hem_cm}</td>
                    <td>{item.is_split ? 'כן' : 'לא'}</td>
                    <td>{item.fabric_text}</td>
                    <td>{item.for_execution ? '✓' : ''}</td>
                    <td dir="ltr">{item.price ? `₪${Number(item.price).toLocaleString()}` : ''}</td>
                    <td>{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {shadings.length > 0 && (
          <>
            <h3 className="shading">זברות / ונציאני / רומי / גלילה</h3>
            <table>
              <thead>
                <tr>
                  <th>#</th><th>סוג</th><th>מיקום</th><th>התקנה</th>
                  <th>רוחב</th><th>גובה</th><th>צד מנגנון</th>
                  <th>צבע/בד</th><th>ביצוע</th><th>עלות</th><th>הערות</th>
                </tr>
              </thead>
              <tbody>
                {shadings.map((item, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{SHADING_LABELS[item.subtype ?? ''] ?? item.subtype}</td>
                    <td>{item.location}</td>
                    <td>{item.mount_type}</td>
                    <td dir="ltr">{item.width_cm}</td>
                    <td dir="ltr">{item.heights_cm.join(', ')}</td>
                    <td>{item.mechanism_side}</td>
                    <td>{item.color_fabric_text}</td>
                    <td>{item.for_execution ? '✓' : ''}</td>
                    <td dir="ltr">{item.price ? `₪${Number(item.price).toLocaleString()}` : ''}</td>
                    <td>{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        <div className="price-section">
          <table className="price-table">
            <tbody>
              <tr><td>סה״כ פריטים לביצוע</td><td dir="ltr"><strong>₪{order.items_total.toLocaleString()}</strong></td></tr>
              {order.discount > 0 && <tr><td>הנחה</td><td dir="ltr">− ₪{order.discount.toLocaleString()}</td></tr>}
              {order.installation_fee > 0 && (
                <tr className="note-row"><td>התקנה (בנפרד — מול המתקין)</td><td dir="ltr">₪{order.installation_fee.toLocaleString()}</td></tr>
              )}
              <tr className="total-row"><td>סה״כ לתשלום</td><td dir="ltr">₪{order.final_total.toLocaleString()}</td></tr>
              {paid > 0 && <tr><td>שולם על החשבון</td><td dir="ltr">₪{paid.toLocaleString()}</td></tr>}
              {remaining > 0 && <tr className="remaining-row"><td>נשאר לתשלום</td><td dir="ltr">₪{remaining.toLocaleString()}</td></tr>}
            </tbody>
          </table>
        </div>

        {order.notes && (
          <div className="notes-box">
            <strong>הערות:</strong><br />
            {order.notes}
          </div>
        )}

        <div className="legal">
          ההזמנה תסופק עד 21 ימי עסקים מרגע תשלום המקדמה. (פרט לוילונות הונציאנים, הרומאים והגלילות)<br />
          בדקתי את המידות וסוג התפירה ואני מאשר/ת את ההזמנה (לא תתקבל תלונה)
        </div>

        <div className="signature-block">
          <div className="sig-line">
            {order.signature_name || ''}<br />חתימת הלקוח
          </div>
          <div className="sig-line">חתימת הסוכן</div>
        </div>
      </div>
    </>
  )
}
