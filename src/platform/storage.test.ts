import { describe, expect, it } from 'vitest'
import { GuardedLocalStorage } from './storage'

class FakeStorage implements Storage {
  data = new Map<string, string>()
  full = true
  get length() { return this.data.size }
  clear() { this.data.clear() }
  getItem(k: string) { return this.data.get(k) ?? null }
  key(i: number) { return [...this.data.keys()][i] ?? null }
  removeItem(k: string) {
    this.data.delete(k)
  }
  setItem(k: string, v: string): void {
    if (this.full) throw new Error('QuotaExceededError')
    this.data.set(k, v)
  }
}

describe('GuardedLocalStorage', () => {
  it('keeps a failed write readable for the session', () => {
    const kv = new GuardedLocalStorage(new FakeStorage())
    kv.setItem('k', 'v')
    expect(kv.getItem('k')).toBe('v')
    kv.removeItem('k')
    expect(kv.getItem('k')).toBeNull()
  })
  it('drops other Daily slots to make room, then retries', () => {
    const ls = new FakeStorage()
    ls.data.set('sudoku.v1.daily.1', 'old')
    const remove = ls.removeItem.bind(ls)
    ls.removeItem = (k: string) => {
      remove(k)
      ls.full = false
    }
    const kv = new GuardedLocalStorage(ls)
    kv.setItem('sudoku.v1.game', 'g')
    expect(ls.data.get('sudoku.v1.game')).toBe('g')
    expect(ls.data.has('sudoku.v1.daily.1')).toBe(false)
  })
})
