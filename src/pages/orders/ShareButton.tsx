interface Props {
  orderNumber: number | string
  customerName: string
  phone: string
}

const BASE_URL = window.location.origin

export default function ShareButton({ orderNumber, customerName, phone }: Props) {
  const printUrl = `${BASE_URL}/print/${orderNumber}`

  const copyLink = () => {
    navigator.clipboard.writeText(printUrl)
    alert('הקישור הועתק ✓')
  }

  const sendWhatsApp = () => {
    const cleanPhone = String(phone).replace(/\D/g, '').replace(/^0/, '972')
    const text = `שלום ${customerName} 😊\nמצורף קישור לצפייה ולהדפסת ההזמנה מקאירי וילונות:\n${printUrl}`
    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <button className="btn-ghost text-sm" onClick={sendWhatsApp}>
        💬 שלח קישור ב-WhatsApp
      </button>
      <button className="btn-ghost text-sm" onClick={copyLink}>
        🔗 העתק קישור להזמנה
      </button>
    </div>
  )
}
