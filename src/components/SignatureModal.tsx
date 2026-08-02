import { useEffect, useState } from 'react'
import SignaturePad from './SignaturePad'

interface SignatureModalProps {
  open: boolean
  title: string
  value: string | null | undefined
  onSave: (dataUrl: string | null) => void
  onClose: () => void
}

export default function SignatureModal({ open, title, value, onSave, onClose }: SignatureModalProps) {
  const [draft, setDraft] = useState<string | null>(value ?? null)

  useEffect(() => {
    if (open) setDraft(value ?? null)
  }, [open, value])

  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
        <h3 className="font-bold text-lg mb-3">{title}</h3>
        <SignaturePad value={draft} onChange={setDraft} hideActions />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!draft}
            onClick={() => { onSave(draft); onClose() }}
          >
            שמור חתימה
          </button>
          <button type="button" className="btn-ghost flex-1" onClick={() => setDraft(null)}>
            אפס
          </button>
        </div>
        <button type="button" className="btn-ghost w-full mt-2 text-sm" onClick={onClose}>
          ביטול
        </button>
      </div>
    </div>
  )
}
