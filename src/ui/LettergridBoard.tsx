import { useMemo, useState } from 'react'
import { longTitle, type CalendarDay } from '../core'
import { useApp } from '../app/AppContext'
import {
  PLAYS_PER_DAILY,
  boardFrame,
  colOf,
  letterValuesFor,
  rowOf,
  wordListVersionFor,
  type Bonus,
  type LettergridBoard,
} from '../core/lettergrid'
import { Sheet } from './Sheet'
import { starsText, starsWords } from './format'

const BONUS_SHORT: Record<Exclude<Bonus, null>, string> = { L2: 'L×2', L3: 'L×3', W2: 'W×2', W3: 'W×3' }

/** Words for what Play `step` (1-based) did, from the per-Play scores; null is a Swap. */
function stepText(step: number, plays: readonly (number | null)[]): string {
  if (step === 0) return 'Start: the Seed Word'
  const p = plays[step - 1]
  return `Play ${step} of ${PLAYS_PER_DAILY}: ${p === null || p === undefined ? 'Swap' : `+${p}`}`
}

/**
 * A Final Board, read-only, that can be stepped through Play by Play from the opening grid. Starts on the
 * final board.
 */
export function BoardSteps({ board, plays, wordListVersion }: { board: LettergridBoard; plays: readonly (number | null)[]; wordListVersion: number }) {
  const [step, setStep] = useState(PLAYS_PER_DAILY)
  const frame = useMemo(() => boardFrame(board, step), [board, step])
  const values = useMemo(() => letterValuesFor(wordListVersion), [wordListVersion])
  const scoreSoFar = plays.slice(0, step).reduce<number>((n, p) => n + (p ?? 0), 0)
  return (
    <div className="lg-steps">
      <div className="lg-steps-board">
        <div className="lg-board" role="img" aria-label={`Lettergrid board after ${step} of ${PLAYS_PER_DAILY} Plays`}>
          {frame.grid.map((letter, cell) => {
            const bonus = frame.bonuses[cell]
            const classes = ['lg-cell']
            if (bonus) classes.push(`bonus-${bonus}`)
            if (letter !== null) classes.push('tile')
            if (frame.seedCells.has(cell)) classes.push('seed')
            if (frame.placed.has(cell)) classes.push('last-play')
            return (
              <div key={cell} className={classes.join(' ')} data-p={cell} title={`Row ${rowOf(cell) + 1}, column ${colOf(cell) + 1}`}>
                {letter !== null ? (
                  <>
                    <span className="lg-letter">{letter.toUpperCase()}</span>
                    <span className="lg-value">{values[letter] ?? 0}</span>
                  </>
                ) : bonus ? (
                  <span className="lg-bonus">{BONUS_SHORT[bonus]}</span>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      <p className="lg-steps-text tabular" role="status">
        {stepText(step, plays)} · Score {scoreSoFar}
      </p>
      <div className="row-buttons">
        <button type="button" className="btn" disabled={step === 0} onClick={() => setStep(0)} aria-label="First: the opening grid">
          ⏮
        </button>
        <button type="button" className="btn grow" disabled={step === 0} onClick={() => setStep(step - 1)}>
          Previous
        </button>
        <button type="button" className="btn grow" disabled={step === PLAYS_PER_DAILY} onClick={() => setStep(step + 1)}>
          Next
        </button>
        <button type="button" className="btn" disabled={step === PLAYS_PER_DAILY} onClick={() => setStep(PLAYS_PER_DAILY)} aria-label="Last: the final board">
          ⏭
        </button>
      </div>
    </div>
  )
}

/** A solved day's Final Board (its counted solve's), stepped through Play by Play, with a way to play the day again. */
export function LettergridBoardSheet() {
  const { controller, lettergridBoard } = useApp()
  const day: CalendarDay | null = lettergridBoard?.day ?? null
  const solve = day === null ? null : controller.profile.lettergridSolve(day)
  return (
    <Sheet title="Lettergrid Board" onClose={() => controller.closeLettergridBoard()}>
      {day !== null && solve && (
        <section aria-label="Final board">
          <h3>{longTitle(day)}</h3>
          <p className="tabular">
            Score {solve.score} · <span aria-label={starsWords(solve.stars)}>{solve.stars > 0 ? starsText(solve.stars) : 'No stars'}</span>
          </p>
          {solve.board ? (
            <BoardSteps board={solve.board} plays={solve.plays} wordListVersion={wordListVersionFor(day)} />
          ) : (
            <p className="muted">This day was solved before boards were saved, so its board can't be shown.</p>
          )}
          <PlayAgainButton day={day} />
        </section>
      )}
    </Sheet>
  )
}

/** Replays a solved day from the start (ADR 0004), or continues a Replay already under way. */
export function PlayAgainButton({ day, primary = false }: { day: CalendarDay; primary?: boolean }) {
  const { controller } = useApp()
  return (
    <button type="button" className={`btn${primary ? ' btn-primary' : ''}`} onClick={() => controller.openLettergridDay(day)}>
      {controller.profile.hasLettergridInProgress(day) ? 'Continue' : 'Play again'}
    </button>
  )
}
