export const DIFFICULTIES = ['easy', 'medium', 'hard', 'expert'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

const INFO: Record<Difficulty, { name: string; clues: number; hints: number }> = {
  easy: { name: 'Easy', clues: 40, hints: 5 },
  medium: { name: 'Medium', clues: 34, hints: 3 },
  hard: { name: 'Hard', clues: 28, hints: 2 },
  expert: { name: 'Expert', clues: 24, hints: 1 },
}

export const displayName = (d: Difficulty): string => INFO[d].name
/** Target number of givens left on the board. */
export const clueCount = (d: Difficulty): number => INFO[d].clues
export const maxHints = (d: Difficulty): number => INFO[d].hints
export const isDifficulty = (v: unknown): v is Difficulty =>
  typeof v === 'string' && (DIFFICULTIES as readonly string[]).includes(v)
