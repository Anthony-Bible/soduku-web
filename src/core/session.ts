import type { AchievementId, SolveSummary } from './achievements'
import { recordAchievements, type AchievementProgress } from './achievements'
import type { CalendarDay } from './calendarDay'
import { catchUpAchievements } from './catchUp'
import { currentStreak, solveFor, type DailyLog } from './dailyLog'
import * as G from './gameState'
import type { GameState } from './gameState'
import type { Puzzle } from './generator'
import type { Position } from './position'
import { randomId } from './id'
import type { SaveStore } from './saveStore'
import { isFinished as isLettergridDone, resultOf, type LettergridState } from './lettergrid/game'
import {
  addLettergridSolve,
  countedSolves,
  deriveLettergridLog,
  deriveLettergridStatistics,
  liveLettergridSlot,
  openLettergridDay,
  setLettergridSlot,
  type LettergridSaved,
  type LettergridSolve,
} from './lettergridProgress'
import type { LettergridStatistics, Statistics } from './statistics'
import {
  addGame,
  dailySlotKey,
  deriveDailyLog,
  deriveStatistics,
  emptySyncDoc,
  GAME_SLOT_KEY,
  liveGameSlot,
  liveSlot,
  mergeDocs,
  normalizeDoc,
  clampDoc,
  MAX_CLOCK_SKEW_MS,
  openDay,
  setSlot,
  solveDay,
  unlockAchievements,
  winGame,
  wonGameCount,
  type SyncDoc,
} from './syncDoc'

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

/** What a solve reports to the profile: the Achievements summary plus which Game it was. */
export interface SolveReport extends SolveSummary {
  readonly gameId?: string
  readonly startedAt?: number
}

/**
 * The player's saved Games, Statistics, Daily log and Achievements, and the rules for changing them. All of
 * it lives in one synced document (see syncDoc.ts); Statistics, the Daily log and the solve count are
 * derived from it. Use it from one thread. Puzzle generation is slow, so the caller generates and passes the
 * Puzzle in.
 */
export class PlayerProfile {
  private doc: SyncDoc
  private derived: {
    doc: SyncDoc
    statistics: Statistics
    dailyLog: DailyLog
    achievements: AchievementProgress
    lettergridLog: DailyLog
    lettergridStatistics: LettergridStatistics
    /** The solve that counts for each day. */
    lettergridCounted: ReadonlyMap<CalendarDay, LettergridSolve>
  } | null = null
  /** Called after a Game is won, so the app can sync soon. */
  onSolve: (() => void) | null = null

  constructor(
    readonly store: SaveStore,
    readonly now: () => number = Date.now,
    readonly newId: () => string = randomId,
  ) {
    this.doc = store.loadDoc()
  }

  /** The current document, re-read so a write never clobbers changes another tab or app instance made. */
  syncDoc(): SyncDoc {
    this.reload()
    return this.doc
  }

  private reload(): void {
    this.doc = this.store.loadDoc()
  }

  /** Public refresh for storage events from other tabs. */
  refresh(): void {
    this.reload()
  }

  private clockLimit(): number {
    return this.now() + MAX_CLOCK_SKEW_MS
  }

  private update(fn: (doc: SyncDoc) => SyncDoc): void {
    this.reload()
    // Timestamps from a device whose date was set ahead are pulled back, so pruning can't drop current Games.
    this.doc = normalizeDoc(fn(clampDoc(this.doc, this.clockLimit())))
    this.store.saveDoc(this.doc)
  }

  /** Merges a document from the server into this device's. Never loses a local change. */
  mergeRemote(remote: SyncDoc): void {
    this.update((doc) => catchUpAchievements(mergeDocs(doc, clampDoc(remote, this.clockLimit())), this.now()))
  }

  /** Replaces everything with an empty, Signed Out state. */
  clearAll(): void {
    this.store.clearAll()
    this.doc = emptySyncDoc()
  }

  private get view() {
    if (this.derived?.doc !== this.doc) {
      const lettergridCounted = countedSolves(this.doc.lettergrid)
      this.derived = {
        doc: this.doc,
        statistics: deriveStatistics(this.doc),
        dailyLog: deriveDailyLog(this.doc),
        achievements: { solveCount: wonGameCount(this.doc), unlockedAt: this.doc.unlockedAt },
        lettergridLog: deriveLettergridLog(this.doc.lettergrid, lettergridCounted),
        lettergridStatistics: deriveLettergridStatistics(this.doc.lettergrid, lettergridCounted),
        lettergridCounted,
      }
    }
    return this.derived
  }

  /** Counted from Game records. */
  get statistics(): Statistics {
    return this.view.statistics
  }
  get dailyLog(): DailyLog {
    return this.view.dailyLog
  }
  get achievements(): AchievementProgress {
    return this.view.achievements
  }

  /** Lettergrid's own Daily log: its Streak, Longest Streak and Calendar come from this and nothing of Sudoku's. */
  get lettergridLog(): DailyLog {
    return this.view.lettergridLog
  }
  get lettergridStatistics(): LettergridStatistics {
    return this.view.lettergridStatistics
  }
  lettergridStreak(today: CalendarDay): number {
    return currentStreak(this.lettergridLog, today)
  }
  /** The solve that counts for a day (the earliest finished), if any. */
  lettergridSolve(day: CalendarDay): LettergridSolve | null {
    this.reload()
    return this.countedLettergrid(day)
  }

  /** The counted solve for a day in the document as loaded; callers reload first. */
  private countedLettergrid(day: CalendarDay): LettergridSolve | null {
    return this.view.lettergridCounted.get(day) ?? null
  }

  // Lettergrid Dailies (Daily-only: there are no ordinary Lettergrid games)

  /**
   * Opens a day's Lettergrid Daily and records the first opening. Returns the saved game to continue,
   * 'needsGame' when the caller should build the day's game and pass it to `startLettergridDaily`, or null
   * for a future day or one already solved.
   */
  openLettergridDaily(day: CalendarDay, today: CalendarDay): LettergridSaved | 'needsGame' | null {
    this.reload()
    if (day > today || this.countedLettergrid(day) !== null) return null
    if (this.doc.lettergrid.firstOpened[day] === undefined) {
      this.update((doc) => ({ ...doc, lettergrid: openLettergridDay(doc.lettergrid, day, today) }))
    }
    return liveLettergridSlot(this.doc.lettergrid, day)?.game ?? 'needsGame'
  }

  startLettergridDaily(state: LettergridState, day: CalendarDay): LettergridSaved {
    // Out of order calls never replace a live game or start one on a solved day.
    this.reload()
    const live = liveLettergridSlot(this.doc.lettergrid, day)
    if (live) return live.game
    if (this.countedLettergrid(day) !== null) throw new Error(`Lettergrid Daily ${day} is already solved`)
    const saved: LettergridSaved = { id: this.newId(), startedAt: this.now(), state }
    this.saveLettergrid(day, saved)
    return saved
  }

  /** Saves the game in progress; a finished one is recorded as a solve and leaves a cleared marker. */
  saveLettergrid(day: CalendarDay, saved: LettergridSaved): void {
    if (isLettergridDone(saved.state)) {
      this.recordLettergridSolve(day, saved)
      return
    }
    this.update((doc) => ({ ...doc, lettergrid: setLettergridSlot(doc.lettergrid, day, saved, this.now()) }))
  }

  hasLettergridInProgress(day: CalendarDay): boolean {
    this.reload()
    return this.countedLettergrid(day) === null && liveLettergridSlot(this.doc.lettergrid, day) !== null
  }

  /** Records a finished Lettergrid Daily. Every solve is kept; the earliest finished counts. */
  private recordLettergridSolve(day: CalendarDay, saved: LettergridSaved): void {
    this.reload()
    if (this.doc.lettergrid.solves[saved.id]) return
    const solve: LettergridSolve = { gameId: saved.id, day, finishedAt: this.now(), ...resultOf(saved.state) }
    this.update((doc) => {
      const lettergrid = addLettergridSolve(doc.lettergrid, solve)
      return { ...doc, lettergrid: setLettergridSlot(lettergrid, day, null, this.now()) }
    })
    this.onSolve?.()
  }

  /** Writes a Game-in-progress slot (or its cleared marker). */
  writeSlot(key: string, game: GameState | null, updatedAt: number): void {
    this.update((doc) => setSlot(doc, key, game, updatedAt))
  }

  private startRecord(state: GameState, dailyDay: CalendarDay | null): void {
    this.update((doc) =>
      addGame(doc, {
        id: state.id,
        difficulty: state.difficulty,
        startedAt: state.startedAt,
        dailyDay,
        wonSeconds: null,
        mistakes: null,
        hintsUsed: null,
      }),
    )
  }

  // Ordinary games

  /** The ordinary Game that can be continued, if any. A finished save is cleared. */
  savedGame(): GameState | null {
    this.reload()
    const slot = liveGameSlot(this.doc)
    if (slot && slot.game.status === 'won') {
      this.writeSlot(GAME_SLOT_KEY, null, this.now())
      return null
    }
    return slot ? slot.game : null
  }

  continueGame(): GameSession | null {
    const saved = this.savedGame()
    if (!saved) return null
    const session = new GameSession(saved, null, this, liveGameSlot(this.doc)!.updatedAt)
    session.resume()
    return session
  }

  /** Starts a new ordinary Game, replacing any saved one, and counts it as played. */
  startGame(puzzle: Puzzle): GameSession {
    const state = G.newGame(puzzle, this.now(), this.newId())
    const session = new GameSession(state, null, this, this.now())
    this.startRecord(state, null)
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
    this.update((doc) => openDay(doc, day, today))
    const slot = liveSlot(this.doc, dailySlotKey(day))
    if (!slot) return 'needsPuzzle'
    const session = new GameSession(slot.game, day, this, slot.updatedAt)
    session.resume()
    return { resumed: session }
  }

  /** Starts a day's Daily Puzzle after `openDaily` returned `needsPuzzle`, and counts it as played. */
  startDaily(puzzle: Puzzle, day: CalendarDay): GameSession {
    const state = G.newGame(puzzle, this.now(), this.newId())
    const session = new GameSession(state, day, this, this.now())
    this.startRecord(state, day)
    session.save()
    return session
  }

  hasDailyInProgress(day: CalendarDay): boolean {
    this.reload()
    return solveFor(this.dailyLog, day) === undefined && liveSlot(this.doc, dailySlotKey(day)) !== null
  }

  currentStreak(today: CalendarDay): number {
    return currentStreak(this.dailyLog, today)
  }

  /** Records a solved Game in its Game record, the Daily log (for a Daily Puzzle) and Achievements. */
  recordSolve(summary: SolveReport): SolveResult {
    this.reload()
    const id = summary.gameId ?? this.newId()
    const bestBefore = this.statistics[summary.difficulty].bestTimeSeconds
    const solveCountBefore = wonGameCount(this.doc, id)
    let unlocked: AchievementId[] = []
    this.update((doc) => {
      let next = winGame(doc, {
        id,
        difficulty: summary.difficulty,
        startedAt: summary.startedAt ?? this.now(),
        dailyDay: summary.dailyDay,
        seconds: summary.seconds,
        mistakes: summary.mistakes,
        hintsUsed: summary.hintsUsed,
      })
      if (summary.dailyDay !== null) next = solveDay(next, summary.dailyDay)
      const result = recordAchievements(
        { solveCount: solveCountBefore, unlockedAt: next.unlockedAt },
        summary,
        deriveDailyLog(next),
        this.now(),
      )
      unlocked = result.unlocked
      return unlockAchievements(next, unlocked, this.now())
    })
    const isNewBest = bestBefore === null || summary.seconds < bestBefore
    this.onSolve?.()
    return { isNewBest, unlocked }
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
    /** Time of the last move or change; it decides which device's copy of this Game wins a sync. */
    private updatedAt: number = profile.now(),
  ) {
    this.state = state
  }

  private touch(): void {
    this.updatedAt = this.profile.now()
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
    this.touch()
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

  /** Writes the Game to its save slot, or leaves a cleared marker once the Game is won. */
  save(): void {
    const key = this.dailyDay === null ? GAME_SLOT_KEY : dailySlotKey(this.dailyDay)
    this.profile.writeSlot(key, this.state.status === 'won' ? null : this.state, this.updatedAt)
  }

  private finish(outcome: G.Outcome, at: Position | null, first: Haptic, completed: ReadonlySet<Position>): MoveFeedback {
    // `this.state` was already assigned by the caller; publish it to listeners.
    this.version++
    if (outcome !== 'ignored') this.touch()
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
      gameId: s.id,
      startedAt: s.startedAt,
      difficulty: s.difficulty,
      seconds: s.elapsedSeconds,
      mistakes: s.mistakes,
      hintsUsed: s.hintsUsed,
      dailyDay: this.dailyDay,
    })
    return this.solveResult
  }
}

