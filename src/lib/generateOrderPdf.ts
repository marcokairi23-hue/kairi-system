import { PDFDocument } from 'pdf-lib'
import html2canvas from 'html2canvas'
import { OrderForm } from '../pages/orders/types'
import { buildOrderHtml } from '../pages/orders/printOrder'

const A4_WIDTH_PT = 595.28
const A4_HEIGHT_PT = 841.89
const RENDER_WIDTH_PX = 794 // רוחב A4 ב-96dpi — תואם את max-width: 210mm שכבר קיים ב-HTML

// מרנדר את אותו HTML ש-printOrder.ts כבר משתמש בו (עברית/RTL תקינים, כי זה
// אותו מנוע רינדור של הדפדפן) ל-canvas, בתוך iframe מוסתר.
async function renderOrderToCanvas(
  form: OrderForm, orderNumber: string | number, showPrices: boolean,
): Promise<HTMLCanvasElement> {
  const html = buildOrderHtml(form, orderNumber, showPrices)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.top = '0'
  iframe.style.left = '-99999px'
  iframe.style.width = `${RENDER_WIDTH_PX}px`
  iframe.style.height = '100px'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const loadPromise = new Promise<void>(resolve => {
      iframe.addEventListener('load', () => resolve(), { once: true })
    })

    const doc = iframe.contentDocument
    if (!doc) throw new Error('יצירת תצוגה זמנית להפקת PDF נכשלה')
    doc.open()
    doc.write(html)
    doc.close()

    await loadPromise
    if (doc.fonts?.ready) await doc.fonts.ready

    const target = doc.querySelector('.page') as HTMLElement | null
    if (!target) throw new Error('לא נמצא תוכן להפקת PDF')

    iframe.style.height = `${target.scrollHeight}px`

    return await html2canvas(target, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: target.scrollWidth,
      windowWidth: target.scrollWidth,
      foreignObjectRendering: true,
    })
  } finally {
    document.body.removeChild(iframe)
  }
}

/** בונה PDF של סיכום הזמנה (צילום של אותו HTML שההדפסה הרגילה משתמשת בו) ומחזיר Blob */
export async function generateOrderPdf(
  form: OrderForm, orderNumber: string | number, showPrices: boolean,
): Promise<Blob> {
  const canvas = await renderOrderToCanvas(form, orderNumber, showPrices)

  const scale = A4_WIDTH_PT / canvas.width
  const imgWidthPt = canvas.width * scale
  const imgHeightPt = canvas.height * scale

  const pdfDoc = await PDFDocument.create()
  const jpgBytes = await fetch(canvas.toDataURL('image/jpeg', 0.85)).then(r => r.arrayBuffer())
  const jpg = await pdfDoc.embedJpg(jpgBytes)

  if (imgHeightPt <= A4_HEIGHT_PT) {
    const page = pdfDoc.addPage([A4_WIDTH_PT, imgHeightPt])
    page.drawImage(jpg, { x: 0, y: 0, width: imgWidthPt, height: imgHeightPt })
  } else {
    const pageCount = Math.ceil(imgHeightPt / A4_HEIGHT_PT)
    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.addPage([A4_WIDTH_PT, A4_HEIGHT_PT])
      const yOffset = (i + 1) * A4_HEIGHT_PT - imgHeightPt
      page.drawImage(jpg, { x: 0, y: yOffset, width: imgWidthPt, height: imgHeightPt })
    }
  }

  const bytes = await pdfDoc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}
