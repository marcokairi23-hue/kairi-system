export type PaymentStatus = 'pending' | 'received' | 'rejected'
export type PaymentRouteCode = 'cash' | 'check' | 'credit_card' | 'bank_transfer'

export interface PaymentRecord {
  id: string
  order_id?: string
  amount: number
  method: string | null
  payment_route: PaymentRouteCode | null
  payment_status: PaymentStatus
  recorded_by: string | null
  requested_at: string
  received_by: string | null
  paid_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  updated_at: string
}

interface PaymentAmountLike {
  amount: number
  payment_status?: PaymentStatus | string | null
}

// Migration 0015 backfills historical rows. Unknown/missing status is not proof of receipt.
export function isReceivedPayment(payment: PaymentAmountLike): boolean {
  return payment.payment_status === 'received'
}

export function sumReceivedPayments(payments: PaymentAmountLike[] = []): number {
  return payments
    .filter(isReceivedPayment)
    .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
}
