import { longTitle } from '../core'
import { useApp } from '../app/AppContext'
import { AccountButton } from './AccountButton'
import { starsText, starsWords } from './format'
import { Icon } from './Icon'
import { StreakBadge } from './Streak'

function DailyCard() {
  const { controller, today } = useApp()
  const profile = controller.profile
  const solve = profile.lettergridSolve(today)
  const streak = profile.lettergridStreak(today)
  const inProgress = profile.hasLettergridInProgress(today)
  return (
    <section className="card daily-card" aria-label="Lettergrid Daily Puzzle">
      <div className="daily-top">
        <div>
          <h2>Daily Puzzle</h2>
          <p className="muted">{longTitle(today)}</p>
        </div>
        <div className="daily-badges">
          <StreakBadge streak={streak} />
          <AccountButton />
        </div>
      </div>
      {solve && (
        <p className="muted tabular">
          Score {solve.score}
          {solve.stars > 0 && (
            <>
              {' · '}
              <span aria-label={starsWords(solve.stars)}>{starsText(solve.stars)}</span>
            </>
          )}
        </p>
      )}
      <div className="row-buttons">
        <button type="button" className="btn btn-primary grow" disabled={solve !== null} onClick={() => controller.openLettergridToday()}>
          <Icon name={solve ? 'check' : 'play'} size={18} fill={!solve} /> {solve ? 'Solved' : inProgress ? 'Continue' : 'Play'}
        </button>
        <button type="button" className="btn" aria-label="Calendar" onClick={() => controller.openSheet('lettergridCalendar')}>
          <Icon name="calendar" size={20} />
        </button>
      </div>
    </section>
  )
}

/** Lettergrid's side of Home: its Daily card and its Statistics. There are no ordinary games. */
export function LettergridHome() {
  const { controller } = useApp()
  return (
    <div className="home-actions">
      <DailyCard />
      <button type="button" className="btn" onClick={() => controller.openSheet('lettergridStats')}>
        Statistics
      </button>
    </div>
  )
}
