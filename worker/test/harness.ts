import migration from '../../migrations/0001_init.sql?raw'
import { handle } from '../app'
import type { Deps } from '../auth'
import type { Env } from '../env'
import type { Mailer, SignInEmail } from '../mailer'
import { createD1 } from './d1'

export const ORIGIN = 'https://sudoku.test'

export class FakeMailer implements Mailer {
  sent: SignInEmail[] = []
  fail = false
  async sendSignInEmail(email: SignInEmail): Promise<void> {
    if (this.fail) throw new Error('ses down')
    this.sent.push(email)
  }
  get last(): SignInEmail {
    const m = this.sent[this.sent.length - 1]
    if (!m) throw new Error('no email was sent')
    return m
  }
}

export interface Harness {
  env: Env
  mailer: FakeMailer
  clock: { now: number }
  /** Sends a request through the Worker and waits for its background work. */
  call(method: string, path: string, opts?: { body?: unknown; cookie?: string; origin?: string | null; contentType?: string | null; headers?: Record<string, string> }): Promise<Response>
  invite(email: string): Promise<void>
  /** The SQL statements the last call ran before its response was ready (background work excluded). */
  readonly sqlBeforeResponse: string[]
}

export async function harness(): Promise<Harness> {
  const log: string[] = []
  const DB = await createD1([migration], log)
  const before: string[] = []
  const env: Env = {
    DB,
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) } as unknown as Fetcher,
    SES_REGION: 'us-west-2',
    EMAIL_FROM: 'Sudoku <noreply@sudoku.test>',
    APP_ORIGIN: ORIGIN,
    AWS_ACCESS_KEY_ID: 'x',
    AWS_SECRET_ACCESS_KEY: 'y',
  }
  const mailer = new FakeMailer()
  const clock = { now: 1_800_000_000_000 }
  const deps: Deps = { mailer, now: () => clock.now }
  return {
    env,
    mailer,
    clock,
    sqlBeforeResponse: before,
    async invite(email) {
      await DB.prepare('INSERT INTO invites (email) VALUES (?)').bind(email).run()
    },
    async call(method, path, opts = {}) {
      const headers = new Headers()
      const origin = opts.origin === undefined ? ORIGIN : opts.origin
      if (origin) headers.set('origin', origin)
      const type = opts.contentType === undefined ? 'application/json' : opts.contentType
      if (type && method !== 'GET') headers.set('content-type', type)
      if (opts.cookie) headers.set('cookie', opts.cookie)
      for (const [k, v] of Object.entries(opts.headers ?? {})) headers.set(k, v)
      const pending: Promise<unknown>[] = []
      log.length = 0
      const res = await handle(
        new Request(`${ORIGIN}${path}`, { method, headers, body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}) }),
        env,
        { waitUntil: (p) => void pending.push(p) },
        deps,
      )
      before.length = 0
      before.push(...log)
      await Promise.all(pending)
      return res
    },
  }
}

/** "sudoku_session=..." from a Set-Cookie header, ready to send back. */
export const cookieOf = (res: Response): string => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
export const tokenOfLink = (link: string): string => new URL(link).searchParams.get('token') ?? ''
