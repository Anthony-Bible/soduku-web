import { describe, expect, test } from 'vitest'
import { generate } from './generator'
import { newGame } from './gameState'
import { MemoryStore, SaveStore, type KeyValueStore } from './saveStore'
import { emptyStatistics, recordStart, recordWin, totalPlayed, winRatePercent } from './statistics'

describe('SaveStore', () => {
  test('round-trips a game, statistics and a Daily slot', () => {
    const store = new SaveStore(new MemoryStore())
    const g = newGame(generate('hard', 8n), 42)
    store.saveGame(g)
    store.saveDaily(g, 20000)
    expect(store.loadGame()).toEqual(g)
    expect(store.loadDaily(20000)).toEqual(g)
    expect(store.loadDaily(20001)).toBeNull()
    store.clearGame()
    expect(store.loadGame()).toBeNull()
    const stats = recordWin(recordStart(emptyStatistics(), 'hard'), 'hard', 99).stats
    store.saveStatistics(stats)
    expect(store.loadStatistics()).toEqual(stats)
  })

  test('corrupt, wrong-version or malformed records load as missing', () => {
    const kv = new MemoryStore()
    const store = new SaveStore(kv)
    kv.setItem('sudoku.v1.game', '{not json')
    kv.setItem('sudoku.v1.statistics', JSON.stringify({ v: 2, data: emptyStatistics() }))
    kv.setItem('sudoku.v1.dailyLog', JSON.stringify({ v: 1, data: { firstOpened: 1 } }))
    expect(store.loadGame()).toBeNull()
    expect(store.loadStatistics()).toEqual(emptyStatistics())
    expect(store.loadDailyLog()).toEqual({ firstOpened: {}, solves: {} })
    expect(store.loadAchievements()).toEqual({ solveCount: 0, unlockedAt: {} })
  })

  test('works when every storage call throws', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    const store = new SaveStore(broken)
    expect(() => store.saveGame(newGame(generate('easy', 1n), 0))).not.toThrow()
    expect(store.loadGame()).toBeNull()
    expect(store.loadStatistics()).toEqual(emptyStatistics())
    expect(() => store.clearGame()).not.toThrow()
  })
})

describe('Statistics', () => {
  test('tracks played, won, win rate and best time per difficulty', () => {
    let s = emptyStatistics()
    s = recordStart(recordStart(s, 'easy'), 'easy')
    let r = recordWin(s, 'easy', 120)
    expect(r.isBest).toBe(true)
    r = recordWin(r.stats, 'easy', 200)
    expect(r.isBest).toBe(false)
    expect(r.stats.easy).toEqual({ played: 2, won: 2, bestTimeSeconds: 120 })
    expect(winRatePercent(r.stats.easy)).toBe(100)
    expect(winRatePercent(s.medium)).toBe(0)
    expect(totalPlayed(r.stats)).toBe(2)
  })
})
