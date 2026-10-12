import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'

type Mode = 'off' | 'review' | 'live'
interface Config { mode: Mode; group_id: string | null; environment: 'production' | 'test' }
interface Event { sale_id: string; order_number: string; amount: number; status: string; reason: string; created_at: string }
const reasons: Record<string, string> = {
  VERIFIED: 'תשלום מאומת נרשם', REVIEW_MODE: 'בדיקה בלבד — לא נרשם תשלום',
  ORDER_NOT_FOUND: 'הזמנה לא נמצאה', PHONE_MISMATCH: 'טלפון אינו תואם להזמנה',
  ORDER_NOT_PAYABLE: 'ההזמנה אינה זמינה לתשלום', EXCEEDS_BALANCE: 'הסכום גדול מהיתרה',
}

export default function PaymentAutomation() {
  const { profile } = useAuth()
  const [config, setConfig] = useState<Config | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const load = async () => {
    setError('')
    const [settings, log] = await Promise.all([
      supabase.from('settings').select('value').eq('key', 'icredit_automation').maybeSingle(),
      supabase.from('icredit_events').select('sale_id,order_number,amount,status,reason,created_at')
        .order('created_at', { ascending: false }).limit(20),
    ])
    if (settings.error || log.error || !settings.data) {
      setError('לא ניתן לטעון את הגדרות האוטומציה. יש לוודא שהעדכון הותקן.')
      return
    }
    setConfig(settings.data.value as Config)
    setEvents((log.data ?? []) as Event[])
  }
  useEffect(() => { void load() }, [])
  const changeMode = async (mode: Mode) => {
    if (!config || profile?.role !== 'admin') return
    setBusy(true); setError(''); setMessage('')
    // Compare the version we loaded so another admin's change is not overwritten.
    const { data, error: saveError } = await supabase.from('settings')
      .update({ value: { ...config, mode } }).eq('key', 'icredit_automation')
      .eq('value', JSON.stringify(config)).select('value').maybeSingle()
    if (saveError || !data) setError('השינוי לא נשמר. רענן ונסה שוב.')
    else { setConfig(data.value as Config); setMessage('מצב האוטומציה נשמר') }
    setBusy(false)
  }
  return (
    <section className="card p-4 space-y-3">
      <h2 className="font-bold text-lg">אוטומציית תשלומים — iCredit / Make</h2>
      <p className="text-sm text-slate-600">בשחרור הראשוני התהליך כבוי. ניתן להפעיל אותו בעדכון הראשון, לאחר בדיקת החיבור.</p>
      {config && <>
        <p className="text-sm">מצב נוכחי: <strong>{{ off: 'כבוי', review: 'בדיקה בלבד', live: 'פעיל' }[config.mode]}</strong></p>
        {profile?.role === 'admin' && <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" disabled={busy || config.mode === 'off'} onClick={() => changeMode('off')}>כיבוי התהליך</button>
          <button className="btn-ghost" disabled={busy || !config.group_id || config.mode === 'review'} onClick={() => changeMode('review')}>בדיקה ללא רישום תשלום</button>
          <button className="btn-primary" disabled={busy || !config.group_id || config.environment !== 'production' || config.mode === 'live'} onClick={() => changeMode('live')}>הפעלת רישום אוטומטי</button>
        </div>}
        <p className="text-xs text-slate-500">כיבוי עוצר רישום תשלומים חדשים ואינו מבטל תשלומים קיימים. אירועים שהגיעו כשהתהליך כבוי אינם נרשמים; נדרשת שליחה חוזרת לאחר הפעלה. תשלומים מאומתים אינם מחליפים אישור משרד לביצוע הזמנה.</p>
        {profile?.role === 'admin' && <p className="text-xs text-slate-600">
          להפעלה בעדכון הראשון יש להפעיל גם את התרחיש ב־Make. <a className="text-brand underline" href="https://eu2.make.com/244332/scenarios/9941828" target="_blank" rel="noreferrer">פתיחת התרחיש</a>
        </p>}
      </>}
      {error && <p className="text-red-600 text-sm" role="alert">{error}</p>}
      {message && <p className="text-green-700 text-sm" role="status">{message}</p>}
      <button className="btn-ghost" disabled={busy} onClick={() => { setMessage(''); void load() }}>רענון מצב ויומן</button>
      {events.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm text-right">
        <thead><tr><th>הזמנה</th><th>סכום</th><th>תוצאה</th><th>מועד</th></tr></thead>
        <tbody>{events.map(event => <tr key={event.sale_id} className="border-t">
          <td className="py-2">{event.order_number || 'ללא שיוך'}</td>
          <td>{Number(event.amount).toLocaleString('he-IL', { style: 'currency', currency: 'ILS' })}</td>
          <td>{reasons[event.reason] ?? event.reason}</td>
          <td>{new Date(event.created_at).toLocaleString('he-IL')}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  )
}
