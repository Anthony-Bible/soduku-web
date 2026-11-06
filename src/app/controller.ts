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
  type LettergridSaved,
} from '../core'
import { lettergridDaily, newDailyGame, wordListVersionFor, type WordList } from '../core/lettergrid'
import type { Api } from '../platform/api'
import { LettergridSession } from './lettergridSession'
import { SyncManager, type SyncStatus } from './sync'
import { loadWordList } from './wordListLoader'

export type Sheet = 'picker' | 'stats' | 'achievements' | 'calendar' | 'account' | 'lettergridCalendar' | 'lettergridStats'

/** Which game's Home is showing. The app always starts on Sudoku. */
export type Tab = 'sudoku' | 'lettergrid'

/** A Lettergrid Daily being opened: the Word List loads first. `error` is set when that failed. */
export interface LettergridOpening {
  readonly day: CalendarDay
  readonly error: string | null
}

export interface Snapshot {
  readonly version: number
  readonly session: GameSession | null
  readonly sheet: Sheet | null
  readonly tab: Tab
  readonly lettergrid: LettergridSession | null
  readonly lettergridOpening: LettergridOpening | null
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
  private tab: Tab = 'sudoku'
  private lettergrid: LettergridSession | null = null
  private lettergridOpening: LettergridOpening | null = null
  /** Bumped whenever an opening is started or abandoned, so a slow Word List load can tell it is stale. */
  private openToken = 0
  private today: CalendarDay
  private version = 0
  private snapshot: Snapshot
  private readonly listeners = new Set<() => void>()

  constructor(
    kv: KeyValueStore,
    private readonly clock: () => Date = () => new Date(),
    api: Api | null = null,
    private readonly loadWords: (version: number) => Promise<WordList> = (version) => loadWordList(version),
  ) {
    const store = new SaveStore(kv)
    this.profile = new PlayerProfile(store, () => this.clock().getTime())
    this.sync = new SyncManager(this.profile, store, api, () => this.clock().getTime(), () => this.changed())
    this.profile.onSolve = () => void this.sync.sync()
    this.sync.onCleared = () => {
      this.session = null
      this.dropLettergrid()
    }
    this.today = dayFromDate(this.clock())
    this.snapshot = this.makeSnapshot()
  }

  private makeSnapshot(): Snapshot {
    return {
      version: this.version,
      session: this.session,
      sheet: this.sheet,
      tab: this.tab,
      lettergrid: this.lettergrid,
      lettergridOpening: this.lettergridOpening,
      today: this.today,
      sync: this.sync.getStatus(),
    }
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

  setTab(tab: Tab): void {
    if (this.tab === tab) return
    this.tab = tab
    this.changed()
  }

  startNewGame(difficulty: Difficulty): void {
    this.leaveGame()
    this.dropLettergrid()
    this.session = this.profile.startGame(generate(difficulty))
    this.sheet = null
    this.changed()
  }

  continueGame(): void {
    const session = this.profile.continueGame()
    if (!session) return
    this.leaveGame()
    this.dropLettergrid()
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

  /**
   * Opens a day's Lettergrid Daily (past days and today). The first opening is recorded at once; the Word List
   * the day was published with is fetched next, so the screen shows a loading state, then the game: resumed
   * from its saved progress or dealt fresh. A failed load leaves a message with a retry.
   */
  openLettergridDay(day: CalendarDay): void {
    this.refreshToday()
    const opened = this.profile.openLettergridDaily(day, this.today)
    if (opened === null) {
      this.lettergridOpening = null
      this.changed()
      return
    }
    this.leaveGame()
    this.session = null
    this.sheet = null
    this.lettergrid = null
    const token = ++this.openToken
    this.lettergridOpening = { day, error: null }
    this.changed()
    void this.finishOpening(day, opened, token)
  }

  /** Opens today's Lettergrid Daily, using the real current date rather than a possibly stale rendered one. */
  openLettergridToday(): void {
    this.refreshToday()
    this.openLettergridDay(this.today)
  }

  /** Tries again after the Word List failed to load. */
  retryLettergridOpening(): void {
    if (this.lettergridOpening?.error) this.openLettergridDay(this.lettergridOpening.day)
  }

  private async finishOpening(day: CalendarDay, opened: LettergridSaved | 'needsGame', token: number): Promise<void> {
    let words: WordList
    try {
      words = await this.loadWords(opened === 'needsGame' ? wordListVersionFor(day) : opened.state.wordListVersion)
    } catch {
      if (token !== this.openToken) return
      this.lettergridOpening = { day, error: "Couldn't load the Word List. Check your connection and try again." }
      this.changed()
      return
    }
    if (token !== this.openToken) return
    try {
      const saved =
        opened === 'needsGame' ? this.profile.startLettergridDaily(newDailyGame(lettergridDaily(day, words)), day) : opened
      this.lettergrid = new LettergridSession(day, saved, words, this.profile, () => this.changed())
    } catch {
      // Solved on another device while the list loaded: nothing to open, so the player goes back Home.
      this.lettergrid = null
    }
    this.lettergridOpening = null
    this.changed()
  }

  private dropLettergrid(): void {
    this.openToken++
    this.lettergrid = null
    this.lettergridOpening = null
  }

  /** Saves and leaves the Game screen. */
  goHome(): void {
    this.leaveGame()
    this.session = null
    this.dropLettergrid()
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
      this.dropLettergrid()
      this.sheet = null
      this.changed()
    }
  }

  /** Signs out: the device goes back to an empty Signed Out state, and no Game stays open. */
  async signOut(): Promise<void> {
    await this.sync.signOut()
    this.session = null
    this.dropLettergrid()
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
