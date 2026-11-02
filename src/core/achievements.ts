import type { CalendarDay } from './calendarDay'
import type { Difficulty } from './difficulty'
import { isFullMonth, isPerfectWeek, longestStreak, solvedCount, type DailyLog } from './dailyLog'

export type AchievementGroup = 'streak' | 'milestone' | 'skill' | 'calendar'

export const GROUPS: readonly { id: AchievementGroup; title: string }[] = [
  { id: 'streak', title: 'Streaks' },
  { id: 'milestone', title: 'Milestones' },
  { id: 'skill', title: 'Skill' },
  { id: 'calendar', title: 'Calendar' },
]

export interface AchievementInfo {
  readonly id: AchievementId
  readonly group: AchievementGroup
  readonly title: string
  readonly detail: string
}

const defs = [
  // Streak
  ['streak3', 'streak', 'Warming Up', 'Reach a 3-day Streak'],
  ['streak7', 'streak', 'On Fire', 'Reach a 7-day Streak'],
  ['streak30', 'streak', 'Habit', 'Reach a 30-day Streak'],
  ['streak100', 'streak', 'Centurion', 'Reach a 100-day Streak'],
  // Milestone
  ['firstSolve', 'milestone', 'First Solve', 'Solve any puzzle'],
  ['tenDown', 'milestone', 'Ten Down', 'Solve 10 puzzles'],
  ['fifty', 'milestone', 'Fifty', 'Solve 50 puzzles'],
  ['century', 'milestone', 'Century', 'Solve 100 puzzles'],
  ['winEasy', 'milestone', 'Easy Does It', 'Solve an Easy puzzle'],
  ['winMedium', 'milestone', 'Middle Path', 'Solve a Medium puzzle'],
  ['winHard', 'milestone', 'Hard Case', 'Solve a Hard puzzle'],
  ['winExpert', 'milestone', 'Expert', 'Solve an Expert puzzle'],
  ['dailyRegular', 'milestone', 'Regular', 'Solve 10 Daily Puzzles'],
  ['dailyDevotee', 'milestone', 'Devotee', 'Solve 50 Daily Puzzles'],
  // Skill
  ['flawless', 'skill', 'Flawless', 'Solve with no mistakes'],
  ['unassisted', 'skill', 'Unassisted', 'Solve without hints'],
  ['quickEasy', 'skill', 'Quick Easy', 'Solve an Easy in under 5:00'],
  ['quickMedium', 'skill', 'Quick Medium', 'Solve a Medium in under 10:00'],
  ['quickHard', 'skill', 'Quick Hard', 'Solve a Hard in under 15:00'],
  ['quickExpert', 'skill', 'Quick Expert', 'Solve an Expert in under 20:00'],
  ['purist', 'skill', 'Purist', 'Solve an Expert with no mistakes and no hints'],
  // Calendar
  ['perfectWeek', 'calendar', 'Perfect Week', 'Solve every Daily Puzzle Monday to Sunday, each on its day'],
  ['fullMonth', 'calendar', 'Full Month', 'Solve every Daily Puzzle in a month (catch-ups count)'],
] as const

export type AchievementId = (typeof defs)[number][0]

/** All 23 Achievements in declaration order. */
export const ACHIEVEMENTS: readonly AchievementInfo[] = defs.map(([id, group, title, detail]) => ({
  id,
  group,
  title,
  detail,
}))

const BY_ID = new Map<string, AchievementInfo>(ACHIEVEMENTS.map((a) => [a.id, a]))
export const achievementInfo = (id: AchievementId): AchievementInfo => BY_ID.get(id)!
export const isAchievementId = (v: unknown): v is AchievementId => typeof v === 'string' && BY_ID.has(v)

/** One finished puzzle, as Achievements see it. */
export interface SolveSummary {
  readonly difficulty: Difficulty
  readonly seconds: number
  readonly mistakes: number
  readonly hintsUsed: number
  /** Set when the solve was a Daily Puzzle. */
  readonly dailyDay: CalendarDay | null
}

/** Achievement counters and unlocks. Starts empty. `unlockedAt` holds epoch milliseconds. */
export interface AchievementProgress {
  readonly solveCount: number
  readonly unlockedAt: Readonly<Partial<Record<AchievementId, number>>>
}

export const emptyAchievementProgress = (): AchievementProgress => ({ solveCount: 0, unlockedAt: {} })
export const isUnlocked = (p: AchievementProgress, id: AchievementId): boolean => p.unlockedAt[id] !== undefined
export const unlockedCount = (p: AchievementProgress): number => ACHIEVEMENTS.filter((a) => isUnlocked(p, a.id)).length

const QUICK: Record<Difficulty, [AchievementId, number]> = {
  easy: ['quickEasy', 5 * 60],
  medium: ['quickMedium', 10 * 60],
  hard: ['quickHard', 15 * 60],
  expert: ['quickExpert', 20 * 60],
}
const WIN: Record<Difficulty, AchievementId> = {
  easy: 'winEasy',
  medium: 'winMedium',
  hard: 'winHard',
  expert: 'winExpert',
}

/**
 * Counts a solve and returns the Achievements it newly unlocked, in declaration order.
 * For a Daily Puzzle solve, `log` must already include it.
 */
export function recordAchievements(
  progress: AchievementProgress,
  s: SolveSummary,
  log: DailyLog,
  at: number,
): { progress: AchievementProgress; unlocked: AchievementId[] } {
  const solveCount = progress.solveCount + 1
  const earned = new Set<AchievementId>(['firstSolve', WIN[s.difficulty]])
  if (solveCount >= 10) earned.add('tenDown')
  if (solveCount >= 50) earned.add('fifty')
  if (solveCount >= 100) earned.add('century')

  if (s.mistakes === 0) earned.add('flawless')
  if (s.hintsUsed === 0) earned.add('unassisted')
  const [quick, limit] = QUICK[s.difficulty]
  if (s.seconds < limit) earned.add(quick)
  if (s.difficulty === 'expert' && s.mistakes === 0 && s.hintsUsed === 0) earned.add('purist')

  if (s.dailyDay !== null) {
    const count = solvedCount(log)
    if (count >= 10) earned.add('dailyRegular')
    if (count >= 50) earned.add('dailyDevotee')
    const streak = longestStreak(log)
    if (streak >= 3) earned.add('streak3')
    if (streak >= 7) earned.add('streak7')
    if (streak >= 30) earned.add('streak30')
    if (streak >= 100) earned.add('streak100')
    if (isPerfectWeek(log, s.dailyDay)) earned.add('perfectWeek')
    if (isFullMonth(log, s.dailyDay)) earned.add('fullMonth')
  }

  const unlocked = ACHIEVEMENTS.map((a) => a.id).filter((id) => earned.has(id) && progress.unlockedAt[id] === undefined)
  const unlockedAt = { ...progress.unlockedAt }
  for (const id of unlocked) unlockedAt[id] = at
  return { progress: { solveCount, unlockedAt }, unlocked }
}
