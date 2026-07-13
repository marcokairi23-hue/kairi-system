import { ORDER_STATUS_LABELS, ITEM_STATUS_LABELS } from '../../lib/statusHelpers'

interface Props {
  orderNumber: number | string
  customerName: string
  newOrderStatus: string
  suggestedItemStatus: string
  itemCount: number
  onConfirm: (syncItems: boolean) => void
  onCancel: () => void
}

// דיאלוג: קידמת את ההזמנה — לעדכן גם את הפריטים?
export default function SyncItemsDialog({
  orderNumber, customerName, newOrderStatus, suggestedItemStatus, itemCount,
  onConfirm, onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
         onClick={onCancel}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm"
           onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-lg mb-1">עדכון פריטי ההזמנה</h3>
        <p className="text-sm text-slate-500 mb-4">
          הזמנה #{orderNumber} — {customerName}
        </p>

        <div className="bg-slate-50 rounded-lg p-4 mb-4 text-sm">
          <div className="mb-2">
            ההזמנה עוברת ל־
            <strong className="text-brand"> {ORDER_STATUS_LABELS[newOrderStatus]}</strong>
          </div>
          <div className="text-slate-600">
            לעדכן גם את {itemCount} הפריטים ל־
            <strong className="text-brand"> {ITEM_STATUS_LABELS[suggestedItemStatus]}</strong>?
          </div>
        </div>

        <div className="space-y-2">
          <button className="btn-primary w-full py-2.5"
                  onClick={() => onConfirm(true)}>
            כן, עדכן גם את הפריטים
          </button>
          <button className="btn-ghost w-full py-2.5"
                  onClick={() => onConfirm(false)}>
            לא, רק את ההזמנה
          </button>
          <button className="w-full text-sm text-slate-400 hover:text-slate-600 py-1"
                  onClick={onCancel}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
