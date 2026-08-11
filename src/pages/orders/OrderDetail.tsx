import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { printOrder, buildFormFromOrder } from './printOrder'
import OrderActivityTab from './OrderActivityTab'
import ItemSelectionDialog from './ItemSelectionDialog'
import StatusSuggestionBanner from './StatusSuggestionBanner'
import PaymentModal from './PaymentModal'
import { getSignatureUrl, getSignatureDataUrl, uploadSignature } from '../../lib/uploadSignature'
import SignatureModal from '../../components/SignatureModal'
import { generateOrderPdf } from '../../lib/generateOrderPdf'
import { uploadOrderPdf } from '../../lib/uploadOrderPdf'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, ORDER_STATUS_NEXT,
  ITEM_STATUS_LABELS, ITEM_STATUS_COLORS, SHADING_LABELS, calcProgress,
} from '../../lib/statusHelpers'

interface OrderItem {
  id: string
  family: 'curtain' | 'shading'
  subtype?: string
  location: string
  width_m: number
  heights_m: number[]
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
}

interface Payment {
  id: string
  amount: number
  method: string
  paid_at: string
}

interface Order {
  id: string
  order_number: number | null
  status: string
  is_quote: boolean
  customer_name_snapshot: string
  phone_snapshot: string
  address_snapshot: string
  agent_id: string
  items_total: number
  installation_fee: number
  discount: number
  final_total: number
  total_width_m: number
  send_email: string | null
  signature_name: string | null
  signature_url: string | null
  agent_signature_url: string | null
  pdf_url: string | null
  pdf_url_original: string | null
  installer_name: string | null
  install_customer_signature_url: string | null
  install_installer_signature_url: string | null
  notes: string | null
  created_at: string
  profiles?: { full_name: string }
  order_items?: OrderItem[]
  payments?: Payment[]
}



export default function OrderDetail() {
  const { profile } = useAuth()
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [signatureImgUrl, setSignatureImgUrl] = useState<string | null>(null)
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null)
  const [signatureLoading, setSignatureLoading] = useState(false)
  const [agentSignatureImgUrl, setAgentSignatureImgUrl] = useState<string | null>(null)
  const [agentSignatureDataUrl, setAgentSignatureDataUrl] = useState<string | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [tab, setTab] = useState<'details' | 'activity'>('details')
  const [sharingPdf, setSharingPdf] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [sendingMake, setSendingMake] = useState(false)
  const [makeResult, setMakeResult] = useState<'ok' | 'error' | null>(null)
  const [syncingPdf, setSyncingPdf] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [officeSelectionOpen, setOfficeSelectionOpen] = useState(false)
  const [showProductionSuggestion, setShowProductionSuggestion] = useState(false)
  const [installers, setInstallers] = useState<string[]>([])
  const [showInstallerSuggestion, setShowInstallerSuggestion] = useState(false)
  const [installCustomerSigOpen, setInstallCustomerSigOpen] = useState(false)
  const [installInstallerSigOpen, setInstallInstallerSigOpen] = useState(false)
  const [installCustomerSigUrl, setInstallCustomerSigUrl] = useState<string | null>(null)
  const [installInstallerSigUrl, setInstallInstallerSigUrl] = useState<string | null>(null)
  const [completionPaymentOpen, setCompletionPaymentOpen] = useState(false)
  const [showCompletedSuggestion, setShowCompletedSuggestion] = useState(false)
  const [reopenConfirmOpen, setReopenConfirmOpen] = useState(false)

  const load = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*, profiles!orders_agent_id_fkey(full_name), order_items(*), payments(*)')
      .eq('id', id)
      .single()
    setOrder(data as Order)
    setLoading(false)
    if (data?.signature_url) {
      setSignatureLoading(true)
      getSignatureUrl(data.signature_url).then(setSignatureImgUrl)
      getSignatureDataUrl(data.signature_url).then((dataUrl) => {
        setSignatureDataUrl(dataUrl)
        setSignatureLoading(false)
      })
    }
    if (data?.agent_signature_url) {
      getSignatureUrl(data.agent_signature_url).then(setAgentSignatureImgUrl)
      getSignatureDataUrl(data.agent_signature_url).then(setAgentSignatureDataUrl)
    }
    setInstallCustomerSigUrl(null)
    setInstallInstallerSigUrl(null)
    if (data?.install_customer_signature_url) {
      getSignatureUrl(data.install_customer_signature_url).then(setInstallCustomerSigUrl)
    }
    if (data?.install_installer_signature_url) {
      getSignatureUrl(data.install_installer_signature_url).then(setInstallInstallerSigUrl)
    }
  }

  const saveInstallSignature = async (kind: 'install_customer' | 'install_installer', dataUrl: string | null) => {
    if (!dataUrl || !id) return
    const path = await uploadSignature(id, dataUrl, kind)
    const column = kind === 'install_customer' ? 'install_customer_signature_url' : 'install_installer_signature_url'
    await supabase.from('orders').update({ [column]: path }).eq('id', id)
    await load()
  }

  useEffect(() => { load() }, [id])

  useEffect(() => {
    supabase.from('settings').select('value').eq('key', 'installers').maybeSingle()
      .then(({ data }) => setInstallers(Array.isArray(data?.value) ? data.value : []))
  }, [])

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>
  if (!order) return <div className="text-red-500 p-4">הזמנה לא נמצאה</div>

  const paid = (order.payments ?? []).reduce((s, p) => s + p.amount, 0)
  const remaining = order.final_total - paid
  const curtains = (order.order_items ?? []).filter(i => i.family === 'curtain')
  const shadings = (order.order_items ?? []).filter(i => i.family === 'shading')

  const nextStatus = ORDER_STATUS_NEXT[order.status]
  const prog = calcProgress(order.order_items ?? [])

  const form = buildFormFromOrder(order)
  const orderNum = order.order_number ?? 'טיוטה'

  const advanceStatus = async () => {
    if (!nextStatus) return
    setUpdatingStatus(true)
    await supabase.from('orders').update({ status: nextStatus }).eq('id', id)
    await supabase.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: nextStatus,
      changed_by: profile?.id ?? null,
      note: 'עדכון ידני',
    })
    await load()
    setUpdatingStatus(false)
  }

  const confirmOfficeSelection = async (selectedIds: Set<string>) => {
    const items = order.order_items ?? []
    await Promise.all(items.map(item =>
      supabase.from('order_items')
        .update({ for_execution: selectedIds.has(item.id) })
        .eq('id', item.id)
    ))
    setOfficeSelectionOpen(false)
    setShowProductionSuggestion(true)
    await load()
  }

  const assignInstaller = async (name: string) => {
    if (!name) return
    await supabase.from('orders').update({ installer_name: name }).eq('id', id)
    setShowInstallerSuggestion(true)
    await load()
  }

  const markInstallSuccess = () => {
    if (remaining > 0) setCompletionPaymentOpen(true)
    else setShowCompletedSuggestion(true)
  }

  const reopenCase = async () => {
    setUpdatingStatus(true)
    await supabase.from('orders').update({ status: 'ready_for_install' }).eq('id', id)
    await supabase.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: 'ready_for_install',
      changed_by: profile?.id ?? null,
      note: 'ההתקנה לא הושלמה — טיפול נפתח, חוזר לשיוך/תיאום מחדש',
    })
    setReopenConfirmOpen(false)
    setUpdatingStatus(false)
    await load()
  }

  const cancelOrder = async () => {
    setUpdatingStatus(true)
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id)
    await supabase.from('order_status_history').insert({
      order_id: id,
      from_status: order.status,
      to_status: 'cancelled',
      changed_by: profile?.id ?? null,
      note: 'בוטלה ידנית',
    })
    setShowCancelConfirm(false)
    await load()
    setUpdatingStatus(false)
  }

  const sendWhatsApp = () => {
    const phone = order.phone_snapshot.replace(/\D/g, '').replace(/^0/, '972')
    const items = [
      ...curtains.map(i => `• וילון ${i.location} — ${i.width_m}×${i.heights_m.join('/')} מ׳`),
      ...shadings.map(i => `• ${SHADING_LABELS[i.subtype??''] ?? i.subtype} ${i.location} — ${i.width_m}×${i.heights_m.join('/')} מ׳`),
    ].join('\n')
    const text = `שלום ${order.customer_name_snapshot} 😊\nהזמנה מספר #${orderNum} מקאירי וילונות:\n\n${items}\n\nסה״כ לתשלום: ₪${order.final_total.toLocaleString()}\n${paid > 0 ? `שולם: ₪${paid.toLocaleString()}\nנשאר: ₪${remaining.toLocaleString()}` : ''}\n\nתודה! 🙏`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  // כפתור זמני: מפיק PDF טרי מהנתונים הנוכחיים ומחליף את הקובץ בקישור הקיים (pdf_url) — אין הפקה אוטומטית יותר בעריכה
  const syncPdf = async () => {
    setSyncingPdf(true); setSyncError(null)
    try {
      const pdfBlob = await generateOrderPdf({ ...form, signatureDataUrl, agentSignatureDataUrl }, orderNum, true)
      const pdfUrl = await uploadOrderPdf(id!, pdfBlob)
      await supabase.from('orders').update({ pdf_url: pdfUrl }).eq('id', id)
      await load()
    } catch (err) {
      setSyncError('שגיאה בסנכרון ה-PDF: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSyncingPdf(false)
    }
  }

  // גישה 1: קישור PDF בתוך הודעת WhatsApp טקסטואלית (wa.me) — נפתח ישירות לצ'אט של הלקוח
  const sendPdfLinkWhatsApp = () => {
    if (!order.pdf_url) return
    const phone = order.phone_snapshot.replace(/\D/g, '').replace(/^0/, '972')
    const text = `שלום ${order.customer_name_snapshot} 😊\nהנה טופס הזמנה מספר #${orderNum} מקאירי וילונות:\n${order.pdf_url}`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  // גישה 2: שיתוף הקובץ עצמו דרך Web Share API — פותח את תפריט השיתוף הטבעי של המכשיר
  const sharePdfFile = async () => {
    if (!order.pdf_url) return
    setSharingPdf(true); setShareError(null)
    try {
      const res = await fetch(order.pdf_url)
      const blob = await res.blob()
      const file = new File([blob], `הזמנה-${orderNum}.pdf`, { type: 'application/pdf' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `הזמנה #${orderNum}`,
          text: `טופס הזמנה עבור ${order.customer_name_snapshot}`,
        })
      } else {
        setShareError('שיתוף קבצים לא נתמך בדפדפן/מכשיר הזה. נסה מהטלפון (Chrome או Safari).')
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        // המשתמש ביטל את תיבת השיתוף — לא שגיאה אמיתית
      } else {
        setShareError('שגיאה בשיתוף הקובץ: ' + (err instanceof Error ? err.message : String(err)))
      }
    } finally {
      setSharingPdf(false)
    }
  }

  // גישה 3: שליחה צד-שרת דרך Make.com + ManyChat — בלי לפתוח וואטסאפ בכלל
  const sendPdfViaMake = async () => {
    if (!order.pdf_url) return
    const webhookUrl = import.meta.env.VITE_MAKE_WEBHOOK_URL
    if (!webhookUrl) {
      setMakeResult('error')
      return
    }
    setSendingMake(true); setMakeResult(null)
    try {
      const phone = order.phone_snapshot.replace(/\D/g, '').replace(/^0/, '972')
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          customer_name: order.customer_name_snapshot,
          order_number: orderNum,
          pdf_url: order.pdf_url,
        }),
      })
      setMakeResult(res.ok ? 'ok' : 'error')
    } catch {
      setMakeResult('error')
    } finally {
      setSendingMake(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto pb-10">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button onClick={() => navigate('/orders')} className="text-sm text-slate-500 hover:text-slate-700 mb-1">
            ← חזרה
          </button>
          <h1 className="text-xl font-bold flex items-center gap-2 flex-wrap">
            הזמנה #{orderNum}
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${ORDER_STATUS_COLORS[order.status] ?? 'bg-slate-100'}`}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </span>
          </h1>
          <div className="text-sm text-slate-500">
            {new Date(order.created_at).toLocaleDateString('he-IL')} | {order.profiles?.full_name}
          </div>
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setTab('details')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'details' ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          פרטים
        </button>
        <button
          onClick={() => setTab('activity')}
          className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
            tab === 'activity' ? 'bg-brand text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          יומן פעילות
        </button>
      </div>

      {tab === 'activity' && <OrderActivityTab orderId={id!} />}

      {tab === 'details' && <>

      {/* פעולות */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <button
          className="btn-ghost text-sm"
          disabled={signatureLoading}
          title={signatureLoading ? 'טוען חתימה...' : undefined}
          onClick={() => printOrder({ ...form, signatureDataUrl, agentSignatureDataUrl }, orderNum, true)}
        >
          🖨️ הדפס ללקוח
        </button>
        <button className="btn-ghost text-sm" onClick={() => printOrder(form, orderNum, false)}>
          🔧 הוראות עבודה
        </button>
        <button className="btn-ghost text-sm" onClick={sendWhatsApp}>
          💬 שלח ב-WhatsApp
        </button>
        <button className="btn-ghost text-sm" onClick={() => navigate(`/orders/${id}/edit`)}>
          ✏️ עריכה
        </button>
      </div>

      {/* עדכון סטטוס */}
      {order.status !== 'completed' && order.status !== 'cancelled' && (
        <div className="card p-3 mb-3 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-600">
            סטטוס: <strong>{ORDER_STATUS_LABELS[order.status]}</strong>
          </div>
          <div className="flex gap-2">
            {order.status === 'pending_payment' ? (
              <button className="btn-primary text-sm py-1.5" onClick={() => setOfficeSelectionOpen(true)}>
                🎯 בחירה סופית
              </button>
            ) : order.status === 'ready_for_install' ? (
              <select
                className="input text-sm py-1.5"
                value={order.installer_name ?? ''}
                onChange={e => assignInstaller(e.target.value)}
              >
                <option value="">שיוך מתקין...</option>
                {installers.map(name => <option key={name} value={name}>{name}</option>)}
              </select>
            ) : nextStatus && (
              <button className="btn-primary text-sm py-1.5" disabled={updatingStatus} onClick={advanceStatus}>
                {updatingStatus ? '...' : `← ${ORDER_STATUS_LABELS[nextStatus]}`}
              </button>
            )}
            <button className="text-xs text-red-400 hover:text-red-600 px-2" onClick={() => setShowCancelConfirm(true)}>
              ביטול
            </button>
          </div>
        </div>
      )}

      {showProductionSuggestion && order.status === 'pending_payment' && (
        <div className="mb-3">
          <StatusSuggestionBanner
            orderId={id!}
            currentStatus={order.status}
            suggestedStatus="in_production"
            reason="בחירה סופית בוצעה — להעביר לייצור?"
            onApplied={() => { setShowProductionSuggestion(false); load() }}
          />
        </div>
      )}

      {showInstallerSuggestion && order.status === 'ready_for_install' && (
        <div className="mb-3">
          <StatusSuggestionBanner
            orderId={id!}
            currentStatus={order.status}
            suggestedStatus="picked_by_installer"
            reason={`${order.installer_name} שויך — לשנות ל"נאסף ע"י מתקין"?`}
            onApplied={() => { setShowInstallerSuggestion(false); load() }}
          />
        </div>
      )}

      {order.status === 'picked_by_installer' && (
        <div className="card p-4 mb-3">
          <div className="text-xs font-bold text-slate-500 mb-2">חתימות סיום התקנה</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm mb-1">
                {installCustomerSigUrl ? '✅ חתימת לקוח' : '⬜ חתימת לקוח'}
              </div>
              {installCustomerSigUrl && (
                <img src={installCustomerSigUrl} alt="חתימת לקוח" className="h-16 rounded border mb-2" />
              )}
              <button className="btn-ghost text-sm" onClick={() => setInstallCustomerSigOpen(true)}>
                ✍️ {installCustomerSigUrl ? 'חתום מחדש' : 'חתימה'}
              </button>
            </div>
            <div>
              <div className="text-sm mb-1">
                {installInstallerSigUrl ? '✅ חתימת מתקין' : '⬜ חתימת מתקין'}
              </div>
              {installInstallerSigUrl && (
                <img src={installInstallerSigUrl} alt="חתימת מתקין" className="h-16 rounded border mb-2" />
              )}
              <button className="btn-ghost text-sm" onClick={() => setInstallInstallerSigOpen(true)}>
                ✍️ {installInstallerSigUrl ? 'חתום מחדש' : 'חתימה'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SignatureModal
        open={installCustomerSigOpen}
        title="חתימת לקוח — סיום התקנה"
        value={null}
        onSave={dataUrl => saveInstallSignature('install_customer', dataUrl)}
        onClose={() => setInstallCustomerSigOpen(false)}
      />
      <SignatureModal
        open={installInstallerSigOpen}
        title="חתימת מתקין — סיום התקנה"
        value={null}
        onSave={dataUrl => saveInstallSignature('install_installer', dataUrl)}
        onClose={() => setInstallInstallerSigOpen(false)}
      />

      {order.status === 'picked_by_installer'
        && order.install_customer_signature_url
        && order.install_installer_signature_url
        && !showCompletedSuggestion && (
        <div className="card p-4 mb-3">
          <div className="text-sm font-medium mb-3">האם ההתקנה הושלמה בהצלחה?</div>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" onClick={markInstallSuccess}>
              ✅ כן, הושלמה
            </button>
            <button className="btn-ghost flex-1 text-red-500" onClick={() => setReopenConfirmOpen(true)}>
              ⚠️ לא — פתיחת טיפול
            </button>
          </div>
        </div>
      )}

      {showCompletedSuggestion && (
        <div className="mb-3">
          <StatusSuggestionBanner
            orderId={id!}
            currentStatus={order.status}
            suggestedStatus="completed"
            reason="ההתקנה הושלמה והיתרה נגבתה — לסמן את ההזמנה כהושלמה?"
            onApplied={() => { setShowCompletedSuggestion(false); load() }}
          />
        </div>
      )}

      {reopenConfirmOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">לפתוח טיפול?</h3>
            <p className="text-slate-500 text-sm mb-4">
              ההזמנה תחזור לשיוך/תיאום מתקין מחדש.
            </p>
            <div className="flex gap-3">
              <button className="btn-primary bg-red-500 hover:bg-red-600 flex-1" disabled={updatingStatus} onClick={reopenCase}>
                כן, פתח טיפול
              </button>
              <button className="btn-ghost flex-1" onClick={() => setReopenConfirmOpen(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {completionPaymentOpen && (
        <PaymentModal
          orderId={id!}
          orderNumber={orderNum}
          customerName={order.customer_name_snapshot}
          finalTotal={order.final_total}
          alreadyPaid={paid}
          onClose={() => setCompletionPaymentOpen(false)}
          onSaved={() => { setCompletionPaymentOpen(false); setShowCompletedSuggestion(true); load() }}
        />
      )}

      {/* פרטי לקוח */}
      <div className="card p-4 mb-3">
        <div className="text-xs font-bold text-slate-500 mb-2">פרטי לקוח</div>
        <div className="font-bold text-lg">{order.customer_name_snapshot}</div>
        <a href={`tel:${order.phone_snapshot}`} className="text-brand text-sm font-medium">{order.phone_snapshot}</a>
        {order.address_snapshot && <div className="text-slate-500 text-sm mt-1">{order.address_snapshot}</div>}
      </div>

      {/* קישור PDF ציבורי */}
      {order.pdf_url && (
        <div className="card p-4 mb-3">
          {order.pdf_url_original && (
            <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
              <div className="text-sm min-w-0">
                <div className="text-xs font-bold text-slate-500 mb-1">PDF מקור (קפוא לצמיתות)</div>
                <a href={order.pdf_url_original} target="_blank" rel="noreferrer" className="text-brand underline break-all">
                  {order.pdf_url_original}
                </a>
              </div>
              <button
                className="btn-ghost text-sm shrink-0"
                onClick={() => navigator.clipboard.writeText(order.pdf_url_original!)}
              >
                העתק קישור
              </button>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm min-w-0">
              <div className="text-xs font-bold text-slate-500 mb-1">PDF חי (מסונכרן)</div>
              <a href={order.pdf_url} target="_blank" rel="noreferrer" className="text-brand underline break-all">
                {order.pdf_url}
              </a>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                className="btn-ghost text-sm"
                disabled={syncingPdf}
                onClick={syncPdf}
                title="מפיק PDF טרי מהנתונים הנוכחיים של ההזמנה ומחליף את הקובץ בקישור הקיים"
              >
                {syncingPdf ? 'מסנכרן...' : '🔄 סנכרן PDF'}
              </button>
              <button
                className="btn-ghost text-sm"
                onClick={() => navigator.clipboard.writeText(order.pdf_url!)}
              >
                העתק קישור
              </button>
            </div>
          </div>
          {syncError && <div className="text-red-600 text-xs mb-3">{syncError}</div>}

          <div className="text-xs font-bold text-slate-500 mb-2">שליחת PDF ללקוח — בדיקת 3 שיטות</div>
          <div className="grid grid-cols-3 gap-2">
            <button className="btn-ghost text-sm" onClick={sendPdfLinkWhatsApp}>
              💬 שיטה 1: קישור ב-WhatsApp
            </button>
            <button className="btn-ghost text-sm" disabled={sharingPdf} onClick={sharePdfFile}>
              {sharingPdf ? 'טוען...' : '📤 שיטה 2: שיתוף קובץ'}
            </button>
            <button className="btn-ghost text-sm" disabled={sendingMake} onClick={sendPdfViaMake}>
              {sendingMake ? 'שולח...' : '📨 שיטה 3: Make/ManyChat'}
            </button>
          </div>
          {shareError && <div className="text-red-600 text-xs mt-2">{shareError}</div>}
          {makeResult === 'ok' && <div className="text-green-700 text-xs mt-2">נשלח ל-Make בהצלחה — בדוק ב-Execution history / בוואטסאפ של הלקוח.</div>}
          {makeResult === 'error' && <div className="text-red-600 text-xs mt-2">שגיאה בשליחה ל-Make. בדוק את VITE_MAKE_WEBHOOK_URL וש-.env.local נטען (הפעל מחדש את שרת ה-dev אם שינית עכשיו).</div>}
        </div>
      )}

      {/* פס התקדמות */}
      {prog.total > 0 && (
        <div className="card p-4 mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-500">התקדמות ייצור</span>
            <span className={`text-sm font-bold ${
              prog.isComplete ? 'text-green-700'
              : prog.isPartial ? 'text-amber-700'
              : 'text-slate-500'
            }`}>
              {prog.isPartial && '⚠️ '}{prog.label}
            </span>
          </div>
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full transition-all ${
              prog.isComplete ? 'bg-green-500'
              : prog.isPartial ? 'bg-amber-400'
              : 'bg-slate-300'
            }`} style={{ width: `${prog.percent}%` }} />
          </div>
        </div>
      )}

      {order.status === 'in_production' && prog.isComplete && (
        <div className="mb-3">
          <StatusSuggestionBanner
            orderId={id!}
            currentStatus={order.status}
            suggestedStatus="ready_for_install"
            reason="כל הפריטים מוכנים — לשנות ל'מוכנה'? (התראה תירשם ביומן לאדמין, מתקין ומשרד)"
            onApplied={() => load()}
          />
        </div>
      )}

      {/* וילונות */}
      {curtains.length > 0 && (
        <div className="card mb-3 overflow-hidden">
          <div className="bg-purple-600 text-white px-4 py-2 text-sm font-bold">וילונות ({curtains.length})</div>
          <div className="divide-y">
            {curtains.map((item, i) => (
              <div key={item.id} className="p-3 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold">{i + 1}. {item.location}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ITEM_STATUS_COLORS[item.item_status] ?? 'bg-slate-100'
                    }`}>
                      {ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}
                    </span>
                    <span className="font-bold text-brand">₪{item.price.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-slate-500 mt-1 flex flex-wrap gap-x-3 text-xs">
                  <span>רוחב: {item.width_m} מ׳</span>
                  <span>גובה: {item.heights_m.join(', ')} מ׳</span>
                  <span>תפירה: {item.sewing_type}</span>
                  {item.shtaif_cm != null && <span>שטייף: {item.shtaif_cm}</span>}
                  {item.hem_cm != null && <span>מכפלת: {item.hem_cm}</span>}
                  {item.is_split && <span>✓ חצוי</span>}
                  {item.fabric_text && <span>בד: {item.fabric_text}</span>}
                </div>
                {item.notes && <div className="text-slate-400 text-xs mt-1">{item.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* הצללה */}
      {shadings.length > 0 && (
        <div className="card mb-3 overflow-hidden">
          <div className="bg-orange-500 text-white px-4 py-2 text-sm font-bold">הצללה ({shadings.length})</div>
          <div className="divide-y">
            {shadings.map((item, i) => (
              <div key={item.id} className="p-3 text-sm">
                <div className="flex justify-between items-start gap-2">
                  <span className="font-semibold">
                    {i + 1}. {SHADING_LABELS[item.subtype ?? ''] ?? item.subtype} — {item.location}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      ITEM_STATUS_COLORS[item.item_status] ?? 'bg-slate-100'
                    }`}>
                      {ITEM_STATUS_LABELS[item.item_status] ?? item.item_status}
                    </span>
                    <span className="font-bold text-brand">₪{item.price.toLocaleString()}</span>
                  </div>
                </div>
                <div className="text-slate-500 mt-1 flex flex-wrap gap-x-3 text-xs">
                  <span>רוחב: {item.width_m} מ׳</span>
                  <span>גובה: {item.heights_m.join(', ')} מ׳</span>
                  {item.mount_type && <span>התקנה: {item.mount_type}</span>}
                  {item.mechanism_side && <span>צד: {item.mechanism_side}</span>}
                  {item.color_fabric_text && <span>צבע: {item.color_fabric_text}</span>}
                </div>
                {item.notes && <div className="text-slate-400 text-xs mt-1">{item.notes}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* סיכום תשלום */}
      <div className="card p-4 mb-3">
        <div className="text-xs font-bold text-slate-500 mb-3">סיכום תשלום</div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">סה״כ פריטים</span><span>₪{order.items_total.toLocaleString()}</span></div>
          {order.discount > 0 && <div className="flex justify-between text-slate-500"><span>הנחה</span><span>− ₪{order.discount.toLocaleString()}</span></div>}
          {order.installation_fee > 0 && <div className="flex justify-between text-slate-400 text-xs"><span>התקנה (בנפרד)</span><span>₪{order.installation_fee.toLocaleString()}</span></div>}
          <div className="flex justify-between font-bold text-base border-t pt-2"><span>סה״כ לתשלום</span><span>₪{order.final_total.toLocaleString()}</span></div>
          {paid > 0 && <div className="flex justify-between text-green-700"><span>שולם</span><span>₪{paid.toLocaleString()}</span></div>}
          {remaining > 0 && <div className="flex justify-between text-amber-700 font-semibold"><span>נשאר</span><span>₪{remaining.toLocaleString()}</span></div>}
        </div>
      </div>

      {order.notes && (
        <div className="card p-4 mb-3">
          <div className="text-xs font-bold text-slate-500 mb-1">הערות</div>
          <div className="text-sm whitespace-pre-wrap">{order.notes}</div>
        </div>
      )}

      {(signatureImgUrl || order.signature_name) && (
        <div className="card p-4 mb-3">
          <div className="text-xs font-bold text-slate-500 mb-1">חתימת לקוח</div>
          {signatureImgUrl ? (
            <img src={signatureImgUrl} alt="חתימת לקוח" className="max-h-40 rounded border" />
          ) : (
            <div className="text-sm">{order.signature_name}</div>
          )}
        </div>
      )}

      {agentSignatureImgUrl && (
        <div className="card p-4">
          <div className="text-xs font-bold text-slate-500 mb-1">חתימת סוכן</div>
          <img src={agentSignatureImgUrl} alt="חתימת סוכן" className="max-h-40 rounded border" />
        </div>
      )}

      </>}

      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-lg mb-2">לבטל את ההזמנה?</h3>
            <p className="text-slate-500 text-sm mb-4">הזמנה #{orderNum} של {order.customer_name_snapshot} תסומן כמבוטלת.</p>
            <div className="flex gap-3">
              <button className="btn-primary bg-red-500 hover:bg-red-600 flex-1" onClick={cancelOrder}>כן, בטל</button>
              <button className="btn-ghost flex-1" onClick={() => setShowCancelConfirm(false)}>חזרה</button>
            </div>
          </div>
        </div>
      )}

      <ItemSelectionDialog
        open={officeSelectionOpen}
        items={(order.order_items ?? []).map(i => ({
          id: i.id, family: i.family, location: i.location, subtype: i.subtype,
          price: i.price, for_execution: i.for_execution,
        }))}
        orderTotal={order.final_total}
        stage="office"
        onConfirm={confirmOfficeSelection}
        onClose={() => setOfficeSelectionOpen(false)}
      />
    </div>
  )
}
