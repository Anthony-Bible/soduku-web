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
import type { Api } from '../platform/api'
import { SyncManager, type SyncStatus } from './sync'

export type Sheet = 'picker' | 'stats' | 'achievements' | 'calendar' | 'account'

export interface Snapshot {
  readonly version: number
  readonly session: GameSession | null
  readonly sheet: Sheet | null
  readonly today: CalendarDay
  readonly sync: SyncStatus
}

/**
 * Glue between the pure core and the UI: owns the PlayerProfile, the current GameSession, which sheet is
 * open, and what "today" is. Not React: the UI subscribes to it through `useSyncExternalStore`.
 */
export class AppController {
  readonly profile: PlayerProfile
  readonly sync: SyncManager
  private session: GameSession | null = null
  private sheet: Sheet | null = null
  private today: CalendarDay
  private version = 0
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()

  constructor(
    kv: KeyValueStore,
    private readonly clock: () => Date = () => new Date(),
    api: Api | null = null,
  ) {
    const store = new SaveStore(kv)
    this.profile = new PlayerProfile(store, () => this.clock().getTime())
    this.sync = new SyncManager(this.profile, store, api, () => this.clock().getTime(), () => this.changed())
    this.profile.onSolve = () => void this.sync.sync()
    this.sync.onCleared = () => {
      this.session = null
    }
    this.today = dayFromDate(this.clock())
    this.snapshot = this.makeSnapshot()
  }

  private makeSnapshot(): Snapshot {
    return { version: this.version, session: this.session, sheet: this.sheet, today: this.today, sync: this.sync.getStatus() }
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

  /**
   * Another tab changed local storage. Re-reads it; if that tab signed out or signed in to a different Account,
   * the Game open here is closed without saving, so it can't write one Account's progress into another. Every
   * move is already saved, so the player can resume it from Home when it still belongs to them.
   */
  storageChanged(): void {
    const hadAccount = this.sync.getStatus().account !== null
    this.profile.refresh()
    const ownerChanged = this.sync.refresh()
    const signedOutElsewhere =
      hadAccount && this.sync.getStatus().account === null && Object.keys(this.profile.syncDoc().games).length === 0
    if (ownerChanged || signedOutElsewhere) {
      this.session = null
      this.sheet = null
      this.changed()
    }
  }

  /** Signs out: the device goes back to an empty Signed Out state, and no Game stays open. */
  async signOut(): Promise<void> {
    await this.sync.signOut()
    this.session = null
    this.sheet = null
    this.changed()
  }

  /**
   * Starts syncing: now, when the page is hidden, on a timer while it is visible, and (through the profile)
   * after each finished Game. Returns a function that stops it.
   */
  startSyncing(): () => void {
    if (!this.sync.available) return () => undefined
    void this.sync.adoptExistingSession()
    void this.sync.sync()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void this.sync.sync({ keepalive: true })
      } else {
        void this.sync.sync()
        void this.sync.adoptExistingSession()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void this.sync.retryPendingSignOut()
        void this.sync.sync()
      }
    }, 60_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
    }
  }

  private leaveGame(): void {
    if (this.session) {
      this.session.pause()
      this.session.save()
    }
  }
}
