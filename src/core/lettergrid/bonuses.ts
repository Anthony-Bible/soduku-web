import { SeededRandom } from '../random'
import { CELL_COUNT, CENTRE, cellIndex, type Bonus } from './grid'

/** Generator v1 layout: how many of each bonus square the day's seed scatters. Frozen. */
export const BONUS_COUNTS_V1: Readonly<Record<Exclude<Bonus, null>, number>> = {
  L2: 12,
  L3: 6,
  W2: 6,
  W3: 3,
}

/**
 * Our own bonus layout, drawn from the day's seed: the counts above on distinct squares, never the
 * centre (the Seed Word always covers it). The draw order is part of the frozen generator contract.
 */
export function generateBonuses(rng: SeededRandom): Bonus[] {
  const squares: number[] = []
  for (let i = 0; i < CELL_COUNT; i++) if (i !== cellIndex(CENTRE, CENTRE)) squares.push(i)
  rng.shuffle(squares)
  const bonuses: Bonus[] = Array.from({ length: CELL_COUNT }, () => null)
  let next = 0
  for (const kind of ['L2', 'L3', 'W2', 'W3'] as const) {
    for (let n = 0; n < BONUS_COUNTS_V1[kind]; n++) bonuses[squares[next++]] = kind
  }
  return bonuses
}
