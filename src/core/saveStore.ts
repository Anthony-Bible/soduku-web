import { isAchievementId, emptyAchievementProgress, type AchievementProgress } from './achievements'
import type { CalendarDay } from './calendarDay'
import { emptyDailyLog, type DailyLog } from './dailyLog'
import { DIFFICULTIES, isDifficulty } from './difficulty'
import type { GameState } from './gameState'
import { emptyStatistics, type Statistics } from './statistics'

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
export const SAVE_VERSION = 1
const PREFIX = 'sudoku.v1.'

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isNonNegInt = (v: unknown): v is number => isInt(v) && v >= 0

function isBoard(v: unknown): boolean {
  return (
    Array.isArray(v) &&
    v.length === 81 &&
    v.every(
      (c) =>
        isObj(c) &&
        isInt(c.value) && c.value >= 0 && c.value <= 9 &&
        typeof c.given === 'boolean' &&
        isInt(c.notes) && c.notes >= 0 && c.notes < 512,
    )
  )
}

function isMove(m: unknown): boolean {
  if (!isObj(m) || !isInt(m.position) || m.position < 0 || m.position > 80 || !isObj(m.move)) return false
  const k = m.move
  switch (k.kind) {
    case 'setValue':
      return (
        isInt(k.previous) &&
        isInt(k.next) &&
        isInt(k.previousNotes) &&
        (k.clearedPeers === undefined ||
          (Array.isArray(k.clearedPeers) && k.clearedPeers.every((q) => isInt(q) && q >= 0 && q <= 80)))
      )
    case 'toggleNote':
      return isInt(k.number)
    case 'clearNotes':
      return isInt(k.previousNotes)
    default:
      return false
  }
}

function isGameState(v: unknown): v is GameState {
  return (
    isObj(v) &&
    isBoard(v.board) &&
    isBoard(v.solution) &&
    isDifficulty(v.difficulty) &&
    typeof v.seed === 'string' &&
    isNonNegInt(v.mistakes) &&
    isNonNegInt(v.hintsUsed) &&
    isNonNegInt(v.elapsedSeconds) &&
    (v.status === 'playing' || v.status === 'paused' || v.status === 'won') &&
    Array.isArray(v.history) &&
    v.history.every(isMove) &&
    (v.selected === null || (isInt(v.selected) && v.selected >= 0 && v.selected <= 80)) &&
    typeof v.isNotesMode === 'boolean' &&
    typeof v.startedAt === 'number'
  )
}

function isStatistics(v: unknown): v is Statistics {
  return (
    isObj(v) &&
    DIFFICULTIES.every((d) => {
      const s = v[d]
      return isObj(s) && isNonNegInt(s.played) && isNonNegInt(s.won) && (s.bestTimeSeconds === null || isNonNegInt(s.bestTimeSeconds))
    })
  )
}

function isDailyLog(v: unknown): v is DailyLog {
  return (
    isObj(v) &&
    isObj(v.firstOpened) &&
    Object.entries(v.firstOpened).every(([k, d]) => isInt(Number(k)) && isInt(d)) &&
    isObj(v.solves) &&
    Object.entries(v.solves).every(([k, d]) => isInt(Number(k)) && (d === 'onDay' || d === 'catchUp'))
  )
}

function isAchievements(v: unknown): v is AchievementProgress {
  return (
    isObj(v) &&
    isNonNegInt(v.solveCount) &&
    isObj(v.unlockedAt) &&
    Object.entries(v.unlockedAt).every(([k, t]) => isAchievementId(k) && typeof t === 'number')
  )
}

/**
 * Keeps every record as versioned JSON in a key/value store. Saving is best-effort: a failed write is
 * ignored and an unreadable or malformed record loads as if missing, so a bad save never stops play.
 */
export class SaveStore {
  constructor(private readonly kv: KeyValueStore) {}

  private read<T>(key: string, guard: (v: unknown) => v is T): T | null {
    try {
      const raw = this.kv.getItem(PREFIX + key)
      if (raw === null) return null
      const parsed: unknown = JSON.parse(raw)
      if (!isObj(parsed) || parsed.v !== SAVE_VERSION) return null
      return guard(parsed.data) ? parsed.data : null
    } catch {
      return null
    }
  }

  private write(key: string, data: unknown): void {
    try {
      this.kv.setItem(PREFIX + key, JSON.stringify({ v: SAVE_VERSION, data }))
    } catch {
      // Best effort.
    }
  }

  private remove(key: string): void {
    try {
      this.kv.removeItem(PREFIX + key)
    } catch {
      // Best effort.
    }
  }

  // Ordinary Game in progress
  loadGame = (): GameState | null => this.read('game', isGameState)
  saveGame = (s: GameState): void => this.write('game', s)
  clearGame = (): void => this.remove('game')

  // Daily Puzzles in progress, one per day
  loadDaily = (day: CalendarDay): GameState | null => this.read(`daily.${day}`, isGameState)
  saveDaily = (s: GameState, day: CalendarDay): void => this.write(`daily.${day}`, s)
  clearDaily = (day: CalendarDay): void => this.remove(`daily.${day}`)

  // Records
  loadStatistics = (): Statistics => this.read('statistics', isStatistics) ?? emptyStatistics()
  saveStatistics = (s: Statistics): void => this.write('statistics', s)
  clearStatistics = (): void => this.remove('statistics')

  loadDailyLog = (): DailyLog => this.read('dailyLog', isDailyLog) ?? emptyDailyLog()
  saveDailyLog = (l: DailyLog): void => this.write('dailyLog', l)

  loadAchievements = (): AchievementProgress => this.read('achievements', isAchievements) ?? emptyAchievementProgress()
  saveAchievements = (p: AchievementProgress): void => this.write('achievements', p)
}
