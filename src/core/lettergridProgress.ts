import type { CalendarDay } from './calendarDay'
import { buildDailyLog, recordOpen, type DailyLog } from './dailyLog'
import { CELL_COUNT, GRID_SIZE, PLAYS_PER_DAILY, RACK_SIZE, TILE_RUN_LENGTH } from './lettergrid/grid'
import type { LettergridResult, LettergridState } from './lettergrid/game'
import { copyBoard, isLettergridBoard, type LettergridBoard } from './lettergrid/finalBoard'
import type { LettergridStatistics } from './statistics'
import {
  clampSlots,
  dailySlotDay,
  dailySlotKey,
  liveSlotIn,
  mergeSlots,
  newestSlotWrite,
  pruneSlots,
  stableStringify,
  unionMap,
  writeSlot,
} from './stable'
import { isInt, isNonNegInt, isObj, isSafeId } from './validate'

// Lettergrid's share of the synced document (ADR 0002, 0004). Like the Sudoku parts it is stored in a form
// that merges cleanly: openings by min, each day's best solve by a total order, Games in progress last-writer-wins.

export const MAX_LETTERGRID_DAYS = 20_000
export const MAX_LETTERGRID_SOLVES = 50_000
export const MAX_LETTERGRID_SLOTS = 5_000

/** A finished Lettergrid Daily. Only each day's best-scoring one is kept, and it is the one that counts (ADR 0004). */
export interface LettergridSolve extends LettergridResult {
  readonly gameId: string
  readonly day: CalendarDay
  /** Epoch milliseconds when the last Play was made. */
  readonly finishedAt: number
  /** The finished board, so it can be viewed and stepped through later. Solves recorded before it was kept have none. */
  readonly board?: LettergridBoard
}

/** A Lettergrid Game in progress. It carries its own grid, Tile Run, Par and Word List version. */
export interface LettergridSaved {
  readonly id: string
  readonly startedAt: number
  readonly state: LettergridState
}

/** Last-writer-wins by `updatedAt`; `game: null` is the dated "cleared" marker. */
export interface LettergridSlot {
  readonly updatedAt: number
  readonly game: LettergridSaved | null
}

export interface LettergridProgress {
  /** Daily Puzzle day -> the day it was first opened (earliest wins). */
  readonly firstOpened: Readonly<Record<string, number>>
  /** Game ID -> its solve; at most one per day, that day's best. */
  readonly solves: Readonly<Record<string, LettergridSolve>>
  /** 'daily.<day>' -> the Game in progress for that day. */
  readonly slots: Readonly<Record<string, LettergridSlot>>
  /**
   * Newest slot write ever seen, kept so a pruned slot still counts. Lettergrid prunes against this clock alone,
   * so Lettergrid play never moves the Sudoku document clock. Merged by max.
   */
  readonly clock: number
}

export const emptyLettergridProgress = (): LettergridProgress => ({ firstOpened: {}, solves: {}, slots: {}, clock: 0 })

// MARK: Merge

/**
 * Whether `a` is the better solve of a day: the higher score, then the earlier finished, then the lower Game ID,
 * then content. It is a total order, so keeping each day's best gives the same result in any merge order.
 */
const beats = (a: LettergridSolve, b: LettergridSolve): boolean =>
  a.score !== b.score
    ? a.score > b.score
    : a.finishedAt !== b.finishedAt
      ? a.finishedAt < b.finishedAt
      : a.gameId !== b.gameId
        ? a.gameId < b.gameId
        : stableStringify(a) < stableStringify(b)

/** Keeps only each day's best solve (ADR 0004). */
function keepBest(solves: Iterable<LettergridSolve>): Record<string, LettergridSolve> {
  const best = new Map<CalendarDay, LettergridSolve>()
  for (const s of solves) {
    const b = best.get(s.day)
    if (!b || beats(s, b)) best.set(s.day, s)
  }
  const out: Record<string, LettergridSolve> = {}
  for (const s of best.values()) out[s.gameId] = s
  return out
}

function mergeSolves(a: Readonly<Record<string, LettergridSolve>>, b: Readonly<Record<string, LettergridSolve>>): Record<string, LettergridSolve> {
  // After a sync both sides usually hold the same records.
  if (a === b) return a
  return keepBest(Object.values(unionMap(a, b, (x, y) => (x === y || beats(x, y) ? x : y))))
}

export function mergeLettergridProgress(a: LettergridProgress, b: LettergridProgress): LettergridProgress {
  return {
    firstOpened: unionMap(a.firstOpened, b.firstOpened, (x, y) => (x <= y ? x : y)),
    solves: mergeSolves(a.solves, b.solves),
    slots: unionMap(a.slots, b.slots, mergeSlots),
    clock: Math.max(a.clock, b.clock),
  }
}

/** Newest slot write or recorded clock. Only Lettergrid slots are pruned against it. */
export const lettergridClock = (p: LettergridProgress): number => newestSlotWrite(p.slots, p.clock)

/** Drops stale slots. A solved day's slot stays: a Replay can be in progress (ADR 0004). */
export function normalizeLettergridProgress(p: LettergridProgress, retentionMs: number): LettergridProgress {
  const clock = lettergridClock(p)
  const cutoff = clock - retentionMs
  return { ...p, slots: pruneSlots(p.slots, cutoff, () => false), clock }
}

export function clampLettergrid(p: LettergridProgress, maxTime: number): LettergridProgress {
  return { ...p, slots: clampSlots(p.slots, maxTime), clock: Math.min(p.clock, maxTime) }
}

// MARK: Derived data

/** The solve that counts for each day: its best, the only one kept (ADR 0004). */
export function countedSolves(p: LettergridProgress): Map<CalendarDay, LettergridSolve> {
  const counted = new Map<CalendarDay, LettergridSolve>()
  for (const s of Object.values(p.solves)) {
    const best = counted.get(s.day)
    if (!best || beats(s, best)) counted.set(s.day, s)
  }
  return counted
}

/** Lettergrid's own Daily log, shaped like Sudoku's so Streak, Longest Streak and the Calendar functions apply. */
export const deriveLettergridLog = (p: LettergridProgress, counted = countedSolves(p)): DailyLog => buildDailyLog(p.firstOpened, counted.keys())

export function deriveLettergridStatistics(p: LettergridProgress, counted = countedSolves(p)): LettergridStatistics {
  let bestScore: number | null = null
  const parReached: [number, number, number] = [0, 0, 0]
  for (const s of counted.values()) {
    bestScore = bestScore === null ? s.score : Math.max(bestScore, s.score)
    for (let i = 0; i < s.stars; i++) parReached[i]++
  }
  return { dailiesPlayed: counted.size, bestScore, parReached }
}

/**
 * Whether a Game has a recorded solve. A day keeps only its best solve, so a lower Replay's is dropped; its slot
 * is cleared when it finishes, which keeps it from coming back (ADR 0004).
 */
export const isLettergridFinished = (p: LettergridProgress, gameId: string): boolean => Object.hasOwn(p.solves, gameId)

/** The Game that can be continued from a day's slot. A slot whose Game is already solved counts as cleared. */
export const liveLettergridSlot = (p: LettergridProgress, day: CalendarDay): (LettergridSlot & { game: LettergridSaved }) | null =>
  liveSlotIn(p.slots, dailySlotKey(day), (id) => isLettergridFinished(p, id))

// MARK: Local edits (each returns new progress)

/** Records the first opening of a day. A future day is ignored; the earliest opening is kept. */
export const openLettergridDay = (p: LettergridProgress, day: CalendarDay, today: CalendarDay): LettergridProgress => recordOpen(p, day, today)

/** Keeps a solve if it is its day's best; a lower one is dropped (ADR 0004). */
export function addLettergridSolve(p: LettergridProgress, s: LettergridSolve): LettergridProgress {
  return { ...p, solves: mergeSolves(p.solves, { [s.gameId]: s }) }
}

/** Writes a day's slot, unless it holds something newer. `null` leaves a cleared marker. A solved Game never comes back. */
export function setLettergridSlot(p: LettergridProgress, day: CalendarDay, game: LettergridSaved | null, updatedAt: number): LettergridProgress {
  const slots = writeSlot(p.slots, dailySlotKey(day), { updatedAt, game }, (id) => isLettergridFinished(p, id))
  return slots === p.slots ? p : { ...p, slots }
}

// MARK: Validation

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const BONUSES = new Set(['L2', 'L3', 'W2', 'W3'])
const isLetter = (v: unknown): v is string => typeof v === 'string' && /^[a-z]$/.test(v)
const letters = (v: unknown, max: number): v is string[] => Array.isArray(v) && v.length <= max && v.every(isLetter)

function isTile(t: unknown): boolean {
  return isObj(t) && isNonNegInt(t.row) && t.row < GRID_SIZE && isNonNegInt(t.col) && t.col < GRID_SIZE && isLetter(t.letter)
}

function isPlay(p: unknown): boolean {
  return (
    isObj(p) &&
    (p.kind === 'play' || p.kind === 'swap') &&
    isNonNegInt(p.score) &&
    Array.isArray(p.tiles) &&
    p.tiles.length <= RACK_SIZE &&
    p.tiles.every(isTile)
  )
}

/** Structural check of a saved Lettergrid game. */
export function isLettergridState(v: unknown): v is LettergridState {
  return (
    isObj(v) &&
    isNonNegInt(v.generatorVersion) &&
    isNonNegInt(v.wordListVersion) &&
    Array.isArray(v.grid) && v.grid.length === CELL_COUNT && v.grid.every((c) => c === null || isLetter(c)) &&
    Array.isArray(v.bonuses) && v.bonuses.length === CELL_COUNT && v.bonuses.every((b) => b === null || (typeof b === 'string' && BONUSES.has(b))) &&
    Array.isArray(v.seedCells) && v.seedCells.length <= GRID_SIZE && v.seedCells.every((c) => isNonNegInt(c) && c < CELL_COUNT) &&
    letters(v.tileRun, TILE_RUN_LENGTH) &&
    letters(v.queue, TILE_RUN_LENGTH) &&
    letters(v.rack, RACK_SIZE) &&
    Array.isArray(v.plays) && v.plays.length <= PLAYS_PER_DAILY && v.plays.every(isPlay) &&
    isObj(v.par) &&
    isNonNegInt(v.par.solverVersion) &&
    isNonNegInt(v.par.greedyScore) &&
    Array.isArray(v.par.tiers) && v.par.tiers.length === 3 && v.par.tiers.every(isNonNegInt)
  )
}

function copyState(v: LettergridState): LettergridState {
  return {
    generatorVersion: v.generatorVersion,
    wordListVersion: v.wordListVersion,
    grid: [...v.grid],
    bonuses: [...v.bonuses],
    seedCells: [...v.seedCells],
    tileRun: [...v.tileRun],
    queue: [...v.queue],
    rack: [...v.rack],
    plays: v.plays.map((p) => ({ kind: p.kind, score: p.score, tiles: p.tiles.map((t) => ({ row: t.row, col: t.col, letter: t.letter })) })) as LettergridState['plays'],
    par: { solverVersion: v.par.solverVersion, greedyScore: v.par.greedyScore, tiers: [...v.par.tiers] as unknown as LettergridState['par']['tiers'] },
  }
}

function parseSaved(v: unknown): LettergridSaved | null {
  if (!isObj(v) || !isSafeId(v.id) || !finite(v.startedAt) || !isLettergridState(v.state)) return null
  return { id: v.id, startedAt: v.startedAt, state: copyState(v.state) }
}

function parseSolve(id: string, v: unknown): LettergridSolve | null {
  if (!isObj(v) || v.gameId !== id || !isInt(v.day) || !finite(v.finishedAt) || !isNonNegInt(v.score)) return null
  if (v.stars !== 0 && v.stars !== 1 && v.stars !== 2 && v.stars !== 3) return null
  if (!Array.isArray(v.plays) || v.plays.length !== PLAYS_PER_DAILY || !v.plays.every((p) => p === null || isNonNegInt(p))) return null
  if ((v.plays as (number | null)[]).reduce<number>((n, p) => n + (p ?? 0), 0) !== v.score) return null
  if (v.board !== undefined && !isLettergridBoard(v.board)) return null
  const solve: LettergridSolve = { gameId: id, day: v.day, finishedAt: v.finishedAt, score: v.score, stars: v.stars, plays: [...(v.plays as (number | null)[])] }
  return v.board === undefined ? solve : { ...solve, board: copyBoard(v.board) }
}

/** Returns a clean copy of an untrusted value if it is well-formed Lettergrid progress, else null. */
export function parseLettergridProgress(raw: unknown): LettergridProgress | null {
  if (!isObj(raw) || !isObj(raw.firstOpened) || !isObj(raw.solves) || !isObj(raw.slots)) return null
  if (Object.keys(raw.firstOpened).length > MAX_LETTERGRID_DAYS) return null
  if (Object.keys(raw.solves).length > MAX_LETTERGRID_SOLVES || Object.keys(raw.slots).length > MAX_LETTERGRID_SLOTS) return null
  const firstOpened: Record<string, number> = {}
  for (const [k, d] of Object.entries(raw.firstOpened)) {
    if (!isInt(Number(k)) || !isInt(d)) return null
    firstOpened[k] = d
  }
  const solves: Record<string, LettergridSolve> = {}
  for (const [id, s] of Object.entries(raw.solves)) {
    const solve = isSafeId(id) ? parseSolve(id, s) : null
    if (!solve) return null
    solves[id] = solve
  }
  // Documents from before ADR 0004's storage rule can hold several solves for a day.
  const best = keepBest(Object.values(solves))
  const slots: Record<string, LettergridSlot> = {}
  for (const [k, s] of Object.entries(raw.slots)) {
    if (!isInt(dailySlotDay(k)) || !isObj(s) || !finite(s.updatedAt)) return null
    const game = s.game === null ? null : parseSaved(s.game)
    if (s.game !== null && !game) return null
    slots[k] = { updatedAt: s.updatedAt, game }
  }
  // Progress from before the clock existed has none; the slots' own writes stand in for it.
  const clock = raw.clock === undefined ? 0 : raw.clock
  if (!finite(clock) || clock < 0) return null
  return { firstOpened, solves: best, slots, clock }
}
