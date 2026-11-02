import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { generate } from './generator'
import { newGame } from './gameState'
import { MemoryStore, SaveStore } from './saveStore'
import { PlayerProfile } from './session'
import { migrateLegacy, type LegacyData } from './migration'
import { DIFFICULTIES } from './difficulty'
import { deriveDailyLog, deriveStatistics, liveGameSlot, wonGameCount } from './syncDoc'

const v1 = (kv: MemoryStore, key: string, data: unknown) => kv.setItem(`sudoku.v1.${key}`, JSON.stringify({ v: 1, data }))
const legacyGame = (seed: bigint, difficulty: 'easy' | 'hard' = 'easy') => {
  const { id: _id, ...rest } = newGame(generate(difficulty, seed), 5_000)
  void _id
  return { ...rest, elapsedSeconds: 30 }
}

function seeded() {
  const kv = new MemoryStore()
  v1(kv, 'statistics', {
    easy: { played: 5, won: 3, bestTimeSeconds: 111 },
    medium: { played: 0, won: 0, bestTimeSeconds: null },
    hard: { played: 2, won: 1, bestTimeSeconds: 900 },
    expert: { played: 0, won: 0, bestTimeSeconds: null },
  })
  v1(kv, 'dailyLog', { firstOpened: { 100: 100, 101: 103 }, solves: { 100: 'onDay', 101: 'catchUp' } })
  v1(kv, 'achievements', { solveCount: 4, unlockedAt: { firstSolve: 7, winEasy: 7 } })
  v1(kv, 'game', legacyGame(1n))
  v1(kv, 'daily.101', legacyGame(2n, 'hard'))
  return kv
}

describe('migrating local storage v1', () => {
  test('keeps every number the player could see', () => {
    const kv = seeded()
    const profile = new PlayerProfile(new SaveStore(kv))
    expect(profile.statistics).toEqual({
      easy: { played: 5, won: 3, bestTimeSeconds: 111 },
      medium: { played: 0, won: 0, bestTimeSeconds: null },
      hard: { played: 2, won: 1, bestTimeSeconds: 900 },
      expert: { played: 0, won: 0, bestTimeSeconds: null },
    })
    expect(profile.dailyLog.solves).toEqual({ 100: 'onDay', 101: 'catchUp' })
    expect(profile.dailyLog.firstOpened).toEqual({ 100: 100, 101: 103 })
    expect(profile.achievements.unlockedAt).toEqual({ firstSolve: 7, winEasy: 7 })
  })

  test('keeps the v1 data when the new document cannot be stored, and migrates on a later launch', () => {
    const kv = seeded()
    let full = true
    const flaky = {
      getItem: (k: string) => kv.getItem(k),
      removeItem: (k: string) => kv.removeItem(k),
      setItem: (k: string, v: string) => {
        if (full && k === 'sudoku.v2.doc') throw new Error('QuotaExceededError')
        kv.setItem(k, v)
      },
    }
    expect(new PlayerProfile(new SaveStore(flaky)).statistics.easy.played).toBe(5)
    full = false
    expect(new PlayerProfile(new SaveStore(flaky)).statistics.easy.played).toBe(5)
  })

  test('gives Games in progress ids that match an unfinished record, so finishing one adds no extra Game', () => {
    const kv = seeded()
    const store = new SaveStore(kv)
    const doc = store.loadDoc()
    const g = liveGameSlot(doc)!.game
    expect(doc.games[g.id]).toMatchObject({ difficulty: 'easy', wonSeconds: null, startedAt: 5_000 })
    expect(doc.slots['daily.101']).toBeUndefined() // day 101 is solved: its slot is shed
    const before = deriveStatistics(doc)
    const profile = new PlayerProfile(store)
    const session = profile.continueGame()!
    expect(session.state.id).toBe(g.id)
    expect(deriveStatistics(profile.syncDoc()).easy.played).toBe(before.easy.played)
  })

  test('runs once: v1 keys are removed and a second load reads the new document', () => {
    const kv = seeded()
    const first = new SaveStore(kv).loadDoc()
    expect(kv.getItem('sudoku.v1.statistics')).toBeNull()
    expect(kv.getItem('sudoku.v1.daily.101')).toBeNull()
    expect(new SaveStore(kv).loadDoc()).toEqual(first)
  })

  test('a solve with no recorded opening is rebuilt with the same kind', () => {
    const kv = new MemoryStore()
    v1(kv, 'dailyLog', { firstOpened: {}, solves: { 50: 'onDay', 60: 'catchUp' } })
    expect(deriveDailyLog(new SaveStore(kv).loadDoc()).solves).toEqual({ 50: 'onDay', 60: 'catchUp' })
  })

  test('keeps Achievement progress after a v1 Statistics reset left solveCount above the wins', () => {
    const kv = new MemoryStore()
    v1(kv, 'statistics', {
      easy: { played: 2, won: 2, bestTimeSeconds: 100 },
      medium: { played: 0, won: 0, bestTimeSeconds: null },
      hard: { played: 0, won: 0, bestTimeSeconds: null },
      expert: { played: 0, won: 0, bestTimeSeconds: null },
    })
    v1(kv, 'achievements', { solveCount: 45, unlockedAt: { firstSolve: 7 } })
    const profile = new PlayerProfile(new SaveStore(kv))
    expect(profile.statistics.easy.won).toBe(2)
    expect(profile.achievements.solveCount).toBe(45)
  })

  test('an empty device migrates to an empty document', () => {
    expect(new SaveStore(new MemoryStore()).loadDoc().games).toEqual({})
  })
})

describe('migrating arbitrary v1 data', () => {
  const arbCounters = fc
    .tuple(fc.integer({ min: 0, max: 30 }), fc.integer({ min: 0, max: 30 }), fc.integer({ min: 1, max: 5000 }))
    .map(([a, b, best]) => {
      const won = Math.min(a, b)
      return { played: Math.max(a, b), won, bestTimeSeconds: won > 0 ? best : null }
    })
  const arbLegacy: fc.Arbitrary<LegacyData> = fc.record({
    statistics: fc.tuple(arbCounters, arbCounters, arbCounters, arbCounters).map(([easy, medium, hard, expert]) => ({ easy, medium, hard, expert })),
    dailyLog: fc
      .uniqueArray(fc.tuple(fc.integer({ min: 0, max: 500 }), fc.integer({ min: -3, max: 6 }), fc.boolean()), { selector: (t) => t[0], maxLength: 20 })
      .map((days) => {
        const firstOpened: Record<number, number> = {}
        const solves: Record<number, 'onDay' | 'catchUp'> = {}
        for (const [day, offset, solved] of days) {
          firstOpened[day] = day + offset
          if (solved) solves[day] = offset <= 0 ? 'onDay' : 'catchUp'
        }
        return { firstOpened, solves }
      }),
    achievements: fc
      .record({ extra: fc.integer({ min: 0, max: 40 }), unlocks: fc.dictionary(fc.constantFrom('firstSolve', 'winEasy', 'winHard'), fc.integer({ min: 0, max: 9999 })) })
      .map((a) => ({ solveCount: a.extra, unlockedAt: a.unlocks })),
    game: fc.constant(null),
    dailies: fc.constant({}),
  }) as fc.Arbitrary<LegacyData>
  const counter = () => {
    let n = 0
    return () => `id-${n++}`
  }

  test('derived Statistics equal the v1 counters', () =>
    fc.assert(
      fc.property(arbLegacy, (legacy) => {
        const stats = deriveStatistics(migrateLegacy(legacy, counter()))
        for (const d of DIFFICULTIES) expect(stats[d]).toEqual(legacy.statistics![d])
      }),
    ))

  test('the Daily log, openings and unlocks carry over exactly', () =>
    fc.assert(
      fc.property(arbLegacy, (legacy) => {
        const doc = migrateLegacy(legacy, counter())
        const log = deriveDailyLog(doc)
        expect(log.solves).toEqual(legacy.dailyLog!.solves)
        expect(log.firstOpened).toEqual(legacy.dailyLog!.firstOpened)
        expect(doc.unlockedAt).toEqual(legacy.achievements!.unlockedAt)
      }),
    ))

  test('Achievement solve progress never drops below the v1 solve count, and equals it when it was at least the wins', () =>
    fc.assert(
      fc.property(arbLegacy, (legacy) => {
        const wins = DIFFICULTIES.reduce((n, d) => n + legacy.statistics![d].won, 0)
        const count = wonGameCount(migrateLegacy(legacy, counter()))
        expect(count).toBeGreaterThanOrEqual(legacy.achievements!.solveCount)
        expect(count).toBe(Math.max(wins, legacy.achievements!.solveCount))
      }),
    ))
})

describe('migrating old in-progress Dailies', () => {
  test('keeps an unfinished Daily for a day far behind the newest', () => {
    const kv = new MemoryStore()
    v1(kv, 'dailyLog', { firstOpened: { 10: 10, 400: 400 }, solves: { 400: 'onDay' } })
    v1(kv, 'daily.10', legacyGame(3n))
    const store = new SaveStore(kv)
    expect(store.loadDoc().slots['daily.10']?.game).not.toBeNull()
    expect(new PlayerProfile(store).hasDailyInProgress(10)).toBe(true)
  })
})
