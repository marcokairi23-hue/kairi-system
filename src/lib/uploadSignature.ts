import { supabase } from './supabase'

export async function uploadSignature(orderId: string, dataUrl: string): Promise<string> {
  const path = `signatures/${orderId}.png`

  let blob: Blob
  try {
    blob = await fetch(dataUrl).then((r) => r.blob())
  } catch {
    throw new Error('שגיאה בעיבוד תמונת החתימה')
  }

  const { error } = await supabase.storage
    .from('documents')
    .upload(path, blob, { contentType: 'image/png', upsert: true })

  if (error) {
    throw new Error('שגיאה בהעלאת החתימה: ' + error.message)
  }

  return path
}

export async function getSignatureUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(path, 60 * 60)

  if (error || !data) {
    return null
  }

  return data.signedUrl
}
