import { useRef, useState } from 'react'
import { useApp } from '../app/AppContext'
import { useFocusTrap } from './useFocusTrap'
import { achievementInfo, displayName, shortTitle, type GameSession } from '../core'
import { Confetti } from './Confetti'
import { Icon, groupIcon } from './Icon'
import { formatElapsed } from './format'
import { usePrefersReducedMotion } from './hooks'
import { canShare, shareResult, shareText, type ShareOutcome } from './share'

export function WinOverlay({ session, onNewGame, onHome }: { session: GameSession; onNewGame: () => void; onHome: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(ref)
  const reduceMotion = usePrefersReducedMotion()
  const s = session.state
  const result = session.solveResult
  const { controller, today } = useApp()
  const [shareStatus, setShareStatus] = useState<ShareOutcome | null>(null)
  const share = async () => {
    const text = shareText({
      difficulty: s.difficulty,
      seconds: s.elapsedSeconds,
      mistakes: s.mistakes,
      hintsUsed: s.hintsUsed,
      dailyDay: session.dailyDay,
      streak: controller.profile.currentStreak(today),
      url: window.location.origin,
    })
    setShareStatus(await shareResult(navigator, text))
  }
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
          {canShare(navigator) && (
            <button type="button" className="btn" onClick={() => void share()}>
              <Icon name="share" size={18} /> Share
            </button>
          )}
          <button type="button" className="btn" onClick={onHome}>
            Home
          </button>
        </div>
        {(shareStatus === 'copied' || shareStatus === 'failed') && (
          <p className="muted form-message" role="status">
            {shareStatus === 'copied' ? 'Copied to the clipboard.' : "Couldn't share. Try again."}
          </p>
        )}
      </div>
      {!reduceMotion && <Confetti />}
    </div>
  )
}
