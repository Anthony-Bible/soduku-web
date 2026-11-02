import type { AchievementId, SolveSummary } from './achievements'
import { recordAchievements, type AchievementProgress } from './achievements'
import type { CalendarDay } from './calendarDay'
import { recordOpen, recordSolve, solveFor, currentStreak, type DailyLog } from './dailyLog'
import * as G from './gameState'
import type { GameState } from './gameState'
import type { Puzzle } from './generator'
import type { Position } from './position'
import type { SaveStore } from './saveStore'
import { emptyStatistics, recordStart, recordWin, type Statistics } from './statistics'

/** What a solve earned, for the win screen. */
export interface SolveResult {
  readonly isNewBest: boolean
  /** Achievements this solve newly unlocked, in declaration order. */
  readonly unlocked: readonly AchievementId[]
}

export type Haptic = 'light' | 'medium' | 'error' | 'success'

/** What a player action produced, for the UI to play back: haptics, cells to flash, and the solve result. */
export interface MoveFeedback {
  readonly outcome: G.Outcome
  readonly haptics: readonly Haptic[]
  /** The cell that just took a Mistake. */
  readonly mistakeAt: Position | null
  /** Cells of every row, column and box the action just completed. */
  readonly completedUnits: ReadonlySet<Position>
  /** Set when the action won the Game. */
  readonly solve: SolveResult | null
}

export const IGNORED: MoveFeedback = { outcome: 'ignored', haptics: [], mistakeAt: null, completedUnits: new Set(), solve: null }

/** Seconds between saves while the clock runs. */
export const AUTOSAVE_INTERVAL = 5

/**
 * The player's saved games, Statistics, Daily log and Achievements, and the rules for changing them.
 * Use it from one thread. Puzzle generation is slow, so the caller generates and passes the Puzzle in.
 */
export class PlayerProfile {
  statistics: Statistics
  dailyLog: DailyLog
  achievements: AchievementProgress

  constructor(
    readonly store: SaveStore,
    readonly now: () => number = Date.now,
  ) {
    this.statistics = store.loadStatistics()
    this.dailyLog = store.loadDailyLog()
    this.achievements = store.loadAchievements()
  }

  /** Re-reads persisted data so a write never clobbers changes another tab or app instance made. */
  private reload(): void {
    this.statistics = this.store.loadStatistics()
    this.dailyLog = this.store.loadDailyLog()
    this.achievements = this.store.loadAchievements()
  }

  /** Public refresh for storage events from other tabs. */
  refresh(): void {
    this.reload()
  }

  // Ordinary games

  /** The ordinary Game that can be continued, if any. A finished save is deleted. */
  savedGame(): GameState | null {
    const saved = this.store.loadGame()
    if (saved && saved.status === 'won') {
      this.store.clearGame()
      return null
    }
    return saved
  }

  continueGame(): GameSession | null {
    const saved = this.savedGame()
    if (!saved) return null
    const session = new GameSession(saved, null, this)
    session.resume()
    return session
  }

  /** Starts a new ordinary Game, replacing any saved one, and counts it as played. */
  startGame(puzzle: Puzzle): GameSession {
    this.reload()
    const session = new GameSession(G.newGame(puzzle, this.now()), null, this)
    this.statistics = recordStart(this.statistics, puzzle.difficulty)
    this.store.saveStatistics(this.statistics)
    session.save()
    return session
  }

  // Daily Puzzles

  /**
   * Opens a day's Daily Puzzle and records the first opening, which fixes whether its solve is On-Day or
   * Catch-Up. Returns null for a future day or one already solved. `needsPuzzle` means: generate
   * `dailyPuzzle(day)` and pass it to `startDaily`.
   */
  openDaily(day: CalendarDay, today: CalendarDay): { resumed: GameSession } | 'needsPuzzle' | null {
    this.reload()
    if (day > today || solveFor(this.dailyLog, day) !== undefined) return null
    this.dailyLog = recordOpen(this.dailyLog, day, today)
    this.store.saveDailyLog(this.dailyLog)
    const saved = this.store.loadDaily(day)
    if (!saved) return 'needsPuzzle'
    const session = new GameSession(saved, day, this)
    session.resume()
    return { resumed: session }
  }

  /** Starts a day's Daily Puzzle after `openDaily` returned `needsPuzzle`, and counts it as played. */
  startDaily(puzzle: Puzzle, day: CalendarDay): GameSession {
    this.reload()
    const session = new GameSession(G.newGame(puzzle, this.now()), day, this)
    this.statistics = recordStart(this.statistics, puzzle.difficulty)
    this.store.saveStatistics(this.statistics)
    session.save()
    return session
  }

  hasDailyInProgress(day: CalendarDay): boolean {
    return solveFor(this.dailyLog, day) === undefined && this.store.loadDaily(day) !== null
  }

  currentStreak(today: CalendarDay): number {
    return currentStreak(this.dailyLog, today)
  }

  /** Clears Statistics only. Streaks, the Calendar and Achievements are kept. */
  resetStatistics(): void {
    this.statistics = emptyStatistics()
    this.store.clearStatistics()
  }

  /** Records a solved Game in Statistics, the Daily log (for a Daily Puzzle) and Achievements. */
  recordSolve(summary: SolveSummary): SolveResult {
    this.reload()
    const { stats, isBest } = recordWin(this.statistics, summary.difficulty, summary.seconds)
    this.statistics = stats
    this.store.saveStatistics(stats)
    if (summary.dailyDay !== null) {
      this.dailyLog = recordSolve(this.dailyLog, summary.dailyDay)
      this.store.saveDailyLog(this.dailyLog)
    }
    const { progress, unlocked } = recordAchievements(this.achievements, summary, this.dailyLog, this.now())
    this.achievements = progress
    this.store.saveAchievements(progress)
    return { isNewBest: isBest, unlocked }
  }
}

/**
 * One Game being played: takes the player's actions, keeps its save current, and records the solve in the
 * PlayerProfile when it is won. Create one through PlayerProfile. The caller owns the clock: while
 * `isClockRunning`, call `tick()` once a second, and call `pause()` when the page is hidden.
 */
export class GameSession {
  state: GameState
  solveResult: SolveResult | null = null
  private tickCount = 0
  private readonly listeners = new Set<() => void>()
  private version = 0

  constructor(
    state: GameState,
    /** Set when this Game is a Daily Puzzle; it then saves to that day's slot. */
    readonly dailyDay: CalendarDay | null,
    private readonly profile: PlayerProfile,
  ) {
    this.state = state
  }

  get isClockRunning(): boolean {
    return this.state.status === 'playing'
  }

  /** For useSyncExternalStore. */
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = (): number => this.version

  private commit(state: GameState): void {
    this.state = state
    this.version++
    this.listeners.forEach((fn) => fn())
  }

  select(p: Position): void {
    this.commit(G.select(this.state, p))
  }

  /** Enters a value, or toggles a note in notes mode, at the selected cell. */
  tapNumber(n: number): MoveFeedback {
    const p = this.state.selected
    if (p === null) return IGNORED
    const wasNotesMode = this.state.isNotesMode
    const { state, outcome } = G.enter(this.state, n, p)
    this.state = state
    const completed = outcome === 'applied' && !wasNotesMode ? G.completedUnits(state, p) : new Set<Position>()
    return this.finish(outcome, p, 'light', completed)
  }

  erase(): MoveFeedback {
    const p = this.state.selected
    if (p === null) return IGNORED
    const { state, outcome } = G.erase(this.state, p)
    this.state = state
    return this.finish(outcome, p, 'light', new Set())
  }

  undo(): MoveFeedback {
    const { state, outcome } = G.undo(this.state)
    this.state = state
    return this.finish(outcome, null, 'light', new Set())
  }

  hint(): MoveFeedback {
    const { state, outcome } = G.hint(this.state)
    this.state = state
    const completed =
      outcome === 'applied' && state.selected !== null ? G.completedUnits(state, state.selected) : new Set<Position>()
    return this.finish(outcome, null, 'medium', completed)
  }

  toggleNotesMode(): MoveFeedback {
    this.commit(G.toggleNotesMode(this.state))
    this.save()
    return { ...IGNORED, outcome: 'applied', haptics: ['light'] }
  }

  pause(): void {
    if (this.state.status !== 'playing') return
    this.commit(G.pause(this.state))
    this.save()
  }

  resume(): void {
    if (this.state.status !== 'paused') return
    this.commit(G.resume(this.state))
    this.save()
  }

  /** Adds one second while playing, saving every few seconds. Does nothing otherwise. */
  tick(): void {
    if (this.state.status !== 'playing') return
    this.commit(G.addElapsed(this.state, 1))
    this.tickCount++
    if (this.tickCount % AUTOSAVE_INTERVAL === 0) this.save()
  }

  /** Writes the Game to its save slot, or deletes the slot once the Game is won. */
  save(): void {
    const store = this.profile.store
    const day = this.dailyDay
    if (this.state.status === 'won') {
      if (day === null) store.clearGame()
      else store.clearDaily(day)
    } else if (day === null) store.saveGame(this.state)
    else store.saveDaily(this.state, day)
  }

  private finish(outcome: G.Outcome, at: Position | null, first: Haptic, completed: ReadonlySet<Position>): MoveFeedback {
    // `this.state` was already assigned by the caller; publish it to listeners.
    this.version++
    if (outcome === 'ignored') {
      this.listeners.forEach((fn) => fn())
      return IGNORED
    }
    const haptics: Haptic[] = []
    let mistakeAt: Position | null = null
    let solve: SolveResult | null = null
    if (outcome === 'applied') haptics.push(first)
    else if (outcome === 'mistake') {
      haptics.push('error')
      mistakeAt = at
    } else {
      haptics.push('success')
      solve = this.recordWin()
    }
    if (completed.size > 0) haptics.push('success')
    this.save()
    this.listeners.forEach((fn) => fn())
    return { outcome, haptics, mistakeAt, completedUnits: completed, solve }
  }

  private recordWin(): SolveResult {
    if (this.solveResult) return this.solveResult
    const s = this.state
    this.solveResult = this.profile.recordSolve({
      difficulty: s.difficulty,
      seconds: s.elapsedSeconds,
      mistakes: s.mistakes,
      hintsUsed: s.hintsUsed,
      dailyDay: this.dailyDay,
    })
    return this.solveResult
  }
}

