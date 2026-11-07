import { isAchievementId, type AchievementId } from './achievements'
import type { CalendarDay } from './calendarDay'
import { buildDailyLog, recordOpen, type DailyLog } from './dailyLog'
import { DIFFICULTIES, isDifficulty, type Difficulty } from './difficulty'
import type { GameState } from './gameState'
import type { Statistics } from './statistics'
import {
  clampLettergrid,
  emptyLettergridProgress,
  lettergridClock,
  mergeLettergridProgress,
  normalizeLettergridProgress,
  parseLettergridProgress,
  type LettergridProgress,
} from './lettergridProgress'
import { clampSlots, cmp, dailySlotDay, dailySlotKey, liveSlotIn, mergeSlots, newestSlotWrite, pruneSlots, stableStringify, unionMap, writeSlot } from './stable'
import { isGameState, isInt, isNonNegInt, isObj, isSafeId } from './validate'

// The synced document (ADR 0002). Every piece is stored in a form that merges cleanly, so `mergeDocs` is
// commutative, associative and idempotent, and nothing a device has recorded is ever lost by a merge.

export const SYNC_DOC_VERSION = 1
/** The one slot for the ordinary Game in progress: last-writer-wins, so the Game that lost a conflict is dropped. */
export const GAME_SLOT_KEY = 'game'
export { dailySlotKey }

/** Slots last touched more than this many days before the document's clock are dropped. */
export const SLOT_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1000

/** Limits that keep a hostile or corrupt document from growing without bound. */
export const MAX_GAMES = 50_000
export const MAX_DAYS = 20_000
export const MAX_SLOTS = 5_000

/** One Game, from start to win or abandonment. `wonSeconds` is null until it is won. */
export interface GameRecord {
  readonly id: string
  readonly difficulty: Difficulty
  /** Epoch milliseconds; 0 for Games migrated from counters. */
  readonly startedAt: number
  readonly dailyDay: CalendarDay | null
  readonly wonSeconds: number | null
  /** Known once won; null for a win migrated from counters. */
  readonly mistakes: number | null
  readonly hintsUsed: number | null
}

/**
 * A Game-in-progress slot: last-writer-wins by `updatedAt`. `game: null` is the dated "cleared" marker left
 * when a Game is finished or replaced, so a device that is behind cannot bring the Game back.
 */
export interface Slot {
  readonly updatedAt: number
  readonly game: GameState | null
}

export interface SyncDoc {
  readonly v: typeof SYNC_DOC_VERSION
  readonly games: Readonly<Record<string, GameRecord>>
  /** Daily Puzzle day -> the day it was first opened (earliest wins). */
  readonly firstOpened: Readonly<Record<string, number>>
  /** Daily Puzzle days that were solved. The On-Day/Catch-Up kind is derived from `firstOpened`. */
  readonly solved: Readonly<Record<string, true>>
  /** Achievement id -> epoch ms of the earliest unlock. */
  readonly unlockedAt: Readonly<Partial<Record<AchievementId, number>>>
  /** 'game' (the ordinary Game) and 'daily.<day>'. */
  readonly slots: Readonly<Record<string, Slot>>
  /**
   * The newest Game start or slot write this document has ever seen, merged by max so it only grows. Slot
   * pruning is measured against it, which keeps pruning consistent however documents are grouped.
   */
  readonly clock: number
  /**
   * Solves a v1 device counted toward Achievements that no Game record stands for (it had reset Statistics).
   * Keyed by a migration id, merged by max, so two copies of the same migration never double count.
   */
  readonly legacySolves: Readonly<Record<string, number>>
  /** Lettergrid's own Daily log, Game-in-progress slots and solves (ADR 0003). Sudoku data never reads it. */
  readonly lettergrid: LettergridProgress
}

export const emptySyncDoc = (): SyncDoc => ({ v: SYNC_DOC_VERSION, games: {}, firstOpened: {}, solved: {}, unlockedAt: {}, slots: {}, legacySolves: {}, lettergrid: emptyLettergridProgress(), clock: 0 })

// MARK: Deterministic ordering

export const docsEqual = (a: SyncDoc, b: SyncDoc): boolean => stableStringify(a) === stableStringify(b)

const DIFF_INDEX = new Map<string, number>(DIFFICULTIES.map((d, i) => [d, i]))

// MARK: Merge

function minNumber(a: number, b: number): number {
  return a <= b ? a : b
}

/** Fields fixed when the Game started: if two copies disagree, the earliest start wins, deterministically. */
function baseOrder(r: GameRecord): [number, number, number] {
  return [r.startedAt, DIFF_INDEX.get(r.difficulty) ?? 0, r.dailyDay ?? -Infinity]
}
function compareBase(a: GameRecord, b: GameRecord): number {
  const x = baseOrder(a)
  const y = baseOrder(b)
  return cmp(x[0], y[0]) || cmp(x[1], y[1]) || cmp(x[2], y[2])
}

/** A win beats no win; between two wins the faster (then fewer mistakes, then fewer hints) is kept. */
function compareWin(a: GameRecord, b: GameRecord): number {
  if (a.wonSeconds === null) return b.wonSeconds === null ? 0 : 1
  if (b.wonSeconds === null) return -1
  return (
    cmp(a.wonSeconds, b.wonSeconds) ||
    cmp(a.mistakes ?? Infinity, b.mistakes ?? Infinity) ||
    cmp(a.hintsUsed ?? Infinity, b.hintsUsed ?? Infinity)
  )
}

export function mergeRecords(a: GameRecord, b: GameRecord): GameRecord {
  const base = compareBase(a, b) <= 0 ? a : b
  const win = compareWin(a, b) <= 0 ? a : b
  return {
    id: base.id,
    difficulty: base.difficulty,
    startedAt: base.startedAt,
    dailyDay: base.dailyDay,
    wonSeconds: win.wonSeconds,
    mistakes: win.mistakes,
    hintsUsed: win.hintsUsed,
  }
}

/** The newest Sudoku Game start or slot write. Lettergrid keeps its own clock, so it never moves this one. */
function contentClock(doc: SyncDoc): number {
  let t = 0
  for (const r of Object.values(doc.games)) if (r.startedAt > t) t = r.startedAt
  return newestSlotWrite(doc.slots, t)
}

/**
 * Drops slots that can no longer matter: a solved day never reopens, and a slot
 * nobody has touched for a long time (measured against `clock`, not against the slot's day, so an old
 * Catch-Up played today is kept) is forgotten. `clock`, `solved` and won records only grow, so each condition
 * only ever becomes more true as documents merge and pruning commutes with merging.
 */
export function normalizeDoc(doc: SyncDoc): SyncDoc {
  const clock = Math.max(doc.clock, contentClock(doc))
  const cutoff = clock - SLOT_RETENTION_DAYS * DAY_MS
  const slots = pruneSlots(doc.slots, cutoff, (day) => doc.solved[day] === true)
  return { ...doc, slots, lettergrid: normalizeLettergridProgress(doc.lettergrid, SLOT_RETENTION_DAYS * DAY_MS), clock }
}

/** How far past the current time a timestamp may be before `clampDoc` pulls it back. */
export const MAX_CLOCK_SKEW_MS = DAY_MS

/**
 * Pulls every timestamp that feeds `clock` back to at most `maxTime`. A device whose date was set ahead would
 * otherwise raise the Account's `clock` for good, and pruning would then drop every Game in progress. Applied
 * before merging (on the server with its own time, and on each device with the device's time), outside
 * `mergeDocs`, so the merge laws are untouched.
 */
export function clampDoc(doc: SyncDoc, maxTime: number): SyncDoc {
  if (Math.max(doc.clock, contentClock(doc), lettergridClock(doc.lettergrid)) <= maxTime) return doc
  const games: Record<string, GameRecord> = {}
  for (const [id, r] of Object.entries(doc.games)) games[id] = r.startedAt > maxTime ? { ...r, startedAt: maxTime } : r
  return { ...doc, games, slots: clampSlots(doc.slots, maxTime), lettergrid: clampLettergrid(doc.lettergrid, maxTime), clock: Math.min(doc.clock, maxTime) }
}

/** Merges two documents. The result does not depend on argument order or grouping, and loses nothing. */
export function mergeDocs(a: SyncDoc, b: SyncDoc): SyncDoc {
  return normalizeDoc({
    v: SYNC_DOC_VERSION,
    games: unionMap(a.games, b.games, mergeRecords),
    firstOpened: unionMap(a.firstOpened, b.firstOpened, minNumber),
    solved: unionMap(a.solved, b.solved, () => true as const),
    unlockedAt: unionMap(a.unlockedAt as Record<string, number>, b.unlockedAt as Record<string, number>, minNumber) as SyncDoc['unlockedAt'],
    slots: unionMap(a.slots, b.slots, mergeSlots),
    legacySolves: unionMap(a.legacySolves, b.legacySolves, (x, y) => Math.max(x, y)),
    lettergrid: mergeLettergridProgress(a.lettergrid, b.lettergrid),
    // Taken from the inputs (not the merged result, where an earlier start may have replaced a later one).
    clock: Math.max(a.clock, b.clock, contentClock(a), contentClock(b)),
  })
}

// MARK: Derived data

/** Statistics counted from Game records: played, won and best time per difficulty. Each Game counts once. */
export function deriveStatistics(doc: SyncDoc): Statistics {
  const acc = { easy: blank(), medium: blank(), hard: blank(), expert: blank() }
  for (const r of Object.values(doc.games)) {
    const s = acc[r.difficulty]
    s.played++
    if (r.wonSeconds !== null) {
      s.won++
      s.bestTimeSeconds = s.bestTimeSeconds === null ? r.wonSeconds : Math.min(s.bestTimeSeconds, r.wonSeconds)
    }
  }
  return acc
}
const blank = (): { played: number; won: number; bestTimeSeconds: number | null } => ({ played: 0, won: 0, bestTimeSeconds: null })

/** Solves toward Achievement milestones: won Game records plus any carried over from v1. */
export const wonGameCount = (doc: SyncDoc, except?: string): number =>
  Object.values(doc.games).filter((r) => r.wonSeconds !== null && r.id !== except).length +
  Object.values(doc.legacySolves).reduce((a, b) => a + b, 0)

/** The Daily log, with each solve's kind derived from the merged earliest opening. */
export const deriveDailyLog = (doc: SyncDoc): DailyLog => buildDailyLog(doc.firstOpened, Object.keys(doc.solved).map(Number))

// MARK: Local edits (each returns a new document)

export function addGame(doc: SyncDoc, r: GameRecord): SyncDoc {
  const existing = doc.games[r.id]
  return { ...doc, games: { ...doc.games, [r.id]: existing ? mergeRecords(existing, r) : r } }
}

/** Marks a Game won, creating its record if this device never saw it start. */
export function winGame(
  doc: SyncDoc,
  g: { id: string; difficulty: Difficulty; startedAt: number; dailyDay: CalendarDay | null; seconds: number; mistakes: number; hintsUsed: number },
): SyncDoc {
  return addGame(doc, {
    id: g.id,
    difficulty: g.difficulty,
    startedAt: g.startedAt,
    dailyDay: g.dailyDay,
    wonSeconds: g.seconds,
    mistakes: g.mistakes,
    hintsUsed: g.hintsUsed,
  })
}

/** Records the first opening of a day's Daily Puzzle. A future day is ignored; the earliest opening is kept. */
export const openDay = (doc: SyncDoc, day: CalendarDay, today: CalendarDay): SyncDoc => recordOpen(doc, day, today)

/** Marks a day solved. Does nothing for a day that was never opened. */
export function solveDay(doc: SyncDoc, day: CalendarDay): SyncDoc {
  if (doc.solved[day] || doc.firstOpened[day] === undefined) return doc
  return { ...doc, solved: { ...doc.solved, [day]: true } }
}

export function unlockAchievements(doc: SyncDoc, ids: readonly AchievementId[], at: number): SyncDoc {
  if (ids.length === 0) return doc
  const unlockedAt = { ...doc.unlockedAt }
  for (const id of ids) unlockedAt[id] = Math.min(unlockedAt[id] ?? at, at)
  return { ...doc, unlockedAt }
}

/** Writes a slot from this device, unless the slot already holds something newer. `null` leaves a cleared marker. */
export function setSlot(doc: SyncDoc, key: string, game: GameState | null, updatedAt: number): SyncDoc {
  const slots = writeSlot(doc.slots, key, { updatedAt, game }, (id) => isFinished(doc, id))
  return slots === doc.slots ? doc : { ...doc, slots }
}

/** Whether a Game's record is already won. Won records are permanent, so this only ever becomes true. */
export const isFinished = (doc: SyncDoc, gameId: string): boolean => doc.games[gameId]?.wonSeconds != null

/** The Game that can be continued from a slot. A slot whose Game is already won counts as cleared. */
export const liveSlot = (doc: SyncDoc, key: string): Slot & { game: GameState } | null =>
  liveSlotIn(doc.slots, key, (id) => isFinished(doc, id))

/** The ordinary Game that can be continued, if any. */
export const liveGameSlot = (doc: SyncDoc): (Slot & { game: GameState }) | null => liveSlot(doc, GAME_SLOT_KEY)

// MARK: Validation

const isRecord = (id: string, v: unknown): v is GameRecord =>
  isObj(v) &&
  v.id === id &&
  isDifficulty(v.difficulty) &&
  typeof v.startedAt === 'number' && Number.isFinite(v.startedAt) &&
  (v.dailyDay === null || isInt(v.dailyDay)) &&
  (v.wonSeconds === null || isNonNegInt(v.wonSeconds)) &&
  (v.mistakes === null || isNonNegInt(v.mistakes)) &&
  (v.hintsUsed === null || isNonNegInt(v.hintsUsed)) &&
  (v.wonSeconds !== null || (v.mistakes === null && v.hintsUsed === null))

const isSlotKey = (k: string): boolean => k === GAME_SLOT_KEY || isInt(dailySlotDay(k))

/** Returns a clean copy of an untrusted value if it is a well-formed document, else null. Copying drops unknown fields. */
export function parseSyncDoc(raw: unknown): SyncDoc | null {
  if (!isObj(raw) || raw.v !== SYNC_DOC_VERSION) return null
  const { games, firstOpened, solved, unlockedAt, slots } = raw
  const legacyRaw = raw.legacySolves === undefined ? {} : raw.legacySolves
  if (!isObj(legacyRaw) || Object.keys(legacyRaw).length > MAX_SLOTS) return null
  if (!isObj(games) || !isObj(firstOpened) || !isObj(solved) || !isObj(unlockedAt) || !isObj(slots)) return null
  if (Object.keys(games).length > MAX_GAMES || Object.keys(firstOpened).length > MAX_DAYS || Object.keys(solved).length > MAX_DAYS) return null
  if (Object.keys(slots).length > MAX_SLOTS) return null

  const outGames: Record<string, GameRecord> = {}
  for (const [id, r] of Object.entries(games)) {
    if (!isSafeId(id) || !isRecord(id, r)) return null
    outGames[id] = {
      id,
      difficulty: r.difficulty,
      startedAt: r.startedAt,
      dailyDay: r.dailyDay,
      wonSeconds: r.wonSeconds,
      mistakes: r.mistakes,
      hintsUsed: r.hintsUsed,
    }
  }
  const outOpened: Record<string, number> = {}
  for (const [k, d] of Object.entries(firstOpened)) {
    if (!isInt(Number(k)) || !isInt(d)) return null
    outOpened[k] = d
  }
  const outSolved: Record<string, true> = {}
  for (const [k, t] of Object.entries(solved)) {
    if (!isInt(Number(k)) || t !== true) return null
    outSolved[k] = true
  }
  const outUnlocked: Partial<Record<AchievementId, number>> = {}
  for (const [k, t] of Object.entries(unlockedAt)) {
    if (!isAchievementId(k) || typeof t !== 'number' || !Number.isFinite(t)) return null
    outUnlocked[k] = t
  }
  const outSlots: Record<string, Slot> = {}
  for (const [k, s] of Object.entries(slots)) {
    // An early draft kept one slot per ordinary Game ('game.<id>'); fold those into the single slot.
    if (k.startsWith('game.')) {
      if (!isObj(s) || typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt)) return null
      if (s.game !== null && !isGameState(s.game)) return null
      const old: Slot = { updatedAt: s.updatedAt, game: s.game as GameState | null }
      outSlots[GAME_SLOT_KEY] = Object.hasOwn(outSlots, GAME_SLOT_KEY) ? mergeSlots(outSlots[GAME_SLOT_KEY], old) : old
      continue
    }
    if (!isSlotKey(k) || !isObj(s) || typeof s.updatedAt !== 'number' || !Number.isFinite(s.updatedAt)) return null
    if (s.game !== null && !isGameState(s.game)) return null
    const clean: Slot = { updatedAt: s.updatedAt, game: s.game as GameState | null }
    outSlots[k] = Object.hasOwn(outSlots, k) ? mergeSlots(outSlots[k], clean) : clean
  }
  const outLegacy: Record<string, number> = {}
  for (const [k, n] of Object.entries(legacyRaw)) {
    if (!isSafeId(k) || !isNonNegInt(n)) return null
    outLegacy[k] = n
  }
  // Documents from before Lettergrid have no such field; they load as having no Lettergrid progress.
  const lettergrid = raw.lettergrid === undefined ? emptyLettergridProgress() : parseLettergridProgress(raw.lettergrid)
  if (!lettergrid) return null
  const clockRaw = raw.clock === undefined ? 0 : raw.clock
  if (typeof clockRaw !== 'number' || !Number.isFinite(clockRaw) || clockRaw < 0) return null
  return { v: SYNC_DOC_VERSION, games: outGames, firstOpened: outOpened, solved: outSolved, unlockedAt: outUnlocked, slots: outSlots, legacySolves: outLegacy, lettergrid, clock: clockRaw }
}

// MARK: Results

/** How a won Game went, as the win screen and the Share text show it. */
export interface WinResult {
  readonly difficulty: Difficulty
  readonly seconds: number
  readonly mistakes: number
  readonly hintsUsed: number
}

/**
 * The win to show for a day's Daily Puzzle: the fastest recorded one (two devices can each solve it before
 * they sync), then the fewest mistakes. Null when no win with its details was recorded, as for days solved
 * before Games were recorded.
 */
export function dailyResult(doc: SyncDoc, day: CalendarDay): WinResult | null {
  let best: WinResult | null = null
  for (const id of Object.keys(doc.games).sort()) {
    const g = doc.games[id]
    if (g.dailyDay !== day || g.wonSeconds === null || g.mistakes === null || g.hintsUsed === null) continue
    const r: WinResult = { difficulty: g.difficulty, seconds: g.wonSeconds, mistakes: g.mistakes, hintsUsed: g.hintsUsed }
    if (best === null || r.seconds < best.seconds || (r.seconds === best.seconds && r.mistakes < best.mistakes)) best = r
  }
  return best
}
