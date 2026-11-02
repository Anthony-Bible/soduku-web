import fc from 'fast-check'
import { beforeEach, describe, expect, test } from 'vitest'
import { dayFromYMD } from './calendarDay'
import { dailyPuzzle } from './dailyPuzzle'
import { generate } from './generator'
import { ALL_POSITIONS } from './position'
import { MemoryStore, SaveStore } from './saveStore'
import { GameSession, IGNORED, PlayerProfile, type MoveFeedback } from './session'
import { currentStreak, longestStreak, solveFor } from './dailyLog'

let kv: MemoryStore
let profile: PlayerProfile
beforeEach(() => {
  kv = new MemoryStore()
  profile = new PlayerProfile(new SaveStore(kv), () => 1_000)
})

/** Solves a session by entering the answers. */
function solveAll(s: GameSession) {
  let last: MoveFeedback = IGNORED
  for (const p of ALL_POSITIONS) {
    if (s.state.board[p].value === s.state.solution[p].value) continue
    s.select(p)
    last = s.tapNumber(s.state.solution[p].value)
  }
  return last
}

describe('ordinary Games', () => {
  test('starting counts as played, saves, and Continue restores', () => {
    const s = profile.startGame(generate('easy', 1n))
    expect(profile.statistics.easy.played).toBe(1)
    s.select(ALL_POSITIONS.find((p) => !s.state.board[p].given)!)
    s.tick()
    s.pause()
    const again = new PlayerProfile(new SaveStore(kv)).continueGame()!
    expect(again.state.elapsedSeconds).toBe(1)
    expect(again.state.status).toBe('playing')
  })

  test('winning records the solve, best time, and deletes the save; it never touches the Daily log', () => {
    const s = profile.startGame(generate('easy', 2n))
    for (let i = 0; i < 90; i++) s.tick()
    const fb = solveAll(s)
    expect(fb.outcome).toBe('won')
    expect(fb.solve?.isNewBest).toBe(true)
    expect(fb.solve?.unlocked).toContain('firstSolve')
    expect(profile.statistics.easy).toEqual({ played: 1, won: 1, bestTimeSeconds: 90 })
    expect(profile.savedGame()).toBeNull()
    expect(Object.keys(profile.dailyLog.solves)).toHaveLength(0)
    expect(profile.currentStreak(dayFromYMD(2026, 11, 1))).toBe(0)
  })

  test('a slower win is not a new best and winning twice is not recorded twice', () => {
    const a = profile.startGame(generate('easy', 3n))
    a.tick()
    solveAll(a)
    const b = profile.startGame(generate('easy', 4n))
    for (let i = 0; i < 5; i++) b.tick()
    expect(solveAll(b).solve?.isNewBest).toBe(false)
    expect(profile.statistics.easy.bestTimeSeconds).toBe(1)
    expect(profile.statistics.easy.won).toBe(2)
  })

  test('mistakes are counted, flagged, buzz an error haptic, and Flawless is withheld', () => {
    const s = profile.startGame(generate('easy', 5n))
    const p = ALL_POSITIONS.find((q) => !s.state.board[q].given)!
    s.select(p)
    const fb = s.tapNumber((s.state.solution[p].value % 9) + 1)
    expect(fb.outcome).toBe('mistake')
    expect(fb.mistakeAt).toBe(p)
    expect(fb.haptics).toEqual(['error'])
    expect(solveAll(s).solve?.unlocked).not.toContain('flawless')
  })

  test('state is persisted across profiles', () => {
    solveAll(profile.startGame(generate('easy', 7n)))
    const fresh = new PlayerProfile(new SaveStore(kv))
    expect(fresh.statistics.easy.won).toBe(1)
    expect(fresh.achievements.solveCount).toBe(1) // counted from Game records
  })
})

describe('Daily Puzzles', () => {
  const today = dayFromYMD(2026, 11, 2) // Monday: Easy
  const open = (day: number, t = today) => {
    const o = profile.openDaily(day, t)
    if (o === 'needsPuzzle') return profile.startDaily(dailyPuzzle(day), day)
    return o ? o.resumed : null
  }

  test('a Catch-Up for a day more than 90 days back survives saving and reloading', () => {
    open(today)
    const old = today - 120
    const s = open(old)!
    s.pause()
    s.save()
    expect(profile.hasDailyInProgress(old)).toBe(true)
    const reloaded = new PlayerProfile(new SaveStore(kv), () => 1_000)
    expect(reloaded.hasDailyInProgress(old)).toBe(true)
    const stats = reloaded.statistics
    expect(reloaded.openDaily(old, today)).not.toBe('needsPuzzle')
    expect(reloaded.statistics).toEqual(stats) // resuming is not another Game
  })

  test('future days cannot be opened', () => {
    expect(profile.openDaily(today + 1, today)).toBeNull()
  })

  test('an On-Day Solve extends the Streak and counts as a Game of the weekday difficulty', () => {
    const s = open(today)!
    solveAll(s)
    expect(solveFor(profile.dailyLog, today)).toBe('onDay')
    expect(profile.currentStreak(today)).toBe(1)
    expect(profile.statistics.easy.won).toBe(1)
    expect(profile.openDaily(today, today)).toBeNull() // solved days do not reopen
  })

  test('opened on the day but solved after midnight is still On-Day', () => {
    const s = open(today)!
    s.tick()
    const next = new PlayerProfile(new SaveStore(kv), () => 5)
    const resumed = next.openDaily(today, today + 1)
    expect(resumed).not.toBe('needsPuzzle')
    solveAll((resumed as { resumed: GameSession }).resumed)
    expect(solveFor(next.dailyLog, today)).toBe('onDay')
  })

  test('a past day first opened later is a Catch-Up Solve and leaves the Streak alone', () => {
    solveAll(open(today)!)
    const before = { s: profile.currentStreak(today), l: longestStreak(profile.dailyLog) }
    solveAll(open(today - 3)!)
    expect(solveFor(profile.dailyLog, today - 3)).toBe('catchUp')
    expect(currentStreak(profile.dailyLog, today)).toBe(before.s)
    expect(longestStreak(profile.dailyLog)).toBe(before.l)
  })

  test('progress is saved per day and resumed; hasDailyInProgress reflects it', () => {
    const s = open(today - 1)!
    s.tick()
    s.save()
    expect(profile.hasDailyInProgress(today - 1)).toBe(true)
    expect(profile.hasDailyInProgress(today - 2)).toBe(false)
    const resumed = profile.openDaily(today - 1, today)
    expect((resumed as { resumed: GameSession }).resumed.state.elapsedSeconds).toBe(1)
  })

  test('property: any order of Catch-Up Solves never changes the Streak', () => {
    fc.assert(
      fc.property(fc.uniqueArray(fc.integer({ min: 1, max: 6 }), { minLength: 1, maxLength: 4 }), (offsets) => {
        const p = new PlayerProfile(new SaveStore(new MemoryStore()), () => 1)
        const start = (day: number) => {
          const o = p.openDaily(day, today)
          return o === 'needsPuzzle' ? p.startDaily(dailyPuzzle(day), day) : null
        }
        solveAll(start(today)!)
        const streak = p.currentStreak(today)
        for (const o of offsets) {
          solveAll(start(today - o)!)
          expect(p.currentStreak(today)).toBe(streak)
        }
      }),
      { numRuns: 4 },
    )
  })
})

describe('two profiles sharing one store', () => {
  test('a stale profile does not erase the other one\'s solve', () => {
    const a = new PlayerProfile(new SaveStore(kv), () => 1_000)
    const b = new PlayerProfile(new SaveStore(kv), () => 1_000)
    const today = dayFromYMD(2026, 11, 1)
    const summary = { difficulty: 'easy' as const, seconds: 100, mistakes: 0, hintsUsed: 0 }
    a.openDaily(today, today)
    a.recordSolve({ ...summary, dailyDay: today })
    b.recordSolve({ ...summary, dailyDay: null })
    const fresh = new PlayerProfile(new SaveStore(kv))
    expect(solveFor(fresh.dailyLog, today)).toBe('onDay')
    expect(fresh.statistics.easy.won).toBeGreaterThanOrEqual(2)
  })
})

describe('a device whose date was set ahead', () => {
  test('cannot make every device drop its Game in progress', () => {
    const now = Date.UTC(2026, 10, 2)
    const p = new PlayerProfile(new SaveStore(new MemoryStore()), () => now)
    p.startGame(generate('easy', 1n))
    // The Account's document carries a clock 100 days in the future.
    p.mergeRemote({ ...p.syncDoc(), clock: now + 100 * 86_400_000 })
    expect(p.savedGame()).not.toBeNull()
    const s = p.startGame(generate('easy', 2n))
    s.save()
    expect(p.savedGame()?.id).toBe(s.state.id)
  })
})
