import { boardFromValues, type Board } from './board'
import { clueCount, type Difficulty } from './difficulty'
import { SeededRandom, add64, randomSeed } from './random'
import { countSolutionsOfValues } from './solver'

/** A dealt puzzle. `seed` is a decimal string so a Puzzle survives JSON. */
export interface Puzzle {
  readonly puzzle: Board
  readonly solution: Board
  readonly difficulty: Difficulty
  readonly seed: string
}

const MAX_ATTEMPTS = 10

/** Fills an empty board with a random valid solution (randomized backtracking). */
export function generateSolution(rng: SeededRandom): number[] {
  const values = new Array<number>(81).fill(0)
  const rows = new Array<number>(9).fill(0)
  const cols = new Array<number>(9).fill(0)
  const boxes = new Array<number>(9).fill(0)

  const fill = (index: number): boolean => {
    if (index === 81) return true
    const r = Math.floor(index / 9)
    const c = index % 9
    const b = Math.floor(r / 3) * 3 + Math.floor(c / 3)
    const digits = rng.shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])
    for (const d of digits) {
      const bit = 1 << (d - 1)
      if (rows[r] & bit || cols[c] & bit || boxes[b] & bit) continue
      values[index] = d
      rows[r] |= bit
      cols[c] |= bit
      boxes[b] |= bit
      if (fill(index + 1)) return true
      values[index] = 0
      rows[r] &= ~bit
      cols[c] &= ~bit
      boxes[b] &= ~bit
    }
    return false
  }
  fill(0)
  return values
}

/**
 * Generator v1. Frozen: for a given (difficulty, seed) the output must never change
 * (see docs/adr/0001). To change generation, add a new version and pick it by date.
 */
export function generate(difficulty: Difficulty, seed: bigint = randomSeed()): Puzzle {
  const target = clueCount(difficulty)
  let best: { solution: number[]; work: number[]; givens: number } | null = null
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const rng = new SeededRandom(add64(seed, BigInt(attempt)))
    const solution = generateSolution(rng)
    const work = solution.slice()
    let givens = 81
    const order = rng.shuffle(Array.from({ length: 81 }, (_, i) => i))
    for (const idx of order) {
      if (givens <= target) break
      const saved = work[idx]
      work[idx] = 0
      if (countSolutionsOfValues(work) === 'unique') givens--
      else work[idx] = saved
    }
    if (best === null || givens < best.givens) best = { solution, work, givens }
    if (givens <= target + 4) break
  }
  const chosen = best!
  return {
    puzzle: boardFromValues(chosen.work),
    solution: boardFromValues(chosen.solution),
    difficulty,
    seed: seed.toString(),
  }
}
