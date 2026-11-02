import { ACHIEVEMENTS, type AchievementId } from './achievements'
import { isFullMonth, isPerfectWeek, longestStreak, solvedCount } from './dailyLog'
import type { Difficulty } from './difficulty'
import { deriveDailyLog, unlockAchievements, wonGameCount, type SyncDoc } from './syncDoc'

const WIN: Record<Difficulty, AchievementId> = { easy: 'winEasy', medium: 'winMedium', hard: 'winHard', expert: 'winExpert' }
const QUICK: Record<Difficulty, [AchievementId, number]> = {
  easy: ['quickEasy', 5 * 60],
  medium: ['quickMedium', 10 * 60],
  hard: ['quickHard', 15 * 60],
  expert: ['quickExpert', 20 * 60],
}

/**
 * Every Achievement the merged history already earns. A solve unlocks Achievements one device at a time, so
 * two devices that each hold half of a milestone (say 6 + 6 solves) earn it only once their Games are merged.
 */
export function earnedFromHistory(doc: SyncDoc): Set<AchievementId> {
  const earned = new Set<AchievementId>()
  const wins = Object.values(doc.games).filter((r) => r.wonSeconds !== null)
  const total = wonGameCount(doc)
  if (total >= 1) earned.add('firstSolve')
  if (total >= 10) earned.add('tenDown')
  if (total >= 50) earned.add('fifty')
  if (total >= 100) earned.add('century')
  for (const r of wins) {
    earned.add(WIN[r.difficulty])
    if (r.mistakes === 0) earned.add('flawless')
    if (r.hintsUsed === 0) earned.add('unassisted')
    const [quick, limit] = QUICK[r.difficulty]
    if ((r.wonSeconds as number) < limit) earned.add(quick)
    if (r.difficulty === 'expert' && r.mistakes === 0 && r.hintsUsed === 0) earned.add('purist')
  }
  const log = deriveDailyLog(doc)
  const count = solvedCount(log)
  if (count >= 10) earned.add('dailyRegular')
  if (count >= 50) earned.add('dailyDevotee')
  const streak = longestStreak(log)
  if (streak >= 3) earned.add('streak3')
  if (streak >= 7) earned.add('streak7')
  if (streak >= 30) earned.add('streak30')
  if (streak >= 100) earned.add('streak100')
  for (const k of Object.keys(doc.solved)) {
    if (isPerfectWeek(log, Number(k))) earned.add('perfectWeek')
    if (isFullMonth(log, Number(k))) earned.add('fullMonth')
  }
  return earned
}

/** Unlocks, at `at`, whatever the merged history earns that is not unlocked yet. */
export function catchUpAchievements(doc: SyncDoc, at: number): SyncDoc {
  const earned = earnedFromHistory(doc)
  const missing = ACHIEVEMENTS.map((a) => a.id).filter((id) => earned.has(id) && doc.unlockedAt[id] === undefined)
  return unlockAchievements(doc, missing, at)
}
