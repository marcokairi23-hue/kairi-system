import { calcItemsTotal, calcTotalWidth, type OrderForm, type PaymentRoute } from './types'

// Storage uploads are deliberately excluded from the database transaction.
export function orderCreationPayload(form: OrderForm, route: PaymentRoute) {
  const { signatureDataUrl, agentSignatureDataUrl, ...details } = form
  return {
    ...details,
    curtain_items: form.curtain_items.map(({ id, db_id, ...item }) => ({
      ...item, for_execution: route !== 'quote' && item.for_execution,
    })),
    shading_items: form.shading_items.map(({ id, db_id, routing_state, ...item }) => ({
      ...item, for_execution: route !== 'quote' && item.for_execution,
    })),
    payment_route: route,
    paid_on_account: route === 'quote' ? '0' : form.paid_on_account,
    items_total: calcItemsTotal(form),
    total_width_m: calcTotalWidth(form),
  }
}

export interface CreatedOrder { id: string; order_number: number }

export function requireCreatedOrder(value: unknown): CreatedOrder {
  const row = value as Partial<CreatedOrder> | null
  if (!row || typeof row.id !== 'string' || !Number.isInteger(row.order_number)) {
    throw new Error('לא התקבל אישור שמירה תקין. יש לנסות שוב באותו טופס, ללא שינוי הפרטים.')
  }
  return row as CreatedOrder
}
