import { useNavigate } from 'react-router-dom'
import OrderActions, { ActionOrder } from './OrderActions'
import {
  ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, calcProgress, fmt,
} from '../../lib/statusHelpers'

type SortKey = 'order_number' | 'customer' | 'created_at' | 'total' | 'status'

interface Props {
  orders: (ActionOrder & { created_at: string })[]
  sortKey: SortKey
  sortAsc: boolean
  onSort: (key: SortKey) => void
  onPayment: (o: ActionOrder) => void
  onItemStatus: (o: ActionOrder) => void
  onAdvance: (o: ActionOrder) => void
}

export default function OrderTableView({
  orders, sortKey, sortAsc, onSort, onPayment, onItemStatus, onAdvance,
}: Props) {
  const navigate = useNavigate()

  const Th = ({ label, sk, className = '' }: { label: string; sk?: SortKey; className?: string }) => (
    <th className={`px-2 py-2 text-right font-semibold text-slate-600 whitespace-nowrap ${
      sk ? 'cursor-pointer hover:text-brand select-none' : ''
    } ${className}`}
        onClick={sk ? () => onSort(sk) : undefined}>
      {label}
      {sk && sortKey === sk && <span className="mr-1">{sortAsc ? '▲' : '▼'}</span>}
    </th>
  )

  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <Th label="#" sk="order_number" />
            <Th label="לקוח" sk="customer" />
            <Th label="פריטים" />
            <Th label="סכום" sk="total" />
            <Th label="סטטוס" sk="status" />
            <Th label="תאריך" sk="created_at" className="hidden sm:table-cell" />
            <Th label="פעולות" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {orders.map(o => {
            const paid = (o.payments ?? []).reduce((s, p) => s + p.amount, 0)
            const remaining = o.final_total - paid
            const prog = calcProgress(o.order_items)

            return (
              <tr key={o.id} className="hover:bg-slate-50">
                <td className="px-2 py-2 font-mono text-xs text-slate-500 whitespace-nowrap
                               cursor-pointer"
                    onClick={() => navigate(`/orders/${o.id}`)}>
                  {o.order_number ?? '—'}
                </td>

                <td className="px-2 py-2 cursor-pointer"
                    onClick={() => navigate(`/orders/${o.id}`)}>
                  <div className="font-medium truncate max-w-[140px]">
                    {o.customer_name_snapshot}
                  </div>
                  <div className="text-xs text-slate-400" dir="ltr">{o.phone_snapshot}</div>
                </td>

                <td className="px-2 py-2 whitespace-nowrap">
                  {prog.total > 0 ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${
                          prog.isComplete ? 'bg-green-500'
                          : prog.isPartial ? 'bg-amber-400'
                          : 'bg-slate-300'
                        }`} style={{ width: `${prog.percent}%` }} />
                      </div>
                      <span className={`text-xs ${
                        prog.isPartial ? 'text-amber-700 font-medium' : 'text-slate-500'
                      }`}>
                        {prog.done}/{prog.total}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-300">—</span>
                  )}
                </td>

                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="font-semibold">{fmt(o.final_total)}</div>
                  {remaining > 0 && (
                    <div className="text-xs text-amber-700">נשאר {fmt(remaining)}</div>
                  )}
                </td>

                <td className="px-2 py-2 whitespace-nowrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    ORDER_STATUS_COLORS[o.status] ?? 'bg-slate-100'
                  }`}>
                    {ORDER_STATUS_LABELS[o.status] ?? o.status}
                  </span>
                </td>

                <td className="px-2 py-2 text-xs text-slate-400 whitespace-nowrap hidden sm:table-cell">
                  {new Date(o.created_at).toLocaleDateString('he-IL')}
                </td>

                <td className="px-2 py-2">
                  <OrderActions order={o} compact
                                onPayment={() => onPayment(o)}
                                onItemStatus={() => onItemStatus(o)}
                                onAdvance={() => onAdvance(o)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
