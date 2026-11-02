import { useEffect, useRef, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useFocusTrap } from './useFocusTrap'

interface Props {
  title: string
  message: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

/** Modal confirm: focuses Cancel, closes on Escape, traps Tab, and returns focus to the trigger on close. */
export function ConfirmDialog({ title, message, confirmLabel, onCancel, onConfirm }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref, onCancel)
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null
    cancelRef.current?.focus()
    return () => {
      if (trigger && trigger.isConnected) trigger.focus()
    }
  }, [])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
      return
    }
  }

  return createPortal(
    <div className="modal-backdrop">
      <div ref={ref} className="modal" role="alertdialog" aria-modal="true" aria-label={title} onKeyDown={onKeyDown}>
        <h2>{title}</h2>
        <p className="muted">{message}</p>
        <div className="row-buttons">
          <button ref={cancelRef} type="button" className="btn grow" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-danger grow" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
