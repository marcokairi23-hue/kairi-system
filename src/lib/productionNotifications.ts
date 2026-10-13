import { supabase } from './supabase'

export interface ProductionTask {
  id: string
  order_id: string | null
  order_item_id: string | null
  item_key: string
  instance_no: number
  previous_task_id: string | null
  family: string
  subtype: string | null
  item_location: string
  from_status: string
  target_status: string
  status: 'active' | 'completed' | 'cancelled'
  created_at: string
  available_at: string
  first_read_at: string | null
  closed_at: string | null
  closed_by: string | null
  closed_by_name: string | null
  close_reason: string | null
  order_number: number | null
  customer_name_snapshot: string
  cursor_at: string
}

export interface NotificationFeed {
  tasks: ProductionTask[]
  active_total: number
  unread_active: number
  has_more: boolean
}

export const PRODUCTION_REFRESH_EVENT = 'production-data-changed'
export const NOTIFICATION_REFRESH_MS = 30_000
export const emptyNotificationFeed: NotificationFeed = { tasks:[], active_total:0, unread_active:0, has_more:false }

export function productionTaskPath(task: ProductionTask, access: { production:boolean; items:boolean; orderDetail:boolean }): string | null {
  if (!task.order_id) return null
  // Production/items list only active orders. History must use the unrestricted
  // order-detail view, with its existing screen permission and order RLS.
  const history = task.status !== 'active' || !task.order_item_id || task.close_reason === 'item_deleted'
  const path = history ? (access.orderDetail ? `/orders/${task.order_id}` : null)
    : access.production ? `/production?order=${task.order_id}`
    : access.items ? `/items?order=${task.order_id}`
    : access.orderDetail ? `/orders/${task.order_id}` : null
  if (!path) return null
  return task.order_item_id && task.close_reason !== 'item_deleted' ? `${path}#item-${task.order_item_id}` : path
}

export async function fetchProductionNotifications(state: 'active' | 'history', count: number, signal: AbortSignal): Promise<NotificationFeed> {
  const tasks: ProductionTask[] = []
  let cursor: ProductionTask | undefined, result = emptyNotificationFeed
  do {
    const { data, error } = await supabase.rpc('production_notifications_v1', {
      p_state:state, p_limit:Math.min(100,count-tasks.length),
      p_before:cursor?.cursor_at ?? null, p_before_id:cursor?.id ?? null,
    }).abortSignal(signal)
    if (error) throw error
    result = data as NotificationFeed
    if (!result || !Array.isArray(result.tasks)) throw new Error('תשובת התראות אינה תקינה')
    tasks.push(...result.tasks)
    cursor = tasks[tasks.length-1]
  } while (result.has_more && result.tasks.length && tasks.length<count)
  return { ...result,tasks }
}

export function productionTaskLabel(task: Pick<ProductionTask,'family' | 'from_status'>): string {
  if (task.from_status==='new') return task.family==='curtain' ? 'גזירת וילון · העבר להכנה' : 'הוצאה לטיפול · העבר להכנה'
  if (task.from_status==='preparation') return 'סמן כמוכן'
  return 'סמן כהושלם'
}

export const TASK_CLOSE_REASONS: Record<string,string> = {
  item_deleted:'הפריט הוסר', order_deleted:'ההזמנה הוסרה', item_cancelled:'הפריט בוטל',
  order_cancelled:'ההזמנה בוטלה', removed_from_execution:'הפריט הוצא מביצוע',
  payment_not_approved:'אין אישור פיננסי', order_inactive:'ההזמנה אינה פעילה לייצור',
  issue_open:'טיפול פתוח מונע השלמה', no_next_transition:'אין מעבר נוסף', state_changed:'מצב הפריט השתנה',
}
