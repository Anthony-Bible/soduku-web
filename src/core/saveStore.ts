import { isAchievementId, type AchievementProgress } from './achievements'
import { emptyDailyLog, type DailyLog } from './dailyLog'
import { DIFFICULTIES } from './difficulty'
import { randomId } from './id'
import { migrateLegacy, type LegacyData } from './migration'
import type { Statistics } from './statistics'
import { emptySyncDoc, parseSyncDoc, type SyncDoc } from './syncDoc'
import { isInt, isLegacyGameState, isNonNegInt, isObj } from './validate'

/** The minimal string key/value surface the core needs. Implementations must never throw. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A store that lives only as long as the page; used when persistent storage is unavailable. */
export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, string>()
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}

/** Bump a record's version (and migrate) rather than changing its shape in place. */
export const SAVE_VERSION = 2
const PREFIX = 'sudoku.v2.'
const LEGACY_PREFIX = 'sudoku.v1.'
const LEGACY_VERSION = 1

function isLegacyStatistics(v: unknown): v is Statistics {
  return (
    isObj(v) &&
    DIFFICULTIES.every((d) => {
      const s = v[d]
      return isObj(s) && isNonNegInt(s.played) && isNonNegInt(s.won) && (s.bestTimeSeconds === null || isNonNegInt(s.bestTimeSeconds))
    })
  )
}

function isLegacyDailyLog(v: unknown): v is DailyLog {
  return (
    isObj(v) &&
    isObj(v.firstOpened) &&
    Object.entries(v.firstOpened).every(([k, d]) => isInt(Number(k)) && isInt(d)) &&
    isObj(v.solves) &&
    Object.entries(v.solves).every(([k, d]) => isInt(Number(k)) && (d === 'onDay' || d === 'catchUp'))
  )
}

function isLegacyAchievements(v: unknown): v is AchievementProgress {
  return (
    isObj(v) &&
    isNonNegInt(v.solveCount) &&
    isObj(v.unlockedAt) &&
    Object.entries(v.unlockedAt).every(([k, t]) => isAchievementId(k) && typeof t === 'number')
  )
}

/** The account this device is signed in to, as last confirmed by the server. */
export interface StoredAccount {
  readonly email: string
}

/**
 * Keeps the synced document (everything the player has done) as versioned JSON in a key/value store, plus
 * which Account the device is signed in to. Saving is best-effort: a failed write is ignored and an
 * unreadable or malformed record loads as if missing, so a bad save never stops play. The first load
 * migrates local storage v1 into the document.
 */
export class SaveStore {
  private cache: SyncDoc | null = null
  /** The stored text `cache` was parsed from, so an unchanged record is not parsed (or re-derived) again. */
  private cacheRaw: string | null = null
  /** True when the last attempt to store the document failed, so `cache` is the only copy. */
  private unpersisted = false

  constructor(
    private readonly kv: KeyValueStore,
    private readonly newId: () => string = randomId,
  ) {}

  private unwrap(raw: string, version: number = SAVE_VERSION): unknown {
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!isObj(parsed) || parsed.v !== version) return null
      return parsed.data ?? null
    } catch {
      return null
    }
  }

  private read(key: string, prefix: string, version: number): unknown {
    try {
      const raw = this.kv.getItem(prefix + key)
      return raw === null ? null : this.unwrap(raw, version)
    } catch {
      return null
    }
  }

  private lastWriteOk = true

  /** Returns the text it tried to store. */
  private write(key: string, data: unknown): string {
    const text = JSON.stringify({ v: SAVE_VERSION, data })
    try {
      this.kv.setItem(PREFIX + key, text)
      this.lastWriteOk = true
    } catch {
      this.lastWriteOk = false // Best effort.
    }
    return text
  }

  private remove(key: string, prefix: string = PREFIX): void {
    try {
      this.kv.removeItem(prefix + key)
    } catch {
      // Best effort.
    }
  }

  // The synced document

  loadDoc(): SyncDoc {
    let raw: string | null = null
    let unreadable = false
    try {
      raw = this.kv.getItem(PREFIX + 'doc')
    } catch {
      unreadable = true
    }
    if (raw !== null && raw === this.cacheRaw && this.cache) return this.cache
    const stored = raw === null ? null : parseSyncDoc(this.unwrap(raw))
    if (stored) {
      this.cache = stored
      this.cacheRaw = raw
      return stored
    }
    // Keep what this page last wrote only when storage can't be read or the write never landed. A record that
    // is simply gone was removed on purpose (another tab signed out), and must not be written back.
    if (this.cache && (unreadable || raw !== null || this.unpersisted)) return this.cache
    this.cache = null
    this.cacheRaw = null
    const migrated = this.migrate()
    if (migrated) {
      this.saveDoc(migrated)
      // Only drop v1 once the document really landed; otherwise the migration runs again next load.
      if (!this.unpersisted) this.removeLegacy(migrated)
      return migrated
    }
    return emptySyncDoc()
  }

  saveDoc = (doc: SyncDoc): void => {
    this.cache = doc
    this.cacheRaw = this.write('doc', doc)
    this.unpersisted = !this.lastWriteOk
  }

  // Account and sync status

  loadAccount(): StoredAccount | null {
    const v = this.read('account', PREFIX, SAVE_VERSION)
    return isObj(v) && typeof v.email === 'string' ? { email: v.email } : null
  }
  saveAccount = (a: StoredAccount): void => {
    this.write('account', a)
  }
  clearAccount = (): void => this.remove('account')

  /**
   * The Account the progress on this device belongs to. It outlives a lost session (the progress merges back
   * into the same Account on the next sign-in) but not a sign-out.
   */
  loadOwner(): string | null {
    const v = this.read('owner', PREFIX, SAVE_VERSION)
    return typeof v === 'string' ? v : null
  }
  saveOwner = (email: string): void => {
    this.write('owner', email)
  }

  /** Set when the player signed out but the server could not be told; the session cookie may still be valid. */
  loadPendingSignOut(): boolean {
    return this.read('pendingSignOut', PREFIX, SAVE_VERSION) === true
  }
  savePendingSignOut = (): void => {
    this.write('pendingSignOut', true)
  }
  clearPendingSignOut = (): void => this.remove('pendingSignOut')

  loadLastSyncedAt(): number | null {
    const v = this.read('lastSyncedAt', PREFIX, SAVE_VERSION)
    return typeof v === 'number' ? v : null
  }
  saveLastSyncedAt = (t: number): void => {
    this.write('lastSyncedAt', t)
  }

  /** Signed out: forget everything on this device except a pending sign-out. v1 data was already migrated away and stays gone. */
  clearAll(): void {
    this.cache = null
    this.cacheRaw = null
    this.unpersisted = false
    this.remove('doc')
    this.remove('account')
    this.remove('owner')
    this.remove('lastSyncedAt')
    this.write('migrated', true)
  }

  // Migration from local storage v1

  private readLegacy(): LegacyData | null {
    const get = (key: string) => this.read(key, LEGACY_PREFIX, LEGACY_VERSION)
    const statistics = get('statistics')
    const dailyLog = get('dailyLog')
    const achievements = get('achievements')
    const game = get('game')
    const data: LegacyData = {
      statistics: isLegacyStatistics(statistics) ? statistics : null,
      dailyLog: isLegacyDailyLog(dailyLog) ? dailyLog : null,
      achievements: isLegacyAchievements(achievements) ? achievements : null,
      game: isLegacyGameState(game) ? game : null,
      dailies: {},
    }
    const dailies: Record<number, NonNullable<LegacyData['game']>> = {}
    for (const day of Object.keys((data.dailyLog ?? emptyDailyLog()).firstOpened)) {
      const g = get(`daily.${day}`)
      if (isLegacyGameState(g)) dailies[Number(day)] = g
    }
    const found = data.statistics || data.dailyLog || data.achievements || data.game || Object.keys(dailies).length > 0
    return found ? { ...data, dailies } : null
  }

  private migrate(): SyncDoc | null {
    if (this.read('migrated', PREFIX, SAVE_VERSION) === true) return null
    const legacy = this.readLegacy()
    return legacy ? migrateLegacy(legacy, this.newId) : null
  }

  private removeLegacy(doc: SyncDoc): void {
    for (const key of ['game', 'statistics', 'dailyLog', 'achievements']) this.remove(key, LEGACY_PREFIX)
    for (const day of Object.keys(doc.firstOpened)) this.remove(`daily.${day}`, LEGACY_PREFIX)
    this.write('migrated', true)
  }
}
