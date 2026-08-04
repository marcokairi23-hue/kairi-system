import { supabase } from './supabase'

export type SignatureKind = 'customer' | 'agent' | 'install_customer' | 'install_installer'

const SIGNATURE_PATH_SUFFIX: Record<SignatureKind, string> = {
  customer: '',
  agent: '-agent',
  install_customer: '-install-customer',
  install_installer: '-install-installer',
}

export async function uploadSignature(orderId: string, dataUrl: string, kind: SignatureKind = 'customer'): Promise<string> {
  const path = `signatures/${orderId}${SIGNATURE_PATH_SUFFIX[kind]}.png`

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

export async function getSignatureDataUrl(path: string): Promise<string | null> {
  const url = await getSignatureUrl(path)
  if (!url) return null

  try {
    const blob = await fetch(url).then((r) => r.blob())
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
