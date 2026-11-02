import {
  dailyPuzzle,
  dayFromDate,
  generate,
  PlayerProfile,
  SaveStore,
  type CalendarDay,
  type Difficulty,
  type GameSession,
  type KeyValueStore,
} from '../core'

export type Sheet = 'picker' | 'stats' | 'achievements' | 'calendar'

export interface Snapshot {
  readonly version: number
  readonly session: GameSession | null
  readonly sheet: Sheet | null
  readonly today: CalendarDay
}

/**
 * Glue between the pure core and the UI: owns the PlayerProfile, the current GameSession, which sheet is
 * open, and what "today" is. Not React: the UI subscribes to it through `useSyncExternalStore`.
 */
export class AppController {
  readonly profile: PlayerProfile
  private session: GameSession | null = null
  private sheet: Sheet | null = null
  private today: CalendarDay
  private version = 0
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()

  constructor(
    kv: KeyValueStore,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.profile = new PlayerProfile(new SaveStore(kv), () => this.clock().getTime())
    this.today = dayFromDate(this.clock())
    this.snapshot = this.makeSnapshot()
  }

  private makeSnapshot(): Snapshot {
    return { version: this.version, session: this.session, sheet: this.sheet, today: this.today }
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = (): Snapshot => this.snapshot

  /** Call after anything that changed profile data (or any of the fields above). */
  changed(): void {
    this.version++
    this.snapshot = this.makeSnapshot()
    this.listeners.forEach((fn) => fn())
  }

  /** Re-reads the local date, e.g. when the page becomes visible after midnight. */
  refreshToday(): void {
    const now = dayFromDate(this.clock())
    if (now !== this.today) {
      this.today = now
      this.changed()
    }
  }

  openSheet(sheet: Sheet | null): void {
    this.sheet = sheet
    this.changed()
  }

  startNewGame(difficulty: Difficulty): void {
    this.leaveGame()
    this.session = this.profile.startGame(generate(difficulty))
    this.sheet = null
    this.changed()
  }

  continueGame(): void {
    const session = this.profile.continueGame()
    if (!session) return
    this.leaveGame()
    this.session = session
    this.changed()
  }

  /** Opens a day's Daily Puzzle: resumes saved progress or deals the date's puzzle. Past days only. */
  openDaily(day: CalendarDay): void {
    this.refreshToday()
    const opening = this.profile.openDaily(day, this.today)
    if (opening === null) {
      this.changed()
      return
    }
    this.leaveGame()
    this.session = opening === 'needsPuzzle' ? this.profile.startDaily(dailyPuzzle(day), day) : opening.resumed
    this.sheet = null
    this.changed()
  }

  /** Opens today's Daily Puzzle, using the real current date rather than a possibly stale rendered one. */
  openToday(): void {
    this.refreshToday()
    this.openDaily(this.today)
  }

  /** Saves and leaves the Game screen. */
  goHome(): void {
    this.leaveGame()
    this.session = null
    this.sheet = null
    this.changed()
  }

  resetStatistics(): void {
    this.profile.resetStatistics()
    this.changed()
  }

  private leaveGame(): void {
    if (this.session) {
      this.session.pause()
      this.session.save()
    }
  }
}
