import { useRef } from 'react'
import { shortTitle } from '../core'
import { useApp } from '../app/AppContext'
import type { LettergridResult, LettergridSession } from '../app/lettergridSession'
import { Confetti } from './Confetti'
import { Icon } from './Icon'
import { starsText, starsWords } from './format'
import { usePrefersReducedMotion } from './hooks'
import { lettergridShareText } from './share'
import { useFocusTrap } from './useFocusTrap'
import { useShareText } from './useShare'

interface Props {
  session: LettergridSession
  result: LettergridResult
  onHome: () => void
  /** Puts the overlay away to show the final board. */
  onViewBoard: () => void
  /** Plays the day again from the start, for practice. */
  onPlayAgain: () => void
}

/**
 * Shown once the last Play is made. A Lettergrid Daily is solved whatever the score; the stars are extra. A
 * practice replay shows its own score next to the one that counts, and has no Share.
 */
export function LettergridFinish({ session, result, onHome, onViewBoard, onPlayAgain }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  const reduceMotion = usePrefersReducedMotion()
  const { controller, today } = useApp()
  const practice = session.practice
  const counted = practice ? controller.profile.lettergridSolve(session.day) : null
  const streak = session.day === today ? controller.profile.lettergridStreak(today) : 0
  const share = useShareText((url) =>
    lettergridShareText({ day: session.day, plays: result.plays, score: result.score, stars: result.stars, streak, url }),
  )
  const tiers: readonly number[] = session.state.par.tiers
  const nextTier: number | undefined = tiers[result.stars]
  const next = nextTier === undefined ? 0 : nextTier - result.score
  return (
    <div className="modal-backdrop win">
      <div className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={practice ? 'Practice Finished' : 'Daily Puzzle Solved!'}>
        <span className="trophy"><Icon name="trophy" size={52} /></span>
        <h2>{practice ? 'Practice Finished' : 'Daily Puzzle Solved!'}</h2>
        <div className="muted win-details">
          <div>Lettergrid · {shortTitle(session.day)}</div>
          <div className="tabular">Score {result.score}</div>
          <div className="lg-stars" aria-label={starsWords(result.stars)}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= result.stars ? 'on' : 'off'} aria-hidden="true">★</span>
            ))}
          </div>
          {next > 0 && <div className="tabular">{next} more for {starsText(result.stars + 1)}</div>}
          {counted && <div className="tabular">Counted score for this day: {counted.score}. Practice never changes it.</div>}
        </div>
        <div className="col-buttons">
          {!practice && share.button}
          <button type="button" className="btn" onClick={onViewBoard}>
            View board
          </button>
          <button type="button" className="btn" onClick={onPlayAgain}>
            Play again
          </button>
          <button type="button" className="btn btn-primary" onClick={onHome} autoFocus>
            Home
          </button>
        </div>
        {!practice && share.message}
      </div>
      {!reduceMotion && result.stars > 0 && <Confetti />}
    </div>
  )
}
