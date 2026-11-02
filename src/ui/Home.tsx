import { useEffect, useState } from 'react'
import { dailyDifficulty, displayName, longTitle, solveFor } from '../core'
import { useApp } from '../app/AppContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icon'
import { accessibleElapsed, formatElapsed } from './format'

function AccountButton() {
  const { controller, sync } = useApp()
  if (!controller.sync.available) return null
  const email = sync.account?.email
  const label = email ? `Account, signed in as ${email}${sync.error ? ', last sync failed' : ''}` : 'Account, signed out'
  return (
    <button type="button" className="account-btn" aria-label={label} onClick={() => controller.openSheet('account')}>
      {email ? <span aria-hidden="true">{email.charAt(0).toUpperCase()}</span> : <Icon name="person" size={20} />}
      {email && sync.error && <span className="account-dot" aria-hidden="true" />}
    </button>
  )
}

function DailyCard() {
  const { controller, today } = useApp()
  const profile = controller.profile
  const solved = solveFor(profile.dailyLog, today) !== undefined
  const streak = profile.currentStreak(today)
  const inProgress = profile.hasDailyInProgress(today)
  return (
    <section className="card daily-card" aria-label="Daily Puzzle">
      <div className="daily-top">
        <div>
          <h2>Daily Puzzle</h2>
          <p className="muted">
            {longTitle(today)} · {displayName(dailyDifficulty(today))}
          </p>
        </div>
        <div className="daily-badges">
        <span className={`streak${streak > 0 ? ' active' : ''}`}>
          <Icon name="flame" fill={streak > 0} /> <span className="tabular" aria-hidden="true">{streak}</span>
          <span className="sr-only">{`Streak ${streak} ${streak === 1 ? 'day' : 'days'}`}</span>
        </span>
        <AccountButton />
        </div>
      </div>
      <div className="row-buttons">
        <button type="button" className="btn btn-primary grow" disabled={solved} onClick={() => controller.openToday()}>
          <Icon name={solved ? 'check' : 'play'} size={18} fill={!solved} /> {solved ? 'Solved' : inProgress ? 'Continue' : 'Play'}
        </button>
        <button type="button" className="btn" aria-label="Calendar" onClick={() => controller.openSheet('calendar')}>
          <Icon name="calendar" size={20} />
        </button>
      </div>
    </section>
  )
}

export function Home({ onDialogChange }: { onDialogChange?: (open: boolean) => void } = {}) {
  const { controller } = useApp()
  const saved = controller.profile.savedGame()
  const [confirmAbandon, setConfirmAbandon] = useState(false)
  useEffect(() => {
    onDialogChange?.(confirmAbandon)
    return () => onDialogChange?.(false)
  }, [confirmAbandon, onDialogChange])
  return (
    <main className="home">
      <div className="hero">
        <svg viewBox="0 0 64 64" width="72" height="72" aria-hidden="true">
          <rect x="4" y="4" width="56" height="56" rx="10" fill="currentColor" />
          <path d="M23 4v56M41 4v56M4 23h56M4 41h56" stroke="var(--bg)" strokeWidth="2.5" />
        </svg>
        <h1>Sudoku</h1>
      </div>
      <div className="home-actions">
        <DailyCard />
        {saved && (
          <button
            type="button"
            className="btn btn-primary"
            aria-label={`Continue ${displayName(saved.difficulty)} game, ${accessibleElapsed(saved.elapsedSeconds)}`}
            onClick={() => controller.continueGame()}
          >
            Continue — {displayName(saved.difficulty)} · {formatElapsed(saved.elapsedSeconds)}
          </button>
        )}
        <button type="button" className="btn" onClick={() => (saved ? setConfirmAbandon(true) : controller.openSheet('picker'))}>
          New Game
        </button>
        <div className="row-buttons">
          <button type="button" className="btn grow" onClick={() => controller.openSheet('stats')}>
            Statistics
          </button>
          <button type="button" className="btn grow" onClick={() => controller.openSheet('achievements')}>
            Achievements
          </button>
        </div>
      </div>
      {confirmAbandon && (
        <ConfirmDialog
          title="Abandon current game?"
          message="Your saved game will be lost."
          confirmLabel="Start New"
          onCancel={() => setConfirmAbandon(false)}
          onConfirm={() => {
            setConfirmAbandon(false)
            controller.openSheet('picker')
          }}
        />
      )}
    </main>
  )
}
