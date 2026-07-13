import { Link } from 'react-router-dom'
import OrderActions, { ActionOrder } from './OrderActions'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, calcProgress, fmt,
} from '../../lib/statusHelpers'

interface Props {
  orders: (ActionOrder & { created_at: string })[]
  onPayment: (o: ActionOrder) => void
  onItemStatus: (o: ActionOrder) => void
  onAdvance: (o: ActionOrder) => void
}

export default function OrderCardView({ orders, onPayment, onItemStatus, onAdvance }: Props) {
  return (
    <div className="space-y-3">
      {orders.map(o => {
        const paid = (o.payments ?? []).reduce((s, p) => s + p.amount, 0)
        const remaining = o.final_total - paid
        const prog = calcProgress(o.order_items)

        return (
          <div key={o.id} className="card p-4">
            <Link to={`/orders/${o.id}`} className="block">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-base">{o.customer_name_snapshot}</div>
                  <div className="text-sm text-slate-500">{o.phone_snapshot}</div>
                  {o.profiles?.full_name && (
                    <div className="text-xs text-slate-400">סוכן: {o.profiles.full_name}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    ORDER_STATUS_COLORS[o.status] ?? 'bg-slate-100'
                  }`}>
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                  {o.order_number && (
                    <span className="text-xs text-slate-400">#{o.order_number}</span>
                  )}
                </div>
              </div>

              {/* פס התקדמות */}
              {prog.total > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className={
                      prog.isComplete ? 'text-green-700 font-medium'
                      : prog.isPartial ? 'text-amber-700 font-medium'
                      : 'text-slate-500'
                    }>
                      {prog.isPartial && '⚠️ '}{prog.label}
                    </span>
                    <span className="text-slate-400">{prog.percent}%</span>
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${
                      prog.isComplete ? 'bg-green-500'
                      : prog.isPartial ? 'bg-amber-400'
                      : 'bg-slate-300'
                    }`} style={{ width: `${prog.percent}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-4 mt-3 text-sm">
                <div>
                  <span className="text-slate-500">סה״כ: </span>
                  <span className="font-semibold">{fmt(o.final_total)}</span>
                </div>
                {paid > 0 && (
                  <div>
                    <span className="text-slate-500">שולם: </span>
                    <span className="text-green-700 font-medium">{fmt(paid)}</span>
                  </div>
                )}
                {remaining > 0 && (
                  <div>
                    <span className="text-slate-500">נשאר: </span>
                    <span className="text-amber-700 font-medium">{fmt(remaining)}</span>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400 mt-1">
                {new Date(o.created_at).toLocaleDateString('he-IL')}
              </div>
            </Link>

            <OrderActions order={o}
                          onPayment={() => onPayment(o)}
                          onItemStatus={() => onItemStatus(o)}
                          onAdvance={() => onAdvance(o)} />
          </div>
        )
      })}
    </div>
  )
}
