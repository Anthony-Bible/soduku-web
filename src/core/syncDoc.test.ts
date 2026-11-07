import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { ACHIEVEMENTS } from './achievements'
import { catchUpAchievements } from './catchUp'
import { DIFFICULTIES } from './difficulty'
import { generate } from './generator'
import { newGame, type GameState } from './gameState'
import { emptyLettergridProgress } from './lettergridProgress'
import {
  GAME_SLOT_KEY,
  liveGameSlot,
  deriveDailyLog,
  deriveStatistics,
  dailySlotKey,
  docsEqual,
  emptySyncDoc,
  mergeDocs,
  normalizeDoc,
  parseSyncDoc,
  addGame,
  setSlot,
  winGame,
  type GameRecord,
  type Slot,
  type SyncDoc,
} from './syncDoc'

const POOL: GameState[] = [
  newGame(generate('easy', 11n), 1, 'ga'),
  newGame(generate('medium', 12n), 2, 'gb'),
  newGame(generate('hard', 13n), 3, 'gc'),
]

const DAY_MS = 24 * 60 * 60 * 1000
/** Epoch-ish milliseconds spread over more than the 90-day slot retention, so pruning really runs. */
const arbTime = fc.tuple(fc.integer({ min: 0, max: 5 }), fc.constantFrom(0, 40, 100, 250)).map(([ms, days]) => ms + days * DAY_MS)

const arbRecord = (id: string): fc.Arbitrary<GameRecord> =>
  fc
    .record({
      difficulty: fc.constantFrom(...DIFFICULTIES),
      startedAt: arbTime,
      dailyDay: fc.option(fc.integer({ min: 100, max: 104 }), { nil: null }),
      won: fc.option(
        fc.record({ seconds: fc.integer({ min: 0, max: 5 }), mistakes: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }), hints: fc.option(fc.integer({ min: 0, max: 2 }), { nil: null }) }),
        { nil: null },
      ),
    })
    .map((r) => ({
      id,
      difficulty: r.difficulty,
      startedAt: r.startedAt,
      dailyDay: r.dailyDay,
      wonSeconds: r.won?.seconds ?? null,
      mistakes: r.won?.mistakes ?? null,
      hintsUsed: r.won?.hints ?? null,
    }))

const arbSlot: fc.Arbitrary<Slot> = fc.record({
  updatedAt: arbTime,
  game: fc.option(fc.constantFrom(...POOL), { nil: null }),
})

const IDS = ['r1', 'r2', 'r3', 'r4']
const DAYS = [100, 101, 102, 103, 104, 105, 400]
const SLOT_KEYS = [GAME_SLOT_KEY, ...DAYS.map(dailySlotKey)]
const UNLOCKS = ACHIEVEMENTS.slice(0, 6).map((a) => a.id)

const subset = <T,>(items: readonly T[], make: (t: T) => fc.Arbitrary<unknown>) =>
  fc.tuple(...items.map((t) => fc.option(make(t), { nil: undefined })))

const arbDoc: fc.Arbitrary<SyncDoc> = fc
  .record({
    games: subset(IDS, arbRecord),
    opened: subset(DAYS, () => fc.integer({ min: 95, max: 110 })),
    solved: subset(DAYS, () => fc.constant(true)),
    unlocks: subset(UNLOCKS, () => fc.integer({ min: 0, max: 9 })),
    slots: subset(SLOT_KEYS, () => arbSlot),
    legacy: subset(['m1', 'm2'], () => fc.integer({ min: 0, max: 40 })),
  })
  .map(({ games, opened, solved, unlocks, slots, legacy }) => {
    const pick = <T,>(keys: readonly (string | number)[], vals: readonly (T | undefined)[]) =>
      Object.fromEntries(keys.flatMap((k, i) => (vals[i] === undefined ? [] : [[String(k), vals[i]]])))
    return normalizeDoc({
      v: 1,
      games: pick(IDS, games as (GameRecord | undefined)[]),
      firstOpened: pick(DAYS, opened as (number | undefined)[]),
      solved: pick(DAYS, solved as (true | undefined)[]),
      unlockedAt: pick(UNLOCKS, unlocks as (number | undefined)[]),
      slots: pick(SLOT_KEYS, slots as (Slot | undefined)[]),
      legacySolves: pick(['m1', 'm2'], legacy as (number | undefined)[]),
      lettergrid: emptyLettergridProgress(),
      clock: 0,
    } as SyncDoc)
  })

const same = (a: SyncDoc, b: SyncDoc): void => {
  expect(docsEqual(a, b)).toBe(true)
}

describe('merge laws', () => {
  test('commutative', () => fc.assert(fc.property(arbDoc, arbDoc, (a, b) => same(mergeDocs(a, b), mergeDocs(b, a)))))
  test('associative', () =>
    fc.assert(fc.property(arbDoc, arbDoc, arbDoc, (a, b, c) => same(mergeDocs(mergeDocs(a, b), c), mergeDocs(a, mergeDocs(b, c))))))
  test('idempotent', () => fc.assert(fc.property(arbDoc, (a) => same(mergeDocs(a, a), a))))
  test('merging with an empty document is the identity', () =>
    fc.assert(fc.property(arbDoc, (a) => {
      same(mergeDocs(a, emptySyncDoc()), a)
      same(mergeDocs(emptySyncDoc(), a), a)
    })))
})

describe('merge never loses progress', () => {
  test('wins, best times, solved days, openings and unlocks all survive', () =>
    fc.assert(
      fc.property(arbDoc, arbDoc, (a, b) => {
        const m = mergeDocs(a, b)
        for (const src of [a, b]) {
          for (const r of Object.values(src.games)) {
            const got = m.games[r.id]
            expect(got).toBeDefined()
            if (r.wonSeconds !== null) {
              expect(got.wonSeconds).not.toBeNull()
              expect(got.wonSeconds as number).toBeLessThanOrEqual(r.wonSeconds)
            }
          }
          for (const d of Object.keys(src.solved)) expect(m.solved[d]).toBe(true)
          for (const [d, o] of Object.entries(src.firstOpened)) expect(m.firstOpened[d]).toBeLessThanOrEqual(o)
          for (const [id, t] of Object.entries(src.unlockedAt)) expect(m.unlockedAt[id as keyof typeof m.unlockedAt]).toBeLessThanOrEqual(t)
        }
      }),
    ))

  test('derived Statistics never count a Game twice and never shrink', () =>
    fc.assert(
      fc.property(arbDoc, arbDoc, (a, b) => {
        const sa = deriveStatistics(a)
        const sb = deriveStatistics(b)
        const sm = deriveStatistics(mergeDocs(a, b))
        const ids = new Set([...Object.keys(a.games), ...Object.keys(b.games)])
        let played = 0
        for (const d of DIFFICULTIES) {
          played += sm[d].played
          expect(sm[d].won).toBeLessThanOrEqual(sm[d].played)
        }
        expect(played).toBe(ids.size)
        expect(deriveStatistics(mergeDocs(a, a))).toEqual(sa)
        expect(deriveStatistics(mergeDocs(mergeDocs(a, b), b))).toEqual(sm)
        // Games won on either side are won in the merge.
        const wonIds = new Set([...Object.values(a.games), ...Object.values(b.games)].filter((r) => r.wonSeconds !== null).map((r) => r.id))
        expect(Object.values(mergeDocs(a, b).games).filter((r) => r.wonSeconds !== null).length).toBe(wonIds.size)
        void sb
      }),
    ))

  test('the On-Day/Catch-Up kind follows the merged earliest opening', () =>
    fc.assert(
      fc.property(arbDoc, arbDoc, (a, b) => {
        const m = mergeDocs(a, b)
        const log = deriveDailyLog(m)
        for (const k of Object.keys(m.solved)) {
          const opened = m.firstOpened[k]
          expect(log.solves[Number(k)]).toBe(opened !== undefined && opened <= Number(k) ? 'onDay' : 'catchUp')
        }
        expect(deriveDailyLog(mergeDocs(b, a))).toEqual(log)
      }),
    ))
})

describe('Games in progress', () => {
  const KEY = GAME_SLOT_KEY
  const slotDoc = (updatedAt: number, game: GameState | null, key = KEY): SyncDoc => ({ ...emptySyncDoc(), slots: { [key]: { updatedAt, game } } })

  test('a cleared marker newer than a slot clears it on every device, whatever order they sync in', () =>
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 50 }), fc.integer({ min: 1, max: 50 }), arbDoc, (t, gap, other) => {
        const stale = slotDoc(t, POOL[0])
        const cleared = slotDoc(t + gap, null)
        const withoutSlot: SyncDoc = { ...other, slots: {} }
        for (const m of [mergeDocs(stale, cleared), mergeDocs(cleared, stale), mergeDocs(mergeDocs(withoutSlot, cleared), stale), mergeDocs(stale, mergeDocs(cleared, withoutSlot))]) {
          // Either the marker is still there, or it and the slot it covers both aged out of the document.
          expect([undefined, { updatedAt: t + gap, game: null }]).toContainEqual(m.slots[KEY])
          expect(liveGameSlot(m)).toBeNull()
        }
      }),
    ))

  test('a stale write after the cleared marker cannot bring a won Game back', () => {
    const game = POOL[0]
    const won = winGame(emptySyncDoc(), { id: game.id, difficulty: game.difficulty, startedAt: 1, dailyDay: null, seconds: 5, mistakes: 0, hintsUsed: 0 })
    const behind = mergeDocs(slotDoc(10, game), mergeDocs(won, slotDoc(20, null)))
    // The stale device makes another move (newer than the marker) in its still-open session.
    const written = setSlot(behind, KEY, game, 99)
    expect(liveGameSlot(written)).toBeNull()
    // Even if such a slot reaches a device through a merge, a won Game is never offered to continue.
    expect(liveGameSlot(mergeDocs(won, slotDoc(99, game)))).toBeNull()
    const unwon = addGame(emptySyncDoc(), { ...won.games[game.id], wonSeconds: null, mistakes: null, hintsUsed: null })
    expect(liveGameSlot(mergeDocs(unwon, slotDoc(99, game)))).not.toBeNull()
  })

  test('the most recently played Game is the one to continue', () => {
    const m = mergeDocs(slotDoc(5, POOL[0]), slotDoc(9, POOL[1]))
    expect(liveGameSlot(m)?.game.id).toBe('gb')
  })

  test('a stale move on an already-won Game from another device never brings that Game back', () => {
    const [g1, g2] = POOL
    const wonG1 = winGame(emptySyncDoc(), { id: g1.id, difficulty: g1.difficulty, startedAt: 1, dailyDay: null, seconds: 5, mistakes: 0, hintsUsed: 0 })
    // Device A: won G1 (cleared its slot at 20), then started and played G2 until 30.
    const a = mergeDocs(wonG1, mergeDocs(slotDoc(20, null), slotDoc(30, g2)))
    // Device B never saw the win and moved in G1 at 40.
    const b = slotDoc(40, g1)
    for (const m of [mergeDocs(a, b), mergeDocs(b, a)]) {
      // Last-writer-wins: the stale write is newer, so G2 is dropped, but the won G1 is never offered.
      expect(liveGameSlot(m)).toBeNull()
    }
    same(mergeDocs(a, b), mergeDocs(b, a))
  })

  test('a Game that lost the conflict stays gone after the winning Game ends', () => {
    const [x, y] = POOL
    // Device A plays X until t=10. Device B never saw X, starts Y at t=20 and wins it at t=30.
    const a = slotDoc(10, x)
    const started = setSlot(emptySyncDoc(), KEY, y, 20)
    const wonY = setSlot(
      winGame(started, { id: y.id, difficulty: y.difficulty, startedAt: 20, dailyDay: null, seconds: 5, mistakes: 0, hintsUsed: 0 }),
      KEY,
      null,
      30,
    )
    for (const m of [mergeDocs(a, wonY), mergeDocs(wonY, a), mergeDocs(a, started)]) {
      expect(liveGameSlot(mergeDocs(m, wonY))).toBeNull()
    }
    expect(liveGameSlot(mergeDocs(a, wonY))).toBeNull()
    expect(liveGameSlot(mergeDocs(a, started))?.game.id).toBe(y.id)
  })

  test('merging stays associative when pruning crosses the retention window', () => {
    const rec = (startedAt: number): GameRecord => ({ id: 'c', difficulty: 'easy', startedAt, dailyDay: null, wonSeconds: null, mistakes: null, hintsUsed: null })
    const a: SyncDoc = { ...emptySyncDoc(), games: { c: rec(0) } }
    const b: SyncDoc = { ...emptySyncDoc(), games: { c: rec(7_862_400_000) } }
    const c: SyncDoc = { ...emptySyncDoc(), slots: { [dailySlotKey(1)]: { updatedAt: 0, game: null } } }
    same(mergeDocs(mergeDocs(a, b), c), mergeDocs(a, mergeDocs(b, c)))
    same(mergeDocs(mergeDocs(a, c), b), mergeDocs(mergeDocs(c, b), a))
  })

  test('a solved day sheds its Daily slots, so a stale device cannot bring one back', () => {
    const day = 200
    const live: SyncDoc = { ...emptySyncDoc(), firstOpened: { [day]: day }, slots: { [dailySlotKey(day)]: { updatedAt: 1, game: POOL[0] } } }
    const solved: SyncDoc = { ...emptySyncDoc(), firstOpened: { [day]: day }, solved: { [day]: true } }
    expect(mergeDocs(live, solved).slots).toEqual({})
    expect(mergeDocs(solved, live).slots).toEqual({})
  })

  test('Daily slots untouched for a long time are forgotten, while an old day played recently is kept', () => {
    const DAY = 24 * 60 * 60 * 1000
    const now = 1_000 * DAY
    const rec: GameRecord = { id: 'new', difficulty: 'easy', startedAt: now, dailyDay: null, wonSeconds: null, mistakes: null, hintsUsed: null }
    const doc: SyncDoc = {
      ...emptySyncDoc(),
      games: { new: rec },
      firstOpened: { 10: 10, 500: 500 },
      slots: {
        [dailySlotKey(10)]: { updatedAt: now - 200 * DAY, game: POOL[0] }, // stale
        [dailySlotKey(11)]: { updatedAt: now - DAY, game: POOL[1] }, // an old day, played yesterday
        [GAME_SLOT_KEY]: { updatedAt: now - 200 * DAY, game: null }, // a stale cleared marker
      },
    }
    const m = mergeDocs(doc, emptySyncDoc())
    expect(Object.keys(m.slots)).toEqual([dailySlotKey(11)])
    expect(m.firstOpened).toEqual({ 10: 10, 500: 500 })
  })
})

describe('Achievements from merged history', () => {
  const won = (id: string): GameRecord => ({ id, difficulty: 'easy', startedAt: 1, dailyDay: null, wonSeconds: 400, mistakes: 2, hintsUsed: 1 })
  const docOf = (ids: string[]): SyncDoc => ({ ...emptySyncDoc(), games: Object.fromEntries(ids.map((i) => [i, won(i)])) })

  test('two devices with six solves each earn Ten Down once merged, and Games are counted once', () => {
    const a = docOf(['a1', 'a2', 'a3', 'a4', 'a5', 'a6'])
    const b = docOf(['b1', 'b2', 'b3', 'b4', 'b5', 'b6'])
    const merged = catchUpAchievements(mergeDocs(a, b), 99)
    expect(merged.unlockedAt.tenDown).toBe(99)
    expect(Object.keys(merged.games)).toHaveLength(12)
    expect(catchUpAchievements(mergeDocs(a, mergeDocs(a, a)), 99).unlockedAt.tenDown).toBeUndefined()
  })
})

describe('parseSyncDoc', () => {
  test('merges ids that are also names on Object.prototype like any other id', () => {
    const record = { id: 'toString', difficulty: 'easy', startedAt: 5, dailyDay: null, wonSeconds: 60, mistakes: 0, hintsUsed: 0 }
    const doc = parseSyncDoc({ ...emptySyncDoc(), games: { toString: record }, legacySolves: { valueOf: 3 } })!
    expect(doc).not.toBeNull()
    for (const merged of [mergeDocs(emptySyncDoc(), doc), mergeDocs(doc, emptySyncDoc()), mergeDocs(doc, doc)]) {
      expect(merged.games.toString).toEqual(doc.games.toString)
      expect(merged.legacySolves.valueOf).toBe(3)
    }
  })

  test('accepts every well-formed document and survives a JSON round trip', () =>
    fc.assert(fc.property(arbDoc, (a) => same(parseSyncDoc(JSON.parse(JSON.stringify(a))) as SyncDoc, a))))

  test.each([
    ['not an object', 5],
    ['wrong version', { ...emptySyncDoc(), v: 2 }],
    ['bad record', { ...emptySyncDoc(), games: { x: { id: 'y' } } }],
    ['unsafe id', { ...emptySyncDoc(), games: JSON.parse('{"__proto__":{"id":"__proto__","difficulty":"easy","startedAt":0,"dailyDay":null,"wonSeconds":null,"mistakes":null,"hintsUsed":null}}') }],
    ['unknown achievement', { ...emptySyncDoc(), unlockedAt: { nope: 1 } }],
    ['bad slot key', { ...emptySyncDoc(), slots: { weird: { updatedAt: 1, game: null } } }],
    ['bad slot game', { ...emptySyncDoc(), slots: { 'game.x': { updatedAt: 1, game: { id: 'x' } } } }],
    ['non-finite time', { ...emptySyncDoc(), slots: { 'game.x': { updatedAt: 'now', game: null } } }],
  ])('rejects %s', (_name, doc) => {
    expect(parseSyncDoc(doc)).toBeNull()
  })
})
