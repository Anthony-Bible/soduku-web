import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { ACHIEVEMENTS } from './achievements'
import { currentStreak, longestStreak, isPerfectWeek, isFullMonth } from './dailyLog'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dayFromYMD } from './calendarDay'
import { generate } from './generator'
import { lettergridDaily, newDailyGame } from './lettergrid/daily'
import { bestPlay } from './lettergrid/solver'
import { CURRENT_WORD_LIST_VERSION, parseWordList, wordListPath } from './lettergrid/wordList'
import { newGame as newSudoku } from './gameState'
import { applyAction, newGame } from './lettergrid/game'
import { CELL_COUNT, PLAYS_PER_DAILY, TILE_RUN_LENGTH } from './lettergrid/grid'
import type { LettergridState } from './lettergrid/game'
import {
  addLettergridSolve,
  countedSolves,
  deriveLettergridLog,
  deriveLettergridStatistics,
  emptyLettergridProgress,
  liveLettergridSlot,
  openLettergridDay,
  parseLettergridProgress,
  setLettergridSlot,
  type LettergridProgress,
  type LettergridSaved,
  type LettergridSolve,
} from './lettergridProgress'
import { MemoryStore, SaveStore } from './saveStore'
import { PlayerProfile } from './session'
import { deriveDailyLog, deriveStatistics, docsEqual, emptySyncDoc, mergeDocs, normalizeDoc, parseSyncDoc, setSlot, solveDay, openDay, winGame, type SyncDoc } from './syncDoc'

const DAY_MS = 24 * 60 * 60 * 1000

const baseState = (): LettergridState =>
  newGame({
    generatorVersion: 1,
    wordListVersion: 1,
    grid: Array.from({ length: CELL_COUNT }, () => null),
    bonuses: Array.from({ length: CELL_COUNT }, () => null),
    seedCells: [36, 37, 38],
    tileRun: Array.from({ length: TILE_RUN_LENGTH }, (_, i) => 'abcdefg'[i % 7]),
    par: { solverVersion: 1, greedyScore: 100, tiers: [60, 80, 95] },
  })

const DAYS = [100, 101, 102, 103, 104, 105, 400]
const IDS = ['a', 'b', 'c', 'd']
const arbTime = fc.tuple(fc.integer({ min: 0, max: 5 }), fc.constantFrom(0, 40, 100, 250)).map(([ms, d]) => ms + d * DAY_MS)

// Each Game ID belongs to one day in every document, but several Games share a day, so the
// earliest-finished and lower-Game-ID rules really run.
const DAY_OF: Record<string, number> = { a: 100, b: 100, c: 101, d: 101 }

const arbSolve = (id: string): fc.Arbitrary<LettergridSolve> =>
  fc
    .record({
      finishedAt: fc.integer({ min: 0, max: 3 }),
      stars: fc.constantFrom<0 | 1 | 2 | 3>(0, 1, 2, 3),
      plays: fc.array(fc.option(fc.integer({ min: 0, max: 60 }), { nil: null }), { minLength: PLAYS_PER_DAILY, maxLength: PLAYS_PER_DAILY }),
    })
    .map((r) => ({ gameId: id, day: DAY_OF[id], ...r, score: r.plays.reduce<number>((n, p) => n + (p ?? 0), 0) }))

const arbSaved = (id: string): fc.Arbitrary<LettergridSaved> =>
  fc.record({ id: fc.constant(id), startedAt: fc.integer({ min: 0, max: 9 }), state: fc.constant(baseState()) })

const subset = <T,>(items: readonly T[], make: (t: T) => fc.Arbitrary<unknown>) =>
  fc.tuple(...items.map((t) => fc.option(make(t), { nil: undefined })))
const pick = <T,>(keys: readonly (string | number)[], vals: readonly (T | undefined)[]): Record<string, T> =>
  Object.fromEntries(keys.flatMap((k, i) => (vals[i] === undefined ? [] : [[String(k), vals[i] as T]])))

const arbProgress: fc.Arbitrary<LettergridProgress> = fc
  .record({
    opened: subset(DAYS, () => fc.integer({ min: 95, max: 110 })),
    solves: subset(IDS, arbSolve),
    clock: fc.oneof(fc.constant(0), arbTime),
    slots: subset(DAYS, () =>
      fc.record({ updatedAt: arbTime, game: fc.option(fc.constantFrom(...IDS).chain(arbSaved), { nil: null }) }),
    ),
  })
  .map((r) => ({
    firstOpened: pick(DAYS, r.opened as (number | undefined)[]),
    solves: pick(IDS, r.solves as (LettergridSolve | undefined)[]),
    slots: pick(
      DAYS.map((d) => `daily.${d}`),
      r.slots as (LettergridProgress['slots'][string] | undefined)[],
    ),
    clock: r.clock,
  }))

const sudokuDoc = (): SyncDoc => {
  let d = emptySyncDoc()
  for (const day of [100, 101, 102]) {
    d = openDay(d, day, day)
    d = winGame(d, { id: `s${day}`, difficulty: 'easy', startedAt: day, dailyDay: day, seconds: 60 + day, mistakes: 0, hintsUsed: 0 })
    d = solveDay(d, day)
  }
  d = setSlot(d, 'game', newSudoku(generate('easy', 5n), 1000, 'gx'), 1000)
  return { ...d, unlockedAt: { [ACHIEVEMENTS[0].id]: 7 } }
}

const withLetter = (lettergrid: LettergridProgress, base: SyncDoc = emptySyncDoc()): SyncDoc => normalizeDoc({ ...base, lettergrid })

const same = (a: SyncDoc, b: SyncDoc): void => expect(docsEqual(a, b)).toBe(true)

const sudokuPart = (days: number[]): SyncDoc => {
  let d = emptySyncDoc()
  for (const day of days) d = solveDay(winGame(openDay(d, day, day), { id: `s${day}`, difficulty: 'easy', startedAt: day, dailyDay: day, seconds: 60 + day, mistakes: 0, hintsUsed: 0 }), day)
  return setSlot(d, 'game', newSudoku(generate('easy', 5n), 1000 + days.length, 'gx'), 1000 + days.length)
}
const SUDOKU_PARTS = [emptySyncDoc(), sudokuPart([100]), sudokuPart([100, 101, 102])]
const arbFull: fc.Arbitrary<SyncDoc> = fc
  .record({ lg: arbProgress, sudoku: fc.constantFrom(...SUDOKU_PARTS) })
  .map(({ lg, sudoku }) => withLetter(lg, sudoku))

describe('Lettergrid progress merges like the rest of the document', () => {
  test('whole documents holding both games merge commutatively, associatively and idempotently', () =>
    fc.assert(
      fc.property(arbFull, arbFull, arbFull, (x, y, z) => {
        same(mergeDocs(x, y), mergeDocs(y, x))
        same(mergeDocs(mergeDocs(x, y), z), mergeDocs(x, mergeDocs(y, z)))
        same(mergeDocs(x, x), x)
      }),
    ))

  test('commutative, associative and idempotent over generated logs', () =>
    fc.assert(
      fc.property(arbProgress, arbProgress, arbProgress, (a, b, c) => {
        const [x, y, z] = [a, b, c].map((p) => withLetter(p))
        same(mergeDocs(x, y), mergeDocs(y, x))
        same(mergeDocs(mergeDocs(x, y), z), mergeDocs(x, mergeDocs(y, z)))
        same(mergeDocs(x, x), x)
        same(mergeDocs(x, emptySyncDoc()), x)
      }),
    ))

  test('every solve survives a merge, and openings only move earlier', () =>
    fc.assert(
      fc.property(arbProgress, arbProgress, (a, b) => {
        const m = mergeDocs(withLetter(a), withLetter(b)).lettergrid
        for (const src of [a, b]) {
          for (const id of Object.keys(src.solves)) expect(Object.hasOwn(m.solves, id)).toBe(true)
          for (const [d, o] of Object.entries(src.firstOpened)) expect(m.firstOpened[d]).toBeLessThanOrEqual(o)
        }
      }),
    ))

  test('the counted solve is always the earliest finished, ties going to the lower Game ID', () =>
    fc.assert(
      fc.property(arbProgress, arbProgress, (a, b) => {
        const m = mergeDocs(withLetter(a), withLetter(b)).lettergrid
        const counted = countedSolves(m)
        for (const day of [100, 101]) {
          const all = Object.values(m.solves).filter((s) => s.day === day)
          const got = counted.get(day)
          if (all.length === 0) {
            expect(got).toBeUndefined()
            continue
          }
          const expected = [...all].sort((p, q) => p.finishedAt - q.finishedAt || (p.gameId < q.gameId ? -1 : 1))[0]
          expect(got).toEqual(expected)
        }
        // Merge order never changes which solve counts.
        expect(countedSolves(mergeDocs(withLetter(b), withLetter(a)).lettergrid)).toEqual(counted)
      }),
    ))

  test('a later solve of a day never changes its score, Par stars or the Statistics', () => {
    const early: LettergridSolve = { gameId: 'z', day: 100, finishedAt: 1, score: 50, stars: 1, plays: [50] }
    const late: LettergridSolve = { gameId: 'a', day: 100, finishedAt: 2, score: 200, stars: 3, plays: [200] }
    let p = openLettergridDay(emptyLettergridProgress(), 100, 100)
    p = addLettergridSolve(addLettergridSolve(p, early), late)
    expect(countedSolves(p).get(100)).toEqual(early)
    expect(deriveLettergridStatistics(p)).toEqual({ dailiesPlayed: 1, bestScore: 50, parReached: [1, 0, 0] })
  })

  test('equal finish times go to the lower Game ID', () => {
    const a: LettergridSolve = { gameId: 'a', day: 100, finishedAt: 5, score: 10, stars: 0, plays: [] }
    const b: LettergridSolve = { gameId: 'b', day: 100, finishedAt: 5, score: 99, stars: 3, plays: [] }
    expect(countedSolves(addLettergridSolve(addLettergridSolve(emptyLettergridProgress(), b), a)).get(100)?.gameId).toBe('a')
  })

  test('a solved day leaves no Game to continue, even from a stale write', () => {
    const saved: LettergridSaved = { id: 'g1', startedAt: 1, state: baseState() }
    let p = setLettergridSlot(emptyLettergridProgress(), 100, saved, 5)
    expect(liveLettergridSlot(p, 100)).not.toBeNull()
    p = addLettergridSolve(p, { gameId: 'g1', day: 100, finishedAt: 9, score: 1, stars: 0, plays: [] })
    expect(liveLettergridSlot(p, 100)).toBeNull()
    expect(liveLettergridSlot(setLettergridSlot(p, 100, saved, 50), 100)).toBeNull()
  })

  test('the newest write to a slot wins and a cleared marker beats an older game', () => {
    const saved: LettergridSaved = { id: 'g1', startedAt: 1, state: baseState() }
    const a = withLetter(setLettergridSlot(emptyLettergridProgress(), 100, saved, 5))
    const b = withLetter(setLettergridSlot(emptyLettergridProgress(), 100, null, 9))
    expect(liveLettergridSlot(mergeDocs(a, b).lettergrid, 100)).toBeNull()
    expect(liveLettergridSlot(mergeDocs(b, a).lettergrid, 100)).toBeNull()
  })
})

describe('Lettergrid never touches Sudoku', () => {
  test('Sudoku Streak, Calendar, Statistics and Achievements are identical whatever Lettergrid data exists', () =>
    fc.assert(
      fc.property(arbProgress, (lg) => {
        const plain = normalizeDoc(sudokuDoc())
        const mixed = normalizeDoc({ ...plain, lettergrid: lg })
        const [pl, mx] = [deriveDailyLog(plain), deriveDailyLog(mixed)]
        expect(mx).toEqual(pl)
        expect(deriveStatistics(mixed)).toEqual(deriveStatistics(plain))
        for (const day of [99, 100, 101, 102, 103, 104]) expect(currentStreak(mx, day)).toBe(currentStreak(pl, day))
        expect(longestStreak(mx)).toBe(longestStreak(pl))
        expect(isPerfectWeek(mx, 101)).toBe(isPerfectWeek(pl, 101))
        expect(isFullMonth(mx, 101)).toBe(isFullMonth(pl, 101))
        expect(mixed.unlockedAt).toEqual(plain.unlockedAt)
        expect(mixed.games).toEqual(plain.games)
        expect(mixed.solved).toEqual(plain.solved)
        expect(mixed.firstOpened).toEqual(plain.firstOpened)
        // Lettergrid never moves the Sudoku clock, so Sudoku slots are exactly what plain Sudoku play leaves.
        expect(mixed.clock).toBe(plain.clock)
        expect(mixed.slots).toEqual(plain.slots)
      }),
    ))

  test('Sudoku data never feeds the Lettergrid log, Streak or Statistics', () => {
    const lg = withLetter(openLettergridDay(emptyLettergridProgress(), 100, 100)).lettergrid
    const noisy = normalizeDoc({ ...sudokuDoc(), lettergrid: lg })
    expect(deriveLettergridLog(noisy.lettergrid)).toEqual(deriveLettergridLog(lg))
    expect(deriveLettergridStatistics(noisy.lettergrid)).toEqual({ dailiesPlayed: 1, bestScore: null, parReached: [0, 0, 0] })
    expect(currentStreak(deriveLettergridLog(noisy.lettergrid), 102)).toBe(0)
  })

  test('Lettergrid has its own Streak, with On-Day and Catch-Up kinds from its own openings', () => {
    let p = emptyLettergridProgress()
    for (const day of [100, 101]) {
      p = openLettergridDay(p, day, day)
      p = addLettergridSolve(p, { gameId: `g${day}`, day, finishedAt: day, score: 1, stars: 0, plays: [] })
    }
    p = openLettergridDay(p, 99, 101)
    p = addLettergridSolve(p, { gameId: 'old', day: 99, finishedAt: 5, score: 1, stars: 0, plays: [] })
    const log = deriveLettergridLog(p)
    expect(log.solves[99]).toBe('catchUp')
    expect(currentStreak(log, 101)).toBe(2)
    expect(longestStreak(log)).toBe(2)
  })
})

describe('persistence and migration', () => {
  test('a pre-Lettergrid document loads unchanged with empty Lettergrid progress and round-trips', () => {
    const legacyShape = JSON.parse(JSON.stringify(winGame(emptySyncDoc(), { id: 'w1', difficulty: 'hard', startedAt: 3, dailyDay: null, seconds: 99, mistakes: 1, hintsUsed: 0 }))) as Record<string, unknown>
    delete legacyShape.lettergrid
    const parsed = parseSyncDoc(legacyShape)
    expect(parsed).not.toBeNull()
    expect(parsed!.lettergrid).toEqual(emptyLettergridProgress())
    expect(parsed!.games.w1.wonSeconds).toBe(99)
    expect(parseSyncDoc(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed)
    // And through the store, as a v2 record written before this change.
    const kv = new MemoryStore()
    kv.setItem('sudoku.v2.doc', JSON.stringify({ v: 2, data: legacyShape }))
    expect(new SaveStore(kv).loadDoc()).toEqual(parsed)
  })

  test('any document with Lettergrid data survives a JSON and store round trip', () =>
    fc.assert(
      fc.property(arbProgress, (lg) => {
        const doc = withLetter(lg)
        expect(parseSyncDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
        const kv = new MemoryStore()
        new SaveStore(kv).saveDoc(doc)
        expect(new SaveStore(kv).loadDoc()).toEqual(doc)
      }),
    ))

  test('malformed Lettergrid data is rejected, not repaired', () => {
    const good = JSON.parse(JSON.stringify(withLetter(setLettergridSlot(emptyLettergridProgress(), 100, { id: 'g', startedAt: 1, state: baseState() }, 5)))) as SyncDoc
    expect(parseSyncDoc(good)).not.toBeNull()
    for (const bad of [
      { lettergrid: 3 },
      { lettergrid: { ...good.lettergrid, solves: { x: { gameId: 'y' } } } },
      { lettergrid: { ...good.lettergrid, firstOpened: { nope: 1 } } },
      { lettergrid: { ...good.lettergrid, slots: { 'daily.100': { updatedAt: 1, game: { id: 'g', startedAt: 1, state: { grid: [] } } } } } },
    ]) expect(parseLettergridProgress(bad.lettergrid)).toBeNull()
  })
})

describe('real Lettergrid games', () => {
  test('a Daily with real Plays and a Swap round-trips through the sync document', () => {
    const words = parseWordList(readFileSync(resolve(__dirname, '../../public', wordListPath(CURRENT_WORD_LIST_VERSION)), 'utf8'))
    let state = newDailyGame(lettergridDaily(dayFromYMD(2026, 11, 5), words))
    for (let i = 0; i < 4; i++) {
      const best = bestPlay(state, words)
      const r = applyAction(state, best ? { type: 'play', tiles: best.tiles } : { type: 'swap' }, words)
      if (!r.ok) throw new Error(r.reason)
      state = r.state
    }
    const r = applyAction(state, { type: 'swap' }, words)
    if (!r.ok) throw new Error(r.reason)
    const saved: LettergridSaved = { id: 'real', startedAt: 1, state: r.state }
    const doc = withLetter(setLettergridSlot(emptyLettergridProgress(), 100, saved, 5))
    expect(parseSyncDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc)
  })
})

describe('PlayerProfile Lettergrid Dailies', () => {
  test('an unfinished game records no solve', () => {
    const clock = { t: 1_000 }
    const profile = new PlayerProfile(new SaveStore(new MemoryStore()), () => clock.t, () => 'id1')
    const saved = profile.startLettergridDaily(baseState(), 100)
    profile.saveLettergrid(100, saved)
    expect(profile.lettergridSolve(100)).toBeNull()
    expect(profile.hasLettergridInProgress(100)).toBe(true)
  })

  const make = (clock: { t: number }, kv = new MemoryStore()) => {
    let n = 0
    return new PlayerProfile(new SaveStore(kv), () => clock.t, () => `id${++n}`)
  }

  test('open, resume, finish and count only the first finished solve', () => {
    const clock = { t: 1_000 }
    const profile = make(clock)
    expect(profile.openLettergridDaily(100, 100)).toBe('needsGame')
    const saved = profile.startLettergridDaily(baseState(), 100)
    expect(profile.hasLettergridInProgress(100)).toBe(true)
    expect(profile.openLettergridDaily(100, 100)).toMatchObject({ id: saved.id })
    expect(profile.openLettergridDaily(101, 100)).toBeNull()

    // Six Swaps finish the Daily without needing a Word List.
    let state = saved.state
    for (let i = 0; i < PLAYS_PER_DAILY; i++) {
      const r = applyAction(state, { type: 'swap' }, { version: 1, isWord: () => false } as never)
      if (!r.ok) throw new Error(r.reason)
      state = r.state
    }
    clock.t = 2_000
    profile.saveLettergrid(100, { ...saved, state })
    expect(profile.lettergridSolve(100)).toMatchObject({ gameId: saved.id, finishedAt: 2_000, score: 0, plays: [null, null, null, null, null, null] })
    expect(profile.hasLettergridInProgress(100)).toBe(false)
    expect(profile.openLettergridDaily(100, 100)).toBeNull()
    expect(profile.lettergridStreak(100)).toBe(1)
    expect(profile.lettergridStatistics).toEqual({ dailiesPlayed: 1, bestScore: 0, parReached: [0, 0, 0] })
    // Sudoku is untouched.
    expect(profile.dailyLog).toEqual({ firstOpened: {}, solves: {} })
    expect(profile.currentStreak(100)).toBe(0)
    expect(profile.statistics.easy.played).toBe(0)
  })
})
