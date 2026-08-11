import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const DELETE_CONFIRM_WORD = 'מחיקה'

interface Props {
  title: string
  description?: string
  settingsKey: string
  placeholder?: string
}

// עריכת רשימת ערכים גנרית (string[]) שנשמרת ב-settings.value לפי key.
// משמשת לכל רשימת בחירה (SELECT) שרוצים לאפשר לאדמין לערוך: מתקינים, סוגי
// תפירה, אמצעי תשלום, סוג מוצר הצללה וכו' — כל אחת היא מופע נפרד של הקומפוננטה.
// מחיקה: אותו דפוס בדיוק כמו מחיקת משתמש (UsersList.tsx) — מילת אימות + העתקה מהירה.
export default function EditableList({ title, description, settingsKey, placeholder = 'ערך חדש...' }: Props) {
  const [values, setValues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', settingsKey).maybeSingle()
    setValues(Array.isArray(data?.value) ? data.value : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [settingsKey])

  const save = async (next: string[]) => {
    setSaving(true); setError(null)
    setValues(next)
    const { error: err } = await supabase.from('settings').upsert({
      key: settingsKey, value: next, updated_at: new Date().toISOString(),
    })
    setSaving(false)
    if (err) setError('שגיאה בשמירה: ' + err.message)
  }

  const addValue = () => {
    const v = newValue.trim()
    if (!v || values.includes(v)) return
    save([...values, v])
    setNewValue('')
  }

  const startEdit = (i: number) => { setEditIndex(i); setEditValue(values[i]) }
  const cancelEdit = () => { setEditIndex(null); setEditValue('') }

  const saveEdit = () => {
    const v = editValue.trim()
    if (editIndex === null || !v) return
    if (values.some((val, i) => val === v && i !== editIndex)) { cancelEdit(); return }
    save(values.map((val, i) => (i === editIndex ? v : val)))
    cancelEdit()
  }

  const openDelete = (v: string) => { setDeleteTarget(v); setDeleteConfirmText('') }

  const copyDeleteWord = async () => {
    try { await navigator.clipboard.writeText(DELETE_CONFIRM_WORD) } catch { /* המשתמש יקליד ידנית */ }
  }

  const confirmDelete = () => {
    if (!deleteTarget) return
    save(values.filter(v => v !== deleteTarget))
    setDeleteTarget(null)
    setDeleteConfirmText('')
  }

  if (loading) return <div className="text-slate-500 text-sm p-2">טוען...</div>

  return (
    <div className="card p-4">
      <div className="text-sm font-bold text-slate-700 mb-1">{title}</div>
      {description && <p className="text-xs text-slate-500 mb-3">{description}</p>}

      <div className="flex gap-2 mb-3">
        <input
          className="input flex-1"
          placeholder={placeholder}
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addValue()}
        />
        <button className="btn-primary shrink-0" disabled={!newValue.trim() || saving} onClick={addValue}>
          + הוסף
        </button>
      </div>

      {error && <div className="text-red-600 text-xs mb-2">{error}</div>}

      {values.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-4">אין עדיין ערכים ברשימה</div>
      ) : (
        <div className="divide-y">
          {values.map((v, i) => (
            <div key={v} className="flex items-center justify-between py-2 text-sm gap-2">
              {editIndex === i ? (
                <>
                  <input
                    className="input flex-1"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && saveEdit()}
                    autoFocus
                  />
                  <button className="text-xs text-brand hover:underline shrink-0" disabled={saving} onClick={saveEdit}>
                    שמור
                  </button>
                  <button className="text-xs text-slate-400 hover:text-slate-600 shrink-0" onClick={cancelEdit}>
                    ביטול
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1">{v}</span>
                  <button className="text-xs text-slate-500 hover:text-slate-700 shrink-0" disabled={saving} onClick={() => startEdit(i)}>
                    ✏️ ערוך
                  </button>
                  <button className="text-xs text-red-500 hover:text-red-700 shrink-0" disabled={saving} onClick={() => openDelete(v)}>
                    🗑️ מחק
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3 border-2 border-red-500">
            <h3 className="font-bold text-lg text-red-700">⚠️ מחיקת "{deleteTarget}"</h3>
            <p className="text-sm text-slate-600">
              הערך יוסר מרשימת הבחירה. הזמנות/פריטים קיימים שכבר משתמשים בו לא ישתנו —
              רק לא יהיה ניתן לבחור אותו יותר בהזמנות חדשות.
            </p>

            <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-center justify-between">
              <span className="text-red-700 font-bold text-lg">{DELETE_CONFIRM_WORD}</span>
              <button type="button" className="btn-ghost text-xs" onClick={copyDeleteWord}>
                📋 העתק
              </button>
            </div>

            <label className="block text-sm">
              הקלד/הדבק את המילה למעלה כדי לאשר
              <input className="input mt-1" value={deleteConfirmText} onChange={e => setDeleteConfirmText(e.target.value)} />
            </label>

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                disabled={saving || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
                onClick={confirmDelete}
              >
                {saving ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
