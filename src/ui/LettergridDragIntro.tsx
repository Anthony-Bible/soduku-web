import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { usePrefersReducedMotion } from './hooks'

/** How many times the tile glides before the caption is left on its own. */
const GLIDES = 3
const GLIDE_MS = 2200

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * The Feature Intro for dragging Lettergrid tiles: a caption with a close button and, unless the player
 * prefers reduced motion, a ghost of a Rack tile gliding onto an empty square a few times. Finishing it
 * (placing a tile, or closing it) is the caller's job.
 */
export function LettergridDragIntro({ boardRef, rackRef, rackIndex, letter, value, toCell, glide, onClose }: {
  boardRef: RefObject<HTMLElement | null>
  rackRef: RefObject<HTMLElement | null>
  /** The Rack tile the ghost starts from, and its letter and points. */
  rackIndex: number
  letter: string
  value: number
  /** The empty square the ghost glides to. */
  toCell: number
  /** False while something else is going on (a real drag), so the ghost stays out of the way. */
  glide: boolean
  onClose: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const ghostRef = useRef<HTMLDivElement>(null)
  const animate = glide && !reduced

  useEffect(() => {
    if (!animate) return
    let cancelled = false
    let anim: Animation | null = null
    void (async () => {
      for (let i = 0; i < GLIDES && !cancelled; i++) {
        await sleep(i === 0 ? 500 : 900)
        const ghost = ghostRef.current
        const from = rackRef.current?.children[rackIndex]?.getBoundingClientRect()
        const to = boardRef.current?.querySelector(`[data-p="${toCell}"]`)?.getBoundingClientRect()
        if (cancelled || !ghost || !from || !to || typeof ghost.animate !== 'function') return
        const size = to.width
        ghost.style.setProperty('--size', `${size * 9}px`)
        const at = (r: DOMRect) => `translate(${r.left + r.width / 2 - size / 2}px, ${r.top + r.height / 2 - size / 2}px)`
        anim = ghost.animate(
          [
            { transform: `${at(from)} scale(1)`, opacity: 0 },
            { transform: `${at(from)} scale(1.12)`, opacity: 0.95, offset: 0.15 },
            { transform: `${at(to)} scale(1.12)`, opacity: 0.95, offset: 0.65 },
            { transform: `${at(to)} scale(1)`, opacity: 0.95, offset: 0.78 },
            { transform: `${at(to)} scale(1)`, opacity: 0 },
          ],
          { duration: GLIDE_MS, easing: 'ease-in-out', fill: 'both' },
        )
        await anim.finished.catch(() => undefined)
      }
    })()
    return () => {
      cancelled = true
      anim?.cancel()
    }
  }, [animate, boardRef, rackRef, rackIndex, toCell])

  return (
    <>
      <div className="lg-intro" role="note">
        <span>Drag tiles onto the board</span>
        <button type="button" className="lg-intro-close" aria-label="Dismiss tip" onClick={onClose}>
          ×
        </button>
      </div>
      {animate &&
        createPortal(
          <div ref={ghostRef} className="lg-intro-ghost" aria-hidden="true" style={{ opacity: 0 } as CSSProperties}>
            <span className="lg-letter">{letter.toUpperCase()}</span>
            <span className="lg-value">{value}</span>
          </div>,
          document.body,
        )}
    </>
  )
}
