import fc from 'fast-check'
import { DIFFICULTIES } from './difficulty'
import { generate } from './generator'
import { newGame, type GameState } from './gameState'

export const arbDifficulty = fc.constantFrom(...DIFFICULTIES)
export const arbSeed = fc.bigInt({ min: 0n, max: 2n ** 64n - 1n })
export const arbDay = fc.integer({ min: -100_000, max: 100_000 })

/** A fresh Game from a (difficulty, seed) pair. Memoised: generation is the slow part of property tests. */
const cache = new Map<string, GameState>()
export function gameFor(difficulty: (typeof DIFFICULTIES)[number], seed: bigint): GameState {
  const key = `${difficulty}:${seed}`
  let g = cache.get(key)
  if (!g) {
    g = newGame(generate(difficulty, seed), 0)
    cache.set(key, g)
  }
  return g
}
