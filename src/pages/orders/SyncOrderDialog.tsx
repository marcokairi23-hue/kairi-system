import { ORDER_STATUS_LABELS, ITEM_STATUS_LABELS } from '../../lib/statusHelpers'

interface Props {
  orderNumber: number | string
  customerName: string
  itemStatus: string
  suggestedOrderStatus: string
  itemCount: number
  onConfirm: () => void
  onCancel: () => void
}

// דיאלוג: כל הפריטים הגיעו לסטטוס X — לקדם את ההזמנה?
export default function SyncOrderDialog({
  orderNumber, customerName, itemStatus, suggestedOrderStatus, itemCount,
  onConfirm, onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">✓ כל הפריטים עודכנו</h3>
        <p className="text-sm text-slate-500 mb-4">
          הזמנה #{orderNumber} — {customerName}
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4 text-sm">
          <div className="mb-2 text-green-800">
            כל {itemCount} הפריטים בסטטוס
            <strong> {ITEM_STATUS_LABELS[itemStatus]}</strong>
          </div>
          <div className="text-slate-700">
            לסמן את ההזמנה כ־
            <strong className="text-brand"> {ORDER_STATUS_LABELS[suggestedOrderStatus]}</strong>?
          </div>
        </div>

        <div className="space-y-2">
          <button className="btn-primary w-full py-2.5" onClick={onConfirm}>
            כן, עדכן את ההזמנה
          </button>
          <button className="btn-ghost w-full py-2.5" onClick={onCancel}>
            לא, השאר כמו שזה
          </button>
        </div>
      </div>
    </div>
  )
}
