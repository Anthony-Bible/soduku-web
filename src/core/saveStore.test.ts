import { describe, expect, test } from 'vitest'
import { generate } from './generator'
import { newGame } from './gameState'
import { MemoryStore, SaveStore, type KeyValueStore } from './saveStore'
import { addGame, emptySyncDoc, setSlot, GAME_SLOT_KEY } from './syncDoc'

describe('SaveStore', () => {
  test('round-trips the synced document, the account and the last sync time', () => {
    const kv = new MemoryStore()
    const store = new SaveStore(kv)
    const g = newGame(generate('hard', 8n), 42, 'g1')
    const doc = setSlot(
      addGame(emptySyncDoc(), { id: 'g1', difficulty: 'hard', startedAt: 42, dailyDay: null, wonSeconds: null, mistakes: null, hintsUsed: null }),
      GAME_SLOT_KEY,
      g,
      50,
    )
    store.saveDoc(doc)
    store.saveAccount({ email: 'a@b.c' })
    store.saveLastSyncedAt(7)
    const again = new SaveStore(kv)
    expect(again.loadDoc()).toEqual(doc)
    expect(again.loadAccount()).toEqual({ email: 'a@b.c' })
    expect(again.loadLastSyncedAt()).toBe(7)
  })

  test('corrupt, wrong-version or malformed records load as missing', () => {
    const kv = new MemoryStore()
    kv.setItem('sudoku.v2.doc', '{not json')
    expect(new SaveStore(kv).loadDoc()).toEqual(emptySyncDoc())
    kv.setItem('sudoku.v2.doc', JSON.stringify({ v: 1, data: emptySyncDoc() }))
    expect(new SaveStore(kv).loadDoc()).toEqual(emptySyncDoc())
    kv.setItem('sudoku.v2.doc', JSON.stringify({ v: 2, data: { v: 1, games: 3 } }))
    expect(new SaveStore(kv).loadDoc()).toEqual(emptySyncDoc())
    kv.setItem('sudoku.v2.account', JSON.stringify({ v: 2, data: { email: 5 } }))
    expect(new SaveStore(kv).loadAccount()).toBeNull()
  })

  test('works when every storage call throws, keeping the last written document in memory', () => {
    const broken: KeyValueStore = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
      removeItem: () => { throw new Error('denied') },
    }
    const store = new SaveStore(broken)
    expect(store.loadDoc()).toEqual(emptySyncDoc())
    const doc = setSlot(emptySyncDoc(), GAME_SLOT_KEY, newGame(generate('easy', 1n), 0, 'g'), 1)
    expect(() => store.saveDoc(doc)).not.toThrow()
    expect(store.loadDoc()).toEqual(doc)
    expect(() => store.clearAll()).not.toThrow()
    expect(store.loadAccount()).toBeNull()
  })

  test('clearAll empties the device and v1 data never migrates back in', () => {
    const kv = new MemoryStore()
    kv.setItem('sudoku.v1.achievements', JSON.stringify({ v: 1, data: { solveCount: 1, unlockedAt: { firstSolve: 5 } } }))
    const store = new SaveStore(kv, () => 'id')
    expect(store.loadDoc().unlockedAt.firstSolve).toBe(5)
    store.saveAccount({ email: 'x@y.z' })
    store.clearAll()
    expect(new SaveStore(kv).loadDoc()).toEqual(emptySyncDoc())
    expect(new SaveStore(kv).loadAccount()).toBeNull()
  })
})

describe('SaveStore across tabs', () => {
  test('a document removed by another tab (sign-out) is not written back from the cache', () => {
    const kv = new MemoryStore()
    const a = new SaveStore(kv)
    const b = new SaveStore(kv)
    const g = newGame(generate('easy', 3n), 10, 'g1')
    a.saveDoc(addGame(emptySyncDoc(), { id: 'g1', difficulty: 'easy', startedAt: 10, dailyDay: null, wonSeconds: 5, mistakes: 0, hintsUsed: 0 }))
    expect(Object.keys(b.loadDoc().games)).toEqual(['g1'])
    a.clearAll()
    expect(Object.keys(b.loadDoc().games)).toEqual([])
    expect(g.id).toBe('g1')
  })

  test('keeps its own copy when storage cannot be written', () => {
    const kv: KeyValueStore = { getItem: () => null, setItem: () => { throw new Error('full') }, removeItem: () => undefined }
    const store = new SaveStore(kv)
    store.saveDoc(addGame(emptySyncDoc(), { id: 'g1', difficulty: 'easy', startedAt: 10, dailyDay: null, wonSeconds: null, mistakes: null, hintsUsed: null }))
    expect(Object.keys(store.loadDoc().games)).toEqual(['g1'])
  })
})
