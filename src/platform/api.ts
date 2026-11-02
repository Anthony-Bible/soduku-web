import { parseSyncDoc, type SyncDoc } from '../core'

export type ApiFailure = 'offline' | 'unauthorized' | 'wrongAccount' | 'rejected' | 'server'

export class ApiError extends Error {
  constructor(readonly kind: ApiFailure) {
    super(kind)
  }
}

/** What the app needs from the server. The browser implementation is HttpApi; tests use a fake. */
export interface Api {
  /** Asks for a Sign-in Email. Resolves the same way whether or not the address is on the Invite List. */
  startSignIn(email: string): Promise<void>
  /** Signs in with a Sign-in Code. Rejects with kind 'rejected' for a wrong, expired or used code. */
  signInWithCode(email: string, code: string): Promise<{ email: string }>
  /** The Account this browser is signed in to (for instance after tapping a Magic Link), or null. */
  me(): Promise<{ email: string } | null>
  signOut(): Promise<void>
  /**
   * Sends the device's document and returns the server's merged one. `expectedEmail` is the Account the device
   * believes it is signed in to; rejects with kind 'wrongAccount' (and merges nothing) if the session is another's.
   */
  sync(doc: SyncDoc, opts?: { keepalive?: boolean; expectedEmail?: string }): Promise<SyncDoc>
}

/** Stays under the 64 KiB in-flight keepalive quota the Fetch spec gives a page. */
export const KEEPALIVE_LIMIT_BYTES = 60_000

export class HttpApi implements Api {
  constructor(private readonly fetchFn: typeof fetch = (...a) => fetch(...a)) {}

  private async request(method: 'GET' | 'POST', path: string, body?: unknown, keepalive: (text: string) => boolean = () => false, extraHeaders: Record<string, string> = {}): Promise<Response> {
    let res: Response
    const text = method === 'POST' ? JSON.stringify(body ?? {}) : undefined
    try {
      res = await this.fetchFn(path, {
        method,
        credentials: 'same-origin',
        headers: method === 'POST' ? { 'content-type': 'application/json', ...extraHeaders } : undefined,
        body: text,
        keepalive: text !== undefined && keepalive(text),
      })
    } catch {
      throw new ApiError('offline')
    }
    if (res.status === 401) throw new ApiError('unauthorized')
    if (res.status === 409) throw new ApiError('wrongAccount')
    if (res.status >= 500) throw new ApiError('server')
    // A 4xx (or the app shell served for an API path by a dev server) is a refusal, not an outage.
    if (!res.ok) throw new ApiError('rejected')
    return res
  }

  async startSignIn(email: string): Promise<void> {
    await this.request('POST', '/api/auth/start', { email })
  }

  async signInWithCode(email: string, code: string): Promise<{ email: string }> {
    const res = await this.request('POST', '/api/auth/code', { email, code })
    const v = (await res.json().catch(() => null)) as { email?: unknown } | null
    if (!v || typeof v.email !== 'string') throw new ApiError('server')
    return { email: v.email }
  }

  async me(): Promise<{ email: string } | null> {
    try {
      const res = await this.request('GET', '/api/me')
      const v = (await res.json().catch(() => null)) as { email?: unknown } | null
      return v && typeof v.email === 'string' ? { email: v.email } : null
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'unauthorized') return null
      throw e
    }
  }

  async signOut(): Promise<void> {
    await this.request('POST', '/api/auth/signout')
  }

  async sync(doc: SyncDoc, opts: { keepalive?: boolean; expectedEmail?: string } = {}): Promise<SyncDoc> {
    // Browsers cap keepalive bodies at 64 KiB; a bigger document goes as a normal request instead.
    const res = await this.request('POST', '/api/sync', doc, (text) => opts.keepalive === true && new TextEncoder().encode(text).length < KEEPALIVE_LIMIT_BYTES,
      opts.expectedEmail === undefined ? {} : { 'x-expected-account': opts.expectedEmail },
    )
    const merged = parseSyncDoc(await res.json().catch(() => null))
    if (!merged) throw new ApiError('server')
    return merged
  }
}
