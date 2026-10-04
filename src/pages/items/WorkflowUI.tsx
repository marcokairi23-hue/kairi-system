import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { supabase } from '../../lib/supabase'
import { ITEM_STATUS_LABELS, ORDER_STATUS_LABELS } from '../../lib/statusHelpers'
import { sumReceivedPayments } from '../../lib/payments'

type Mode = 'routing' | 'cutter' | 'office' | 'receipt' | 'ready' | 'pickup' | 'installer'
interface Item {
  id:string; family:string; subtype?:string; location:string; width_m:number; sewing_type?:string
  item_status:string; for_execution:boolean; routing_owner?:string; cut_instruction_id?:string
  supplier_name?:string
}
interface Order {
  id:string; order_number:number; customer_name_snapshot:string; status:string; final_total:number
  order_items:Item[]; payments:{amount:number;payment_status?:string}[]; installer_name?:string
}
const tabs: [Mode,string][] = [['routing','ניתוב ואחריות'],['cutter','גזרן'],['office','משרד וספקים'],
  ['receipt','קבלת סחורה'],['ready','מוכנות'],['pickup','איסוף ומסילות'],['installer','התקנות']]
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const executable=(o:Order)=>o.order_items.filter(i=>i.for_execution && i.item_status!=='cancelled')
const active=(o:Order)=>!['draft','quote','pending_payment','cancelled','completed'].includes(o.status)
const target=(i:Item)=>i.family==='curtain'?'גזרן':'משרד / ספק'
const state=(i:Item)=>i.cut_instruction_id?'ממתין לאישור גזירה':ITEM_STATUS_LABELS[i.item_status]??i.item_status

export default function WorkflowUI({initial='routing'}:{initial?:Mode}) {
  const {profile}=useAuth()
  const [mode,setMode]=useState<Mode>(initial)
  const [orders,setOrders]=useState<Order[]>([])
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [search,setSearch]=useState('')
  const [selected,setSelected]=useState<string[]>([])
  const [dialog,setDialog]=useState<{kind:Mode;order?:Order;item?:Item}|null>(null)
  const [supplier,setSupplier]=useState('')
  const [reviewed,setReviewed]=useState(false)
  const cutter=profile?.role==='cutter'
  const operational=profile?.is_active && ['admin','office','cutter'].includes(profile.role)
  useEffect(()=>{
    let live=true
    setLoading(true);setOrders([])
    supabase.from('orders').select('*, order_items(*), payments(*)').order('created_at',{ascending:false})
      .then(({data,error})=>{if(live){setOrders((data??[]) as Order[]);setError(error?.message??'');setLoading(false)}})
    return()=>{live=false}
  },[profile?.id])
  const effectiveMode=cutter?'cutter':mode
  function change(next:Mode){setMode(next);setSelected([]);setDialog(null);setReviewed(false)}
  function toggle(id:string){setSelected(s=>s.includes(id)?s.filter(x=>x!==id):[...s,id])}
  function relevant(o:Order):Item[] {
    const rows=executable(o)
    if(effectiveMode==='pickup') return rows.filter(i=>i.family==='curtain')
    if(effectiveMode==='cutter') return active(o)?rows.filter(i=>i.family==='curtain' && i.item_status==='new'):[]
    if(effectiveMode==='office') return active(o)?rows.filter(i=>i.family==='shading'):[]
    if(effectiveMode==='receipt') return active(o)?rows.filter(i=>i.family==='curtain' && i.item_status==='sewing'):[]
    return rows
  }
  const visible=orders.filter(o=>`${o.order_number} ${o.customer_name_snapshot}`.includes(search))
    .filter(o=>['pickup','installer'].includes(effectiveMode)?o.status==='ready_for_install':
      ['cutter','office','receipt'].includes(effectiveMode)?relevant(o).length>0:true)
  const selectedRows=orders.flatMap(o=>relevant(o).filter(i=>selected.includes(i.id)).map(i=>({o,i})))
  const selectedOrders=visible.filter(o=>selected.includes(o.id))
  function printPreview() {
    const w=window.open('','_blank');if(!w){setError('חלון ההדפסה נחסם. יש לאפשר חלונות קופצים.');return}
    const reportOrders=dialog?.kind==='cutter' && dialog.order?[dialog.order]:
      ['pickup','installer'].includes(effectiveMode)?selectedOrders:orders.filter(o=>selectedRows.some(r=>r.o.id===o.id))
    const kind=dialog?.kind??effectiveMode
    const title=kind==='pickup'?'טיוטת דוח מסילות':kind==='installer'?'דפי התקנה':kind==='receipt'?'טיוטת קבלת סחורה':'טיוטת הוראות עבודה'
    const html=reportOrders.map(o=>{
      const rows=kind==='pickup'?executable(o).filter(i=>i.family==='curtain'):
        kind==='installer'?executable(o):relevant(o).filter(i=>selected.includes(i.id))
      return `<section><h2>הזמנה #${esc(o.order_number)} — ${esc(o.customer_name_snapshot)}</h2>
      <table><thead><tr><th>מיקום</th><th>סוג / תפירה</th><th>רוחב פריט (מ׳)</th><th>מצב</th></tr></thead><tbody>${rows.map(i=>`<tr><td>${esc(i.location)}</td><td>${esc(i.family==='curtain'?i.sewing_type:i.subtype)}</td><td>${esc(i.width_m)}</td><td>${esc(state(i))}</td></tr>`).join('')}</tbody></table>
      ${!rows.length?'<p>אין פריטי וילון תפור לדוח מסילות.</p>':''}</section>`
    }).join('')
    w.document.write(`<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title><style>body{font:14px Arial;margin:24px}table{width:100%;border-collapse:collapse}td,th{padding:8px;border:1px solid #aaa}thead{display:table-header-group}tr{break-inside:avoid}section{${kind==='installer'?'break-before:page;':''}}section:first-of-type{break-before:auto}@page{margin:14mm}</style></head><body><h1>${title}</h1><p>תצוגה בלבד — לא נשמר אישור ביצוע ולא שונה סטטוס.${kind==='pickup'?' רוחב הפריט מוצג לבדיקה; אין כאן אישור למידת חיתוך מסילה.':''}</p>${html}</body></html>`)
    w.document.close();w.focus();w.print()
  }
  return <div dir="rtl" className="space-y-4">
    <h1 className="text-xl font-bold">{cutter?'עבודות גזירה':'תפעול V1'}</h1>
    {!cutter && <nav aria-label="שלבי עבודה" className="flex flex-wrap gap-2">{tabs.map(([key,label])=><button key={key} className={mode===key?'btn-primary':'btn-ghost'} onClick={()=>change(key)}>{label}</button>)}</nav>}
    <label className="block">חיפוש הזמנה או לקוח<input className="input mt-1" value={search} onChange={e=>setSearch(e.target.value)}/></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {loading && <p role="status">טוען הזמנות…</p>}
    <p className="text-sm text-slate-600">הנתונים מוצגים כפי שנשמרו. מסמכי הטיוטה אינם משנים סטטוס; פעולות אישור שאינן זמינות מסומנות במפורש.</p>
    {effectiveMode==='pickup' && <p className="card p-3">מסלול: איסוף עצמי · בחר הזמנות מוכנות. דוח המסילות כולל וילונות תפורים בלבד.</p>}
    {effectiveMode==='office' && <p className="card p-3">ממתין להזמנה ← הוזמן מספק ← מעקב ← מוכן. כל מוצרי ההצללה, כולל רומאי, בטיפול המשרד.</p>}
    {!loading && !visible.length && <p className="card p-4">אין הזמנות מתאימות לתצוגה זו.</p>}
    {visible.map(o=>{
      const rows=relevant(o),all=executable(o),ready=all.filter(i=>i.item_status==='ready').length
      return <section key={o.id} className="card p-4 space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">#{o.order_number} · {o.customer_name_snapshot}</h2>
            <p>{ORDER_STATUS_LABELS[o.status]??o.status}</p></div>
          {!cutter && <Link className="btn-ghost" to={`/orders/${o.id}`}>פתח הזמנה</Link>}
          {['pickup','installer'].includes(effectiveMode) && <label className="flex gap-2"><input type="checkbox" checked={selected.includes(o.id)} onChange={()=>toggle(o.id)}/>בחר הזמנה</label>}
          {effectiveMode==='cutter' && <button className="btn-primary" onClick={()=>{setSelected([]);setDialog({kind:'cutter',order:o})}}>פתח הזמנה — הדפס הוראות עבודה</button>}
        </header>
        <div className={`rounded-lg p-3 ${o.status==='ready_for_install'?'bg-teal-100 text-teal-900':'bg-slate-50'}`}>
          {o.status==='ready_for_install'?'מוכנה למסירה / התקנה':`מוכנות פריטים: ${ready}/${all.length}`}
          {all.length>0 && ready===all.length && o.status!=='ready_for_install' && <p>כל הפריטים מוכנים; מצב ההזמנה טרם עודכן.</p>}
        </div>
        {effectiveMode==='routing' && <p className="text-sm">התקבל: ₪{sumReceivedPayments(o.payments??[])} · יתרה: ₪{Math.max(0,o.final_total-sumReceivedPayments(o.payments??[]))}{o.status==='pending_payment'?' · ממתין לאישור משרד':''}</p>}
        {effectiveMode==='installer' && <p>מתקין: {o.installer_name||'טרם שויך'} · ממתין לקבלת העבודה להתקנה</p>}
        <div className="divide-y">{rows.map(i=><div key={i.id} className="py-3 flex flex-wrap items-center gap-3">
          {effectiveMode==='receipt' && <input aria-label={`בחר ${i.location} בהזמנה ${o.order_number}`} type="checkbox" checked={selected.includes(i.id)} onChange={()=>toggle(i.id)}/>}
          <div className="flex-1 min-w-40"><strong>{i.location} · {i.family==='curtain'?'וילון תפור':i.subtype||'הצללה'}</strong><p className="text-sm">{i.width_m} מ׳ · {i.sewing_type??''}</p>
            <p className="text-sm">גורם מיועד: {target(i)} · אחראי מתועד: {i.routing_owner==='CUTTER'?'גזרן':i.routing_owner==='OFFICE_SUPPLIER'?'משרד / ספק':'טרם תועד'}</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{state(i)}</span>
          {effectiveMode==='office' && <button className="btn-ghost" disabled={!operational} onClick={()=>{setSupplier(i.supplier_name??'');setDialog({kind:'office',order:o,item:i})}}>{i.item_status==='new'?'הוזמן — בחירת ספק':i.item_status==='ready'?'פרטי ספק':'מעקב / סימון מוכן'}</button>}
          {effectiveMode==='routing' && <span className="text-sm text-slate-600">הפעולה הבאה: {!active(o)?'השלמת שער התשלום':i.cut_instruction_id?'אישור גזירה':i.item_status==='ready'?'מסירה / התקנה':i.family==='curtain'?'טיפול גזרן':'טיפול משרד / ספק'}</span>}
        </div>)}</div>
      </section>
    })}
    {['receipt','pickup','installer'].includes(effectiveMode) && <div className="card p-4 sticky bottom-2 flex flex-wrap gap-3 items-center">
      <span>{selected.length} נבחרו</span><button className="btn-primary" disabled={!selected.length} onClick={()=>{setReviewed(false);setDialog({kind:effectiveMode})}}>{effectiveMode==='receipt'?'סקירת טיוטת קבלה':effectiveMode==='pickup'?'הצג דוח מסילות':'סקירת דפי התקנה'}</button>
    </div>}
    {dialog && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-labelledby="workflow-dialog">
      <div className="bg-white rounded-xl p-5 w-full max-w-2xl max-h-[90vh] overflow-auto space-y-4">
        <h2 id="workflow-dialog" className="text-lg font-bold">{dialog.kind==='office'?'הזמנה ומעקב ספק':dialog.kind==='cutter'?'בחירת פריטים להוראות עבודה':dialog.kind==='receipt'?'טיוטת קבלת סחורה':dialog.kind==='pickup'?'טיוטת דוח מסילות':'הדפסת הזמנות להתקנה'}</h2>
        {dialog.kind==='office'?<>
          <p>{dialog.item?.location} · {dialog.item?.subtype} · משרד / ספק</p>
          <label className="block">ספק (חובה)<select className="input" value={supplier} disabled={!dialog.item?.supplier_name} onChange={e=>setSupplier(e.target.value)}><option value="">אין רשימת ספקים זמינה לבחירה</option>{dialog.item?.supplier_name&&<option>{dialog.item.supplier_name}</option>}</select></label>
          <button className="btn-primary" disabled>אשר הזמנה מספק</button> <button className="btn-ghost" disabled>סמן מוכן</button>
          <p className="text-sm">בחירה ואישור ספק, ושמירת המעקב, עדיין אינם זמינים. לא נשמר שינוי בפריט.</p>
        </>:<>
          {dialog.kind==='cutter'?dialog.order?.order_items.filter(i=>i.family==='curtain'&&i.for_execution&&i.item_status==='new').map(i=><label key={i.id} className="flex gap-3"><input type="checkbox" disabled={!!i.cut_instruction_id} checked={selected.includes(i.id)} onChange={()=>toggle(i.id)}/>{i.location} · {i.width_m} מ׳ · {state(i)}</label>):
            dialog.kind==='receipt'?<><p>{selectedRows.length} פריטים · רוחב מצטבר {selectedRows.reduce((n,r)=>n+Number(r.i.width_m),0).toFixed(2)} מ׳</p>{[...new Set(selectedRows.map(r=>r.i.sewing_type??'ללא סוג תפירה'))].map(group=><div key={group}><h3 className="font-bold">{group}</h3>{selectedRows.filter(r=>(r.i.sewing_type??'ללא סוג תפירה')===group).map(({o,i})=><p key={i.id}>#{o.order_number} · {i.location} · {i.width_m} מ׳</p>)}</div>)}<label className="flex gap-2"><input type="checkbox" checked={reviewed} onChange={e=>setReviewed(e.target.checked)}/>בדקתי את פרטי הטיוטה</label></>:
            selectedOrders.map(o=><div key={o.id} className="border-b pb-2"><h3 className="font-bold">#{o.order_number} · {o.customer_name_snapshot}</h3>{(dialog.kind==='pickup'?executable(o).filter(i=>i.family==='curtain'):executable(o)).map(i=><p key={i.id}>{i.location} · {i.width_m} מ׳</p>)}</div>)}
          {dialog.kind==='pickup'&&<p>רוחב הפריט מוצג לבדיקה בלבד. אין כאן אישור למידת חיתוך מסילה.</p>}
          <button className="btn-primary" disabled={!selected.length} onClick={printPreview}>הדפס טיוטה / שמור כ־PDF</button>
          <button className="btn-ghost" disabled>{dialog.kind==='receipt'?'אשר קבלת סחורה':dialog.kind==='installer'?'אשר קבלת עבודת התקנה':dialog.kind==='pickup'?'אשר איסוף':'הודפס — הפעל הוראה'}</button>
          <p className="text-sm">{dialog.kind==='receipt'&&reviewed?'הסקירה הושלמה מקומית. ':''}האישור והשמירה אינם זמינים כעת. הדפסה לא משנה את מצב ההזמנה או הפריטים.</p>
        </>}
        <button className="btn-ghost" onClick={()=>setDialog(null)}>סגור</button>
      </div>
    </div>}
  </div>
}
