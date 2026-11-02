import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { boardFromString, serialize } from './board'
import { clueCount } from './difficulty'
import { generate } from './generator'
import { SeededRandom } from './random'
import { countSolutions, solve } from './solver'
import { isSolved, isConsistent } from './validator'
import { arbDifficulty, arbSeed } from './fixtures'

describe('Generator', () => {
  test('any seed yields a unique-solution puzzle near the clue target whose solution is valid', () => {
    fc.assert(
      fc.property(arbDifficulty, arbSeed, (difficulty, seed) => {
        const p = generate(difficulty, seed)
        const givens = p.puzzle.filter((c) => c.given).length
        expect(givens).toBeGreaterThanOrEqual(clueCount(difficulty))
        expect(givens).toBeLessThanOrEqual(clueCount(difficulty) + 4)
        expect(countSolutions(p.puzzle)).toBe('unique')
        expect(isSolved(p.solution)).toBe(true)
        // the puzzle's givens agree with the solution
        p.puzzle.forEach((c, i) => c.given && expect(c.value).toBe(p.solution[i].value))
        expect(solve(p.puzzle)?.map((c) => c.value)).toEqual(p.solution.map((c) => c.value))
      }),
      { numRuns: 40 },
    )
  })

  test('the same seed always gives the same puzzle', () => {
    fc.assert(
      fc.property(arbDifficulty, arbSeed, (d, seed) => {
        expect(generate(d, seed)).toEqual(generate(d, seed))
      }),
      { numRuns: 20 },
    )
  })
})

describe('Solver and Validator', () => {
  test('solver output always satisfies the validator and keeps the givens', () => {
    fc.assert(
      fc.property(arbDifficulty, arbSeed, (d, seed) => {
        const p = generate(d, seed)
        const solved = solve(p.puzzle)!
        expect(isSolved(solved)).toBe(true)
        p.puzzle.forEach((c, i) => c.given && expect(solved[i].value).toBe(c.value))
      }),
      { numRuns: 25 },
    )
  })

  test('an empty board has many solutions; a contradictory board has none', () => {
    const empty = boardFromString('.'.repeat(81))!
    expect(countSolutions(empty)).toBe('multiple')
    const bad = boardFromString('11' + '.'.repeat(79))!
    expect(countSolutions(bad)).toBe('none')
    expect(solve(bad)).toBeNull()
    expect(isConsistent(bad)).toBe(false)
  })

  test('a known puzzle solves to its known solution', () => {
    const puzzle = boardFromString('530070000600195000098000060800060003400803001700020006060000280000419005000080079')!
    expect(serialize(solve(puzzle)!)).toBe(
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    )
  })
})

describe('SeededRandom', () => {
  test('SplitMix64 matches the reference vector for seed 0 substitute', () => {
    // Known SplitMix64 outputs for seed 1234567 (from the reference implementation).
    const rng = new SeededRandom(1234567n)
    expect(rng.next()).toBe(6457827717110365317n)
    expect(rng.next()).toBe(3203168211198807973n)
  })

  test('shuffle is a permutation and is reproducible', () => {
    fc.assert(
      fc.property(arbSeed, fc.integer({ min: 0, max: 40 }), (seed, n) => {
        const items = Array.from({ length: n }, (_, i) => i)
        const a = new SeededRandom(seed).shuffle(items.slice())
        const b = new SeededRandom(seed).shuffle(items.slice())
        expect(a).toEqual(b)
        expect([...a].sort((x, y) => x - y)).toEqual(items)
      }),
    )
  })
})
