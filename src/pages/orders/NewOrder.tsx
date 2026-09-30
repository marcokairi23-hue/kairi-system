import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Blinds, CreditCard, Package, PanelsTopLeft, PenLine, Plus, Send, UserRound } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { uid } from '../../lib/uid'
import { useSettingsList } from '../../lib/useSettingsList'
import {
  OrderForm, OrderAccessory, PaymentRoute,
  emptyForm, newCurtainItem, newShadingItem,
  calcItemsTotal, calcTotalWidth, calcAutoTotal,
  PAYMENT_ROUTE_OPTIONS, SEWING_TYPES, SHADING_SUBTYPES, hasInvalidItemWidths,
} from './types'
import { Field, SummaryBox, BlockHeader } from './FormFields'
import CurtainCard from './CurtainCard'
import ShadingCard from './ShadingCard'
import ItemSelectionDialog from './ItemSelectionDialog'
import SignatureModal from '../../components/SignatureModal'
import { uploadSignature } from '../../lib/uploadSignature'
import { generateOrderPdf } from '../../lib/generateOrderPdf'
import { uploadOrderPdf } from '../../lib/uploadOrderPdf'

export default function NewOrder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<OrderForm>(emptyForm(profile?.full_name ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)
  const [paymentRoute, setPaymentRoute] = useState<PaymentRoute | ''>('')
  const [itemSelectionOpen, setItemSelectionOpen] = useState(false)
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null)
  const [customerSigOpen, setCustomerSigOpen] = useState(false)
  const [agentSigOpen, setAgentSigOpen] = useState(false)
  const sewingTypes = useSettingsList('sewing_types', SEWING_TYPES)
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
  const receivedDeposit = paymentRoute === 'cash' || paymentRoute === 'check'
    ? parseFloat(form.paid_on_account) || 0
    : 0
  const remaining = (parseFloat(form.final_total) || 0) - receivedDeposit

  const applyExecutionSelection = (selectedIds: Set<string>) => {
    const updated: OrderForm = {
      ...form,
      curtain_items: form.curtain_items.map(item => ({ ...item, for_execution: selectedIds.has(item.id) })),
      shading_items: form.shading_items.map(item => ({ ...item, for_execution: selectedIds.has(item.id) })),
    }
    updated.final_total = String(calcAutoTotal(updated))
    setForm(updated)
  }

  const fillAllItems = () => {
    applyExecutionSelection(new Set([
      ...form.curtain_items.map(item => item.id),
      ...form.shading_items.map(item => item.id),
    ]))
  }

  const choosePaymentRoute = (route: PaymentRoute | '') => {
    setPaymentRoute(route)
    const label = PAYMENT_ROUTE_OPTIONS.find(option => option.value === route)?.label ?? ''
    setForm(current => ({
      ...current,
      payment_method: route === 'quote' ? '' : label,
      paid_on_account: route === 'quote' ? '' : current.paid_on_account,
    }))
  }

  const validateOrderForm = (candidate: OrderForm): string | null => {
    if (!candidate.city?.trim()) return 'יש להזין עיר.'
    if (hasInvalidItemWidths(candidate)) return 'יש להזין רוחב בין 0.30 ל־10.00 מטר לכל פריט.'
    return null
  }

  const openSubmitDialog = () => {
    const validationError = validateOrderForm(form)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!paymentRoute) {
      setError('יש לבחור מסלול תשלום.')
      return
    }
    const deposit = parseFloat(form.paid_on_account) || 0
    if (paymentRoute !== 'quote' && deposit <= 0) {
      setError('יש להזין סכום מקדמה גדול מאפס.')
      return
    }
    if (
      paymentRoute !== 'quote' &&
      ![...form.curtain_items, ...form.shading_items].some(item => item.for_execution)
    ) {
      setError('יש לבחור לפחות פריט אחד לביצוע.')
      return
    }
    setError(null)
    setShowDialog(true)
  }

  const confirmItemSelection = (selectedIds: Set<string>) => {
    applyExecutionSelection(selectedIds)
    setItemSelectionOpen(false)
  }

  // --- שמירה ---
  const save = async (route: PaymentRoute) => {
    const isQuote = route === 'quote'
    const entersExecution = route === 'cash' || route === 'check'
    const f: OrderForm = isQuote ? {
      ...form,
      paid_on_account: '',
      payment_method: '',
      curtain_items: form.curtain_items.map(item => ({ ...item, for_execution: false })),
      shading_items: form.shading_items.map(item => ({ ...item, for_execution: false })),
    } : form
    const validationError = validateOrderForm(f)
    if (validationError) {
      setError(validationError)
      return
    }
    const fItemsTotal = calcItemsTotal(f)
    const fTotalWidth = calcTotalWidth(f)
    setBusy(true); setError(null)
    try {
      // יצירת לקוח
      const { data: cust, error: ce } = await supabase.from('customers').insert({
        full_name: f.customer_name,
        phone: f.phone,
        address: f.address,
        city: f.city!.trim(),
      }).select('id').single()
      if (ce) throw ce

      // יצירת הזמנה
      const { data: order, error: oe } = await supabase.from('orders').insert({
        is_quote: isQuote,
        // Cash/Check stay non-operational until their received payment is stored.
        status: isQuote ? 'quote' : entersExecution ? 'draft' : 'pending_payment',
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
        await supabase.from('order_items').insert(
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
            item_status: item.item_status,
            notes: item.notes || null,
            sort_order: idx,
          }))
        )
      }

      // פריטי הצללה
      if (f.shading_items.length > 0) {
        await supabase.from('order_items').insert(
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
            item_status: item.item_status,
            notes: item.notes || null,
            sort_order: idx,
          }))
        )
      }

      // הפקת PDF והעלאה ל-Storage (לא חוסמת את שמירת ההזמנה בכישלון)
      try {
        const documentForm = entersExecution ? f : { ...f, paid_on_account: '', payment_method: '' }
        const pdfBlob = await generateOrderPdf(documentForm, allocatedNumber ?? 'טיוטה', true)
        const pdfUrl = await uploadOrderPdf(order.id, pdfBlob)
        const pdfUrlOriginal = await uploadOrderPdf(order.id, pdfBlob, true)
        await supabase.from('orders').update({ pdf_url: pdfUrl, pdf_url_original: pdfUrlOriginal }).eq('id', order.id)
      } catch (pdfErr) {
        console.error('שגיאה בהפקת/העלאת PDF ההזמנה:', pdfErr)
      }

      // תשלום ראשוני
      if (!isQuote && f.paid_on_account && parseFloat(f.paid_on_account) > 0) {
        const { error: paymentError } = await supabase.from('payments').insert({
          order_id: order.id,
          amount: parseFloat(f.paid_on_account),
          method: f.payment_method || null,
          payment_route: route,
          payment_status: entersExecution ? 'received' : 'pending',
          recorded_by: profile!.id,
          received_by: entersExecution ? profile!.id : null,
          paid_at: null,
        })
        if (paymentError) throw paymentError
      }

      // Release Cash/Check only after the received payment insert succeeded.
      if (entersExecution) {
        const { error: releaseError } = await supabase
          .from('orders')
          .update({ status: 'ready' })
          .eq('id', order.id)
        if (releaseError) throw releaseError
      }

      // היסטוריה
      await supabase.from('order_status_history').insert({
        order_id: order.id,
        from_status: entersExecution ? 'draft' : null,
        to_status: isQuote ? 'quote' : entersExecution ? 'ready' : 'pending_payment',
        changed_by: profile!.id,
        note: isQuote
          ? 'הצעת מחיר נוצרה'
          : entersExecution
            ? 'הזמנה נוצרה והועברה לביצוע'
            : 'הזמנה נוצרה והועברה לטיפול בגבייה',
      })

      if (signatureUploadFailed) {
        setCreatedOrderId(order.id)
        setError('ההזמנה נשמרה אך אחת החתימות (או שתיהן) לא הועלתה. אפשר להשלים במסך עריכת ההזמנה.')
        return
      }

      navigate('/orders')
    } catch (err: unknown) {
      setError('שגיאה בשמירה: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pb-20">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">הזמנה חדשה</h1>
          <div className="mt-1 text-sm text-slate-500">
            מספר הזמנה: <span className="font-medium text-slate-700">יוקצה בשמירה</span>
          </div>
        </div>
        <button onClick={() => navigate('/orders')} className="btn-ghost text-sm">← חזרה</button>
      </div>

      {/* בלוק 1 — פרטי לקוח */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="פרטי לקוח" color="bg-[#2743C7]" icon={<UserRound size={18} />} />
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
          <Field label="כתובת" className="col-span-2 sm:col-span-1">
            <input className="input" value={form.address}
                   onChange={e => setF('address', e.target.value)} />
          </Field>
          <Field label="עיר" required className="col-span-2 sm:col-span-1">
            <input className="input" value={form.city ?? ''}
                   onChange={e => setF('city', e.target.value)} />
          </Field>
        </div>
      </div>

      {/* בלוק 2 — וילונות */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="מידות וילונות" color="bg-[#7C3AED]" icon={<PanelsTopLeft size={18} />} />
        <div className="p-4">
          {form.curtain_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו על „הוסף וילון“ כדי להתחיל
            </div>
          ) : (
            form.curtain_items.map((item, i) => (
              <CurtainCard key={item.id} item={item} index={i}
                           onChange={u => updateCurtain(i, u)}
                           onRemove={() => removeCurtain(i)}
                           sewingTypes={sewingTypes}
                           creationMode />
            ))
          )}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={addCurtain}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2743C7] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1F36A8] focus:outline-none focus:ring-2 focus:ring-[#2743C7]/40 focus:ring-offset-2"
            >
              <Plus size={16} aria-hidden="true" />
              הוסף וילון
            </button>
          </div>
        </div>
      </div>

      {/* בלוק 3 — הצללה */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="זברות / ונציאני / רומי / גלילה" color="bg-[#EA8C1F]" icon={<Blinds size={18} />} />
        <div className="p-4">
          {form.shading_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו על „הוסף פריט“ כדי להתחיל
            </div>
          ) : (
            form.shading_items.map((item, i) => (
              <ShadingCard key={item.id} item={item} index={i}
                           onChange={u => updateShading(i, u)}
                           onRemove={() => removeShading(i)}
                           subtypes={shadingSubtypes}
                           creationMode />
            ))
          )}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={addShading}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#2743C7] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1F36A8] focus:outline-none focus:ring-2 focus:ring-[#2743C7]/40 focus:ring-offset-2"
            >
              <Plus size={16} aria-hidden="true" />
              הוסף פריט
            </button>
          </div>
        </div>
      </div>

      {/* אביזרים */}
      {(form.accessories.length > 0) && (
        <div className="card mb-4 overflow-hidden">
          <BlockHeader title="אביזרים" color="bg-slate-600" icon={<Package size={18} />}
            action={<button type="button" onClick={addAccessory} className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs text-white hover:bg-white/30"><Plus size={14} aria-hidden="true" />הוסף</button>} />
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
        <button type="button" onClick={addAccessory} className="btn-ghost mb-4 inline-flex w-full items-center justify-center gap-2 text-sm">
          <Plus size={16} aria-hidden="true" />
          הוסף אביזר (חובק, מקל פתיחה...)
        </button>
      )}

      {/* בלוק 4 — תשלום */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="תשלום וסיכום" color="bg-[#1E9E4C]" icon={<CreditCard size={18} />} />
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
            <Field label="סה״כ לתשלום (₪)" required className="col-span-2">
              <div className="flex flex-col gap-2 sm:flex-row">
                <input className="input font-bold" type="number" min="0" dir="ltr"
                       value={form.final_total}
                       onChange={e => setF('final_total', e.target.value)} />
                <div className="grid shrink-0 grid-cols-2 gap-2">
                  <button type="button" onClick={fillAllItems}
                          className="px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs rounded-lg font-medium">
                    מלא הכל
                  </button>
                  <button type="button" onClick={() => setItemSelectionOpen(true)}
                          className="px-3 py-2 bg-blue-100 hover:bg-blue-200 text-blue-800 text-xs rounded-lg font-medium">
                    מלא חלקי
                  </button>
                </div>
              </div>
            </Field>
            {paymentRoute !== 'quote' && <Field label={
              paymentRoute === 'credit_card' || paymentRoute === 'bank_transfer'
                ? 'מקדמה מבוקשת לאישור המשרד (₪)'
                : 'מקדמה שהתקבלה (₪)'
            } required>
              <input className="input" type="number" min="0" dir="ltr"
                     value={form.paid_on_account}
                     onChange={e => setF('paid_on_account', e.target.value)} />
            </Field>}
            <Field label="מסלול תשלום" required>
              <select className="input" value={paymentRoute}
                      onChange={e => choosePaymentRoute(e.target.value as PaymentRoute | '')}>
                <option value="">בחר...</option>
                {PAYMENT_ROUTE_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
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
              <button type="button" className="btn-ghost inline-flex items-center gap-2 text-sm" onClick={() => setCustomerSigOpen(true)}>
                <PenLine size={16} aria-hidden="true" />
                חתימה
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
              <button type="button" className="btn-ghost inline-flex items-center gap-2 text-sm" onClick={() => setAgentSigOpen(true)}>
                <PenLine size={16} aria-hidden="true" />
                חתימה
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
        <button className="btn-primary inline-flex items-center justify-center gap-2 py-3 text-base"
                disabled={busy || !!createdOrderId || !form.customer_name || !form.phone || !form.city?.trim() || !paymentRoute}
                onClick={openSubmitDialog}>
          {!busy && !createdOrderId && <Send size={18} aria-hidden="true" />}
          {busy ? 'שומר...' : createdOrderId ? 'ההזמנה נשמרה' : 'שלח הזמנה'}
        </button>
      </div>

      {/* אישור קצר לפני שליחה */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-2 text-center">אישור שליחת הזמנה</h3>
            <p className="text-sm text-slate-600 text-center mb-5">
              {paymentRoute === 'cash' || paymentRoute === 'check'
                ? 'התשלום התקבל והפריטים שנבחרו יעברו לביצוע.'
                : paymentRoute === 'quote'
                  ? 'המידע יישמר כהצעת מחיר ללא העברה לביצוע.'
                  : 'ההזמנה תישמר ותועבר לטיפול המשרד.'}
            </p>
            <div className="mb-5 space-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">
                  {paymentRoute === 'credit_card' || paymentRoute === 'bank_transfer'
                    ? 'מקדמה מבוקשת:'
                    : paymentRoute === 'quote' ? 'מקדמה:' : 'מקדמה שהתקבלה:'}
                </span>
                <strong dir="ltr" className="text-slate-900">
                  ₪{(parseFloat(form.paid_on_account) || 0).toLocaleString('he-IL')}
                </strong>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">אופן תשלום:</span>
                <strong className="text-slate-900">
                  {PAYMENT_ROUTE_OPTIONS.find(option => option.value === paymentRoute)?.label ?? '—'}
                </strong>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" disabled={busy}
                      onClick={() => { setShowDialog(false); save(paymentRoute as PaymentRoute) }}>
                {busy ? 'שומר...' : 'אישור ושליחה'}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => setShowDialog(false)}>
                חזרה
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
            width_m: parseFloat(i.width_m) || 0, fabric_text: i.fabric_text,
            price: parseFloat(i.price) || 0, for_execution: i.for_execution,
          })),
          ...form.shading_items.map(i => ({
            id: i.id, family: i.family, location: i.location, subtype: i.subtype,
            width_m: parseFloat(i.width_m) || 0, fabric_text: i.color_fabric_text,
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
