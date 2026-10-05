import { supabase } from './supabase'
import { deriveV1OrderStatus } from './statusHelpers'

export async function recalculateOrderStatus(orderId: string, changedBy: string | null) {
  const { data, error } = await supabase.from('orders')
    .select('status, payment_approved, final_total, order_items(item_status, for_execution), payments(amount)')
    .eq('id', orderId).single()
  if (error) throw error
  if (!data) throw new Error('ההזמנה לא נמצאה לצורך חישוב סטטוס')
  const status = deriveV1OrderStatus(data)
  if (status === data.status) return status
  const { error: updateError } = await supabase.from('orders').update({ status }).eq('id', orderId)
  if (updateError) throw updateError
  const { error: historyError } = await supabase.from('order_status_history').insert({
    order_id: orderId, from_status: data.status, to_status: status,
    changed_by: changedBy, note: 'חישוב סטטוס הזמנה לפי פריטי ביצוע, אישור תשלום ויתרה',
  })
  if (historyError) throw historyError
  return status
}
