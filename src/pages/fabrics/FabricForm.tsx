import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { Fabric } from '../../types'

const empty = {
  name: '', sku: '', supplier: '', color: '', composition: '',
  price_per_meter: '' as string | number,
  roll_width_cm: '300' as string | number,
  is_active: true, is_stock_managed: true,
}

export default function FabricForm() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const { profile } = useAuth()
  const canEdit = profile?.role === 'admin' || profile?.role === 'office'

  const [form, setForm] = useState<typeof empty>(empty)
  const [fabric, setFabric] = useState<Fabric | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNew) return
    supabase.from('fabrics').select('*, fabric_images(*)').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return
        setFabric(data)
        setForm({
          name: data.name ?? '', sku: data.sku ?? '', supplier: data.supplier ?? '',
          color: data.color ?? '', composition: data.composition ?? '',
          price_per_meter: data.price_per_meter ?? '',
          roll_width_cm: data.roll_width_cm ?? '',
          is_active: data.is_active, is_stock_managed: data.is_stock_managed,
        })
      })
  }, [id, isNew])

  const set = (k: keyof typeof empty) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value,
    }))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canEdit) return
    setBusy(true); setError(null)

    const payload = {
      name: form.name.trim(),
      sku: form.sku.trim() || null,
      supplier: form.supplier.trim() || null,
      color: form.color.trim() || null,
      composition: form.composition.trim() || null,
      price_per_meter: form.price_per_meter === '' ? null : Number(form.price_per_meter),
      roll_width_cm: form.roll_width_cm === '' ? null : Number(form.roll_width_cm),
      is_active: form.is_active,
      is_stock_managed: form.is_stock_managed,
    }

    let fabricId = id
    if (isNew) {
      const { data, error } = await supabase.from('fabrics').insert(payload).select('id').single()
      if (error) { setError('השמירה נכשלה: ' + error.message); setBusy(false); return }
      fabricId = data.id
    } else {
      const { error } = await supabase.from('fabrics').update(payload).eq('id', id)
      if (error) { setError('השמירה נכשלה: ' + error.message); setBusy(false); return }
    }

    if (file && fabricId) {
      const ext = file.name.split('.').pop()
      const path = `${fabricId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('fabric-images')
        .upload(path, file, { upsert: false })
      if (upErr) {
        setError('הבד נשמר, אך העלאת התמונה נכשלה: ' + upErr.message)
        setBusy(false); return
      }
      await supabase.from('fabric_images').insert({
        fabric_id: fabricId, storage_path: path,
        is_primary: !fabric?.fabric_images?.length,
      })
    }

    navigate('/fabrics')
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-4">{isNew ? 'בד חדש' : 'עריכת בד'}</h1>

      {!canEdit && (
        <div className="card p-4 mb-4 text-sm text-slate-600">
          צפייה בלבד — עריכת הקטלוג פתוחה למשרד ולמנהל.
        </div>
      )}

      <form onSubmit={onSubmit} className="card p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">שם הבד *</label>
          <input className="input" required value={form.name} onChange={set('name')} disabled={!canEdit} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">מק״ט</label>
            <input className="input" value={form.sku} onChange={set('sku')} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">ספק</label>
            <input className="input" value={form.supplier} onChange={set('supplier')} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">צבע</label>
            <input className="input" value={form.color} onChange={set('color')} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">הרכב</label>
            <input className="input" value={form.composition} onChange={set('composition')} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">מחיר למטר (₪)</label>
            <input className="input" type="number" step="0.01" min="0" dir="ltr"
                   value={form.price_per_meter} onChange={set('price_per_meter')} disabled={!canEdit} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">רוחב גליל (ס״מ)</label>
            <input className="input" type="number" step="1" min="0" dir="ltr"
                   value={form.roll_width_cm} onChange={set('roll_width_cm')} disabled={!canEdit} />
          </div>
        </div>

        <div className="flex items-center gap-6 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_active} onChange={set('is_active')} disabled={!canEdit} />
            פעיל בקטלוג
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.is_stock_managed} onChange={set('is_stock_managed')} disabled={!canEdit} />
            מנוהל במלאי
          </label>
        </div>

        {canEdit && (
          <div>
            <label className="block text-sm font-medium mb-1">הוספת תמונה</label>
            <input type="file" accept="image/*"
                   onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                   className="text-sm" />
          </div>
        )}

        {error && <div className="text-sm text-red-600">{error}</div>}

        {canEdit && (
          <div className="flex gap-3 pt-2">
            <button className="btn-primary" disabled={busy}>
              {busy ? 'שומר…' : 'שמירה'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => navigate('/fabrics')}>
              ביטול
            </button>
          </div>
        )}
      </form>
    </div>
  )
}
