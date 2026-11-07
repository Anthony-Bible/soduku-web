import { DIFFICULTIES, currentStreak, displayName, longestStreak, solvedCount, totalPlayed, totalWon, winRatePercent } from '../core'
import { useApp } from '../app/AppContext'
import { Sheet } from './Sheet'
import { formatElapsed } from './format'

export function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="stat-row">
      <span>{label}</span>
      <span className="muted tabular">{value}</span>
    </div>
  )
}

export function StatsSheet() {
  const { controller, today } = useApp()
  const { statistics, dailyLog } = controller.profile
  return (
    <Sheet title="Statistics" onClose={() => controller.openSheet(null)}>
      <section aria-label="Daily">
        <h3>Daily</h3>
        <Row label="Current Streak" value={currentStreak(dailyLog, today)} />
        <Row label="Longest Streak" value={longestStreak(dailyLog)} />
        <Row label="Daily Puzzles solved" value={solvedCount(dailyLog)} />
      </section>
      <section aria-label="Totals">
        <h3>Totals</h3>
        <Row label="Played" value={totalPlayed(statistics)} />
        <Row label="Won" value={totalWon(statistics)} />
      </section>
      {DIFFICULTIES.map((d) => {
        const s = statistics[d]
        return (
          <section key={d} aria-label={displayName(d)}>
            <h3>{displayName(d)}</h3>
            <Row label="Played" value={s.played} />
            <Row label="Won" value={s.won} />
            <Row label="Win rate" value={`${winRatePercent(s)}%`} />
            <Row label="Best time" value={s.bestTimeSeconds === null ? '—' : formatElapsed(s.bestTimeSeconds)} />
          </section>
        )
      })}
    </Sheet>
  )
}
