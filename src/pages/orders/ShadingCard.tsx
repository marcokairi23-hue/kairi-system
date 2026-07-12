import { ShadingItem, SHADING_SUBTYPES, MOUNT_TYPES, MECHANISM_SIDES, ITEM_STATUSES } from './types'
import { Field } from './FormFields'

interface Props {
  item: ShadingItem
  index: number
  onChange: (item: ShadingItem) => void
  onRemove: () => void
}

export default function ShadingCard({ item, index, onChange, onRemove }: Props) {
  const set = (k: keyof ShadingItem, v: unknown) => onChange({ ...item, [k]: v })
  const subtypeLabel = SHADING_SUBTYPES.find(s => s.value === item.subtype)?.label ?? item.subtype

  return (
    <div className="border border-orange-200 rounded-lg bg-white overflow-hidden mb-3">
      <div className="bg-orange-50 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-orange-700">{subtypeLabel} {index + 1}</span>
          {item.location && <span className="text-xs text-orange-600">— {item.location}</span>}
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
        <Field label="סוג פריט">
          <select className="input" value={item.subtype}
                  onChange={e => set('subtype', e.target.value as ShadingItem['subtype'])}>
            {SHADING_SUBTYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>

        <Field label="מיקום" required>
          <input className="input" value={item.location}
                 onChange={e => set('location', e.target.value)}
                 placeholder="מטבח, חלון..." />
        </Field>

        <Field label="התקנה">
          <select className="input" value={item.mount_type}
                  onChange={e => set('mount_type', e.target.value)}>
            {MOUNT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>

        <Field label="רוחב (ס״מ)" required>
          <input className="input" type="number" min="0" dir="ltr" value={item.width_cm}
                 onChange={e => set('width_cm', e.target.value)} />
        </Field>

        <Field label="גובה (ס״מ)" required>
          <input className="input" dir="ltr" value={item.heights_cm}
                 onChange={e => set('heights_cm', e.target.value)} />
        </Field>

        <Field label="צד מנגנון">
          <select className="input" value={item.mechanism_side}
                  onChange={e => set('mechanism_side', e.target.value)}>
            {MECHANISM_SIDES.map(s => <option key={s}>{s}</option>)}
          </select>
        </Field>

        <Field label="צבע / סוג בד" className="col-span-2 sm:col-span-1">
          <input className="input" value={item.color_fabric_text}
                 onChange={e => set('color_fabric_text', e.target.value)}
                 placeholder="לבן, אפור..." />
        </Field>

        <Field label="סטטוס">
          <select className="input" value={item.item_status}
                  onChange={e => set('item_status', e.target.value as ShadingItem['item_status'])}>
            {ITEM_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>

        <Field label="עלות (₪)" required>
          <input className="input font-bold" type="number" min="0" dir="ltr" value={item.price}
                 onChange={e => set('price', e.target.value)} />
        </Field>

        <Field label="הערות" className="col-span-2 sm:col-span-3">
          <input className="input" value={item.notes}
                 onChange={e => set('notes', e.target.value)} />
        </Field>
      </div>
    </div>
  )
}
