import { useEffect, useRef, type ReactNode } from 'react'
import { noModalAbove, useFocusTrap } from './useFocusTrap'

/** A modal panel that slides over the page. Escape or Done closes it; focus moves into it on open. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  useFocusTrap(ref)
  useEffect(() => {
    closeRef.current = onClose
  })
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && noModalAbove(ref)) closeRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])
  return (
    <div className="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="sheet-header">
          <h2>{title}</h2>
          <button type="button" className="btn-text" onClick={onClose}>
            Done
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
