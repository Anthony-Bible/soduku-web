import type { PlayerProfile, SaveStore } from '../core'
import { ApiError, type Api } from '../platform/api'

export interface SyncStatus {
  /** The Account this device is signed in to, or null when Signed Out. */
  readonly account: { readonly email: string } | null
  readonly lastSyncedAt: number | null
  /** Why the last sync failed, or null. */
  readonly error: string | null
  readonly syncing: boolean
}

const REASONS: Record<'offline' | 'server' | 'rejected' | 'wrongAccount', string> = {
  wrongAccount: 'This browser was signed in to a different Account, so nothing was synced. Your progress on this device is untouched.',
  offline: "Couldn't reach the server. Your progress is saved on this device and will sync when you're back online.",
  server: 'The server had a problem. Will try again soon.',
  rejected: "The server didn't accept the last sync. Will try again soon.",
}

/**
 * Keeps the device's document and the Account's in step (ADR 0002): sends the whole local document, merges
 * what comes back, and never blocks play. Not React; the controller owns one and republishes its status.
 */
export class SyncManager {
  private account: { email: string } | null
  private lastSyncedAt: number | null
  private error: string | null = null
  private syncing = false
  private status: SyncStatus

  constructor(
    private readonly profile: PlayerProfile,
    private readonly store: SaveStore,
    private readonly api: Api | null,
    private readonly now: () => number,
    private readonly onChange: () => void,
  ) {
    this.account = store.loadAccount()
    this.lastSyncedAt = store.loadLastSyncedAt()
    this.owner = store.loadOwner()
    this.status = this.makeStatus()
  }

  /** The Account this device's progress belonged to when this tab last looked. */
  private owner: string | null

  private makeStatus(): SyncStatus {
    return { account: this.account, lastSyncedAt: this.lastSyncedAt, error: this.error, syncing: this.syncing }
  }

  getStatus = (): SyncStatus => this.status

  private publish(): void {
    this.status = this.makeStatus()
    this.onChange()
  }

  /** Whether this build can talk to a server at all. */
  get available(): boolean {
    return this.api !== null
  }

  /** Re-reads the signed-in Account after another tab changed it. */
  /** Re-reads local storage after another tab changed it. Returns whether the progress now belongs to a different Account. */
  refresh(): boolean {
    const before = this.owner
    this.owner = this.store.loadOwner()
    this.account = this.store.loadAccount()
    this.lastSyncedAt = this.store.loadLastSyncedAt()
    this.publish()
    return this.owner !== before
  }

  /**
   * Looks for a session this browser already has, for instance after tapping the Magic Link in the email,
   * and signs the app in to it. Quietly does nothing when offline or when there is none.
   */
  async adoptExistingSession(): Promise<void> {
    if (!this.api || this.account) return
    // A session cookie that the player already signed out of must not sign this device back in.
    await this.retryPendingSignOut()
    if (this.store.loadPendingSignOut()) return
    try {
      const me = await this.api.me()
      if (!me || this.account || this.store.loadPendingSignOut()) return
      this.setAccount(me.email)
      await this.sync()
    } catch {
      // Offline or no server: stay Signed Out.
    }
  }

  async signInWithCode(email: string, code: string): Promise<void> {
    if (!this.api) throw new ApiError('offline')
    // End the signed-out session on the server first. Replacing its cookie would leave it valid, and a retry
    // sent after this sign-in would end the new session instead.
    await this.retryPendingSignOut()
    if (this.store.loadPendingSignOut()) throw new ApiError('offline')
    const { email: confirmed } = await this.api.signInWithCode(email, code)
    this.setAccount(confirmed)
    // Whatever this device has is merged into the Account.
    await this.sync()
  }

  async startSignIn(email: string): Promise<void> {
    if (!this.api) throw new ApiError('offline')
    // End the old session first: otherwise the retry could later end the one this email's Magic Link creates.
    await this.retryPendingSignOut()
    if (this.store.loadPendingSignOut()) throw new ApiError('offline')
    await this.api.startSignIn(email)
  }

  /** Signs this device in to `email`. Progress that belonged to a different Account is cleared first. */
  private setAccount(email: string): void {
    const owner = this.store.loadOwner()
    if (owner !== null && owner !== email) {
      this.profile.clearAll()
      this.onCleared?.()
    }
    this.store.saveOwner(email)
    this.owner = email
    this.account = { email }
    this.error = null
    this.store.saveAccount(this.account)
    this.publish()
  }

  /** Called when sync empties this device on its own (progress from another Account), so no open Game writes it back. */
  onCleared: (() => void) | null = null
  private retrying: Promise<void> | null = null
  private running: Promise<boolean> | null = null
  private queued = false
  /** Whether a round queued behind the running one was asked for by a hidden page (so it must use keepalive). */
  private queuedKeepalive = false
  /** Bumped when this device signs out or loses its session, so a response to an older request is ignored. */
  private epoch = 0
  private signingOut = false

  /**
   * Syncs now. A call that arrives while one is in flight waits for one more round after it, so its caller
   * hears whether everything up to the call reached the server. Returns whether this device is in step.
   */
  sync(opts: { keepalive?: boolean } = {}): Promise<boolean> {
    if (!this.api || !this.account || this.signingOut) return Promise.resolve(false)
    if (this.running) {
      this.queued = true
      this.queuedKeepalive ||= opts.keepalive === true
      return this.running
    }
    const run = this.runRounds(opts).finally(() => {
      this.running = null
    })
    this.running = run
    return run
  }

  private async runRounds(opts: { keepalive?: boolean }): Promise<boolean> {
    let ok: boolean
    let round = opts
    do {
      this.queued = false
      this.queuedKeepalive = false
      ok = await this.syncOnce(round)
      round = { keepalive: this.queuedKeepalive }
    } while (this.queued && this.account && !this.signingOut)
    return ok
  }

  private async syncOnce(opts: { keepalive?: boolean }): Promise<boolean> {
    if (!this.api) return false
    this.syncing = true
    this.publish()
    let ok = false
    const epoch = this.epoch
    try {
      const merged = await this.api.sync(this.profile.syncDoc(), { ...opts, expectedEmail: this.account?.email })
      // Signed out (or session lost) while the request was out: the response must not land on a cleared device.
      if (epoch !== this.epoch || !this.account) return false
      this.profile.mergeRemote(merged)
      this.lastSyncedAt = this.now()
      this.store.saveLastSyncedAt(this.lastSyncedAt)
      this.error = null
      ok = true
    } catch (e) {
      if (epoch !== this.epoch) return false
      const kind = e instanceof ApiError ? e.kind : 'server'
      if (kind === 'unauthorized') {
        this.epoch++
        // The server ended this session (for instance the address left the Invite List). Keep the progress
        // on this device and go back to Signed Out.
        this.account = null
        this.lastSyncedAt = null
        this.store.clearAccount()
        this.error = null
      } else if (kind === 'wrongAccount') {
        // Nothing was merged. End the other Account's session so it can't receive this device's progress.
        this.error = REASONS.wrongAccount
        await this.api.signOut().catch(() => undefined)
      } else if (!opts.keepalive) {
        this.error = REASONS[kind]
      }
    } finally {
      this.syncing = false
      this.publish()
    }
    return ok
  }

  /**
   * Signs out. Always works, online or not: this device is emptied straight away (the caller has already
   * tried to push progress and warned if that failed). If the server can't be told, a pending sign-out
   * marker keeps the still-valid cookie from signing the device back in, and the request is retried later.
   */
  async signOut(): Promise<void> {
    this.signingOut = true
    try {
      // Let a sync already in flight finish first; nothing new starts meanwhile.
      await this.running?.catch(() => false)
      this.store.savePendingSignOut()
      this.epoch++
      this.profile.clearAll()
      this.onCleared?.()
      this.owner = null
      this.account = null
      this.lastSyncedAt = null
      this.error = null
      this.publish()
    } finally {
      this.signingOut = false
    }
    await this.retryPendingSignOut()
  }

  /** The Account this device's progress belongs to, when it differs from `email`: signing in as `email` would clear it. */
  progressOwnerOtherThan(email: string): string | null {
    const owner = this.store.loadOwner()
    return owner !== null && owner !== email.trim().toLowerCase() ? owner : null
  }

  /** Whether a sign-out is still waiting to reach the server. */
  get signOutPending(): boolean {
    return this.store.loadPendingSignOut()
  }

  /** Tells the server about a sign-out that couldn't be delivered. Removes the marker once it confirms. */
  retryPendingSignOut(): Promise<void> {
    if (!this.api || !this.store.loadPendingSignOut()) return Promise.resolve()
    if (this.retrying) return this.retrying
    const api = this.api
    const run = (async () => {
      try {
        await api.signOut()
        this.store.clearPendingSignOut()
      } catch (e) {
        // No session left on the server counts as signed out.
        if (e instanceof ApiError && e.kind === 'unauthorized') this.store.clearPendingSignOut()
      }
    })().finally(() => {
      this.retrying = null
    })
    this.retrying = run
    return run
  }
}
