import { useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'

export default function InstallationReview({customerSigned,installerSigned,completed=false}:{customerSigned:boolean;installerSigned:boolean;completed?:boolean}) {
  const {profile}=useAuth()
  const [files,setFiles]=useState<File[]>([])
  const [previews,setPreviews]=useState<{name:string;url:string}[]>([])
  useEffect(()=>{
    const next=files.map(f=>({name:f.name,url:URL.createObjectURL(f)}));setPreviews(next)
    return()=>next.forEach(p=>URL.revokeObjectURL(p.url))
  },[files])
  const office=profile?.is_active && ['admin','office'].includes(profile.role)
  return <section className="card p-4 mb-3 space-y-3" dir="rtl">
    <h2 className="font-bold">{completed?'הזמנה סגורה':'תמונות ובדיקת תנאי סגירה'}</h2>
    <p>חתימת לקוח — חובה: {customerSigned?'קיימת':'חסרה'}</p>
    <p>חתימת מתקין — חובה: {installerSigned?'קיימת':'חסרה'}</p>
    {!completed&&<label className="block">תמונות התקנה (לא חובה)<input className="input mt-1" type="file" accept="image/*" multiple onChange={e=>setFiles(Array.from(e.target.files??[]))}/></label>}
    <p className="text-sm text-slate-600">{previews.length} תמונות בתצוגה מקומית בלבד. התמונות אינן נשמרות וייעלמו ביציאה מהמסך; מצב התמונות השמורות אינו זמין.</p>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{previews.map(p=><figure key={p.url}><img src={p.url} alt={p.name} className="w-full h-32 object-contain rounded border"/><figcaption className="text-xs break-all">{p.name}</figcaption></figure>)}</div>
    {!completed&&<><p role="status">{!customerSigned||!installerSigned?'חסרות חתימות הנדרשות לסגירה.':office?'שתי החתימות קיימות; אישור סגירה סופי עדיין אינו זמין.':'רק משרד או מנהל רשאים לבצע סגירה סופית.'}</p>
      {office&&<button className="btn-primary" disabled>סגירה סופית</button>}
      <p className="text-sm text-slate-500">לא בוצע שינוי במצב ההזמנה.</p></>}
  </section>
}
