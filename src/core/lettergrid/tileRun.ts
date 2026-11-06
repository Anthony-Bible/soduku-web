import { SeededRandom } from '../random'
import { TILE_RUN_LENGTH } from './grid'

import { TILE_WEIGHTS_V1 } from './tileWeightsV1'

/** Generator v1 draws letters by weights derived from Word List v1 letter frequency (tileWeightsV1.ts). */
export { TILE_WEIGHTS_V1 }
const MAX_COPIES_V1 = 4
const MIN_VOWELS_V1 = 9
const MAX_VOWELS_V1 = 13

const LETTERS = Object.keys(TILE_WEIGHTS_V1)
const TOTAL_WEIGHT = LETTERS.reduce((n, c) => n + TILE_WEIGHTS_V1[c], 0)

/**
 * The day's Tile Run: TILE_RUN_LENGTH letters drawn by weight, no letter more than four times, and
 * between 9 and 13 vowels so the Rack is neither starved nor flooded. A run outside those bounds is
 * redrawn whole (deterministic, since it consumes the same seeded stream).
 */
export function generateTileRun(rng: SeededRandom): string[] {
  for (;;) {
    const run: string[] = []
    const counts: Record<string, number> = {}
    while (run.length < TILE_RUN_LENGTH) {
      let r = rng.nextBelow(TOTAL_WEIGHT)
      let letter = LETTERS[0]
      for (const c of LETTERS) {
        if (r < TILE_WEIGHTS_V1[c]) {
          letter = c
          break
        }
        r -= TILE_WEIGHTS_V1[c]
      }
      if ((counts[letter] ?? 0) >= MAX_COPIES_V1) continue
      counts[letter] = (counts[letter] ?? 0) + 1
      run.push(letter)
    }
    const vowels = run.filter((c) => 'aeiou'.includes(c)).length
    if (vowels >= MIN_VOWELS_V1 && vowels <= MAX_VOWELS_V1) return run
  }
}
