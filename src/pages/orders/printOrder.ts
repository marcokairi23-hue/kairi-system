import { OrderForm, calcItemsTotal, calcRemaining } from './types'

const SHADING_LABELS: Record<string, string> = {
  zebra: 'זברה', venetian: 'ונציאני', roman: 'רומי', roller: 'גלילה',
}

export function printOrder(form: OrderForm, orderNumber: string | number, showPrices: boolean) {
  const itemsTotal = calcItemsTotal(form)
  const remaining = calcRemaining(form)
  const title = showPrices ? 'הזמנה / הצעת מחיר' : 'הוראות עבודה'

  const curtainRows = form.curtain_items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${item.location}</td>
      <td>${item.sewing_type}</td>
      <td dir="ltr">${item.width_cm}</td>
      <td dir="ltr">${item.heights_cm}</td>
      <td>${item.shtaif_cm}</td>
      <td>${item.hem_cm}</td>
      <td>${item.is_split ? 'כן' : 'לא'}</td>
      <td>${item.fabric_text}</td>
      <td>${item.for_execution ? '✓' : ''}</td>
      ${showPrices ? `<td dir="ltr">${item.price ? Number(item.price).toLocaleString() + ' ₪' : ''}</td>` : ''}
      <td>${item.notes}</td>
    </tr>`).join('')

  const shadingRows = form.shading_items.map((item, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${SHADING_LABELS[item.subtype] ?? item.subtype}</td>
      <td>${item.location}</td>
      <td>${item.mount_type}</td>
      <td dir="ltr">${item.width_cm}</td>
      <td dir="ltr">${item.heights_cm}</td>
      <td>${item.mechanism_side}</td>
      <td>${item.color_fabric_text}</td>
      <td>${item.for_execution ? '✓' : ''}</td>
      ${showPrices ? `<td dir="ltr">${item.price ? Number(item.price).toLocaleString() + ' ₪' : ''}</td>` : ''}
      <td>${item.notes}</td>
    </tr>`).join('')

  const accessoryRows = form.accessories.filter(a => a.name).map(a => `
    <tr>
      <td>${a.name}</td>
      <td>${a.quantity}</td>
      ${showPrices ? `<td dir="ltr">${a.unit_price} ₪</td><td dir="ltr">${(Number(a.quantity) * Number(a.unit_price)).toLocaleString()} ₪</td>` : ''}
    </tr>`).join('')

  const priceSection = showPrices ? `
    <div class="price-section">
      <table class="price-table">
        <tr><td>סה״כ פריטים לביצוע</td><td dir="ltr"><strong>${itemsTotal.toLocaleString()} ₪</strong></td></tr>
        ${form.discount ? `<tr><td>הנחה</td><td dir="ltr">- ${Number(form.discount).toLocaleString()} ₪</td></tr>` : ''}
        ${form.installation_fee ? `<tr class="note-row"><td>התקנה (בנפרד — מול המתקין)</td><td dir="ltr">${Number(form.installation_fee).toLocaleString()} ₪</td></tr>` : ''}
        <tr class="total-row"><td>סה״כ לתשלום</td><td dir="ltr">${Number(form.final_total || 0).toLocaleString()} ₪</td></tr>
        ${form.paid_on_account ? `<tr><td>שולם על החשבון (${form.payment_method})</td><td dir="ltr">${Number(form.paid_on_account).toLocaleString()} ₪</td></tr>` : ''}
        ${form.paid_on_account ? `<tr class="remaining-row"><td>נשאר לתשלום</td><td dir="ltr">${remaining.toLocaleString()} ₪</td></tr>` : ''}
      </table>
    </div>` : `
    <div class="work-note">
      <strong>הוראות עבודה — ללא מחירים</strong><br/>
      מסמך זה מיועד לסדנה/תפירה בלבד.
    </div>`

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>${title} — ${form.customer_name} — ${orderNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Heebo', Arial, sans-serif; font-size: 12px; color: #1a1a1a; direction: rtl; }
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&display=swap');
  .page { max-width: 210mm; margin: 0 auto; padding: 15mm 15mm 20mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; border-bottom: 2px solid #1F6E6B; padding-bottom: 12px; }
  .logo { font-size: 22px; font-weight: 800; color: #1F6E6B; }
  .logo-sub { font-size: 10px; color: #666; }
  .order-meta { text-align: left; font-size: 11px; line-height: 1.8; }
  .order-meta strong { font-size: 13px; color: #1F6E6B; }
  .customer-block { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #f8f9fa; border-radius: 6px; padding: 10px; margin-bottom: 14px; font-size: 11px; }
  .customer-block .field label { font-weight: 600; color: #555; }
  h3 { background: #1F6E6B; color: white; padding: 5px 10px; border-radius: 4px; margin: 12px 0 6px; font-size: 12px; }
  h3.shading { background: #EA8C1F; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px; }
  th { background: #e8f5f5; padding: 5px 4px; font-weight: 600; text-align: right; border: 1px solid #ccc; }
  td { padding: 4px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .price-section { margin-top: 14px; display: flex; justify-content: flex-end; }
  .price-table { width: 260px; border-collapse: collapse; }
  .price-table td { padding: 4px 8px; border: 1px solid #ddd; }
  .price-table .total-row td { font-weight: 700; font-size: 13px; background: #e8f5f5; }
  .price-table .remaining-row td { font-weight: 700; color: #c0392b; }
  .price-table .note-row td { color: #888; font-size: 10px; }
  .work-note { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: 8px 12px; margin-top: 12px; font-size: 11px; }
  .notes-section { margin-top: 12px; border: 1px solid #ddd; border-radius: 6px; padding: 8px; min-height: 40px; }
  .legal { margin-top: 16px; font-size: 10px; color: #666; border-top: 1px solid #eee; padding-top: 10px; line-height: 1.6; }
  .signature-block { display: flex; justify-content: space-between; margin-top: 20px; }
  .sig-line { border-top: 1px solid #333; width: 180px; padding-top: 4px; font-size: 10px; color: #555; text-align: center; }
  @media print {
    body { font-size: 11px; }
    .page { padding: 8mm 10mm; }
    @page { size: A4; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">מרקו קאירי</div>
      <div class="logo-sub">וילונות ובדים בהתאמה אישית</div>
      <div class="logo-sub" style="margin-top:4px">050-877-1720 | marcokairi.com</div>
    </div>
    <div class="order-meta">
      <strong>${title}</strong><br/>
      מספר הזמנה: ${orderNumber}<br/>
      תאריך: ${new Date().toLocaleDateString('he-IL')}<br/>
      סוכן: ${form.agent_name}
    </div>
  </div>

  <div class="customer-block">
    <div class="field"><label>שם לקוח: </label>${form.customer_name}</div>
    <div class="field"><label>טלפון: </label>${form.phone}</div>
    <div class="field" style="grid-column:span 2"><label>כתובת: </label>${form.address}</div>
  </div>

  ${form.curtain_items.length > 0 ? `
  <h3>מידות וילונות</h3>
  <table>
    <thead><tr>
      <th>#</th><th>מיקום</th><th>סוג תפירה</th><th>רוחב</th><th>גובה/ים</th>
      <th>שטייף</th><th>מכפלת</th><th>חצוי</th><th>בד</th><th>ביצוע</th>
      ${showPrices ? '<th>עלות</th>' : ''}<th>הערות</th>
    </tr></thead>
    <tbody>${curtainRows}</tbody>
  </table>` : ''}

  ${form.shading_items.length > 0 ? `
  <h3 class="shading">זברות / ונציאני / רומי / גלילה</h3>
  <table>
    <thead><tr>
      <th>#</th><th>סוג</th><th>מיקום</th><th>התקנה</th><th>רוחב</th><th>גובה</th>
      <th>צד מנגנון</th><th>צבע/בד</th><th>ביצוע</th>
      ${showPrices ? '<th>עלות</th>' : ''}<th>הערות</th>
    </tr></thead>
    <tbody>${shadingRows}</tbody>
  </table>` : ''}

  ${form.accessories.filter(a => a.name).length > 0 ? `
  <h3 style="background:#555">אביזרים</h3>
  <table>
    <thead><tr>
      <th>פריט</th><th>כמות</th>
      ${showPrices ? '<th>מחיר יחידה</th><th>סה״כ</th>' : ''}
    </tr></thead>
    <tbody>${accessoryRows}</tbody>
  </table>` : ''}

  ${priceSection}

  ${form.notes ? `<div class="notes-section"><strong>הערות:</strong><br/>${form.notes.replace(/\n/g, '<br/>')}</div>` : ''}

  ${showPrices ? `
  <div class="legal">
    ההזמנה תסופק עד 21 ימי עסקים מרגע תשלום המקדמה. (פרט לוילונות הונציאנים, הרומאים והגלילות)<br/>
    בדקתי את המידות וסוג התפירה ואני מאשר/ת את ההזמנה (לא תתקבל תלונה)
  </div>
  <div class="signature-block">
    <div class="sig-line">${form.signature_name || ''}<br/>חתימת הלקוח</div>
    <div class="sig-line">חתימת הסוכן</div>
  </div>` : ''}
</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`

 const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
const url = URL.createObjectURL(blob)
window.open(url, '_blank')
}

// בונה OrderForm מנתוני הזמנה קיימת (לשימוש במסך פרטי הזמנה)
export function buildFormFromOrder(order: {
  customer_name_snapshot: string
  phone_snapshot: string
  address_snapshot: string
  notes: string | null
  signature_name: string | null
  send_email: string | null
  installation_fee: number
  discount: number
  final_total: number
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
    item_status: string
    notes?: string
  }>
  payments?: Array<{ amount: number; method: string }>
}): import('./types').OrderForm {
  const paid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const method = order.payments?.[0]?.method ?? ''

  const curtain_items = (order.order_items ?? [])
    .filter(i => i.family === 'curtain')
    .map(i => ({
      id: crypto.randomUUID(),
      family: 'curtain' as const,
      location: i.location,
      width_cm: String(i.width_cm),
      heights_cm: i.heights_cm.join(','),
      sewing_type: i.sewing_type ?? '',
      hem_cm: String(i.hem_cm ?? 10),
      shtaif_cm: String(i.shtaif_cm ?? 10),
      is_split: i.is_split ?? false,
      fabric_text: i.fabric_text ?? '',
      price: String(i.price),
      for_execution: i.for_execution,
      item_status: i.item_status as import('./types').ItemStatus,
      notes: i.notes ?? '',
    }))

  const shading_items = (order.order_items ?? [])
    .filter(i => i.family === 'shading')
    .map(i => ({
      id: crypto.randomUUID(),
      family: 'shading' as const,
      subtype: (i.subtype ?? 'zebra') as import('./types').ShadingSubtype,
      location: i.location,
      width_cm: String(i.width_cm),
      heights_cm: i.heights_cm.join(','),
      mount_type: i.mount_type ?? '',
      mechanism_side: i.mechanism_side ?? '',
      color_fabric_text: i.color_fabric_text ?? '',
      price: String(i.price),
      for_execution: i.for_execution,
      item_status: i.item_status as import('./types').ItemStatus,
      notes: i.notes ?? '',
    }))

  return {
    customer_name: order.customer_name_snapshot,
    phone: order.phone_snapshot,
    address: order.address_snapshot ?? '',
    agent_name: order.profiles?.full_name ?? '',
    curtain_items,
    shading_items,
    accessories: [],
    is_quote: false,
    installation_fee: String(order.installation_fee || ''),
    discount: String(order.discount || ''),
    final_total: String(order.final_total || ''),
    paid_on_account: paid > 0 ? String(paid) : '',
    payment_method: method,
    send_email: order.send_email ?? '',
    signature_name: order.signature_name ?? '',
    notes: order.notes ?? '',
  }
}
