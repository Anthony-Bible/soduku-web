import { MemoryStore, type KeyValueStore } from '../core'

const DAILY_SLOT_PREFIX = 'sudoku.v1.daily.'

/**
 * localStorage with every call guarded. A write that fails (quota, blocked) is kept in memory so the
 * session stays consistent, and old unsolved Daily save slots are dropped to make room and retried.
 */
export class GuardedLocalStorage implements KeyValueStore {
  private readonly overlay = new Map<string, string>()
  constructor(private readonly ls: Storage) {}
  getItem(key: string): string | null {
    const held = this.overlay.get(key)
    if (held !== undefined) return held
    try {
      return this.ls.getItem(key)
    } catch {
      return null
    }
  }
  setItem(key: string, value: string): void {
    if (this.tryWrite(key, value)) {
      this.overlay.delete(key)
      return
    }
    this.pruneDailySlots(key)
    if (this.tryWrite(key, value)) this.overlay.delete(key)
    else this.overlay.set(key, value)
  }
  removeItem(key: string): void {
    this.overlay.delete(key)
    try {
      this.ls.removeItem(key)
    } catch {
      // Ignore.
    }
  }
  private tryWrite(key: string, value: string): boolean {
    try {
      this.ls.setItem(key, value)
      return true
    } catch {
      return false
    }
  }
  private pruneDailySlots(except: string): void {
    try {
      const doomed: string[] = []
      for (let i = 0; i < this.ls.length; i++) {
        const k = this.ls.key(i)
        if (k && k.startsWith(DAILY_SLOT_PREFIX) && k !== except) doomed.push(k)
      }
      doomed.forEach((k) => this.ls.removeItem(k))
    } catch {
      // Ignore.
    }
  }
}

export function browserStore(): KeyValueStore {
  try {
    const ls = globalThis.localStorage
    if (!ls) return new MemoryStore()
    const probe = '__sudoku_probe__'
    ls.setItem(probe, '1')
    ls.removeItem(probe)
    return new GuardedLocalStorage(ls)
  } catch {
    return new MemoryStore()
  }
}
