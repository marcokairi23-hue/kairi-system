export interface CutItem {
  id: string; order_id: string; order_number: number | null; customer_name: string
  location: string; width_m: number; heights_m: number[]; sewing_type: string | null
  hem_cm: number | null; shtaif_cm: number | null; is_split: boolean | null
  fabric_text: string | null; notes: string | null; cut_instruction_id?: string | null
}
export interface CutInstruction {
  id: string; order_id: string; item_ids: string[]; snapshot: CutItem[]
  status: 'draft' | 'pending' | 'confirmed'; created_at: string
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]!))

export function cutInstructionHtml(instruction: CutInstruction): string {
  if (instruction.status !== 'draft') throw new Error('הוראה פעילה אינה זמינה להדפסה חוזרת.')
  const cells = (item: CutItem) => [item.location,item.sewing_type,item.width_m,
    item.heights_m.join(', '),item.shtaif_cm,item.hem_cm,item.is_split ? 'כן' : 'לא',item.fabric_text,item.notes]
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>טיוטת הוראות גזירה</title>
  <style>body{font:14px Arial;margin:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #999;padding:8px}thead{display:table-header-group}tr{break-inside:avoid}.notice{border:2px solid #333;padding:12px}@page{size:A4 landscape;margin:12mm}</style></head><body>
  <h1>הוראות גזירה — טיוטה</h1><p>הזמנה ${escape(instruction.snapshot[0]?.order_number)} · ${escape(instruction.snapshot[0]?.customer_name)}</p>
  <p>מזהה הוראה: <b dir="ltr">${escape(instruction.id)}</b></p>
  <p class="notice">אין להתחיל בגזירה לפני אישור הפעלת הוראה זו במערכת. ביטול ההדפסה אינו מפעיל אותה.</p>
  <table><thead><tr>${['מיקום','תפירה','רוחב (מ׳)','גבהים (מ׳)','שטייף','מכפלת','חצוי','בד','הערות'].map(h=>`<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${instruction.snapshot.map(i=>`<tr>${cells(i).map(c=>`<td>${escape(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></body></html>`
}
