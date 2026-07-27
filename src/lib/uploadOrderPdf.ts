import { supabase } from './supabase'

export async function uploadOrderPdf(orderId: string, pdfBlob: Blob): Promise<string> {
  const path = `${orderId}/${Date.now()}.pdf`

  const { error } = await supabase.storage
    .from('order-pdfs')
    .upload(path, pdfBlob, { contentType: 'application/pdf', upsert: true })

  if (error) {
    throw new Error('שגיאה בהעלאת קובץ ה-PDF: ' + error.message)
  }

  return getOrderPdfUrl(path)
}

export function getOrderPdfUrl(path: string): string {
  return supabase.storage.from('order-pdfs').getPublicUrl(path).data.publicUrl
}
