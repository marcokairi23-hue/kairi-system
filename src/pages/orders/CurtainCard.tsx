import { CurtainItem, SEWING_TYPES, ITEM_STATUSES } from './types'
import { canTransitionItemStatus } from '../../lib/statusHelpers'
import { Field } from './FormFields'
import { useId, useState } from 'react'

interface Props {
  creationMode?: boolean
  editMode?: boolean
  item: CurtainItem
  index: number
  onChange: (item: CurtainItem) => void
  onRemove: () => void
  sewingTypes?: string[]
}

export default function CurtainCard({ item, index, onChange, onRemove, creationMode = false, editMode = false, sewingTypes = SEWING_TYPES }: Props) {
  const set = (k: keyof CurtainItem, v: unknown) => onChange({ ...item, [k]: v })
  const [widthBlurred, setWidthBlurred] = useState(false)
  const [heightBlurred, setHeightBlurred] = useState(false)
  const errorId = useId()
  const dimensionMode = creationMode || editMode
  const numericValue = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
  const width = item.width_m.trim()
  const widthInvalid = dimensionMode && widthBlurred && (!numericValue.test(width) || !Number.isFinite(Number(width)) || Number(width) < 0.3 || Number(width) > 10)
  const heightInvalid = dimensionMode && heightBlurred && item.heights_m.split(',').some(value => {
    const height = value.trim()
    return !numericValue.test(height) || !Number.isFinite(Number(height)) || Number(height) <= 0 || Number(height) > 6
  })

  return (
    <div className="border border-purple-200 rounded-lg bg-white overflow-hidden mb-3">
      {/* כותרת כרטיס */}
      <div className="bg-purple-50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-purple-700">וילון {index + 1}</span>
          {item.location && (
            <span className="text-xs text-purple-600">— {item.location}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!creationMode && !editMode && <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={item.for_execution}
                   onChange={e => set('for_execution', e.target.checked)} />
            לביצוע
          </label>}
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="מיקום" required className="col-span-2 sm:col-span-1">
          <input className="input" value={item.location}
                 onChange={e => set('location', e.target.value)}
                 placeholder="סלון, חדר שינה..." />
        </Field>

        <Field label="רוחב (מ׳)" required>
          <input className={`input${widthInvalid ? ' border-red-500 ring-1 ring-red-500' : ''}`} type={dimensionMode ? 'text' : 'number'} inputMode={dimensionMode ? 'decimal' : undefined} required={dimensionMode} min={dimensionMode ? "0.30" : "0"} max={dimensionMode ? "10.00" : undefined} step="0.01" dir="ltr" value={item.width_m}
                 onBlur={() => { if (dimensionMode) setWidthBlurred(true) }}
                 aria-invalid={widthInvalid || undefined} aria-describedby={widthInvalid ? `${errorId}-width` : undefined}
                 onChange={e => set('width_m', e.target.value)} />
          {widthInvalid && <p id={`${errorId}-width`} role="alert" className="text-xs text-red-600 mt-1">הרוחב חייב להיות מספר בין 0.30 ל־10.00 מטר</p>}
          {dimensionMode && <p className="text-xs text-slate-500 mt-1">רוחב בין 0.30 ל-10.00 מטר</p>}
        </Field>

        <Field label="גובה/ים (מ׳)" required>
          <input className={`input${heightInvalid ? ' border-red-500 ring-1 ring-red-500' : ''}`} required={dimensionMode} dir="ltr" value={item.heights_m}
                 onBlur={() => { if (dimensionMode) setHeightBlurred(true) }}
                 aria-invalid={heightInvalid || undefined} aria-describedby={heightInvalid ? `${errorId}-height` : undefined}
                 onChange={e => set('heights_m', e.target.value)}
                 placeholder="3.06 או 3.06,3.07,3.06" />
          {heightInvalid && <p id={`${errorId}-height`} role="alert" className="text-xs text-red-600 mt-1">כל גובה חייב להיות מספר גדול מ־0 ועד 6.00 מטר, ללא ערכים ריקים</p>}
          {dimensionMode && <p className="text-xs text-slate-500 mt-1">כל גובה גדול מ-0 ועד 6.00 מטר, מופרד בפסיקים</p>}
        </Field>

        <Field label="סוג תפירה">
          <select className="input" value={item.sewing_type}
                  onChange={e => set('sewing_type', e.target.value)}>
            {sewingTypes.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="שטייף (ס״מ)">
          <input className="input" type="number" min="0" dir="ltr" value={item.shtaif_cm}
                 onChange={e => set('shtaif_cm', e.target.value)} />
        </Field>

        <Field label="מכפלת (ס״מ)">
          <input className="input" type="number" min="0" dir="ltr" value={item.hem_cm}
                 onChange={e => set('hem_cm', e.target.value)} />
        </Field>

        <Field label="סוג בד">
          <input className="input" value={item.fabric_text}
                 onChange={e => set('fabric_text', e.target.value)}
                 placeholder="שם הבד / קוד" />
        </Field>

        {!creationMode && item.db_id && item.for_execution && ITEM_STATUSES.some(s => s.value === item.item_status) && <Field label="סטטוס">
          <select className="input" value={item.item_status}
                  onChange={e => { if (canTransitionItemStatus(item.item_status, e.target.value)) set('item_status', e.target.value as CurtainItem['item_status']) }}>
            {ITEM_STATUSES.filter(s => s.value === item.item_status || canTransitionItemStatus(item.item_status, s.value)).map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>}

        <Field label="עלות (₪)" required>
          <input className="input font-bold" type="number" min="0" dir="ltr" value={item.price}
                 onChange={e => set('price', e.target.value)} />
        </Field>

        <div className="col-span-2 sm:col-span-3 flex items-center gap-4">
          {dimensionMode ? (
            <div role="group" aria-label="חלוקת וילון" className="inline-flex rounded-lg border border-purple-200 overflow-hidden">
              {[false, true].map(split => (
                <button key={String(split)} type="button" aria-pressed={item.is_split === split}
                        onClick={() => set('is_split', split)}
                        className={`px-4 py-2 text-xs font-medium ${item.is_split === split ? 'bg-purple-100 text-purple-700' : 'bg-white text-slate-600 hover:bg-purple-50'}`}>
                  {split ? 'חצוי' : 'לא חצוי'}
                </button>
              ))}
            </div>
          ) : <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={item.is_split}
                   onChange={e => set('is_split', e.target.checked)} />
            חצוי (נפתח מהאמצע)
          </label>}
        </div>

        <Field label="הערות" className="col-span-2 sm:col-span-3">
          <input className="input" value={item.notes}
                 onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
