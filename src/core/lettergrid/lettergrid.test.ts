import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fc from 'fast-check'
import { dayFromYMD } from '../calendarDay'
import { SeededRandom } from '../random'
import { isOffensive } from './blocklist'
import { BONUS_COUNTS_V1, generateBonuses } from './bonuses'
import { generateLayout, lettergridDaily, lettergridSeed, WORD_LIST_SCHEDULE, wordListVersionFor, type LettergridDaily } from './daily'
import { evaluatePlay } from './evaluate'
import {
  applyAction,
  isFinished,
  newGame,
  scoreOf,
  type Action,
  type LettergridState,
} from './game'
import {
  ALL_TILES_BONUS,
  CENTRE,
  CELL_COUNT,
  PLAYS_PER_DAILY,
  RACK_SIZE,
  TILE_RUN_LENGTH,
  cellIndex,
  emptyGrid,
  type Bonus,
} from './grid'
import { letterValuesFor } from './letterValuesTable'
import { parFromGreedy, starsFor } from './par'
import { bestPlay, solveGreedy } from './solver'
import { generateTileRun } from './tileRun'
import { deriveTileWeights } from './letterValues'
import { TILE_WEIGHTS_V1 } from './tileWeightsV1'
import { CURRENT_WORD_LIST_VERSION, createWordList, parseWordList, wordListPath } from './wordList'

const LETTER_VALUES = letterValuesFor(CURRENT_WORD_LIST_VERSION)

// Pinned to v1, not CURRENT_WORD_LIST_VERSION: every day these tests generate is published with v1.
const words = parseWordList(readFileSync(resolve(__dirname, '../../../public', wordListPath(1)), 'utf8'))
const START = dayFromYMD(2026, 11, 5)
const seedArb = fc.bigInt({ min: 0n, max: 2n ** 64n - 1n })
const dayArb = fc.integer({ min: dayFromYMD(2024, 1, 1), max: dayFromYMD(2100, 1, 1) })

// A few real Dailies, built once: generation runs the solver.
const dailies: LettergridDaily[] = [0, 1, 2, 3].map((i) => lettergridDaily(START + i * 17, words))

function countsOf(items: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of items) out[c] = (out[c] ?? 0) + 1
  return out
}

/** Tiles placed by Plays + Rack + queue are always exactly the Tile Run. */
function expectConserved(state: LettergridState) {
  const onGrid = state.grid.filter((c, i) => c !== null && !state.seedCells.includes(i)) as string[]
  expect(state.rack.length).toBeLessThanOrEqual(RACK_SIZE)
  expect(countsOf([...onGrid, ...state.rack, ...state.queue])).toEqual(countsOf(state.tileRun))
}

describe('the Daily Puzzle', () => {
  it('is identical for the same date and distinct across dates', () => {
    fc.assert(
      fc.property(dayArb, (day) => {
        expect(generateLayout(day, words)).toEqual(generateLayout(day, words))
      }),
      { numRuns: 100 },
    )
    expect(lettergridDaily(START, words)).toEqual(lettergridDaily(START, words))
    const seeds = new Set(Array.from({ length: 500 }, (_, i) => lettergridSeed(START + i)))
    expect(seeds.size).toBe(500)
  })

  it('has a Seed Word that is a candidate, never on the blocklist, through the centre', () => {
    fc.assert(
      fc.property(dayArb, (day) => {
        const layout = generateLayout(day, words)
        expect(words.seedCandidates).toContain(layout.seedWord)
        expect(isOffensive(layout.seedWord)).toBe(false)
        expect(layout.seedWord.length).toBeGreaterThanOrEqual(3)
        const { row, col } = layout.seedStart
        const len = layout.seedWord.length
        if (layout.seedDirection === 'across') {
          expect(row).toBe(CENTRE)
          expect(col).toBeLessThanOrEqual(CENTRE)
          expect(col + len - 1).toBeGreaterThanOrEqual(CENTRE)
          expect(col + len).toBeLessThanOrEqual(9)
        } else {
          expect(col).toBe(CENTRE)
          expect(row).toBeLessThanOrEqual(CENTRE)
          expect(row + len - 1).toBeGreaterThanOrEqual(CENTRE)
          expect(row + len).toBeLessThanOrEqual(9)
        }
      }),
      { numRuns: 300 },
    )
  })

  it('opens with the Seed Word on the grid, a full Rack and the rest queued', () => {
    for (const daily of dailies) {
      const state = newGame(daily)
      const onGrid = state.grid.filter((c) => c !== null).join('')
      expect([...onGrid].sort().join('')).toBe([...daily.seedWord].sort().join(''))
      expect(state.grid[cellIndex(CENTRE, CENTRE)]).not.toBeNull()
      expect(state.rack).toEqual(daily.tileRun.slice(0, RACK_SIZE))
      expect(state.queue.length).toBe(TILE_RUN_LENGTH - RACK_SIZE)
      expect(state.plays).toEqual([])
      expectConserved(state)
    }
  })

  it('has strictly ascending, positive Par tiers drawn from the greedy score', () => {
    for (const daily of dailies) {
      const [one, two, three] = daily.par.tiers
      expect(one).toBeGreaterThan(0)
      expect(two).toBeGreaterThan(one)
      expect(three).toBeGreaterThan(two)
      expect(three).toBeLessThanOrEqual(daily.par.greedyScore)
    }
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (g) => {
        const [a, b, c] = parFromGreedy(g, 1).tiers
        expect(a).toBeGreaterThan(0)
        expect(b).toBeGreaterThan(a)
        expect(c).toBeGreaterThan(b)
      }),
    )
  })

  it('counts stars as the Par tiers reached', () => {
    const par = parFromGreedy(100, 1)
    expect(starsFor(0, par)).toBe(0)
    expect(starsFor(par.tiers[0], par)).toBe(1)
    expect(starsFor(par.tiers[1], par)).toBe(2)
    expect(starsFor(par.tiers[2] + 1000, par)).toBe(3)
  })
})

describe('bonus squares and Tile Run', () => {
  it('scatter the pinned counts on distinct non-centre squares', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const b = generateBonuses(new SeededRandom(seed))
        expect(b.length).toBe(CELL_COUNT)
        expect(b[cellIndex(CENTRE, CENTRE)]).toBeNull()
        for (const kind of ['L2', 'L3', 'W2', 'W3'] as const) {
          expect(b.filter((x) => x === kind).length).toBe(BONUS_COUNTS_V1[kind])
        }
      }),
    )
  })

  it('is 28 letters with a playable vowel balance and no letter more than four times', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const run = generateTileRun(new SeededRandom(seed))
        expect(run.length).toBe(TILE_RUN_LENGTH)
        expect(run.every((c) => /^[a-z]$/.test(c))).toBe(true)
        const vowels = run.filter((c) => 'aeiou'.includes(c)).length
        expect(vowels).toBeGreaterThanOrEqual(9)
        expect(vowels).toBeLessThanOrEqual(13)
        expect(Math.max(...Object.values(countsOf(run)))).toBeLessThanOrEqual(4)
      }),
    )
  })
})

describe('playing a Daily', () => {
  const actionArb = fc.record({
    kind: fc.constantFrom('swap', 'best', 'random', 'random'),
    a: fc.nat(),
    b: fc.nat(),
    c: fc.nat(),
    d: fc.nat(),
  })

  function toAction(state: LettergridState, s: { kind: string; a: number; b: number; c: number; d: number }): Action {
    if (s.kind === 'swap') return { type: 'swap' }
    if (s.kind === 'best') {
      const best = bestPlay(state, words)
      return best ? { type: 'play', tiles: best.tiles } : { type: 'swap' }
    }
    // Often illegal: any letters from the Rack in any line at any place.
    const n = 1 + (s.a % Math.max(1, state.rack.length))
    const dir = s.b % 2
    const fixed = s.c % 9
    const start = s.d % 9
    const tiles = state.rack.slice(0, n).map((letter, k) =>
      dir === 0 ? { row: fixed, col: (start + k) % 9, letter } : { row: (start + k) % 9, col: fixed, letter },
    )
    return { type: 'play', tiles }
  }

  it('keeps tiles conserved, the Rack at 7 or fewer, and a rejection changes nothing', () => {
    fc.assert(
      fc.property(fc.nat(dailies.length - 1), fc.array(actionArb, { maxLength: 30 }), (di, steps) => {
        let state = newGame(dailies[di])
        for (const step of steps) {
          const before = structuredClone(state)
          const result = applyAction(state, toAction(state, step), words)
          if (result.ok) {
            expect(result.score).toBeGreaterThanOrEqual(0)
            expect(result.state.plays.length).toBe(before.plays.length + 1)
            expect(state).toEqual(before) // never mutates
            state = result.state
          } else {
            expect(state).toEqual(before)
          }
          expectConserved(state)
          if (isFinished(state)) break
        }
      }),
      { numRuns: 60 },
    )
  })

  it('finishes after exactly 6 Plays, with any mix of Plays and Swaps, then refuses more', () => {
    fc.assert(
      fc.property(fc.nat(dailies.length - 1), fc.array(actionArb, { minLength: 40, maxLength: 40 }), (di, steps) => {
        let state = newGame(dailies[di])
        for (const step of steps) {
          if (isFinished(state)) break
          const result = applyAction(state, toAction(state, step), words)
          if (result.ok) state = result.state
        }
        while (!isFinished(state)) {
          const result = applyAction(state, { type: 'swap' }, words)
          if (!result.ok) throw new Error('swap refused')
          state = result.state
        }
        expect(state.plays.length).toBe(PLAYS_PER_DAILY)
        expect(scoreOf(state)).toBeGreaterThanOrEqual(0)
        expect(state.plays.every((p) => p.score >= 0 && (p.kind === 'play' || p.score === 0))).toBe(true)
        const after = applyAction(state, { type: 'swap' }, words)
        expect(after).toEqual({ ok: false, reason: 'finished' })
      }),
      { numRuns: 40 },
    )
  })

  it('a Swap sends the whole Rack to the back of the Tile Run and refills in order', () => {
    const state = newGame(dailies[0])
    const result = applyAction(state, { type: 'swap' }, words)
    if (!result.ok) throw new Error('swap refused')
    const expected = [...state.queue, ...state.rack]
    expect(result.state.rack).toEqual(expected.slice(0, RACK_SIZE))
    expect(result.state.queue).toEqual(expected.slice(RACK_SIZE))
    expect(result.state.plays).toEqual([{ kind: 'swap', score: 0, tiles: [] }])
    expect(result.score).toBe(0)
  })

  it('is scored the same every time, and the greedy solver is deterministic and legal', () => {
    for (const daily of dailies) {
      const a = solveGreedy(newGame(daily), words)
      const b = solveGreedy(newGame(daily), words)
      expect(a).toEqual(b)
      expect(a.score).toBe(daily.par.greedyScore)
      expect(a.plays.length).toBe(PLAYS_PER_DAILY)
      expect(a.score).toBeGreaterThan(0)
    }
  })

  it('rejects a Play whose letters are not on the Rack', () => {
    const state = newGame(dailies[0])
    const result = applyAction(state, { type: 'play', tiles: [{ row: 3, col: 4, letter: state.rack.includes('z') ? 'y' : 'z' }] }, words)
    expect(result).toEqual({ ok: false, reason: 'not-in-rack' })
  })
})

describe('Play rules and scoring', () => {
  // A tiny Word List so every outcome is checkable by hand. Letter values: c4 a2 t2 s2 e1 r2 o3.
  const tiny = createWordList({
    version: CURRENT_WORD_LIST_VERSION,
    source: 'test',
    words: ['as', 'at', 'ca', 'cat', 'cats', 'ta', 'tar', 'ate', 'eat', 'sat', 'scat', 'to', 'ox'],
    seeds: [],
  })
  const noBonuses = (): Bonus[] => Array.from({ length: CELL_COUNT }, () => null)
  // "cat" across row 4, columns 3..5.
  const grid = (() => {
    const g = emptyGrid()
    ;['c', 'a', 't'].forEach((l, k) => (g[cellIndex(4, 3 + k)] = l))
    return g
  })()
  const check = (tiles: { row: number; col: number; letter: string }[], bonuses = noBonuses()) =>
    evaluatePlay(grid, bonuses, tiles, LETTER_VALUES, (w) => tiny.isWord(w))

  it('scores an extension as the sum of its letter values', () => {
    const r = check([{ row: 4, col: 6, letter: 's' }])
    expect(r).toMatchObject({ ok: true, score: 4 + 2 + 2 + 2 })
  })

  it('applies letter and word bonuses to new tiles only', () => {
    const b = noBonuses()
    b[cellIndex(4, 6)] = 'L3'
    b[cellIndex(4, 3)] = 'W3' // under an existing tile: ignored
    expect(check([{ row: 4, col: 6, letter: 's' }], b)).toMatchObject({ ok: true, score: 4 + 2 + 2 + 6 })
    const w = noBonuses()
    w[cellIndex(4, 6)] = 'W2'
    expect(check([{ row: 4, col: 6, letter: 's' }], w)).toMatchObject({ ok: true, score: (4 + 2 + 2 + 2) * 2 })
  })

  it('scores every word formed, including crossing words', () => {
    // "s" after cat (cats) with "a" below the t (ta) in one single-tile Play each.
    const r = check([{ row: 5, col: 5, letter: 'a' }])
    expect(r).toMatchObject({ ok: true, score: 2 + 2 })
    // two tiles down column 6 from the end of cat: "s" forms cats, "a" below it forms nothing across.
    const two = check([
      { row: 4, col: 6, letter: 's' },
      { row: 5, col: 6, letter: 'o' },
    ])
    expect(two).toMatchObject({ ok: false, reason: 'not-a-word' }) // "so" is not in the tiny list
    const ok = check([
      { row: 4, col: 6, letter: 's' },
      { row: 3, col: 6, letter: 'a' },
    ])
    expect(ok).toMatchObject({ ok: true })
    if (ok.ok) expect(ok.words.map((w) => w.word).sort()).toEqual(['as', 'cats'])
  })

  it('adds the all-tiles bonus only for a full Rack', () => {
    const g = emptyGrid()
    const r = evaluatePlay(
      g,
      noBonuses(),
      [],
      LETTER_VALUES,
      () => true,
    )
    expect(r).toMatchObject({ ok: false, reason: 'empty' })
    const big = createWordList({ version: CURRENT_WORD_LIST_VERSION, source: 't', words: ['aaaaaaaa'], seeds: [] })
    const g2 = emptyGrid()
    g2[cellIndex(0, 0)] = 'a'
    const seven = Array.from({ length: 7 }, (_, k) => ({ row: 0, col: 1 + k, letter: 'a' }))
    const full = evaluatePlay(g2, noBonuses(), seven, LETTER_VALUES, (w) => big.isWord(w))
    expect(full).toMatchObject({ ok: true, usedAllTiles: true, score: 8 * 2 + ALL_TILES_BONUS })
    const six = evaluatePlay(g2, noBonuses(), seven.slice(0, 6), LETTER_VALUES, () => true)
    expect(six).toMatchObject({ ok: true, usedAllTiles: false, score: 7 * 2 })
  })

  it('rejects each kind of illegal placement', () => {
    expect(check([])).toMatchObject({ reason: 'empty' })
    expect(check([{ row: 4, col: 4, letter: 's' }])).toMatchObject({ reason: 'occupied' })
    expect(check([{ row: 9, col: 0, letter: 's' }])).toMatchObject({ reason: 'off-grid' })
    expect(check([{ row: 4, col: 6, letter: 'S' }])).toMatchObject({ reason: 'bad-letter' })
    expect(
      check([
        { row: 4, col: 6, letter: 's' },
        { row: 4, col: 6, letter: 's' },
      ]),
    ).toMatchObject({ reason: 'duplicate-cell' })
    expect(
      check([
        { row: 4, col: 6, letter: 's' },
        { row: 5, col: 7, letter: 'a' },
      ]),
    ).toMatchObject({ reason: 'not-in-line' })
    expect(
      check([
        { row: 4, col: 6, letter: 's' },
        { row: 4, col: 8, letter: 'a' },
      ]),
    ).toMatchObject({ reason: 'gap' })
    expect(check([{ row: 0, col: 0, letter: 'a' }])).toMatchObject({ reason: 'not-connected' })
    expect(check([{ row: 4, col: 6, letter: 'x' }])).toMatchObject({ reason: 'not-a-word', word: 'catx' })
    expect(
      check(Array.from({ length: 8 }, (_, k) => ({ row: 0, col: k, letter: 'a' }))),
    ).toMatchObject({ reason: 'too-many-tiles' })
  })

  it('accepts a Play that fills a gap between existing tiles', () => {
    const g = emptyGrid()
    g[cellIndex(4, 3)] = 'c'
    g[cellIndex(4, 5)] = 't'
    const r = evaluatePlay(g, noBonuses(), [{ row: 4, col: 4, letter: 'a' }], LETTER_VALUES, (w) => tiny.isWord(w))
    expect(r).toMatchObject({ ok: true, score: 4 + 2 + 2 })
  })

  it('finds only plays the rules accept', () => {
    for (const daily of dailies) {
      const state = newGame(daily)
      const best = bestPlay(state, words)
      if (best) {
        const r = applyAction(state, { type: 'play', tiles: best.tiles }, words)
        expect(r.ok).toBe(true)
        if (r.ok) expect(r.score).toBe(best.score)
      }
    }
  })
})

describe('tile weights', () => {
  it('match the frequency derivation from the Word List they were frozen from', () => {
    expect(deriveTileWeights(words.words)).toEqual(TILE_WEIGHTS_V1)
  })
})

describe('Word List order', () => {
  it('finds the same best play whatever order the words arrive in', () => {
    const data = { version: 1, source: 'test', words: [...words.words], seeds: [...words.seedCandidates] }
    const reversed = createWordList({ ...data, words: [...data.words].reverse() })
    const shuffled = createWordList({ ...data, words: new SeededRandom(1n).shuffle([...data.words, ...data.words.slice(0, 50)]) })
    const state = newGame(dailies[0])
    expect(bestPlay(state, reversed)).toEqual(bestPlay(state, words))
    expect(bestPlay(state, shuffled)).toEqual(bestPlay(state, words))
    expect(reversed.words).toEqual(words.words)
  })
})

describe('generator v1 is frozen', () => {
  it('pins the Seed Word, first Rack and Par for 2026-11-05', () => {
    const daily = lettergridDaily(dayFromYMD(2026, 11, 5), words)
    expect({
      seedWord: daily.seedWord,
      seedStart: daily.seedStart,
      seedDirection: daily.seedDirection,
      rack: daily.tileRun.slice(0, RACK_SIZE).join(''),
      tileRun: daily.tileRun.join(''),
      bonuses: daily.bonuses.map((b) => (b ?? '..')).join(''),
      par: daily.par,
    }).toEqual(GOLDEN)
  })
})

const GOLDEN = {
  seedWord: 'dourest',
  seedStart: { row: 4, col: 0 },
  seedDirection: 'across',
  rack: 'iofiyty',
  tileRun: 'iofiytyakesryntteiedsuaareom',
  bonuses: '....L2........L2........L2....L3L3L2W2......L2..W2..W2..........L2..W2................W3..L2....L2L2......L2........L2........L2W3L3....W3..W2L3W2L3............L3',
  par: { solverVersion: 1, greedyScore: 287, tiers: [172, 229, 272] },
}

describe('Word List version schedule (ADR 0003)', () => {
  it('publishes every day up to the end of 2026 with Word List v1, whatever the newest build is', () => {
    fc.assert(
      fc.property(fc.integer({ min: dayFromYMD(1970, 1, 1), max: dayFromYMD(2026, 12, 31) }), (day) => {
        expect(wordListVersionFor(day)).toBe(1)
      }),
    )
  })

  it('picks the latest row starting on or before the day, and rows are in date order', () => {
    for (let i = 1; i < WORD_LIST_SCHEDULE.length; i++) {
      expect(WORD_LIST_SCHEDULE[i][0]).toBeGreaterThan(WORD_LIST_SCHEDULE[i - 1][0])
    }
    fc.assert(
      fc.property(dayArb, (day) => {
        const rows = WORD_LIST_SCHEDULE.filter(([from]) => from <= day)
        expect(wordListVersionFor(day)).toBe(rows[rows.length - 1][1])
      }),
    )
  })

  it('never schedules a Word List version that has not been built', () => {
    for (const [, version] of WORD_LIST_SCHEDULE) expect(version).toBeLessThanOrEqual(CURRENT_WORD_LIST_VERSION)
  })
})
