import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { uid } from '../../lib/uid'
import {
  OrderForm, OrderAccessory,
  emptyForm, newCurtainItem, newShadingItem,
  calcItemsTotal, calcTotalWidth, calcAutoTotal, calcRemaining,
  PAYMENT_METHODS,
} from './types'
import { Field, SummaryBox, BlockHeader } from './FormFields'
import CurtainCard from './CurtainCard'
import ShadingCard from './ShadingCard'
import { printOrder } from './printOrder'
import SignaturePad from '../../components/SignaturePad'
import { uploadSignature } from '../../lib/uploadSignature'

export default function NewOrder() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState<OrderForm>(emptyForm(profile?.full_name ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDialog, setShowDialog] = useState(false)

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

  const fillTotal = () => setF('final_total', String(autoTotal))

  // --- שמירה ---
  const save = async (isQuote: boolean) => {
    setBusy(true); setError(null)
    try {
      // יצירת לקוח
      const { data: cust, error: ce } = await supabase.from('customers').insert({
        full_name: form.customer_name,
        phone: form.phone,
        address: form.address,
      }).select('id').single()
      if (ce) throw ce

      // יצירת הזמנה
      const { data: order, error: oe } = await supabase.from('orders').insert({
        is_quote: isQuote,
        status: isQuote ? 'quote' : 'pending_payment',
        customer_id: cust.id,
        agent_id: profile!.id,
        customer_name_snapshot: form.customer_name,
        phone_snapshot: form.phone,
        address_snapshot: form.address,
        items_total: itemsTotal,
        installation_fee: parseFloat(form.installation_fee) || 0,
        discount: parseFloat(form.discount) || 0,
        final_total: parseFloat(form.final_total) || 0,
        total_width_m: totalWidth,
        send_email: form.send_email || null,
        signature_name: form.signature_name || null,
        notes: form.notes || null,
      }).select('id').single()
      if (oe) throw oe

      // הקצאת מספר הזמנה
      await supabase.rpc('allocate_order_number', { p_order_id: order.id })

      // העלאת חתימה (לא חוסמת את שמירת ההזמנה בכישלון)
      let signatureUploadFailed = false
      if (form.signatureDataUrl) {
        try {
          const path = await uploadSignature(order.id, form.signatureDataUrl)
          await supabase.from('orders').update({ signature_url: path }).eq('id', order.id)
        } catch (sigErr) {
          console.error('שגיאה בהעלאת חתימה:', sigErr)
          signatureUploadFailed = true
        }
      }

      // פריטי וילונות
      if (form.curtain_items.length > 0) {
        await supabase.from('order_items').insert(
          form.curtain_items.map((item, idx) => ({
            order_id: order.id,
            family: 'curtain',
            location: item.location,
            width_cm: parseFloat(item.width_cm) || 0,
            heights_cm: item.heights_cm.split(',').map(h => parseFloat(h.trim())).filter(Boolean),
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
      if (form.shading_items.length > 0) {
        await supabase.from('order_items').insert(
          form.shading_items.map((item, idx) => ({
            order_id: order.id,
            family: 'shading',
            subtype: item.subtype,
            location: item.location,
            width_cm: parseFloat(item.width_cm) || 0,
            heights_cm: item.heights_cm.split(',').map(h => parseFloat(h.trim())).filter(Boolean),
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

      // תשלום ראשוני
      if (form.paid_on_account && parseFloat(form.paid_on_account) > 0) {
        await supabase.from('payments').insert({
          order_id: order.id,
          amount: parseFloat(form.paid_on_account),
          method: form.payment_method || null,
          received_by: profile!.id,
        })
      }

      // היסטוריה
      await supabase.from('order_status_history').insert({
        order_id: order.id,
        to_status: isQuote ? 'quote' : 'pending_payment',
        changed_by: profile!.id,
        note: 'הזמנה נוצרה',
      })

      if (signatureUploadFailed) {
        setError('ההזמנה נשמרה אך החתימה לא הועלתה')
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
    <div className="max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">הזמנה חדשה</h1>
        <button onClick={() => navigate('/orders')} className="btn-ghost text-sm">← חזרה</button>
      </div>

      {/* בלוק 1 — פרטי לקוח */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="👤 פרטי לקוח" color="bg-[#2743C7]" />
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
        </div>
      </div>

      {/* בלוק 2 — וילונות */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader
          title="🪟 מידות וילונות"
          color="bg-[#7C3AED]"
          action={
            <button onClick={addCurtain}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">
              + הוסף וילון
            </button>
          }
        />
        <div className="p-4">
          {form.curtain_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו "+ הוסף וילון" להתחיל
            </div>
          ) : (
            form.curtain_items.map((item, i) => (
              <CurtainCard key={item.id} item={item} index={i}
                           onChange={u => updateCurtain(i, u)}
                           onRemove={() => removeCurtain(i)} />
            ))
          )}
        </div>
      </div>

      {/* בלוק 3 — הצללה */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader
          title="🪞 זברות / ונציאני / רומי / גלילה"
          color="bg-[#EA8C1F]"
          action={
            <button onClick={addShading}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">
              + הוסף פריט
            </button>
          }
        />
        <div className="p-4">
          {form.shading_items.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4">
              לחצו "+ הוסף פריט" להתחיל
            </div>
          ) : (
            form.shading_items.map((item, i) => (
              <ShadingCard key={item.id} item={item} index={i}
                           onChange={u => updateShading(i, u)}
                           onRemove={() => removeShading(i)} />
            ))
          )}
        </div>
      </div>

      {/* אביזרים */}
      {(form.accessories.length > 0) && (
        <div className="card mb-4 overflow-hidden">
          <BlockHeader title="🔩 אביזרים" color="bg-slate-600"
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
        <BlockHeader title="💳 תשלום וסיכום" color="bg-[#1E9E4C]" />
        <div className="p-4 space-y-4">

          {/* toggle הצעת מחיר */}
          <label className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <input type="checkbox" checked={form.is_quote}
                   onChange={e => setF('is_quote', e.target.checked)}
                   className="w-4 h-4" />
            <span className="text-sm font-medium text-amber-800">
              הזמנה זו היא הצעת מחיר בלבד (לא לביצוע)
            </span>
          </label>

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
                <button type="button" onClick={fillTotal}
                        className="shrink-0 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-800 text-xs rounded-lg font-medium">
                  מלא
                </button>
              </div>
            </Field>
            <Field label="שולם על החשבון (₪)">
              <input className="input" type="number" min="0" dir="ltr"
                     value={form.paid_on_account}
                     onChange={e => setF('paid_on_account', e.target.value)} />
            </Field>
            <Field label="סוג תשלום">
              <select className="input" value={form.payment_method}
                      onChange={e => setF('payment_method', e.target.value)}>
                <option value="">בחר...</option>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
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

          <Field label="חתימה (ציור)">
            <SignaturePad
              value={form.signatureDataUrl}
              onChange={dataUrl => setF('signatureDataUrl', dataUrl)}
              disabled={busy}
            />
          </Field>
        </div>
      </div>

      {error && <div className="text-red-600 text-sm mb-3 card p-3">{error}</div>}

      {/* כפתורי פעולה */}
      <div className="flex flex-col gap-2">
        <button className="btn-primary py-3 text-base"
                disabled={busy || !form.customer_name || !form.phone}
                onClick={() => setShowDialog(true)}>
          {busy ? 'שומר...' : '📤 שלח הזמנה'}
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-ghost"
                  onClick={() => printOrder(form, 'טיוטה', true)}>
            🖨️ הדפס ללקוח
          </button>
          <button className="btn-ghost"
                  onClick={() => printOrder(form, 'טיוטה', false)}>
            🔧 הוראות עבודה
          </button>
        </div>
      </div>

      {/* דיאלוג סיום */}
      {showDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-lg mb-4 text-center">בחר סוג הזמנה</h3>
            <div className="space-y-3">
              <button
                className="w-full text-right p-4 rounded-xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100"
                onClick={() => { setShowDialog(false); save(false) }}>
                <div className="font-bold text-amber-800">בקשה לגבייה + העברה לביצוע</div>
                <div className="text-xs text-amber-600">ההזמנה תועבר לסטטוס "ממתין לגבייה"</div>
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
    </div>
  )
}
