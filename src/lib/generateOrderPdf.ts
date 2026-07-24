import { PDFDocument, PDFFont, PDFPage, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import bidiFactory from 'bidi-js'
import { OrderForm, calcItemsTotal, calcRemaining } from '../pages/orders/types'

const bidi = bidiFactory()

const SHADING_LABELS: Record<string, string> = {
  zebra: 'זברה', venetian: 'ונציאני', roman: 'רומי', roller: 'גלילה',
}

const PAGE_W = 595.28
const PAGE_H = 841.89
const MARGIN = 36
const TEAL = rgb(0x1f / 255, 0x6e / 255, 0x6b / 255)
const ORANGE = rgb(0xea / 255, 0x8c / 255, 0x1f / 255)
const GRAY = rgb(0.4, 0.4, 0.4)
const LIGHT_GRAY = rgb(0.93, 0.93, 0.93)
const BORDER = rgb(0.8, 0.8, 0.8)
const BLACK = rgb(0.1, 0.1, 0.1)
const RED = rgb(0.75, 0.2, 0.15)

// Unicode Directional Isolates — "עוטפים" רצפי מספרים/תאריכים/טלפונים לפני
// הרצת ה-bidi, כדי שהאלגוריתם יתייחס אליהם כיחידת LTR אטומית ולא יפרק
// את סדר הקבוצות בתוכם (בעיה אמיתית שנמצאה: "תאריך: 24.7.2026" יצא מבולבל
// כי ה-bidi ערבב את סדר שלוש קבוצות הספרות כשהן מוטמעות בתוך משפט עברי).
const LRI = '⁦' // Left-to-Right Isolate
const PDI = '⁩' // Pop Directional Isolate

function wrapNumericRuns(text: string): string {
  return text.replace(/[0-9]+(?:[.,:\-/][0-9]+)*/g, m => LRI + m + PDI)
}

// ממיר טקסט לסדר התצוגה הנכון (UAX #9 — אלגוריתם ה-bidi הרשמי של יוניקוד,
// דרך bidi-js) כדי לצייר אותו עם מנוע ציור LTR-בלבד כמו pdf-lib.
// הניסיון הראשון (היפוך תווים ידני לפי מילים) נכשל בפועל — לא טיפל נכון
// בפיסוק צמוד למילים ובמראה-מראה (mirroring) של סוגריים.
function toVisual(text: string): string {
  if (!text) return ''
  const marked = wrapNumericRuns(text)
  const embeddingLevels = bidi.getEmbeddingLevels(marked, 'rtl')
  const chars = marked.split('')

  const mirrored = bidi.getMirroredCharactersMap(marked, embeddingLevels)
  mirrored.forEach((replacement, idx) => { chars[idx] = replacement })

  const flips = bidi.getReorderSegments(marked, embeddingLevels)
  flips.forEach(([start, end]) => {
    let i = start, j = end
    while (i < j) {
      const tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp
      i++; j--
    }
  })

  return chars.filter(c => c !== LRI && c !== PDI).join('')
}

interface Ctx {
  pdfDoc: PDFDocument
  font: PDFFont
  page: PDFPage
  y: number
}

function addPage(ctx: Ctx) {
  ctx.page = ctx.pdfDoc.addPage([PAGE_W, PAGE_H])
  ctx.y = PAGE_H - MARGIN
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y - needed < MARGIN) addPage(ctx)
}

const LINE_GAP = 4

// טקסט מיושר לימין (תחילת השורה בעברית) בתוך רוחב נתון, ומקדם את הסמן האנכי בשורה אחת
function drawRight(ctx: Ctx, text: string, size: number, opts: { color?: ReturnType<typeof rgb>; xRight?: number } = {}) {
  ensureSpace(ctx, size + LINE_GAP)
  const xRight = opts.xRight ?? PAGE_W - MARGIN
  const visual = toVisual(text)
  const width = ctx.font.widthOfTextAtSize(visual, size)
  ctx.page.drawText(visual, {
    x: xRight - width, y: ctx.y - size, size, font: ctx.font, color: opts.color ?? BLACK,
  })
  ctx.y -= size + LINE_GAP
}

function truncateToWidth(font: PDFFont, text: string, size: number, maxWidth: number): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text
  let out = text
  while (out.length > 1 && font.widthOfTextAtSize(out + '…', size) > maxWidth) {
    out = out.slice(0, -1)
  }
  return out + '…'
}

function sectionTitle(ctx: Ctx, text: string, color: ReturnType<typeof rgb>) {
  ensureSpace(ctx, 26)
  ctx.y -= 4
  const height = 16
  ctx.page.drawRectangle({
    x: MARGIN, y: ctx.y - height, width: PAGE_W - MARGIN * 2, height, color,
  })
  const visual = toVisual(text)
  const size = 10
  const width = ctx.font.widthOfTextAtSize(visual, size)
  ctx.page.drawText(visual, {
    x: PAGE_W - MARGIN - 8 - width, y: ctx.y - height + 4, size, font: ctx.font, color: rgb(1, 1, 1),
  })
  ctx.y -= height + 6
}

interface TableCol { header: string; width: number }

function drawTable(ctx: Ctx, cols: TableCol[], rows: string[][]) {
  const rowHeight = 16
  const totalWidth = cols.reduce((s, c) => s + c.width, 0)
  const xStart = PAGE_W - MARGIN - totalWidth // שמאלית ביותר של הטבלה

  const drawHeader = () => {
    ensureSpace(ctx, rowHeight)
    ctx.page.drawRectangle({ x: xStart, y: ctx.y - rowHeight, width: totalWidth, height: rowHeight, color: LIGHT_GRAY })
    let xRight = PAGE_W - MARGIN
    for (const col of cols) {
      const visual = toVisual(col.header)
      const size = 8
      const w = ctx.font.widthOfTextAtSize(visual, size)
      ctx.page.drawText(visual, { x: xRight - col.width + (col.width - w) / 2, y: ctx.y - rowHeight + 5, size, font: ctx.font, color: BLACK })
      xRight -= col.width
    }
    ctx.page.drawRectangle({ x: xStart, y: ctx.y - rowHeight, width: totalWidth, height: rowHeight, borderColor: BORDER, borderWidth: 0.5 })
    ctx.y -= rowHeight
  }

  drawHeader()

  rows.forEach((row, i) => {
    if (ctx.y - rowHeight < MARGIN) {
      addPage(ctx)
      drawHeader()
    }
    if (i % 2 === 1) {
      ctx.page.drawRectangle({ x: xStart, y: ctx.y - rowHeight, width: totalWidth, height: rowHeight, color: rgb(0.97, 0.97, 0.97) })
    }
    let xRight = PAGE_W - MARGIN
    row.forEach((cell, ci) => {
      const col = cols[ci]
      const size = 8
      const visual = toVisual(truncateToWidth(ctx.font, cell ?? '', size, col.width - 6))
      const w = ctx.font.widthOfTextAtSize(visual, size)
      ctx.page.drawText(visual, { x: xRight - 3 - w, y: ctx.y - rowHeight + 5, size, font: ctx.font, color: BLACK })
      xRight -= col.width
    })
    ctx.page.drawRectangle({ x: xStart, y: ctx.y - rowHeight, width: totalWidth, height: rowHeight, borderColor: BORDER, borderWidth: 0.5 })
    ctx.y -= rowHeight
  })

  ctx.y -= 10
}

let cachedFontBytes: ArrayBuffer | null = null
async function loadHebrewFontBytes(): Promise<ArrayBuffer> {
  if (cachedFontBytes) return cachedFontBytes
  const res = await fetch('/fonts/NotoSansHebrew-Regular.ttf')
  if (!res.ok) throw new Error('טעינת הפונט העברי נכשלה')
  cachedFontBytes = await res.arrayBuffer()
  return cachedFontBytes
}

/** בונה PDF של סיכום הזמנה (טקסט וקטורי אמיתי, לא תמונה) ומחזיר Blob */
export async function generateOrderPdf(
  form: OrderForm, orderNumber: string | number, showPrices: boolean,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.registerFontkit(fontkit)
  const fontBytes = await loadHebrewFontBytes()
  const font = await pdfDoc.embedFont(fontBytes, { subset: true })

  const ctx: Ctx = { pdfDoc, font, page: pdfDoc.addPage([PAGE_W, PAGE_H]), y: PAGE_H - MARGIN }

  const title = showPrices ? 'הזמנה / הצעת מחיר' : 'הוראות עבודה'

  // כותרת עליונה
  drawRight(ctx, 'מרקו קאירי', 16, { color: TEAL })
  drawRight(ctx, 'וילונות ובדים בהתאמה אישית', 9, { color: GRAY })
  ctx.y -= 8
  drawRight(ctx, title, 12, { color: TEAL })
  drawRight(ctx, `מספר הזמנה: ${orderNumber}`, 9)
  drawRight(ctx, `תאריך: ${new Date().toLocaleDateString('he-IL')}`, 9)
  drawRight(ctx, `סוכן: ${form.agent_name}`, 9)
  ctx.y -= 8
  ctx.page.drawLine({
    start: { x: MARGIN, y: ctx.y }, end: { x: PAGE_W - MARGIN, y: ctx.y }, thickness: 1.2, color: TEAL,
  })
  ctx.y -= 16

  // פרטי לקוח
  drawRight(ctx, `שם לקוח: ${form.customer_name}`, 10)
  drawRight(ctx, `טלפון: ${form.phone}`, 10)
  if (form.address) drawRight(ctx, `כתובת: ${form.address}`, 10)
  ctx.y -= 6

  // וילונות
  if (form.curtain_items.length > 0) {
    sectionTitle(ctx, 'מידות וילונות', TEAL)
    const cols: TableCol[] = [
      { header: '#', width: 16 },
      { header: 'מיקום', width: 55 },
      { header: 'סוג תפירה', width: 55 },
      { header: 'רוחב', width: 32 },
      { header: 'גובה/ים', width: 55 },
      { header: 'שטייף', width: 32 },
      { header: 'מכפלת', width: 32 },
      { header: 'חצוי', width: 28 },
      { header: 'בד', width: 60 },
      { header: 'ביצוע', width: 28 },
      ...(showPrices ? [{ header: 'עלות', width: 45 } as TableCol] : []),
    ]
    const rows = form.curtain_items.map((item, i) => [
      String(i + 1), item.location, item.sewing_type, item.width_cm, item.heights_cm,
      item.shtaif_cm, item.hem_cm, item.is_split ? 'כן' : 'לא', item.fabric_text,
      item.for_execution ? '✓' : '',
      ...(showPrices ? [item.price ? `${Number(item.price).toLocaleString()} ₪` : ''] : []),
    ])
    drawTable(ctx, cols, rows)
  }

  // הצללה
  if (form.shading_items.length > 0) {
    sectionTitle(ctx, 'זברות / ונציאני / רומי / גלילה', ORANGE)
    const cols: TableCol[] = [
      { header: '#', width: 16 },
      { header: 'סוג', width: 40 },
      { header: 'מיקום', width: 55 },
      { header: 'התקנה', width: 45 },
      { header: 'רוחב', width: 32 },
      { header: 'גובה', width: 40 },
      { header: 'צד מנגנון', width: 45 },
      { header: 'צבע/בד', width: 60 },
      { header: 'ביצוע', width: 28 },
      ...(showPrices ? [{ header: 'עלות', width: 45 } as TableCol] : []),
    ]
    const rows = form.shading_items.map((item, i) => [
      String(i + 1), SHADING_LABELS[item.subtype] ?? item.subtype, item.location, item.mount_type,
      item.width_cm, item.heights_cm, item.mechanism_side, item.color_fabric_text,
      item.for_execution ? '✓' : '',
      ...(showPrices ? [item.price ? `${Number(item.price).toLocaleString()} ₪` : ''] : []),
    ])
    drawTable(ctx, cols, rows)
  }

  // אביזרים
  const accessories = form.accessories.filter(a => a.name)
  if (accessories.length > 0) {
    sectionTitle(ctx, 'אביזרים', rgb(0.33, 0.33, 0.33))
    const cols: TableCol[] = [
      { header: 'פריט', width: 120 },
      { header: 'כמות', width: 40 },
      ...(showPrices ? [{ header: 'מחיר יחידה', width: 55 } as TableCol, { header: 'סה״כ', width: 55 } as TableCol] : []),
    ]
    const rows = accessories.map(a => [
      a.name, a.quantity,
      ...(showPrices ? [`${a.unit_price} ₪`, `${(Number(a.quantity) * Number(a.unit_price)).toLocaleString()} ₪`] : []),
    ])
    drawTable(ctx, cols, rows)
  }

  // סיכום מחיר / הוראת עבודה
  if (showPrices) {
    const itemsTotal = calcItemsTotal(form)
    const remaining = calcRemaining(form)
    ensureSpace(ctx, 90)
    drawRight(ctx, `סה״כ פריטים לביצוע: ${itemsTotal.toLocaleString()} ₪`, 10)
    if (form.discount) drawRight(ctx, `הנחה: -${Number(form.discount).toLocaleString()} ₪`, 10)
    if (form.installation_fee) {
      drawRight(ctx, `התקנה (בנפרד — מול המתקין): ${Number(form.installation_fee).toLocaleString()} ₪`, 9, { color: GRAY })
    }
    drawRight(ctx, `סה״כ לתשלום: ${Number(form.final_total || 0).toLocaleString()} ₪`, 12, { color: TEAL })
    if (form.paid_on_account) {
      drawRight(ctx, `שולם על החשבון (${form.payment_method}): ${Number(form.paid_on_account).toLocaleString()} ₪`, 10)
      drawRight(ctx, `נשאר לתשלום: ${remaining.toLocaleString()} ₪`, 11, { color: RED })
    }
  } else {
    ensureSpace(ctx, 40)
    drawRight(ctx, 'הוראות עבודה — ללא מחירים', 10, { color: ORANGE })
    drawRight(ctx, 'מסמך זה מיועד לסדנה/תפירה בלבד.', 9, { color: GRAY })
  }

  if (form.notes) {
    ctx.y -= 8
    ensureSpace(ctx, 24)
    drawRight(ctx, 'הערות:', 10)
    for (const line of form.notes.split('\n')) drawRight(ctx, line, 9, { color: GRAY })
  }

  if (showPrices) {
    ctx.y -= 12
    ensureSpace(ctx, 40)
    drawRight(ctx, 'ההזמנה תסופק עד 21 ימי עסקים מרגע תשלום המקדמה. (פרט לוילונות הונציאנים, הרומאים והגלילות)', 8, { color: GRAY })
    drawRight(ctx, 'בדקתי את המידות וסוג התפירה ואני מאשר/ת את ההזמנה (לא תתקבל תלונה)', 8, { color: GRAY })

    ctx.y -= 20
    if (form.signatureDataUrl?.startsWith('data:image/png')) {
      const base64 = form.signatureDataUrl.split(',')[1]
      const png = await ctx.pdfDoc.embedPng(base64)
      const h = 50
      const w = (png.width / png.height) * h
      ensureSpace(ctx, h + 12)
      ctx.page.drawImage(png, { x: PAGE_W - MARGIN - w, y: ctx.y - h, width: w, height: h })
      ctx.y -= h + 2
      drawRight(ctx, 'חתימת לקוח', 8, { color: GRAY })
    } else {
      ensureSpace(ctx, 20)
      drawRight(ctx, `חתימת לקוח: ${form.signature_name || ''}`, 9)
    }
  }

  const bytes = await pdfDoc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
