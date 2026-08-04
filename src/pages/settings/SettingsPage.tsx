import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SettingsPage() {
  const [installers, setInstallers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [newInstaller, setNewInstaller] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('settings').select('value').eq('key', 'installers').maybeSingle()
    setInstallers(Array.isArray(data?.value) ? data.value : [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const save = async (next: string[]) => {
    setSaving(true)
    setInstallers(next)
    await supabase.from('settings').upsert({
      key: 'installers', value: next, updated_at: new Date().toISOString(),
    })
    setSaving(false)
  }

  const addInstaller = () => {
    const name = newInstaller.trim()
    if (!name || installers.includes(name)) return
    save([...installers, name])
    setNewInstaller('')
  }

  const removeInstaller = (name: string) => {
    save(installers.filter(i => i !== name))
  }

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">הגדרות</h1>

      <div className="card p-4">
        <div className="text-sm font-bold text-slate-700 mb-1">רשימת מתקינים</div>
        <p className="text-xs text-slate-500 mb-3">
          משמשת בשיוך מתקין להזמנה (במעבר "מוכנה" → "נאסף ע\"י מתקין").
        </p>

        <div className="flex gap-2 mb-3">
          <input
            className="input flex-1"
            placeholder="שם מתקין..."
            value={newInstaller}
            onChange={e => setNewInstaller(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addInstaller()}
          />
          <button className="btn-primary shrink-0" disabled={!newInstaller.trim() || saving} onClick={addInstaller}>
            + הוסף
          </button>
        </div>

        {installers.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-4">אין עדיין מתקינים ברשימה</div>
        ) : (
          <div className="divide-y">
            {installers.map(name => (
              <div key={name} className="flex items-center justify-between py-2 text-sm">
                <span>{name}</span>
                <button
                  className="text-xs text-red-500 hover:text-red-700"
                  disabled={saving}
                  onClick={() => removeInstaller(name)}
                >
                  🗑️ הסר
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
