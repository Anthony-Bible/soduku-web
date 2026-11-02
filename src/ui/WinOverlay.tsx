import { useRef } from 'react'
import { useFocusTrap } from './useFocusTrap'
import { achievementInfo, displayName, shortTitle, type GameSession } from '../core'
import { Confetti } from './Confetti'
import { Icon, groupIcon } from './Icon'
import { formatElapsed } from './format'
import { usePrefersReducedMotion } from './hooks'

export function WinOverlay({ session, onNewGame, onHome }: { session: GameSession; onNewGame: () => void; onHome: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  const reduceMotion = usePrefersReducedMotion()
  const s = session.state
  const result = session.solveResult
  return (
    <div className="modal-backdrop win">
      <div className="modal" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Puzzle Solved!">
        <span className="trophy"><Icon name="trophy" size={52} /></span>
        <h2>Puzzle Solved!</h2>
        {result?.isNewBest && <p className="accent"><strong>New best!</strong></p>}
        <div className="muted win-details">
          {session.dailyDay !== null && <div>Daily Puzzle · {shortTitle(session.dailyDay)}</div>}
          <div>{displayName(s.difficulty)}</div>
          <div className="tabular">Time {formatElapsed(s.elapsedSeconds)}</div>
          <div>Mistakes {s.mistakes} · Hints used {s.hintsUsed}</div>
        </div>
        {result && result.unlocked.length > 0 && (
          <div className="unlocked" aria-label="Achievements unlocked">
            <small>Achievement Unlocked</small>
            {result.unlocked.map((id) => {
              const a = achievementInfo(id)
              return (
                <div key={id}>
                  <Icon name={groupIcon(a.group)} size={16} /> <strong>{a.title}</strong>
                </div>
              )
            })}
          </div>
        )}
        <div className="col-buttons">
          <button type="button" className="btn btn-primary" onClick={onNewGame} autoFocus>
            New Game
          </button>
          <button type="button" className="btn" onClick={onHome}>
            Home
          </button>
        </div>
      </div>
      {!reduceMotion && <Confetti />}
    </div>
  )
}
