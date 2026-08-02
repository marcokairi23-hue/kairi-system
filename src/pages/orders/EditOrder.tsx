import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { uid } from '../../lib/uid'
import {
  OrderForm, emptyForm,
  calcItemsTotal, calcTotalWidth, calcAutoTotal, calcRemaining,
  PAYMENT_METHODS, CurtainItem, ShadingItem, OrderAccessory,
  newCurtainItem, newShadingItem, ITEM_STATUSES,
} from './types'
import { Field, SummaryBox, BlockHeader } from './FormFields'
import CurtainCard from './CurtainCard'
import ShadingCard from './ShadingCard'
import { printOrder, buildFormFromOrder } from './printOrder'
import SignaturePad from '../../components/SignaturePad'
import SignatureModal from '../../components/SignatureModal'
import { uploadSignature, getSignatureUrl } from '../../lib/uploadSignature'

export default function EditOrder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState<OrderForm>(emptyForm(profile?.full_name ?? ''))
  const [orderNumber, setOrderNumber] = useState<number | string>('טיוטה')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
  const [signatureCleared, setSignatureCleared] = useState(false)
  const [existingAgentSignatureUrl, setExistingAgentSignatureUrl] = useState<string | null>(null)
  const [agentSigOpen, setAgentSigOpen] = useState(false)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, profiles!orders_agent_id_fkey(full_name), order_items(*), payments(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setOrderNumber(data.order_number ?? 'טיוטה')
        setForm(buildFormFromOrder(data))
        setLoading(false)
        if (data.signature_url) {
          getSignatureUrl(data.signature_url).then(setExistingSignatureUrl)
        }
        if (data.agent_signature_url) {
          getSignatureUrl(data.agent_signature_url).then(setExistingAgentSignatureUrl)
        }
      })
  }, [id])

  const setF = (k: keyof OrderForm, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const addCurtain = () => setF('curtain_items', [...form.curtain_items, newCurtainItem()])
  const updateCurtain = (i: number, item: CurtainItem) =>
    setF('curtain_items', form.curtain_items.map((c, idx) => idx === i ? item : c))
  const removeCurtain = (i: number) =>
    setF('curtain_items', form.curtain_items.filter((_, idx) => idx !== i))

  const addShading = () => setF('shading_items', [...form.shading_items, newShadingItem()])
  const updateShading = (i: number, item: ShadingItem) =>
    setF('shading_items', form.shading_items.map((s, idx) => idx === i ? item : s))
  const removeShading = (i: number) =>
    setF('shading_items', form.shading_items.filter((_, idx) => idx !== i))

  const addAccessory = () => setF('accessories', [
    ...form.accessories,
    { id: uid(), name: '', quantity: '1', unit_price: '' } as OrderAccessory,
  ])
  const updateAccessory = (i: number, acc: OrderAccessory) =>
    setF('accessories', form.accessories.map((a, idx) => idx === i ? acc : a))
  const removeAccessory = (i: number) =>
    setF('accessories', form.accessories.filter((_, idx) => idx !== i))

  const itemsTotal = calcItemsTotal(form)
  const totalWidth = calcTotalWidth(form)
  const autoTotal = calcAutoTotal(form)
  const remaining = calcRemaining(form)
  const fillTotal = () => setF('final_total', String(autoTotal))

  const save = async () => {
    setBusy(true); setError(null)
    let signatureUploadFailed = false
    try {
      let signaturePath: string | undefined
      if (form.signatureDataUrl) {
        try {
          signaturePath = await uploadSignature(id!, form.signatureDataUrl)
        } catch (e) {
          signatureUploadFailed = true
          setError(e instanceof Error ? e.message : 'שגיאה בהעלאת חתימת הלקוח')
        }
      }

      let agentSignaturePath: string | undefined
      if (form.agentSignatureDataUrl) {
        try {
          agentSignaturePath = await uploadSignature(id!, form.agentSignatureDataUrl, 'agent')
        } catch (e) {
          signatureUploadFailed = true
          setError(e instanceof Error ? e.message : 'שגיאה בהעלאת חתימת הסוכן')
        }
      }

      // עדכון הזמנה
      await supabase.from('orders').update({
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
        ...(signaturePath ? { signature_url: signaturePath } : signatureCleared ? { signature_url: null } : {}),
        ...(agentSignaturePath ? { agent_signature_url: agentSignaturePath } : {}),
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)

      // מחיקת פריטים ישנים והוספה מחדש
      await supabase.from('order_items').delete().eq('order_id', id)

      if (form.curtain_items.length > 0) {
        await supabase.from('order_items').insert(
          form.curtain_items.map((item, idx) => ({
            order_id: id,
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

      if (form.shading_items.length > 0) {
        await supabase.from('order_items').insert(
          form.shading_items.map((item, idx) => ({
            order_id: id,
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

      // PDF הציבורי לא מופק מחדש כאן — נשאר קפוא כפי שנוצר, מתעדכן רק בכפתור "סנכרן PDF" בעמוד ההזמנה

      if (!signatureUploadFailed) {
        navigate(`/orders/${id}`)
      }
    } catch (err: unknown) {
      setError('שגיאה בשמירה: ' + (err instanceof Error ? err.message : JSON.stringify(err)))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">עריכת הזמנה #{orderNumber}</h1>
        <button onClick={() => navigate(`/orders/${id}`)} className="btn-ghost text-sm">← חזרה</button>
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
          <Field label="שם סוכן">
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
        <BlockHeader title="🪟 מידות וילונות" color="bg-[#7C3AED]"
          action={
            <button onClick={addCurtain}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">
              + הוסף וילון
            </button>
          } />
        <div className="p-4">
          {form.curtain_items.length === 0
            ? <div className="text-center text-slate-400 text-sm py-4">אין וילונות</div>
            : form.curtain_items.map((item, i) => (
              <CurtainCard key={item.id} item={item} index={i}
                           onChange={u => updateCurtain(i, u)}
                           onRemove={() => removeCurtain(i)} />
            ))}
        </div>
      </div>

      {/* בלוק 3 — הצללה */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="🪞 זברות / ונציאני / רומי / גלילה" color="bg-[#EA8C1F]"
          action={
            <button onClick={addShading}
                    className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">
              + הוסף פריט
            </button>
          } />
        <div className="p-4">
          {form.shading_items.length === 0
            ? <div className="text-center text-slate-400 text-sm py-4">אין פריטי הצללה</div>
            : form.shading_items.map((item, i) => (
              <ShadingCard key={item.id} item={item} index={i}
                           onChange={u => updateShading(i, u)}
                           onRemove={() => removeShading(i)} />
            ))}
        </div>
      </div>

      {/* אביזרים */}
      {form.accessories.length > 0 && (
        <div className="card mb-4 overflow-hidden">
          <BlockHeader title="🔩 אביזרים" color="bg-slate-600"
            action={<button onClick={addAccessory}
                            className="text-xs bg-white/20 hover:bg-white/30 px-3 py-1 rounded-full text-white">
              + הוסף
            </button>} />
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
                  <Field label="מחיר">
                    <input className="input" type="number" dir="ltr" value={acc.unit_price}
                           onChange={e => updateAccessory(i, { ...acc, unit_price: e.target.value })} />
                  </Field>
                  <button onClick={() => removeAccessory(i)}
                          className="mb-0.5 text-red-400 hover:text-red-600">×</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!form.accessories.length && (
        <button onClick={addAccessory} className="btn-ghost text-sm mb-4 w-full">
          + הוסף אביזר
        </button>
      )}

      {/* בלוק 4 — תשלום */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="💳 תשלום וסיכום" color="bg-[#1E9E4C]" />
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryBox label="סה״כ פריטים" value={`₪${itemsTotal.toLocaleString()}`} color="purple" />
            <SummaryBox label="רוחב כולל" value={`${totalWidth.toFixed(2)} מ׳`} />
            <SummaryBox label="חישוב אוטומטי" value={`₪${autoTotal.toLocaleString()}`} color="green" />
            <SummaryBox label="נשאר לתשלום" value={`₪${remaining.toLocaleString()}`}
                        color={remaining > 0 ? 'orange' : 'green'} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="התקנה (₪) — לא נכלל">
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
            <Field label="סוג תשלום">
              <select className="input" value={form.payment_method}
                      onChange={e => setF('payment_method', e.target.value)}>
                <option value="">בחר...</option>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          <Field label="הערות">
            <textarea className="input min-h-[70px] resize-y" value={form.notes}
                      onChange={e => setF('notes', e.target.value)} />
          </Field>

          <Field label="חתימה (שם הלקוח)">
            <input className="input" value={form.signature_name}
                   onChange={e => setF('signature_name', e.target.value)} />
          </Field>

          <Field label="חתימת לקוח (ציור)">
            <SignaturePad
              value={form.signatureDataUrl ?? existingSignatureUrl}
              onChange={dataUrl => {
                setF('signatureDataUrl', dataUrl)
                if (dataUrl === null) {
                  setSignatureCleared(true)
                  setExistingSignatureUrl(null)
                } else {
                  setSignatureCleared(false)
                }
              }}
              disabled={busy}
            />
          </Field>

          <Field label="חתימת סוכן">
            <div className="flex items-center gap-3">
              {(form.agentSignatureDataUrl ?? existingAgentSignatureUrl) ? (
                <img
                  src={form.agentSignatureDataUrl ?? existingAgentSignatureUrl ?? ''}
                  alt="חתימת סוכן"
                  className="h-16 rounded border"
                />
              ) : (
                <span className="text-sm text-slate-400">אין חתימה</span>
              )}
              <button type="button" className="btn-ghost text-sm" disabled={busy} onClick={() => setAgentSigOpen(true)}>
                ✍️ חתימה
              </button>
            </div>
          </Field>
        </div>
      </div>

      <SignatureModal
        open={agentSigOpen}
        title="חתימת סוכן"
        value={form.agentSignatureDataUrl ?? existingAgentSignatureUrl}
        onSave={dataUrl => setF('agentSignatureDataUrl', dataUrl)}
        onClose={() => setAgentSigOpen(false)}
      />

      {error && <div className="text-red-600 text-sm mb-3 card p-3">{error}</div>}

      <div className="flex gap-2">
        <button className="btn-primary flex-1 py-3" disabled={busy} onClick={save}>
          {busy ? 'שומר...' : '💾 שמור שינויים'}
        </button>
        <button className="btn-ghost" onClick={() => navigate(`/orders/${id}`)}>
          ביטול
        </button>
      </div>
    </div>
  )
}
