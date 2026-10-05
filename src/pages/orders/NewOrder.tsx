import { useRef, useState } from 'react'
import { UserRound, PanelsTopLeft, Blinds, Package, CreditCard, PenLine, Send } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { uid } from '../../lib/uid'
import { useSettingsList } from '../../lib/useSettingsList'
import {
  OrderForm, OrderAccessory,
  emptyForm, newCurtainItem, newShadingItem,
  calcItemsTotal, calcTotalWidth, calcAutoTotal, calcRemaining,
  SEWING_TYPES, SHADING_SUBTYPES,
} from './types'
import { Field, SummaryBox, BlockHeader } from './FormFields'
import CurtainCard from './CurtainCard'
import ShadingCard from './ShadingCard'
import ItemSelectionDialog from './ItemSelectionDialog'
import SignatureModal from '../../components/SignatureModal'
import { uploadSignature } from '../../lib/uploadSignature'
import { generateOrderPdf } from '../../lib/generateOrderPdf'
import { uploadOrderPdf } from '../../lib/uploadOrderPdf'
import { deriveV1OrderStatus } from '../../lib/statusHelpers'
import { recalculateOrderStatus } from '../../lib/recalculateOrderStatus'

export default function NewOrder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<OrderForm>(emptyForm(profile?.full_name ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [itemSelectionOpen, setItemSelectionOpen] = useState(false)
  const [itemSelectionPurpose, setItemSelectionPurpose] = useState<'fill' | 'submit'>('fill')
  const [depositRequested, setDepositRequested] = useState('')
  const [receipt, setReceipt] = useState<{ orderId: string; paymentId: string; route: 'cash' | 'check'; amount: number; by: string; at: string } | null>(null)
  const savingReceipt = useRef(false)
  const [receiptSaved, setReceiptSaved] = useState(false)
  const creatingOrder = useRef(false)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [customerSigOpen, setCustomerSigOpen] = useState(false)
  const [agentSigOpen, setAgentSigOpen] = useState(false)
  const sewingTypes = useSettingsList('sewing_types', SEWING_TYPES)
  const paymentMethods = [
    { value: 'cash', label: 'מזומן' },
    { value: 'check', label: 'צ׳ק' },
    { value: 'credit_card', label: 'אשראי' },
    { value: 'bank_transfer', label: 'העברה בנקאית' },
    { value: 'quote', label: 'הצעת מחיר' },
  ]
  const shadingSubtypes = useSettingsList('shading_subtypes', SHADING_SUBTYPES)

  const setF = (k: keyof OrderForm, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  // --- פריטי וילונות ---
  const addCurtain = () => setF('curtain_items', [...form.curtain_items, newCurtainItem()])
  const updateCurtain = (i: number, item: typeof form.curtain_items[0]) =>
    setF('curtain_items', form.curtain_items.map((c, idx) => idx === i ? item : c))
  const removeCurtain = (i: number) =>
    setF('curtain_items', form.curtain_items.filter((_, idx) => idx !== i))

  // --- פריטי הצללה ---
  const addShading = () => setF('shading_items', [...form.shading_items, newShadingItem()])
  const updateShading = (i: number, item: typeof form.shading_items[0]) =>
    setF('shading_items', form.shading_items.map((s, idx) => idx === i ? item : s))
  const removeShading = (i: number) =>
    setF('shading_items', form.shading_items.filter((_, idx) => idx !== i))

  // --- אביזרים ---
  const addAccessory = () => setF('accessories', [
    ...form.accessories,
    { id: uid(), name: '', quantity: '1', unit_price: '' } as OrderAccessory,
  ])
  const updateAccessory = (i: number, acc: OrderAccessory) =>
    setF('accessories', form.accessories.map((a, idx) => idx === i ? acc : a))
  const removeAccessory = (i: number) =>
    setF('accessories', form.accessories.filter((_, idx) => idx !== i))

  // --- חישובים ---
  const itemsTotal = calcItemsTotal(form)
  const totalWidth = calcTotalWidth(form)
  const autoTotal = calcAutoTotal(form)
  const remaining = calcRemaining(form)
  const hasExecutionItems = [...form.curtain_items, ...form.shading_items].some(i => i.for_execution)
  const paymentRoute = hasExecutionItems ? form.payment_method : 'quote'

  const validatePayment = (f: OrderForm, route: string): string | null => {
    if (route === 'quote') return null
    if (!paymentMethods.some(method => method.value === route)) return 'יש לבחור מסלול תשלום.'
    if (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(depositRequested.trim()) || !Number.isFinite(Number(depositRequested)) || Number(depositRequested) <= 0) {
      return 'המקדמה לתשלום חייבת להיות מספר גדול מ־0.'
    }
    const total = Number(f.final_total)
    if (!f.final_total.trim() || !Number.isFinite(total) || Number(depositRequested) > total) {
      return 'המקדמה לתשלום אינה יכולה לעלות על סה״כ ההזמנה.'
    }
    return null
  }

  const confirmPaymentReceived = async () => {
    if (!receipt || savingReceipt.current) return
    if (profile?.id !== receipt.by) { setError('נדרש המשתמש שיצר את ההזמנה לאישור התקבול.'); return }
    savingReceipt.current = true
    const receivedAt = receipt.at || new Date().toISOString()
    if (!receipt.at) setReceipt({ ...receipt, at: receivedAt })
    setBusy(true); setError(null)
    let paymentExists = false
    try {
      const { data: existing, error: lookupError } = await supabase.from('payments')
        .select('id').eq('id', receipt.paymentId).maybeSingle()
      if (lookupError) throw lookupError
      paymentExists = !!existing
      if (paymentExists) setReceiptSaved(true)
      if (!paymentExists) {
        const { error: paymentError } = await supabase.from('payments').insert({
          id: receipt.paymentId, order_id: receipt.orderId, amount: receipt.amount,
          method: receipt.route, payment_route: receipt.route, payment_status: 'received',
          recorded_by: receipt.by, received_by: receipt.by, paid_at: receivedAt,
          collection_status: 'at_agent', office_received_by: null, office_received_at: null,
        })
        if (paymentError) throw paymentError
        paymentExists = true
        setReceiptSaved(true)
      }
      const { data: approvedOrder, error: approvalError } = await supabase.from('orders').update({
        payment_approved: true, payment_approved_by: receipt.by, payment_approved_at: receivedAt,
      }).eq('id', receipt.orderId).select('id').single()
      if (approvalError) throw approvalError
      if (!approvedOrder) throw new Error('ההזמנה לא עודכנה')
      await recalculateOrderStatus(receipt.orderId, receipt.by)
      setReceipt(null)
      navigate('/orders')
    } catch {
      setError(paymentExists
        ? 'התשלום נשמר, אך אישור התשלום או חישוב סטטוס ההזמנה נכשל. ניתן לנסות שוב; התקבול הקיים יישמר ולא ייווצר תשלום נוסף.'
        : 'לא ניתן לאשר את שמירת התשלום. ההזמנה כבר נשמרה וממתינה לתשלום. ניתן לנסות שוב ללא יצירת הזמנה או תשלום כפולים.')
    } finally {
      savingReceipt.current = false
      setBusy(false)
    }
  }

  const fillAll = () => {
    const updated: OrderForm = {
      ...form,
      curtain_items: form.curtain_items.map(i => ({ ...i, for_execution: true })),
      shading_items: form.shading_items.map(i => ({ ...i, for_execution: true })),
    }
    setForm({ ...updated, final_total: String(calcAutoTotal(updated)) })
  }

  const fillPartial = () => {
    setItemSelectionPurpose('fill')
    setItemSelectionOpen(true)
  }

  const confirmItemSelection = (selectedIds: Set<string>) => {
    const updated: OrderForm = {
      ...form,
      curtain_items: form.curtain_items.map(i => ({ ...i, for_execution: selectedIds.has(i.id) })),
      shading_items: form.shading_items.map(i => ({ ...i, for_execution: selectedIds.has(i.id) })),
    }
    if (!updated.curtain_items.some(i => i.for_execution) && !updated.shading_items.some(i => i.for_execution)) {
      updated.paid_on_account = ''
    }
    setForm(itemSelectionPurpose === 'fill'
      ? { ...updated, final_total: String(calcAutoTotal(updated)) }
      : updated)
    setItemSelectionOpen(false)
    if (itemSelectionPurpose === 'submit') setShowDialog(true)
  }

  const validateForm = (f: OrderForm): string | null => {
    if (!f.city.trim()) return 'יש להזין עיר.'
    const numericValue = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
    for (const [items, label, maxHeight] of [
      [f.curtain_items, 'וילון', 6],
      [f.shading_items, 'פריט הצללה', 3.5],
    ] as const) {
      for (const [index, item] of items.entries()) {
        const width = item.width_m.trim()
        if (!numericValue.test(width) || !Number.isFinite(Number(width)) || Number(width) < 0.3 || Number(width) > 10) {
          return `${label} ${index + 1}: רוחב חייב להיות מספר בין 0.30 ל-10.00 מטר.`
        }
        const heights = item.heights_m.split(',').map(value => value.trim())
        if (heights.some(height => !numericValue.test(height) || !Number.isFinite(Number(height)) || Number(height) <= 0 || Number(height) > maxHeight)) {
          return `${label} ${index + 1}: יש להזין גובה אחד לפחות; כל גובה חייב להיות מספר גדול מ-0 ועד ${maxHeight.toFixed(2)} מטר, ללא ערכים ריקים.`
        }
      }
    }
    return null
  }

  const submitOrder = () => {
    const validationError = validateForm(form)
    setError(validationError)
    if (validationError) return
    setItemSelectionPurpose('submit')
    setItemSelectionOpen(true)
  }

  // --- שמירה ---
  const save = async (isQuote: boolean, formOverride?: OrderForm) => {
    if (createdOrderId || creatingOrder.current) return
    const currentForm = formOverride ?? form
    const hasExecution = [...currentForm.curtain_items, ...currentForm.shading_items].some(i => i.for_execution)
    const route = isQuote || !hasExecution ? 'quote' : currentForm.payment_method
    isQuote = route === 'quote'
    const f = { ...currentForm, paid_on_account: '' }
    const validationError = validateForm(f)
    if (validationError) {
      setError(validationError)
      return
    }
    const paymentError = validatePayment(f, route)
    if (paymentError) { setError(paymentError); return }
    const fItemsTotal = calcItemsTotal(f)
    const fTotalWidth = calcTotalWidth(f)
    const orderStatus = deriveV1OrderStatus({
      payment_approved: false, final_total: parseFloat(f.final_total) || 0,
      order_items: [...f.curtain_items, ...f.shading_items].map(i => ({ for_execution: i.for_execution, item_status: 'new' })),
      payments: [],
    })
    creatingOrder.current = true
    setBusy(true); setError(null)
    try {
      // יצירת לקוח
      const { data: cust, error: ce } = await supabase.from('customers').insert({
        full_name: f.customer_name,
        phone: f.phone,
        address: f.address,
        city: f.city.trim(),
      }).select('id').single()
      if (ce) throw ce

      // יצירת הזמנה
      const { data: order, error: oe } = await supabase.from('orders').insert({
        is_quote: isQuote,
        status: orderStatus,
        payment_route: route,
        deposit_requested: isQuote ? 0 : Number(depositRequested),
        payment_approved: false,
        payment_approved_by: null,
        payment_approved_at: null,
        customer_id: cust.id,
        agent_id: profile!.id,
        customer_name_snapshot: f.customer_name,
        phone_snapshot: f.phone,
        address_snapshot: f.address,
        items_total: fItemsTotal,
        installation_fee: parseFloat(f.installation_fee) || 0,
        discount: parseFloat(f.discount) || 0,
        final_total: parseFloat(f.final_total) || 0,
        total_width_m: fTotalWidth,
        send_email: f.send_email || null,
        signature_name: f.signature_name || null,
        notes: f.notes || null,
      }).select('id').single()
      if (oe) throw oe
      setCreatedOrderId(order.id)

      // הקצאת מספר הזמנה
      const { data: allocatedNumber } = await supabase
        .rpc('allocate_order_number', { p_order_id: order.id })

      // העלאת חתימות (לא חוסמת את שמירת ההזמנה בכישלון)
      let signatureUploadFailed = false
      if (f.signatureDataUrl) {
        try {
          const path = await uploadSignature(order.id, f.signatureDataUrl)
          await supabase.from('orders').update({ signature_url: path }).eq('id', order.id)
        } catch (sigErr) {
          console.error('שגיאה בהעלאת חתימת לקוח:', sigErr)
          signatureUploadFailed = true
        }
      }
      if (f.agentSignatureDataUrl) {
        try {
          const path = await uploadSignature(order.id, f.agentSignatureDataUrl, 'agent')
          await supabase.from('orders').update({ agent_signature_url: path }).eq('id', order.id)
        } catch (sigErr) {
          console.error('שגיאה בהעלאת חתימת סוכן:', sigErr)
          signatureUploadFailed = true
        }
      }

      // פריטי וילונות
      if (f.curtain_items.length > 0) {
        const { error: itemError } = await supabase.from('order_items').insert(
          f.curtain_items.map((item, idx) => ({
            order_id: order.id,
            family: 'curtain',
            production_route: 'internal',
            location: item.location,
            width_m: parseFloat(item.width_m) || 0,
            heights_m: item.heights_m.split(',').map(h => parseFloat(h.trim())).filter(h => !isNaN(h)),
            sewing_type: item.sewing_type,
            hem_cm: parseFloat(item.hem_cm) || 10,
            shtaif_cm: parseFloat(item.shtaif_cm) || 10,
            is_split: item.is_split,
            fabric_text: item.fabric_text || null,
            price: parseFloat(item.price) || 0,
            for_execution: item.for_execution,
            item_status: 'new',
            notes: item.notes || null,
            sort_order: idx,
          }))
        )
        if (itemError) throw itemError
      }

      // פריטי הצללה
      if (f.shading_items.length > 0) {
        const { error: itemError } = await supabase.from('order_items').insert(
          f.shading_items.map((item, idx) => ({
            order_id: order.id,
            family: 'shading',
            production_route: 'external',
            subtype: item.subtype,
            location: item.location,
            width_m: parseFloat(item.width_m) || 0,
            heights_m: item.heights_m.split(',').map(h => parseFloat(h.trim())).filter(h => !isNaN(h)),
            mount_type: item.mount_type,
            mechanism_side: item.mechanism_side,
            color_fabric_text: item.color_fabric_text || null,
            price: parseFloat(item.price) || 0,
            for_execution: item.for_execution,
            item_status: 'new',
            notes: item.notes || null,
            sort_order: idx,
          }))
        )
        if (itemError) throw itemError
      }

      // הפקת PDF והעלאה ל-Storage (לא חוסמת את שמירת ההזמנה בכישלון)
      try {
        const pdfBlob = await generateOrderPdf(f, allocatedNumber ?? 'טיוטה', true)
        const pdfUrl = await uploadOrderPdf(order.id, pdfBlob)
        const pdfUrlOriginal = await uploadOrderPdf(order.id, pdfBlob, true)
        const { error: pdfWriteError } = await supabase.from('orders').update({ pdf_url: pdfUrl, pdf_url_original: pdfUrlOriginal }).eq('id', order.id)
        if (pdfWriteError) throw pdfWriteError
      } catch (pdfErr) {
        console.error('שגיאה בהפקת/העלאת PDF ההזמנה:', pdfErr)
      }

      // היסטוריה
      const { error: historyError } = await supabase.from('order_status_history').insert({
        order_id: order.id,
        to_status: orderStatus,
        changed_by: profile!.id,
        note: 'הזמנה נוצרה',
      })
      if (historyError) throw historyError

      if (!isQuote && (route === 'cash' || route === 'check')) {
        setReceipt({ orderId: order.id, paymentId: crypto.randomUUID(), route,
          amount: Number(depositRequested), by: profile!.id, at: '' })
        if (signatureUploadFailed) setError('ההזמנה נשמרה אך אחת החתימות לא הועלתה. אפשר להשלים במסך עריכת ההזמנה.')
        return
      }

      if (signatureUploadFailed) {
        setCreatedOrderId(order.id)
        setError('ההזמנה נשמרה אך אחת החתימות (או שתיהן) לא הועלתה. אפשר להשלים במסך עריכת ההזמנה.')
        return
      }

      navigate('/orders')
    } catch (err: unknown) {
      setError('שגיאה בשמירה: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
    } finally {
      creatingOrder.current = false
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">הזמנה חדשה</h1>
        <button onClick={() => navigate('/orders')} className="btn-ghost text-sm">← חזרה</button>
      </div>

      {/* בלוק 1 — פרטי לקוח */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="פרטי לקוח" icon={<UserRound size={18} aria-hidden="true" />} color="bg-[#2743C7]" />
        <div className="p-4 grid grid-cols-2 gap-3">
          <Field label="שם לקוח" required className="col-span-2">
            <input className="input" value={form.customer_name}
                   onChange={e => setF('customer_name', e.target.value)} />
          </Field>
          <Field label="טלפון" required>
            <input className="input" type="tel" dir="ltr" value={form.phone}
                   onChange={e => setF('phone', e.target.value)} />
          </Field>
          <Field label="שם סוכן" required>
            <input className="input" value={form.agent_name}
                   onChange={e => setF('agent_name', e.target.value)} />
          </Field>
          <Field label="כתובת" className="col-span-2">
            <input className="input" value={form.address}
                   onChange={e => setF('address', e.target.value)} />
          </Field>
          <Field label="עיר" required className="col-span-2">
            <input className="input" required value={form.city}
                   onChange={e => setF('city', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* בלוק 2 — וילונות */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader
          title="מידות וילונות" icon={<PanelsTopLeft size={18} aria-hidden="true" />}
          color="bg-[#7C3AED]"
        />
        <div className="p-4">
          {form.curtain_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו "+ הוסף וילון" להתחיל
            </div>
          ) : (
            form.curtain_items.map((item, i) => (
              <CurtainCard creationMode key={item.id} item={item} index={i}
                           onChange={u => updateCurtain(i, u)}
                           onRemove={() => removeCurtain(i)}
                           sewingTypes={sewingTypes} />
            ))
          )}
          <button type="button" onClick={addCurtain} className="btn-primary text-sm w-full mt-3">
            + הוסף וילון
          </button>
        </div>
      </div>

      {/* בלוק 3 — הצללה */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader
          title="זברות / ונציאני / רומי / גלילה" icon={<Blinds size={18} aria-hidden="true" />}
          color="bg-[#EA8C1F]"
        />
        <div className="p-4">
          {form.shading_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו "+ הוסף גלילה" להתחיל
            </div>
          ) : (
            form.shading_items.map((item, i) => (
              <ShadingCard creationMode key={item.id} item={item} index={i}
                           onChange={u => updateShading(i, u)}
                           onRemove={() => removeShading(i)}
                           subtypes={shadingSubtypes} />
            ))
          )}
          <button type="button" onClick={addShading} className="btn-primary text-sm w-full mt-3">
            + הוסף גלילה
          </button>
        </div>
      </div>

      {/* אביזרים */}
      {(form.accessories.length > 0) && (
        <div className="card mb-4 overflow-hidden">
          <BlockHeader title="אביזרים" icon={<Package size={18} aria-hidden="true" />} color="bg-slate-600"
            action={<button onClick={addAccessory} className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">+ הוסף</button>} />
          <div className="p-4 space-y-2">
            {form.accessories.map((acc, i) => (
              <div key={acc.id} className="grid grid-cols-4 gap-2 items-end">
                <Field label="שם" className="col-span-2">
                  <input className="input" value={acc.name}
                         onChange={e => updateAccessory(i, { ...acc, name: e.target.value })} />
                </Field>
                <Field label="כמות">
                  <input className="input" type="number" dir="ltr" value={acc.quantity}
                         onChange={e => updateAccessory(i, { ...acc, quantity: e.target.value })} />
                </Field>
                <div className="flex gap-1 items-end">
                  <Field label="מחיר יחידה">
                    <input className="input" type="number" dir="ltr" value={acc.unit_price}
                           onChange={e => updateAccessory(i, { ...acc, unit_price: e.target.value })} />
                  </Field>
                  <button onClick={() => removeAccessory(i)} className="mb-0.5 text-red-400 hover:text-red-600">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!form.accessories.length && (
        <button onClick={addAccessory} className="btn-ghost text-sm mb-4 w-full">
          + הוסף אביזר (חובק, מקל פתיחה...)
        </button>
      )}

      {/* בלוק 4 — תשלום */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="תשלום וסיכום" icon={<CreditCard size={18} aria-hidden="true" />} color="bg-[#1E9E4C]" />
        <div className="p-4 space-y-4">

          {/* סיכומי ביניים */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryBox label="סה״כ פריטים לביצוע"
                        value={`₪${itemsTotal.toLocaleString()}`} color="purple" />
            <SummaryBox label="סה״כ רוחב (מ׳ קיר)"
                        value={`${totalWidth.toFixed(2)} מ׳`} />
            <SummaryBox label="חישוב אוטומטי"
                        value={`₪${autoTotal.toLocaleString()}`} color="green" />
            <SummaryBox label="נשאר לתשלום"
                        value={`₪${remaining.toLocaleString()}`}
                        color={remaining > 0 ? 'orange' : 'green'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="התקנה (₪) — לא נכלל בסה״כ">
              <input className="input" type="number" min="0" dir="ltr"
                     value={form.installation_fee}
                     onChange={e => setF('installation_fee', e.target.value)} />
            </Field>
            <Field label="הנחה (₪)">
              <input className="input" type="number" min="0" dir="ltr"
                     value={form.discount}
                     onChange={e => setF('discount', e.target.value)} />
            </Field>
            <Field label="סה״כ לתשלום (₪)" required>
              <div className="flex gap-2">
                <input className="input font-bold" type="number" min="0" dir="ltr"
                       value={form.final_total}
                       onChange={e => setF('final_total', e.target.value)} />
                <button type="button" onClick={fillAll}
                        className="shrink-0 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs rounded-lg font-medium">
                  מלא הכל
                </button>
                <button type="button" onClick={fillPartial}
                        className="shrink-0 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs rounded-lg font-medium">
                  מלא חלקי
                </button>
              </div>
            </Field>
            <Field label="מקדמה לתשלום (₪)">
              <input className="input" type="number" min="0" dir="ltr"
                     value={depositRequested}
                     onChange={e => { setDepositRequested(e.target.value); setF('paid_on_account', '') }} />
            </Field>
            <Field label="מסלול תשלום">
              <select className="input" value={paymentRoute} disabled={!hasExecutionItems}
                      onChange={e => { setForm(f => ({ ...f, payment_method: e.target.value, paid_on_account: '' })) }}>
                <option value="">בחר...</option>
                {paymentMethods.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              {(paymentRoute === 'credit_card' || paymentRoute === 'bank_transfer') && <p className="text-sm text-amber-700 mt-2">ממתין לאישור המשרד — המקדמה טרם התקבלה.</p>}
            </Field>
            <Field label="אימייל לשליחת הטופס">
              <input className="input" type="email" dir="ltr"
                     value={form.send_email}
                     onChange={e => setF('send_email', e.target.value)} />
            </Field>
          </div>

          <Field label="הערות">
            <textarea className="input min-h-[70px] resize-y" value={form.notes}
                      onChange={e => setF('notes', e.target.value)}
                      placeholder="הערות להזמנה..." />
          </Field>

          <Field label="חתימה (שם הלקוח)">
            <input className="input" value={form.signature_name}
                   onChange={e => setF('signature_name', e.target.value)}
                   placeholder="הקלד שם לחתימה או השאר ריק" />
          </Field>

          <Field label="חתימת לקוח">
            <div className="flex items-center gap-3">
              {form.signatureDataUrl ? (
                <img src={form.signatureDataUrl} alt="חתימת לקוח" className="h-16 rounded border" />
              ) : (
                <span className="text-sm text-slate-400">אין חתימה</span>
              )}
              <button type="button" className="btn-ghost text-sm" onClick={() => setCustomerSigOpen(true)}>
                <PenLine size={16} className="inline-block me-1" aria-hidden="true" /> חתימה
              </button>
            </div>
          </Field>

          <Field label="חתימת סוכן">
            <div className="flex items-center gap-3">
              {form.agentSignatureDataUrl ? (
                <img src={form.agentSignatureDataUrl} alt="חתימת סוכן" className="h-16 rounded border" />
              ) : (
                <span className="text-sm text-slate-400">אין חתימה</span>
              )}
              <button type="button" className="btn-ghost text-sm" onClick={() => setAgentSigOpen(true)}>
                <PenLine size={16} className="inline-block me-1" aria-hidden="true" /> חתימה
              </button>
            </div>
          </Field>
        </div>
      </div>

      <SignatureModal
        open={customerSigOpen}
        title="חתימת לקוח"
        value={form.signatureDataUrl}
        onSave={dataUrl => setF('signatureDataUrl', dataUrl)}
        onClose={() => setCustomerSigOpen(false)}
      />

      <SignatureModal
        open={agentSigOpen}
        title="חתימת סוכן"
        value={form.agentSignatureDataUrl}
        onSave={dataUrl => setF('agentSignatureDataUrl', dataUrl)}
        onClose={() => setAgentSigOpen(false)}
      />

      {error && (
        <div className="text-red-600 text-sm mb-3 card p-3">
          {error}
          {createdOrderId && (
            <>
              {' '}
              <button className="underline" onClick={() => navigate(`/orders/${createdOrderId}/edit`)}>
                לעריכת ההזמנה
              </button>
            </>
          )}
        </div>
      )}

      {/* כפתורי פעולה */}
      <div className="flex flex-col gap-2">
        <button className="btn-primary py-3 text-base"
                disabled={busy || !!createdOrderId || !form.customer_name || !form.phone}
                onClick={submitOrder}>
          {busy ? 'שומר...' : createdOrderId ? 'ההזמנה נשמרה' : <><Send size={18} className="inline-block me-1" aria-hidden="true" /> שלח הזמנה</>}
        </button>
      </div>

      {/* דיאלוג סיום */}
      {receipt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="receipt-title" className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 id="receipt-title" className="font-bold text-lg mb-4">האם התשלום התקבל?</h3>
            <p className="text-sm text-slate-600 mb-4">ההזמנה נשמרה וממתינה לתשלום. מקדמה לתשלום: ₪{receipt.amount.toLocaleString()}.</p>
            {error && <p role="alert" className="text-red-600 text-sm mb-4">{error}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn-primary flex-1" disabled={busy} onClick={confirmPaymentReceived}>{busy ? 'מאשר...' : 'אישור התקבל'}</button>
              <button type="button" className="btn-ghost flex-1" disabled={busy || receiptSaved} onClick={() => { setReceipt(null); navigate('/orders') }}>עדיין לא התקבל</button>
            </div>
          </div>
        </div>
      )}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-center">בחר סוג הזמנה</h3>
            <div className="space-y-3">
              <button
                className="w-full text-right p-4 rounded-xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100"
                onClick={() => { setShowDialog(false); save(false) }}>
                <div className="font-bold text-amber-800">בקשה לגבייה + העברה לביצוע</div>
                <div className="text-xs text-amber-600">הסטטוס ייקבע לפי פריטי הביצוע ואישור התשלום</div>
              </button>
              <button
                className="w-full text-right p-4 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50"
                onClick={() => { setShowDialog(false); save(true) }}>
                <div className="font-bold text-slate-700">הצעת מחיר (לא לביצוע)</div>
                <div className="text-xs text-slate-500">תישמר כהצעת מחיר בלבד</div>
              </button>
              <button className="w-full p-3 text-slate-500 hover:text-slate-700 text-sm"
                      onClick={() => setShowDialog(false)}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      <ItemSelectionDialog
        open={itemSelectionOpen}
        items={[
          ...form.curtain_items.map(i => ({
            id: i.id, family: i.family, location: i.location,
            width_m: i.width_m, fabric_color: i.fabric_text,
            price: parseFloat(i.price) || 0, for_execution: i.for_execution,
          })),
          ...form.shading_items.map(i => ({
            id: i.id, family: i.family, location: i.location, subtype: i.subtype,
            width_m: i.width_m, fabric_color: i.color_fabric_text,
            price: parseFloat(i.price) || 0, for_execution: i.for_execution,
          })),
        ]}
        orderTotal={parseFloat(form.final_total) || 0}
        stage="agent"
        onConfirm={confirmItemSelection}
        onClose={() => setItemSelectionOpen(false)}
      />
    </div>
  )
}
