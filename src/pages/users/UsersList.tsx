import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Profile, UserRole } from '../../types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'אדמין', office: 'משרד', sales: 'סוכן', viewer: 'צפייה בלבד',
}

export default function UsersList() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name')
    if (error) console.error('שגיאה בטעינת משתמשים:', error)
    setUsers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const update = async (id: string, patch: Partial<Profile>) => {
    setSavingId(id)
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, ...patch } : u)))
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) {
      alert('שגיאה בעדכון המשתמש: ' + error.message)
      await load()
    }
    setSavingId(null)
  }

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">משתמשים</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-slate-500 border-b">
              <th className="p-2">שם</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">תפקיד</th>
              <th className="p-2">פעיל</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-2">
                  <input
                    className="input"
                    defaultValue={u.full_name}
                    disabled={savingId === u.id}
                    onBlur={e => e.target.value !== u.full_name && update(u.id, { full_name: e.target.value })}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="input"
                    defaultValue={u.phone ?? ''}
                    disabled={savingId === u.id}
                    onBlur={e =>
                      e.target.value !== (u.phone ?? '') && update(u.id, { phone: e.target.value || null })
                    }
                  />
                </td>
                <td className="p-2">
                  <select
                    className="input"
                    value={u.role}
                    disabled={savingId === u.id}
                    onChange={e => update(u.id, { role: e.target.value as UserRole })}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={u.is_active}
                    disabled={savingId === u.id}
                    onChange={e => update(u.id, { is_active: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
