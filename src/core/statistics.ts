import { DIFFICULTIES, type Difficulty } from './difficulty'

export interface DifficultyStats {
  readonly played: number
  readonly won: number
  readonly bestTimeSeconds: number | null
}

/** Per-difficulty counts of Games played and won. A Daily Puzzle counts under its weekday's difficulty. */
export type Statistics = Readonly<Record<Difficulty, DifficultyStats>>

const ZERO: DifficultyStats = { played: 0, won: 0, bestTimeSeconds: null }

export const emptyStatistics = (): Statistics => ({ easy: ZERO, medium: ZERO, hard: ZERO, expert: ZERO })

export const totalPlayed = (s: Statistics): number => DIFFICULTIES.reduce((n, d) => n + s[d].played, 0)
export const totalWon = (s: Statistics): number => DIFFICULTIES.reduce((n, d) => n + s[d].won, 0)

export function winRatePercent(s: DifficultyStats): number {
  return s.played > 0 ? Math.round((s.won / s.played) * 100) : 0
}

export function recordStart(s: Statistics, d: Difficulty): Statistics {
  return { ...s, [d]: { ...s[d], played: s[d].played + 1 } }
}

/** `isBest` is true if this win set a new best time. */
export function recordWin(s: Statistics, d: Difficulty, seconds: number): { stats: Statistics; isBest: boolean } {
  const cur = s[d]
  const isBest = cur.bestTimeSeconds === null || seconds < cur.bestTimeSeconds
  const next: DifficultyStats = {
    ...cur,
    won: cur.won + 1,
    // A Game started before a Statistics reset still wins: keep won <= played.
    played: Math.max(cur.played, cur.won + 1),
    bestTimeSeconds: isBest ? seconds : cur.bestTimeSeconds,
  }
  return { stats: { ...s, [d]: next }, isBest }
}
