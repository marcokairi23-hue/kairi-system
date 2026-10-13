import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Bell, X } from 'lucide-react'
import { useFeature } from '../lib/featureFlags'
import { useAuth } from '../lib/auth'
import { useDialogFocus } from '../lib/useDialogFocus'
import { useProductionNotifications } from '../lib/useProductionNotifications'
import { ProductionTask, productionTaskLabel, productionTaskPath, TASK_CLOSE_REASONS } from '../lib/productionNotifications'
import { ITEM_ROUTE_LABELS, getItemRoute, SHADING_LABELS } from '../lib/statusHelpers'

const time = (value: string) => new Date(value).toLocaleString('he-IL',{ timeZone:'Asia/Jerusalem',dateStyle:'short',timeStyle:'short' })

function NotificationPanel({ notifications,state,onState,onMore,onClose,onOpen,canOpen }: {
  notifications: ReturnType<typeof useProductionNotifications>
  state:'active' | 'history'
  onState:(state:'active' | 'history') => void
  onMore:() => void
  onClose:() => void
  onOpen:(task:ProductionTask) => Promise<void>
  canOpen:(task:ProductionTask) => boolean
}) {
  const dialog=useRef<HTMLDivElement>(null)
  useDialogFocus(dialog,onClose)
  const { feed,loading,error,reading,read,refresh }=notifications
  return createPortal(<div className="fixed inset-0 z-50 bg-black/30 flex items-start justify-end px-3 pt-16 pb-3 sm:px-4" onClick={onClose}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="notification-title"
      className="bg-white text-slate-900 rounded-2xl shadow-xl w-full sm:max-w-lg max-h-[calc(100dvh-5rem)] flex flex-col overflow-hidden"
      onClick={event => event.stopPropagation()}>
      <div className="p-4 border-b shrink-0">
        <div className="flex items-center justify-between gap-3">
          <h2 id="notification-title" className="font-bold text-lg">משימות ייצור</h2>
          <button className="btn-ghost p-2" aria-label="סגור התראות" onClick={onClose}><X size={18} aria-hidden="true" /></button>
        </div>
        <p className="text-sm text-slate-600" aria-live="polite">{feed.active_total} משימות פעילות · {feed.unread_active} פעילות שלא נקראו</p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <button aria-pressed={state==='active'} className={state==='active' ? 'btn-primary text-sm' : 'btn-ghost text-sm'} onClick={() => onState('active')}>פעילות</button>
          <button aria-pressed={state==='history'} className={state==='history' ? 'btn-primary text-sm' : 'btn-ghost text-sm'} onClick={() => onState('history')}>הושלמו ובוטלו</button>
          <button className="btn-ghost text-sm ms-auto" disabled={loading} onClick={refresh}>רענן התראות</button>
        </div>
      </div>
      {error && <div role="alert" className="p-3 text-sm text-red-600 border-b">{error}</div>}
      {loading && <div role="status" className="px-4 py-2 text-sm text-slate-500">טוען התראות...</div>}
      <div className="min-h-0 overflow-y-auto flex-1 divide-y" data-testid="notifications-list">
        {!loading && !feed.tasks.length && <p className="p-6 text-center text-slate-500 text-sm">{state==='active' ? 'אין משימות ייצור פעילות.' : 'אין משימות בהיסטוריה.'}</p>}
        {feed.tasks.map(task => <article key={task.id} data-task-id={task.id} className={`p-4 break-words ${!task.first_read_at && task.status==='active' ? 'bg-brand-light' : ''}`}>
          <div className="flex gap-2 flex-wrap items-center mb-1">
            <strong className="text-sm">{productionTaskLabel(task)}</strong>
            <span className="text-xs text-slate-500">{ITEM_ROUTE_LABELS[getItemRoute(task.family)]}</span>
            <span className="text-xs text-slate-500 ms-auto">{task.first_read_at ? 'נקראה' : 'טרם נקראה'}</span>
          </div>
          <p className="text-sm">הזמנה #{task.order_number ?? '—'} · {task.customer_name_snapshot}</p>
          <p className="text-sm text-slate-600">{task.family==='curtain' ? 'וילון' : SHADING_LABELS[task.subtype ?? ''] ?? task.subtype ?? 'הצללה'} · {task.item_location}</p>
          <p className="text-xs text-slate-500 mt-1">נוצרה {time(task.created_at)} · זמינה לך {time(task.available_at)}</p>
          {task.first_read_at && <p className="text-xs text-slate-500">נקראה לראשונה {time(task.first_read_at)}</p>}
          {task.status!=='active' && <p className={`text-xs mt-2 ${task.status==='completed' ? 'text-green-700' : 'text-slate-600'}`}>
            {task.status==='completed' ? 'בוצעה' : `בוטלה · ${TASK_CLOSE_REASONS[task.close_reason ?? ''] ?? 'מצב הפריט השתנה'}`}
            {' · '}{task.closed_by_name ?? 'מערכת'}{task.closed_at && ` · ${time(task.closed_at)}`}
          </p>}
          <div className="flex gap-2 flex-wrap mt-3">
            {task.order_id && <button className="btn-ghost text-sm" disabled={!!reading || !canOpen(task)} onClick={() => { void onOpen(task) }}>פתח משימה · {task.item_location}</button>}
            {!task.first_read_at && <button className="btn-ghost text-sm" disabled={!!reading} onClick={() => { void read(task) }}>סמן כנקראה · {task.item_location}</button>}
          </div>
          {!canOpen(task) && <p className="text-xs text-slate-500 mt-1">אין הרשאת כניסה למסך המשימה.</p>}
        </article>)}
      </div>
      {feed.has_more && <div className="p-3 border-t shrink-0"><button className="btn-ghost w-full text-sm" disabled={loading} onClick={onMore}>טען עוד משימות</button></div>}
    </div>
  </div>,document.body)
}

export default function ProductionNotificationBell() {
  const { profile }=useAuth()
  const navigate=useNavigate()
  const production=useFeature('production'), items=useFeature('items'), orderDetail=useFeature('orderDetail')
  const [open,setOpen]=useState(false)
  const [state,setState]=useState<'active' | 'history'>('active')
  const [count,setCount]=useState(50)
  const notifications=useProductionNotifications(open,state,count)
  if (!notifications.enabled) return null
  const access={ production:production && ['admin','office'].includes(profile?.role ?? ''),items,orderDetail }
  const openTask = async (task:ProductionTask) => {
    const path=productionTaskPath(task,access)
    if (!path || !await notifications.read(task)) return
    setOpen(false)
    navigate(path)
  }
  return <>
    <button className="relative rounded-md p-2 hover:bg-white/10 shrink-0" aria-haspopup="dialog" aria-expanded={open}
      aria-label={`התראות ייצור, ${notifications.feed.unread_active} פעילות שלא נקראו`}
      onClick={() => { if (!open) { setState('active'); setCount(50) }; setOpen(!open) }}>
      <Bell size={20} aria-hidden="true" />
      {notifications.feed.unread_active>0 && <span className="absolute -top-1 -right-1 rounded-full bg-red-600 text-white text-[10px] min-w-4 px-1 text-center">{notifications.feed.unread_active}</span>}
      {notifications.error && <span className="absolute top-0 right-0 rounded-full bg-amber-400 text-slate-900 text-[10px] px-1" aria-label="שגיאה בטעינת התראות">!</span>}
    </button>
    {open && <NotificationPanel notifications={notifications} state={state} onState={next => { setState(next); setCount(50) }}
      canOpen={task => productionTaskPath(task,access)!==null}
      onMore={() => setCount(previous => previous+50)} onClose={() => setOpen(false)} onOpen={openTask} />}
  </>
}
