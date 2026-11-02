import { emptySyncDoc, mergeDocs, type SyncDoc } from '../core'
import { ApiError, type Api } from './api'

/** An in-memory server for tests: invited addresses, one document per Account, switchable outages. */
export class FakeApi implements Api {
  /** Each Account's stored document. */
  docs: Record<string, SyncDoc> = {}
  /** The first invited Account's document. */
  get doc(): SyncDoc {
    return this.docs[this.invited[0]] ?? emptySyncDoc()
  }
  set doc(d: SyncDoc) {
    this.docs[this.invited[0]] = d
  }
  offline = false
  /** The next Sign-in Code the "server" accepts. */
  code = '123456'
  signedInAs: string | null = null
  sessionEnded = false
  started: string[] = []
  syncs = 0
  /** When set, a sync waits for this before the server answers (to test requests that are in flight). */
  gate: Promise<void> | null = null
  /** Keepalive flags of the sync requests received, in order. */
  keepalives: boolean[] = []

  private readonly invited: readonly string[]
  constructor(...invited: string[]) {
    this.invited = invited.length > 0 ? invited : ['player@example.com']
  }

  private guard(): void {
    if (this.offline) throw new ApiError('offline')
  }

  async startSignIn(email: string): Promise<void> {
    this.guard()
    this.started.push(email)
  }

  async signInWithCode(email: string, code: string): Promise<{ email: string }> {
    this.guard()
    const normal = email.trim().toLowerCase()
    if (code !== this.code || !this.invited.includes(normal)) throw new ApiError('rejected')
    this.signedInAs = normal
    return { email: normal }
  }

  async me(): Promise<{ email: string } | null> {
    this.guard()
    return this.signedInAs ? { email: this.signedInAs } : null
  }

  async signOut(): Promise<void> {
    this.guard()
    this.signedInAs = null
  }

  async sync(doc: SyncDoc, opts: { keepalive?: boolean; expectedEmail?: string } = {}): Promise<SyncDoc> {
    this.guard()
    this.keepalives.push(opts.keepalive === true)
    if (this.gate) await this.gate
    if (this.sessionEnded || !this.signedInAs) throw new ApiError('unauthorized')
    if (opts.expectedEmail !== undefined && opts.expectedEmail !== this.signedInAs) throw new ApiError('wrongAccount')
    this.syncs++
    const merged = mergeDocs(this.docs[this.signedInAs] ?? emptySyncDoc(), doc)
    this.docs[this.signedInAs] = merged
    return merged
  }
}
