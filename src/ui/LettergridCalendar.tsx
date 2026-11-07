import { useState } from 'react'
import { longTitle, type CalendarDay } from '../core'
import { useApp } from '../app/AppContext'
import { CalendarMonth } from './CalendarMonth'
import { Sheet } from './Sheet'
import { Row } from './Stats'
import { StreakSummary } from './Streak'
import { playsText, starsText, starsWords } from './format'
import { lettergridShareText } from './share'
import { useShareText } from './useShare'


/** A solved day's result, with Share. The Streak goes in the Share text only for today's Daily Puzzle. */
function DayResult({ day }: { day: CalendarDay }) {
  const { controller, today } = useApp()
  const solve = controller.profile.lettergridSolve(day)
  const streak = day === today ? controller.profile.lettergridStreak(today) : 0
  const share = useShareText((url) =>
    solve ? lettergridShareText({ day, plays: solve.plays, score: solve.score, stars: solve.stars, streak, url }) : '',
  )
  if (!solve) return null
  const kind = controller.profile.lettergridLog.solves[day]
  return (
    <section className="day-result" aria-label="Daily Puzzle result">
      <h3>{longTitle(day)}</h3>
      <p className="muted">{kind === 'onDay' ? 'Solved on the day' : 'Solved later'}</p>
      <p className="tabular">
        Score {solve.score} · <span aria-label={starsWords(solve.stars)}>{solve.stars > 0 ? starsText(solve.stars) : 'No stars'}</span>
      </p>
      <p className="muted tabular">{playsText(solve.plays)}</p>
      {share.button}
      {share.message}
    </section>
  )
}

/** Lettergrid's own Calendar: On-Day and Catch-Up Solves with stars; an unsolved past day opens its puzzle. */
export function LettergridCalendarSheet() {
  const { controller, today } = useApp()
  const profile = controller.profile
  const log = profile.lettergridLog
  const [selected, setSelected] = useState<CalendarDay | null>(null)
  const starsOf = (day: CalendarDay) => profile.lettergridSolve(day)?.stars ?? 0
  return (
    <Sheet title="Lettergrid Calendar" onClose={() => controller.openSheet(null)}>
      <StreakSummary log={log} today={today} />
      <CalendarMonth
        log={log}
        today={today}
        inProgress={(day) => profile.hasLettergridInProgress(day)}
        extra={(day) => starsWords(starsOf(day))}
        badge={(day) => starsText(starsOf(day))}
        selected={selected}
        onSelect={setSelected}
        onOpen={(day) => controller.openLettergridDay(day)}
      >
        {selected !== null && <DayResult key={selected} day={selected} />}
      </CalendarMonth>
    </Sheet>
  )
}

export function LettergridStatsSheet() {
  const { controller } = useApp()
  const s = controller.profile.lettergridStatistics
  const rows: [string, string | number][] = [
    ['Dailies played', s.dailiesPlayed],
    ['Best score', s.bestScore ?? '—'],
    ['1 star Par reached', s.parReached[0]],
    ['2 stars Par reached', s.parReached[1]],
    ['3 stars Par reached', s.parReached[2]],
  ]
  return (
    <Sheet title="Lettergrid Statistics" onClose={() => controller.openSheet(null)}>
      <section aria-label="Daily Puzzles">
        <h3>Daily Puzzles</h3>
        {rows.map(([label, value]) => (
          <Row key={label} label={label} value={value} />
        ))}
      </section>
    </Sheet>
  )
}
