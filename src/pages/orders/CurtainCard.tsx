import { CurtainItem, SEWING_TYPES, ITEM_STATUSES } from './types'
import { Field } from './FormFields'

interface Props {
  item: CurtainItem
  index: number
  onChange: (item: CurtainItem) => void
  onRemove: () => void
}

export default function CurtainCard({ item, index, onChange, onRemove }: Props) {
  const set = (k: keyof CurtainItem, v: unknown) => onChange({ ...item, [k]: v })

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
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={item.for_execution}
                   onChange={e => set('for_execution', e.target.checked)} />
            לביצוע
          </label>
          <button onClick={onRemove} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      </div>

      <div className="p-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="מיקום" required className="col-span-2 sm:col-span-1">
          <input className="input" value={item.location}
                 onChange={e => set('location', e.target.value)}
                 placeholder="סלון, חדר שינה..." />
        </Field>

        <Field label="רוחב (ס״מ)" required>
          <input className="input" type="number" min="0" dir="ltr" value={item.width_cm}
                 onChange={e => set('width_cm', e.target.value)} />
        </Field>

        <Field label="גובה/ים (ס״מ)" required>
          <input className="input" dir="ltr" value={item.heights_cm}
                 onChange={e => set('heights_cm', e.target.value)}
                 placeholder="306 או 306,307,306" />
        </Field>

        <Field label="סוג תפירה">
          <select className="input" value={item.sewing_type}
                  onChange={e => set('sewing_type', e.target.value)}>
            {SEWING_TYPES.map(t => <option key={t}>{t}</option>)}
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

        <Field label="סטטוס">
          <select className="input" value={item.item_status}
                  onChange={e => set('item_status', e.target.value as CurtainItem['item_status'])}>
            {ITEM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>

        <Field label="עלות (₪)" required>
          <input className="input font-bold" type="number" min="0" dir="ltr" value={item.price}
                 onChange={e => set('price', e.target.value)} />
        </Field>

        <div className="col-span-2 sm:col-span-3 flex items-center gap-4">
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={item.is_split}
                   onChange={e => set('is_split', e.target.checked)} />
            חצוי (נפתח מהאמצע)
          </label>
        </div>

        <Field label="הערות" className="col-span-2 sm:col-span-3">
          <input className="input" value={item.notes}
                 onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
