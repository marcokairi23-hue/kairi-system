import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Profile, UserRole } from '../../types'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'אדמין', office: 'משרד', sales: 'סוכן', viewer: 'צפייה בלבד',
}

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let out = ''
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

interface NewUserForm {
  full_name: string
  phone: string
  email: string
  role: UserRole
  password: string
}

function emptyNewUserForm(): NewUserForm {
  return { full_name: '', phone: '', email: '', role: 'sales', password: generatePassword() }
}

const DELETE_CONFIRM_WORD = 'מחיקה'

export default function UsersList() {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [newUser, setNewUser] = useState<NewUserForm>(emptyNewUserForm())
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createdCreds, setCreatedCreds] = useState<{ email: string; password: string } | null>(null)

  const [editUser, setEditUser] = useState<Profile | null>(null)
  const [editForm, setEditForm] = useState<{ full_name: string; phone: string; role: UserRole; is_active: boolean } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const load = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name')
    if (error) console.error('שגיאה בטעינת משתמשים:', error)
    setUsers(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setNewUser(emptyNewUserForm())
    setCreateError(null)
    setShowAdd(true)
  }

  const createUser = async () => {
    setCreating(true)
    setCreateError(null)
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: {
        full_name: newUser.full_name,
        phone: newUser.phone || null,
        email: newUser.email,
        role: newUser.role,
        password: newUser.password,
      },
    })
    setCreating(false)
    if (error || data?.error) {
      setCreateError(data?.error ?? error?.message ?? 'שגיאה ביצירת המשתמש')
      return
    }
    setShowAdd(false)
    setCreatedCreds({ email: newUser.email, password: newUser.password })
    await load()
  }

  const openEdit = (u: Profile) => {
    setEditUser(u)
    setEditForm({ full_name: u.full_name, phone: u.phone ?? '', role: u.role, is_active: u.is_active })
    setEditError(null)
  }

  const saveEdit = async () => {
    if (!editUser || !editForm) return
    setSavingEdit(true)
    setEditError(null)
    const { error } = await supabase.from('profiles').update({
      full_name: editForm.full_name,
      phone: editForm.phone || null,
      role: editForm.role,
      is_active: editForm.is_active,
    }).eq('id', editUser.id)
    setSavingEdit(false)
    if (error) {
      setEditError('שגיאה בעדכון המשתמש: ' + error.message)
      return
    }
    setEditUser(null)
    setEditForm(null)
    await load()
  }

  const openDelete = (u: Profile) => {
    setDeleteTarget(u)
    setDeleteConfirmText('')
    setDeleteError(null)
  }

  const copyDeleteWord = async () => {
    try {
      await navigator.clipboard.writeText(DELETE_CONFIRM_WORD)
    } catch {
      // אם ההעתקה נכשלת (למשל דפדפן חוסם) — המשתמש עדיין יכול להקליד ידנית
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { id: deleteTarget.id },
    })
    setDeleting(false)
    if (error || data?.error) {
      setDeleteError(data?.error ?? error?.message ?? 'שגיאה במחיקת המשתמש')
      return
    }
    setDeleteTarget(null)
    setDeleteConfirmText('')
    await load()
  }

  if (loading) return <div className="text-slate-500 p-4">טוען...</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">משתמשים</h1>
        <button className="btn-primary" onClick={openAdd}>+ הוסף משתמש</button>
      </div>

      {createdCreds && (
        <div className="card p-4 mb-4 border-2 border-green-400 bg-green-50">
          <div className="font-bold text-green-800 mb-1">המשתמש נוצר בהצלחה</div>
          <div className="text-sm text-slate-700">
            אימייל: <span dir="ltr" className="font-mono">{createdCreds.email}</span><br />
            סיסמה זמנית: <span dir="ltr" className="font-mono font-bold">{createdCreds.password}</span>
          </div>
          <div className="text-xs text-slate-500 mt-2">
            העבר את הסיסמה למשתמש עכשיו — היא לא תוצג שוב.
          </div>
          <button className="btn-ghost text-xs mt-2" onClick={() => setCreatedCreds(null)}>סגור</button>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-right text-slate-500 border-b">
              <th className="p-2">שם</th>
              <th className="p-2">טלפון</th>
              <th className="p-2">תפקיד</th>
              <th className="p-2">פעיל</th>
              <th className="p-2">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="p-2">{u.full_name}</td>
                <td className="p-2" dir="ltr">{u.phone || '—'}</td>
                <td className="p-2">{ROLE_LABELS[u.role]}</td>
                <td className="p-2 text-center">{u.is_active ? '✅' : '—'}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <button className="btn-ghost text-xs"
                            onClick={() => openEdit(u)}>
                      ✏️ ערוך
                    </button>
                    <button className="text-xs text-red-600 hover:text-red-800"
                            onClick={() => openDelete(u)}>
                      🗑️ מחק
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3">
            <h3 className="font-bold text-lg">הוספת משתמש חדש</h3>

            <label className="block text-sm">
              שם מלא
              <input className="input mt-1" value={newUser.full_name}
                     onChange={e => setNewUser(f => ({ ...f, full_name: e.target.value }))} />
            </label>

            <label className="block text-sm">
              טלפון
              <input className="input mt-1" dir="ltr" value={newUser.phone}
                     onChange={e => setNewUser(f => ({ ...f, phone: e.target.value }))} />
            </label>

            <label className="block text-sm">
              אימייל
              <input className="input mt-1" dir="ltr" type="email" value={newUser.email}
                     onChange={e => setNewUser(f => ({ ...f, email: e.target.value }))} />
            </label>

            <label className="block text-sm">
              תפקיד
              <select className="input mt-1" value={newUser.role}
                      onChange={e => setNewUser(f => ({ ...f, role: e.target.value as UserRole }))}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              סיסמה זמנית
              <div className="flex gap-2 mt-1">
                <input className="input" dir="ltr" value={newUser.password}
                       onChange={e => setNewUser(f => ({ ...f, password: e.target.value }))} />
                <button type="button" className="btn-ghost shrink-0"
                        onClick={() => setNewUser(f => ({ ...f, password: generatePassword() }))}>
                  🎲 צור אקראית
                </button>
              </div>
            </label>

            {createError && <div className="text-red-600 text-sm">{createError}</div>}

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" disabled={creating
                || !newUser.full_name || !newUser.email || newUser.password.length < 6}
                      onClick={createUser}>
                {creating ? 'יוצר...' : 'צור משתמש'}
              </button>
              <button className="btn-ghost" onClick={() => setShowAdd(false)}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {editUser && editForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3">
            <h3 className="font-bold text-lg">עריכת {editUser.full_name}</h3>

            <label className="block text-sm">
              שם מלא
              <input className="input mt-1" value={editForm.full_name}
                     onChange={e => setEditForm(f => f && ({ ...f, full_name: e.target.value }))} />
            </label>

            <label className="block text-sm">
              טלפון
              <input className="input mt-1" dir="ltr" value={editForm.phone}
                     onChange={e => setEditForm(f => f && ({ ...f, phone: e.target.value }))} />
            </label>

            <label className="block text-sm">
              תפקיד
              <select className="input mt-1" value={editForm.role}
                      onChange={e => setEditForm(f => f && ({ ...f, role: e.target.value as UserRole }))}>
                {Object.entries(ROLE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={editForm.is_active}
                     onChange={e => setEditForm(f => f && ({ ...f, is_active: e.target.checked }))} />
              פעיל
            </label>

            {editError && <div className="text-red-600 text-sm">{editError}</div>}

            <div className="flex gap-2 pt-2">
              <button className="btn-primary flex-1" disabled={savingEdit || !editForm.full_name}
                      onClick={saveEdit}>
                {savingEdit ? 'שומר...' : 'שמור'}
              </button>
              <button className="btn-ghost" onClick={() => { setEditUser(null); setEditForm(null) }}>
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-3 border-2 border-red-500">
            <h3 className="font-bold text-lg text-red-700">⚠️ מחיקת {deleteTarget.full_name}</h3>
            <p className="text-sm text-slate-600">
              פעולה זו בלתי הפיכה. אם למשתמש הזה יש הזמנות, תשלומים או פעילות רשומה — המחיקה תיכשל
              (כדי לא לאבד את היומן) ותצטרך להשתמש ב"לא פעיל" במקום.
            </p>

            <div className="bg-red-50 border border-red-300 rounded-lg p-3 flex items-center justify-between">
              <span className="text-red-700 font-bold text-lg">{DELETE_CONFIRM_WORD}</span>
              <button type="button" className="btn-ghost text-xs" onClick={copyDeleteWord}>
                📋 העתק
              </button>
            </div>

            <label className="block text-sm">
              הקלד/הדבק את המילה למעלה כדי לאשר
              <input className="input mt-1" value={deleteConfirmText}
                     onChange={e => setDeleteConfirmText(e.target.value)} />
            </label>

            {deleteError && <div className="text-red-600 text-sm">{deleteError}</div>}

            <div className="flex gap-2 pt-2">
              <button
                className="flex-1 py-2 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                disabled={deleting || deleteConfirmText.trim() !== DELETE_CONFIRM_WORD}
                onClick={confirmDelete}
              >
                {deleting ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
              <button className="btn-ghost" onClick={() => setDeleteTarget(null)}>ביטול</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
