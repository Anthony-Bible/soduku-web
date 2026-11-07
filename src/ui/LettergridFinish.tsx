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

/** Shown once the last Play is made. A Lettergrid Daily is solved whatever the score; the stars are extra. */
export function LettergridFinish({ session, result, onHome }: { session: LettergridSession; result: LettergridResult; onHome: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  const reduceMotion = usePrefersReducedMotion()
  const { controller, today } = useApp()
  const streak = session.day === today ? controller.profile.lettergridStreak(today) : 0
  const share = useShareText((url) =>
    lettergridShareText({ day: session.day, plays: result.plays, score: result.score, stars: result.stars, streak, url }),
  )
  const tiers: readonly number[] = session.state.par.tiers
  const nextTier: number | undefined = tiers[result.stars]
  const next = nextTier === undefined ? 0 : nextTier - result.score
  return (
    <div className="modal-backdrop win">
      <div className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Daily Puzzle Solved!">
        <span className="trophy"><Icon name="trophy" size={52} /></span>
        <h2>Daily Puzzle Solved!</h2>
        <div className="muted win-details">
          <div>Lettergrid · {shortTitle(session.day)}</div>
          <div className="tabular">Score {result.score}</div>
          <div className="lg-stars" aria-label={starsWords(result.stars)}>
            {[1, 2, 3].map((n) => (
              <span key={n} className={n <= result.stars ? 'on' : 'off'} aria-hidden="true">★</span>
            ))}
          </div>
          {next > 0 && <div className="tabular">{next} more for {starsText(result.stars + 1)}</div>}
        </div>
        <div className="col-buttons">
          {share.button}
          <button type="button" className="btn btn-primary" onClick={onHome} autoFocus>
            Home
          </button>
        </div>
        {share.message}
      </div>
      {!reduceMotion && result.stars > 0 && <Confetti />}
    </div>
  )
}
