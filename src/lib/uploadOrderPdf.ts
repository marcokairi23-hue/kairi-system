import { supabase } from './supabase'
import { generateOrderPdf } from './generateOrderPdf'
import { buildFormFromOrder } from '../pages/orders/printOrder'
import { getSignatureDataUrl } from './uploadSignature'

export const CUSTOMER_PDF_UPDATE_WARNING = 'השינויים נשמרו, אך עדכון PDF הלקוח נכשל.'

/** Shared by on-demand printing and the persistent customer PDF. */
export async function generateCurrentOrderPdf(orderId: string): Promise<Blob> {
  const { data: order, error: readError } = await supabase.from('orders')
    .select('*, profiles!orders_agent_id_fkey(full_name), customers(city), order_items(*), payments(*)')
    .eq('id', orderId).single()
  if (readError) throw readError
  if (!order) throw new Error('הזמנה לא נמצאה')

  const [customerSignature, agentSignature] = await Promise.all([
    order.signature_url ? getSignatureDataUrl(order.signature_url) : Promise.resolve(null),
    order.agent_signature_url ? getSignatureDataUrl(order.agent_signature_url) : Promise.resolve(null),
  ])
  if ((order.signature_url && !customerSignature) || (order.agent_signature_url && !agentSignature)) {
    throw new Error('לא ניתן לטעון את החתימות השמורות ל-PDF')
  }
  order.order_items?.sort((a: { sort_order?: number }, b: { sort_order?: number }) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0))
  return generateOrderPdf({
    ...buildFormFromOrder(order),
    signatureDataUrl: customerSignature,
    agentSignatureDataUrl: agentSignature,
  }, order.order_number ?? 'טיוטה', true)
}

/** Refresh only the customer PDF, using persisted data and the existing stable path. */
export async function refreshOrderPdf(orderId: string): Promise<string> {
  const pdf = await generateCurrentOrderPdf(orderId)
  const url = await uploadOrderPdf(orderId, pdf)
  const { data: updated, error: writeError } = await supabase.from('orders')
    .update({ pdf_url: url }).eq('id', orderId).select('id').single()
  if (writeError) throw writeError
  if (!updated) throw new Error('קישור PDF הלקוח לא נשמר')
  return url
}

// Display-only version: the canonical URL and storage path remain unchanged.
export function getUpdatedOrderPdfDisplayUrl(url: string, version: number): string {
  const displayUrl = new URL(url)
  displayUrl.searchParams.set('v', String(version))
  return displayUrl.toString()
}

export async function uploadOrderPdf(orderId: string, pdfBlob: Blob, original = false): Promise<string> {
  const path = original ? `${orderId}-original.pdf` : `${orderId}.pdf`

  const { error } = await supabase.storage
    .from('order-pdfs')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: !original, cacheControl: '0' })

  if (error) {
    throw new Error('שגיאה בהעלאת קובץ ה-PDF: ' + error.message)
  }

  return getOrderPdfUrl(path)
}

export function getOrderPdfUrl(path: string): string {
  return supabase.storage.from('order-pdfs').getPublicUrl(path).data.publicUrl
}
