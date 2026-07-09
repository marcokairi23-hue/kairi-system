import { useState, FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError('האימייל או הסיסמה אינם נכונים. בדקו ונסו שוב.')
    setBusy(false)
  }

  return (
    <div className="min-h-screen grid place-items-center px-4">
      <div className="card w-full max-w-sm p-8">
        <div className="text-center mb-8">
          <div className="text-2xl font-extrabold text-brand">מרקו קאירי</div>
          <div className="text-sm text-slate-500 mt-1">מערכת ניהול — וילונות ובדים</div>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input className="input" type="email" dir="ltr" required
                   value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">סיסמה</label>
            <input className="input" type="password" dir="ltr" required
                   value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button className="btn-primary w-full" disabled={busy}>
            {busy ? 'מתחבר…' : 'כניסה למערכת'}
          </button>
        </form>
      </div>
    </div>
  )
}
