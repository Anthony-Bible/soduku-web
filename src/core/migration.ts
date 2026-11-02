import type { AchievementProgress } from './achievements'
import type { CalendarDay } from './calendarDay'
import type { DailyLog } from './dailyLog'
import { DIFFICULTIES } from './difficulty'
import type { GameState } from './gameState'
import type { Statistics } from './statistics'
import { dailySlotKey, emptySyncDoc, GAME_SLOT_KEY, normalizeDoc, type GameRecord, type Slot, type SyncDoc } from './syncDoc'

/** What local storage v1 held: counters, not Game records, and Games without ids. */
export interface LegacyData {
  readonly statistics: Statistics | null
  readonly dailyLog: DailyLog | null
  readonly achievements: AchievementProgress | null
  readonly game: Omit<GameState, 'id'> | null
  readonly dailies: Readonly<Record<number, Omit<GameState, 'id'>>>
}

/**
 * Turns v1 data into the synced document without changing anything the player can see: Statistics counters
 * become that many synthetic Game records (every synthetic win carries the best time), the Daily log and
 * Achievements carry over, and each Game in progress gets an id and, where possible, an unfinished record.
 */
export function migrateLegacy(legacy: LegacyData, newId: () => string): SyncDoc {
  const games: Record<string, GameRecord> = {}
  const unfinished: Record<string, GameRecord[]> = { easy: [], medium: [], hard: [], expert: [] }

  for (const d of DIFFICULTIES) {
    const s = legacy.statistics?.[d]
    if (!s) continue
    const won = s.won
    const played = Math.max(s.played, s.won)
    for (let i = 0; i < played; i++) {
      const isWin = i < won
      const rec: GameRecord = {
        id: newId(),
        difficulty: d,
        startedAt: 0,
        dailyDay: null,
        wonSeconds: isWin ? (s.bestTimeSeconds ?? 3600) : null,
        mistakes: null,
        hintsUsed: null,
      }
      games[rec.id] = rec
      if (!isWin) unfinished[d].push(rec)
    }
  }

  const slots: Record<string, Slot> = {}
  const adopt = (keyFor: (id: string) => string, g: Omit<GameState, 'id'>, dailyDay: CalendarDay | null) => {
    if (g.status === 'won') return
    const rec = unfinished[g.difficulty].pop()
    const id = rec?.id ?? newId()
    if (rec) games[id] = { ...rec, startedAt: g.startedAt, dailyDay }
    slots[keyFor(id)] = { updatedAt: g.startedAt + g.elapsedSeconds * 1000, game: { ...g, id } }
  }
  if (legacy.game) adopt(() => GAME_SLOT_KEY, legacy.game, null)
  for (const [day, g] of Object.entries(legacy.dailies)) adopt(() => dailySlotKey(Number(day)), g, Number(day))

  const firstOpened: Record<string, number> = {}
  const solved: Record<string, true> = {}
  for (const [k, d] of Object.entries(legacy.dailyLog?.firstOpened ?? {})) firstOpened[k] = d
  for (const [k, kind] of Object.entries(legacy.dailyLog?.solves ?? {})) {
    solved[k] = true
    // A solve always has an opening; if it is somehow missing, reconstruct one that yields the same kind.
    if (firstOpened[k] === undefined) firstOpened[k] = kind === 'onDay' ? Number(k) : Number(k) + 1
  }

  // v1's resetStatistics() cleared the counters but kept the Achievements solve count, so it can exceed the
  // wins above. Carry the difference so milestone progress (say 45 of 50) survives.
  const wins = Object.values(games).filter((g) => g.wonSeconds !== null).length
  const extra = Math.max(0, (legacy.achievements?.solveCount ?? 0) - wins)
  const legacySolves: Record<string, number> = extra > 0 ? { [newId()]: extra } : {}

  return normalizeDoc({ ...emptySyncDoc(), games, firstOpened, solved, unlockedAt: { ...(legacy.achievements?.unlockedAt ?? {}) }, slots, legacySolves })
}
