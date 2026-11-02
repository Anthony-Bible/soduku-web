import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

interface ModalEntry {
  el: () => HTMLElement | null
  onBack?: () => void
}
const stack: ModalEntry[] = []

/** True when `entry` is the topmost open modal. */
const isTop = (entry: ModalEntry) => stack[stack.length - 1] === entry
const syncInert = () => {
  stack.forEach((m, i) => {
    const el = m.el()
    if (el) el.inert = i !== stack.length - 1
  })
}

/** Closes the topmost modal that handles Back; returns whether one did. */
export function closeTopModalOnBack(): boolean {
  const top = stack[stack.length - 1]
  if (!top?.onBack) return false
  top.onBack()
  return true
}

/** Keeps Tab / Shift+Tab inside `ref` while mounted, including when focus has strayed outside it. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, onBack?: () => void): void {
  const backRef = useRef(onBack)
  useEffect(() => {
    backRef.current = onBack
  })
  const hasBack = onBack !== undefined
  useEffect(() => {
    const entry: ModalEntry = { el: () => ref.current, onBack: hasBack ? () => backRef.current?.() : undefined }
    const node = ref.current
    stack.push(entry)
    syncInert()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !isTop(entry)) return
      const root = ref.current
      if (!root) return
      const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) {
        e.preventDefault()
        root.focus()
        return
      }
      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      if (!active || !root.contains(active) || active === root) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      const i = stack.indexOf(entry)
      if (i >= 0) stack.splice(i, 1)
      if (node) node.inert = false
      syncInert()
    }
  }, [ref, hasBack])
}

/** Whether Escape should be handled by the given modal ref's owner (no confirm open above it). */
export function noModalAbove(ref: RefObject<HTMLElement | null>): boolean {
  const i = stack.findIndex((m) => m.el() === ref.current)
  return i < 0 || i === stack.length - 1
}
