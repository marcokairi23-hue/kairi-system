import { SHADING_LABELS } from '../../lib/statusHelpers'

interface WorkItem {
  family: string
  subtype: string | null
  location: string
  width_m: number
  heights_m: number[]
  sewing_type: string | null
  hem_cm: number | null
  shtaif_cm: number | null
  is_split: boolean | null
  fabric_text: string | null
  mount_type: string | null
  mechanism_side: string | null
  color_fabric_text: string | null
  notes: string | null
  orders?: {
    order_number: number | null
    customer_name_snapshot: string
  }
}

// הדפסת הוראות עבודה לפריטים נבחרים (יכולים להיות מכמה הזמנות)
export function printWorkOrder(items: WorkItem[]) {
  if (items.length === 0) return

  const curtains = items.filter(i => i.family === 'curtain')
  const shadings = items.filter(i => i.family === 'shading')

  const curtainRows = curtains.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="order-num">#${i.orders?.order_number ?? '—'}</td>
      <td>${i.orders?.customer_name_snapshot ?? ''}</td>
      <td>${i.location}</td>
      <td>${i.sewing_type ?? ''}</td>
      <td dir="ltr">${i.width_m}</td>
      <td dir="ltr">${i.heights_m.join(', ')}</td>
      <td>${i.shtaif_cm ?? ''}</td>
      <td>${i.hem_cm ?? ''}</td>
      <td>${i.is_split ? 'כן' : 'לא'}</td>
      <td>${i.fabric_text ?? ''}</td>
      <td>${i.notes ?? ''}</td>
    </tr>`).join('')

  const shadingRows = shadings.map((i, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td class="order-num">#${i.orders?.order_number ?? '—'}</td>
      <td>${i.orders?.customer_name_snapshot ?? ''}</td>
      <td>${SHADING_LABELS[i.subtype ?? ''] ?? i.subtype ?? ''}</td>
      <td>${i.location}</td>
      <td>${i.mount_type ?? ''}</td>
      <td dir="ltr">${i.width_m}</td>
      <td dir="ltr">${i.heights_m.join(', ')}</td>
      <td>${i.mechanism_side ?? ''}</td>
      <td>${i.color_fabric_text ?? ''}</td>
      <td>${i.notes ?? ''}</td>
    </tr>`).join('')

  const html = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>הוראות עבודה — ${items.length} פריטים</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Heebo', Arial, sans-serif; font-size: 12px; color: #1a1a1a; direction: rtl; }
  .page { max-width: 297mm; margin: 0 auto; padding: 12mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            margin-bottom: 14px; border-bottom: 2px solid #1F6E6B; padding-bottom: 10px; }
  .logo { font-size: 22px; font-weight: 800; color: #1F6E6B; }
  .logo-sub { font-size: 10px; color: #666; }
  .meta { text-align: left; font-size: 11px; line-height: 1.7; }
  .meta strong { font-size: 14px; color: #1F6E6B; display: block; }
  .work-banner { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px;
                 padding: 8px 12px; margin-bottom: 12px; font-size: 12px; font-weight: 600; }
  h3 { background: #1F6E6B; color: white; padding: 5px 10px; border-radius: 4px;
       margin: 14px 0 6px; font-size: 12px; }
  h3.shading { background: #EA8C1F; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
  th { background: #e8f5f5; padding: 6px 4px; font-weight: 600; text-align: right;
       border: 1px solid #ccc; }
  td { padding: 5px 4px; border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) td { background: #fafafa; }
  .order-num { font-family: monospace; font-weight: 700; color: #1F6E6B; }
  @media print {
    .page { padding: 6mm; }
    @page { size: A4 landscape; margin: 0; }
  }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="logo">מרקו קאירי</div>
      <div class="logo-sub">וילונות ובדים בהתאמה אישית</div>
    </div>
    <div class="meta">
      <strong>הוראות עבודה</strong>
      תאריך: ${new Date().toLocaleDateString('he-IL')}<br/>
      סה״כ פריטים: ${items.length}
    </div>
  </div>

  <div class="work-banner">
    ⚠️ מסמך לסדנה / תפירה בלבד — ללא מחירים
  </div>

  ${curtains.length > 0 ? `
  <h3>וילונות (${curtains.length})</h3>
  <table>
    <thead><tr>
      <th>#</th><th>הזמנה</th><th>לקוח</th><th>מיקום</th><th>סוג תפירה</th>
      <th>רוחב (מ׳)</th><th>גובה/ים (מ׳)</th><th>שטייף</th><th>מכפלת</th><th>חצוי</th>
      <th>בד</th><th>הערות</th>
    </tr></thead>
    <tbody>${curtainRows}</tbody>
  </table>` : ''}

  ${shadings.length > 0 ? `
  <h3 class="shading">הצללה (${shadings.length})</h3>
  <table>
    <thead><tr>
      <th>#</th><th>הזמנה</th><th>לקוח</th><th>סוג</th><th>מיקום</th>
      <th>התקנה</th><th>רוחב (מ׳)</th><th>גובה (מ׳)</th><th>צד מנגנון</th>
      <th>צבע/בד</th><th>הערות</th>
    </tr></thead>
    <tbody>${shadingRows}</tbody>
  </table>` : ''}
</div>
<script>window.onload = () => window.print()</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
}
