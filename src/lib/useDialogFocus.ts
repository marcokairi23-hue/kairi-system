import { RefObject, useEffect, useRef } from 'react'

// One focus lifecycle for print and notification dialogs, including nested use.
export function useDialogFocus(dialog: RefObject<HTMLElement>, onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const container = dialog.current
    if (!container) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const controls = () => Array.from(container.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0)
    ;(controls()[0] ?? container).focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return }
      if (event.key !== 'Tab') return
      const elements = controls(), first = elements[0], last = elements[elements.length - 1]
      if (!first || !last) { event.preventDefault(); container.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !container.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !container.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    container.addEventListener('keydown',keydown)
    const keepFocus = (event: FocusEvent) => {
      if (!container.contains(event.target as Node)) (controls()[0] ?? container).focus()
    }
    document.addEventListener('focusin',keepFocus)
    return () => {
      container.removeEventListener('keydown',keydown)
      document.removeEventListener('focusin',keepFocus)
      document.body.style.overflow = previousOverflow
      if (opener?.isConnected) opener.focus()
    }
  }, [dialog])
}
