import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Blinds, CreditCard, Package, PanelsTopLeft, PenLine, Plus, Save, UserRound } from 'lucide-react'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { uid } from '../../lib/uid'
import { useSettingsList } from '../../lib/useSettingsList'
import {
  OrderForm, emptyForm,
  calcItemsTotal, calcTotalWidth, calcAutoTotal, calcRemaining,
  PAYMENT_METHODS, SEWING_TYPES, SHADING_SUBTYPES, CurtainItem, ShadingItem, OrderAccessory,
  newCurtainItem, newShadingItem, ITEM_STATUSES, hasInvalidItemWidths,
} from './types'
import { Field, SummaryBox, BlockHeader } from './FormFields'
import CurtainCard from './CurtainCard'
import ShadingCard from './ShadingCard'
import ItemSelectionDialog from './ItemSelectionDialog'
import { printOrder, buildFormFromOrder } from './printOrder'
import SignatureModal from '../../components/SignatureModal'
import { uploadSignature, getSignatureUrl } from '../../lib/uploadSignature'

export default function EditOrder() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState<OrderForm>(emptyForm(profile?.full_name ?? ''))
  const [orderNumber, setOrderNumber] = useState<number | string>('טיוטה')
  const [customerId, setCustomerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [existingSignatureUrl, setExistingSignatureUrl] = useState<string | null>(null)
  const [signatureCleared, setSignatureCleared] = useState(false)
  const [existingAgentSignatureUrl, setExistingAgentSignatureUrl] = useState<string | null>(null)
  const [customerSigOpen, setCustomerSigOpen] = useState(false)
  const [agentSigOpen, setAgentSigOpen] = useState(false)
  const [itemSelectionOpen, setItemSelectionOpen] = useState(false)
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([])
  const sewingTypes = useSettingsList('sewing_types', SEWING_TYPES)
  const paymentMethods = useSettingsList('payment_methods', PAYMENT_METHODS)
  const shadingSubtypes = useSettingsList('shading_subtypes', SHADING_SUBTYPES)

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, profiles!orders_agent_id_fkey(full_name), customers(city), order_items(*), payments(*)')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        if (!data) return
        setOrderNumber(data.order_number ?? 'טיוטה')
        setCustomerId(data.customer_id)
        setForm({ ...buildFormFromOrder(data), city: data.customers?.city ?? '' })
        setOriginalItemIds((data.order_items ?? []).map((i: { id: string }) => i.id))
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

  const save = async () => {
    if (!form.city?.trim()) {
      setError('יש להזין עיר.')
      return
    }
    if (!customerId) {
      setError('לא ניתן לשמור עיר ללא לקוח מקושר להזמנה.')
      return
    }
    if (hasInvalidItemWidths(form)) {
      setError('יש להזין רוחב בין 0.30 ל־10.00 מטר לכל פריט.')
      return
    }
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

      if (customerId) {
        const { error: customerErr } = await supabase
          .from('customers')
          .update({ city: form.city.trim() })
          .eq('id', customerId)
        if (customerErr) throw customerErr
      }

      // עדכון הזמנה
      const { error: orderErr } = await supabase.from('orders').update({
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
      if (orderErr) throw orderErr

      // פריטים: UPDATE לקיימים (יש db_id), INSERT לחדשים, DELETE רק לאלו שהוסרו בטופס.
      // לעולם לא מוחקים+יוצרים מחדש פריט קיים — order_status_history.order_item_id
      // מצביע עליו בלי CASCADE, ומחיקה כזו הייתה נכשלת בשקט ויוצרת כפילויות (DEFECTS_MAP #5).
      let sortOrder = 0

      for (const item of form.curtain_items) {
        const row = {
          order_id: id,
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
          sort_order: sortOrder++,
        }
        const { error } = item.db_id
          ? await supabase.from('order_items').update(row).eq('id', item.db_id)
          : await supabase.from('order_items').insert(row)
        if (error) throw error
      }

      for (const item of form.shading_items) {
        const row = {
          order_id: id,
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
          sort_order: sortOrder++,
        }
        const { error } = item.db_id
          ? await supabase.from('order_items').update(row).eq('id', item.db_id)
          : await supabase.from('order_items').insert(row)
        if (error) throw error
      }

      // פריטים שהוסרו בטופס (היו ב-DB, לא נותרו בטופס) — נמחקים בנפרד.
      const remainingIds = new Set([
        ...form.curtain_items.map(i => i.db_id),
        ...form.shading_items.map(i => i.db_id),
      ])
      const removedIds = originalItemIds.filter(dbId => !remainingIds.has(dbId))
      if (removedIds.length > 0) {
        const { error } = await supabase.from('order_items').delete().in('id', removedIds)
        if (error) throw error
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
    <div className="pb-20">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">עריכת הזמנה</h1>
          <div className="mt-1 text-sm text-slate-500">
            מספר הזמנה: <span dir="ltr" className="font-semibold text-slate-700">#{orderNumber}</span>
          </div>
        </div>
        <button onClick={() => navigate(`/orders/${id}`)} className="btn-ghost text-sm">← חזרה</button>
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
          <Field label="שם סוכן">
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
          {form.curtain_items.length === 0
            ? <div className="text-center text-slate-400 text-sm py-4">אין וילונות</div>
            : form.curtain_items.map((item, i) => (
              <CurtainCard key={item.id} item={item} index={i}
                           onChange={u => updateCurtain(i, u)}
                           onRemove={() => removeCurtain(i)}
                           sewingTypes={sewingTypes} />
            ))}
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
          {form.shading_items.length === 0
            ? <div className="text-center text-slate-400 text-sm py-4">אין פריטי הצללה</div>
            : form.shading_items.map((item, i) => (
              <ShadingCard key={item.id} item={item} index={i}
                           onChange={u => updateShading(i, u)}
                           onRemove={() => removeShading(i)}
                           subtypes={shadingSubtypes} />
            ))}
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
      {form.accessories.length > 0 && (
        <div className="card mb-4 overflow-hidden">
          <BlockHeader title="אביזרים" color="bg-slate-600" icon={<Package size={18} />}
            action={<button onClick={addAccessory}
                            type="button"
                            className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs text-white hover:bg-white/30">
              <Plus size={14} aria-hidden="true" />
              הוסף
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
        <button type="button" onClick={addAccessory} className="btn-ghost mb-4 inline-flex w-full items-center justify-center gap-2 text-sm">
          <Plus size={16} aria-hidden="true" />
          הוסף אביזר
        </button>
      )}

      {/* בלוק 4 — תשלום */}
      <div className="card mb-4 overflow-hidden">
        <BlockHeader title="תשלום וסיכום" color="bg-[#1E9E4C]" icon={<CreditCard size={18} />} />
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
            <Field label="סוג תשלום">
              <select className="input" value={form.payment_method}
                      onChange={e => setF('payment_method', e.target.value)}>
                <option value="">בחר...</option>
                {paymentMethods.map(m => <option key={m}>{m}</option>)}
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

          <Field label="חתימת לקוח">
            <div className="flex items-center gap-3">
              {(form.signatureDataUrl ?? existingSignatureUrl) ? (
                <img
                  src={form.signatureDataUrl ?? existingSignatureUrl ?? ''}
                  alt="חתימת לקוח"
                  className="h-16 rounded border"
                />
              ) : (
                <span className="text-sm text-slate-400">אין חתימה</span>
              )}
              <button type="button" className="btn-ghost inline-flex items-center gap-2 text-sm" disabled={busy} onClick={() => setCustomerSigOpen(true)}>
                <PenLine size={16} aria-hidden="true" />
                חתימה
              </button>
            </div>
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
              <button type="button" className="btn-ghost inline-flex items-center gap-2 text-sm" disabled={busy} onClick={() => setAgentSigOpen(true)}>
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
        value={form.signatureDataUrl ?? existingSignatureUrl}
        onSave={dataUrl => {
          setF('signatureDataUrl', dataUrl)
          setSignatureCleared(dataUrl === null)
          if (dataUrl !== null) setExistingSignatureUrl(null)
        }}
        onClose={() => setCustomerSigOpen(false)}
      />

      <ItemSelectionDialog
        open={itemSelectionOpen}
        items={[
          ...form.curtain_items.map(item => ({
            id: item.id,
            family: item.family,
            location: item.location,
            width_m: parseFloat(item.width_m) || 0,
            fabric_text: item.fabric_text,
            price: parseFloat(item.price) || 0,
            for_execution: item.for_execution,
          })),
          ...form.shading_items.map(item => ({
            id: item.id,
            family: item.family,
            location: item.location,
            subtype: item.subtype,
            width_m: parseFloat(item.width_m) || 0,
            fabric_text: item.color_fabric_text,
            price: parseFloat(item.price) || 0,
            for_execution: item.for_execution,
          })),
        ]}
        orderTotal={parseFloat(form.final_total) || 0}
        stage="agent"
        onConfirm={selectedIds => {
          applyExecutionSelection(selectedIds)
          setItemSelectionOpen(false)
        }}
        onClose={() => setItemSelectionOpen(false)}
      />

      <SignatureModal
        open={agentSigOpen}
        title="חתימת סוכן"
        value={form.agentSignatureDataUrl ?? existingAgentSignatureUrl}
        onSave={dataUrl => setF('agentSignatureDataUrl', dataUrl)}
        onClose={() => setAgentSigOpen(false)}
      />

      {error && <div className="text-red-600 text-sm mb-3 card p-3">{error}</div>}

      <div className="flex gap-2">
        <button className="btn-primary inline-flex flex-1 items-center justify-center gap-2 py-3" disabled={busy} onClick={save}>
          {!busy && <Save size={18} aria-hidden="true" />}
          {busy ? 'שומר...' : 'שמור שינויים'}
        </button>
        <button className="btn-ghost" onClick={() => navigate(`/orders/${id}`)}>
          ביטול
        </button>
      </div>
    </div>
  )
}
