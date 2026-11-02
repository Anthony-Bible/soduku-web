import { describe, expect, test } from 'vitest'
import {
  ACHIEVEMENTS, emptyAchievementProgress, recordAchievements, type AchievementId, type AchievementProgress,
  type SolveSummary,
} from './achievements'
import { dayFromYMD } from './calendarDay'
import { emptyDailyLog, recordOpen, recordSolve, type DailyLog } from './dailyLog'

const solve = (over: Partial<SolveSummary> = {}): SolveSummary => ({
  difficulty: 'medium', seconds: 700, mistakes: 1, hintsUsed: 1, dailyDay: null, ...over,
})
const rec = (p: AchievementProgress, s: SolveSummary, log: DailyLog = emptyDailyLog()) =>
  recordAchievements(p, s, log, 123)

const dailySolved = (days: number[], opened: (d: number) => number = (d) => d): DailyLog => {
  let log = emptyDailyLog()
  for (const d of days) log = recordSolve(recordOpen(log, d, opened(d)), d)
  return log
}

describe('Achievements', () => {
  test('there are 23 across four groups', () => {
    expect(ACHIEVEMENTS).toHaveLength(23)
    const n = (g: string) => ACHIEVEMENTS.filter((a) => a.group === g).length
    expect([n('streak'), n('milestone'), n('skill'), n('calendar')]).toEqual([4, 10, 7, 2])
  })

  test('a first sloppy medium solve unlocks First Solve and Middle Path only', () => {
    const { unlocked } = rec(emptyAchievementProgress(), solve())
    expect(unlocked).toEqual(['firstSolve', 'winMedium'])
  })

  test('Flawless and Unassisted depend on mistakes and hints', () => {
    const { unlocked } = rec(emptyAchievementProgress(), solve({ mistakes: 0, hintsUsed: 0 }))
    expect(unlocked).toEqual(expect.arrayContaining(['flawless', 'unassisted']))
  })

  test.each([
    ['easy', 299, 'quickEasy'],
    ['medium', 599, 'quickMedium'],
    ['hard', 899, 'quickHard'],
    ['expert', 1199, 'quickExpert'],
  ] as const)('quick %s needs strictly under its limit', (difficulty, seconds, id) => {
    const fast = rec(emptyAchievementProgress(), solve({ difficulty, seconds }))
    expect(fast.unlocked).toContain(id)
    const slow = rec(emptyAchievementProgress(), solve({ difficulty, seconds: seconds + 1 }))
    expect(slow.unlocked).not.toContain(id)
  })

  test('Purist needs an Expert with no mistakes and no hints', () => {
    expect(rec(emptyAchievementProgress(), solve({ difficulty: 'expert', mistakes: 0, hintsUsed: 0 })).unlocked).toContain('purist')
    expect(rec(emptyAchievementProgress(), solve({ difficulty: 'expert', mistakes: 1, hintsUsed: 0 })).unlocked).not.toContain('purist')
    expect(rec(emptyAchievementProgress(), solve({ difficulty: 'hard', mistakes: 0, hintsUsed: 0 })).unlocked).not.toContain('purist')
  })

  test('solve-count milestones unlock at 10, 50 and 100 and each unlocks once', () => {
    let p = emptyAchievementProgress()
    const seen: AchievementId[] = []
    for (let i = 1; i <= 100; i++) {
      const r = rec(p, solve({ difficulty: 'easy' }))
      p = r.progress
      seen.push(...r.unlocked)
      if (i === 9) expect(seen).not.toContain('tenDown')
      if (i === 10) expect(r.unlocked).toContain('tenDown')
      if (i === 50) expect(r.unlocked).toContain('fifty')
      if (i === 100) expect(r.unlocked).toContain('century')
    }
    expect(new Set(seen).size).toBe(seen.length)
  })

  test('Streak and Calendar Achievements need a Daily Puzzle; ordinary Games never earn them', () => {
    const monday = dayFromYMD(2026, 11, 2)
    const log = dailySolved([0, 1, 2, 3, 4, 5, 6].map((i) => monday + i))
    const ordinary = rec(emptyAchievementProgress(), solve(), log).unlocked
    expect(ordinary).not.toContain('streak3')
    expect(ordinary).not.toContain('perfectWeek')
    const daily = rec(emptyAchievementProgress(), solve({ dailyDay: monday + 6 }), log).unlocked
    expect(daily).toEqual(expect.arrayContaining(['streak3', 'streak7', 'perfectWeek']))
  })

  test('streak30 and streak100 use the Longest Streak', () => {
    const start = dayFromYMD(2026, 1, 1)
    const days = Array.from({ length: 100 }, (_, i) => start + i)
    const r = rec(emptyAchievementProgress(), solve({ dailyDay: days[99] }), dailySolved(days))
    expect(r.unlocked).toEqual(expect.arrayContaining(['streak3', 'streak7', 'streak30', 'streak100', 'dailyRegular', 'dailyDevotee']))
  })

  test('Full Month counts Catch-Up Solves; Perfect Week does not', () => {
    const first = dayFromYMD(2026, 2, 1)
    const days = Array.from({ length: 28 }, (_, i) => first + i)
    const log = dailySolved(days, (d) => (d === first + 3 ? first + 10 : d))
    const r = rec(emptyAchievementProgress(), solve({ dailyDay: first + 27 }), log).unlocked
    expect(r).toContain('fullMonth')
    expect(r).not.toContain('perfectWeek')
  })

  test('unlock timestamps are kept and never overwritten', () => {
    const a = recordAchievements(emptyAchievementProgress(), solve(), emptyDailyLog(), 1)
    const b = recordAchievements(a.progress, solve(), emptyDailyLog(), 2)
    expect(b.progress.unlockedAt.firstSolve).toBe(1)
    expect(b.unlocked).toEqual([])
  })
})
