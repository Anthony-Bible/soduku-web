import { describe, expect, it } from 'vitest'
import { MAX_CLOCK_SKEW_MS, emptySyncDoc, setSlot, winGame, type SyncDoc } from '../../src/core/syncDoc'
import { MAX_CODE_ATTEMPTS, MAX_EMAILS_PER_DAY, MAX_EMAILS_PER_HOUR, SIGN_IN_TTL_MS } from '../auth'
import { SESSION_MS } from '../http'
import { ORIGIN, cookieOf, harness, tokenOfLink, type Harness } from './harness'

const EMAIL = 'Player@Example.com'
const NORMAL = 'player@example.com'

async function start(h: Harness, email = EMAIL) {
  return h.call('POST', '/api/auth/start', { body: { email } })
}

/** Invites, requests a Sign-in Email and signs in with its code. Returns the session cookie. */
async function signedIn(h: Harness, email = EMAIL): Promise<string> {
  await h.invite(email.trim().toLowerCase())
  await start(h, email)
  const res = await h.call('POST', '/api/auth/code', { body: { email, code: h.mailer.last.code } })
  expect(res.status).toBe(200)
  return cookieOf(res)
}

const game = (id: string, startedAt: number, seconds = 60) =>
  ({ id, difficulty: 'easy', startedAt, dailyDay: null, seconds, mistakes: 0, hintsUsed: 0 }) as const

describe('POST /api/auth/start', () => {
  it('answers identically for listed, unlisted and malformed addresses, and emails only the listed one', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    const listed = await start(h)
    const unlisted = await start(h, 'stranger@example.com')
    const malformed = await start(h, 'not an email')
    expect([listed.status, unlisted.status, malformed.status]).toEqual([200, 200, 200])
    const bodies = await Promise.all([listed.text(), unlisted.text(), malformed.text()])
    expect(new Set(bodies).size).toBe(1)
    expect(h.mailer.sent.map((m) => m.to)).toEqual([NORMAL])
  })

  it('does the same database work before answering a code for an address with and without a pending email', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: '000000' } })
    const pending = h.sqlBeforeResponse.map((q) => q.trim().split(/\s+/)[0])
    await h.call('POST', '/api/auth/code', { body: { email: 'stranger@example.com', code: '000000' } })
    expect(h.sqlBeforeResponse.map((q) => q.trim().split(/\s+/)[0])).toEqual(pending)
  })

  it('does the same database work on every wrong code, including the one that voids the Sign-in Email', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const verbs = () => h.sqlBeforeResponse.map((q) => q.trim().split(/\s+/)[0])
    for (let i = 0; i <= MAX_CODE_ATTEMPTS; i++) {
      await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: '000000' } })
      const listed = verbs()
      await h.call('POST', '/api/auth/code', { body: { email: 'stranger@example.com', code: '000000' } })
      expect(verbs()).toEqual(listed)
    }
  })

  it('still answers the same when the email provider fails', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    h.mailer.fail = true
    const res = await start(h)
    expect(res.status).toBe(200)
  })

  it('sends a link and a six digit code, and stores only hashes of them', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { link, code } = h.mailer.last
    expect(link.startsWith(`${ORIGIN}/auth/link?token=`)).toBe(true)
    expect(code).toMatch(/^\d{6}$/)
    const rows = await h.env.DB.prepare('SELECT * FROM sign_in_emails').all<Record<string, unknown>>()
    const dump = JSON.stringify(rows.results)
    expect(dump).not.toContain(tokenOfLink(link))
    expect(dump).not.toContain(`"${code}"`)
  })

  it('holds the hourly limit against parallel requests', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    const responses = await Promise.all(Array.from({ length: 30 }, () => start(h)))
    expect(new Set(await Promise.all(responses.map((r) => r.text()))).size).toBe(1)
    expect(h.mailer.sent).toHaveLength(MAX_EMAILS_PER_HOUR)
    const n = await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sign_in_emails').first<{ n: number }>()
    expect(n?.n).toBe(MAX_EMAILS_PER_HOUR)
  })

  it('limits each address to five Sign-in Emails an hour, answering the same', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    const bodies = new Set<string>()
    for (let i = 0; i < MAX_EMAILS_PER_HOUR + 3; i++) {
      const res = await start(h)
      expect(res.status).toBe(200)
      bodies.add(await res.text())
    }
    expect(bodies.size).toBe(1)
    expect(h.mailer.sent).toHaveLength(MAX_EMAILS_PER_HOUR)
    h.clock.now += 61 * 60 * 1000
    await start(h)
    expect(h.mailer.sent).toHaveLength(MAX_EMAILS_PER_HOUR + 1)
  })

  it('caps Sign-in Emails per address per day, so Sign-in Code guesses are bounded too', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    for (let hour = 0; hour < 23; hour++) {
      for (let i = 0; i < MAX_EMAILS_PER_HOUR; i++) await start(h)
      h.clock.now += 61 * 60 * 1000
    }
    expect(h.mailer.sent).toHaveLength(MAX_EMAILS_PER_DAY)
    h.clock.now += 2 * 60 * 60 * 1000
    await start(h)
    expect(h.mailer.sent).toHaveLength(MAX_EMAILS_PER_DAY + 1)
  })

  it('a newer Sign-in Email voids the earlier ones', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const first = h.mailer.last
    await start(h)
    const second = h.mailer.last
    const old = await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: first.code } })
    expect(old.status).toBe(400)
    const oldLink = await h.call('POST', '/api/auth/link', { body: { token: tokenOfLink(first.link) } })
    expect(oldLink.status).toBe(400)
    const fresh = await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: second.code } })
    expect(fresh.status).toBe(200)
  })

  it('a Sign-in Email made in the same millisecond by a parallel request is not voided by the earlier one', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    const db = h.env.DB
    let raced = false
    // Recreate the race: request 2 inserts its row after request 1's insert but before request 1 voids older rows.
    h.env.DB = {
      ...db,
      batch: db.batch.bind(db),
      prepare(sql: string) {
        if (!raced && sql.startsWith('UPDATE sign_in_emails SET used_at')) {
          raced = true
          void db
            .prepare(`INSERT INTO sign_in_emails (id, email, link_token_hash, code_hash, expires_at, attempts, used_at, created_at)
                      VALUES ('parallel', ?, 'h', 'c', ?, 0, NULL, ?)`)
            .bind(NORMAL, h.clock.now + 60_000, h.clock.now)
            .run()
        }
        return db.prepare(sql)
      },
    } as D1Database
    await start(h)
    expect(raced).toBe(true)
    const row = await db.prepare("SELECT used_at FROM sign_in_emails WHERE id = 'parallel'").first<{ used_at: number | null }>()
    expect(row?.used_at).toBeNull()
  })
})

describe('Invite List', () => {
  it('rejects an address that is not lowercase, which could never match', async () => {
    const h = await harness()
    await expect(h.invite('Friend@Example.com')).rejects.toThrow()
  })
})

describe('Magic Link', () => {
  it('GET shows a page and does not spend the token; the POST signs in once', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const token = tokenOfLink(h.mailer.last.link)
    for (let i = 0; i < 3; i++) {
      const page = await h.call('GET', `/auth/link?token=${token}`)
      expect(page.status).toBe(200)
      expect(page.headers.get('content-type')).toContain('text/html')
      expect(page.headers.get('set-cookie')).toBeNull()
    }
    const ok = await h.call('POST', '/api/auth/link', { body: { token } })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ email: NORMAL })
    const again = await h.call('POST', '/api/auth/link', { body: { token } })
    expect(again.status).toBe(400)
  })

  it('is spent by the code too, and spends the code', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { link, code } = h.mailer.last
    expect((await h.call('POST', '/api/auth/link', { body: { token: tokenOfLink(link) } })).status).toBe(200)
    expect((await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code } })).status).toBe(400)
  })

  it('the code spends the link', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { link, code } = h.mailer.last
    expect((await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code } })).status).toBe(200)
    expect((await h.call('POST', '/api/auth/link', { body: { token: tokenOfLink(link) } })).status).toBe(400)
  })

  it('expires after 15 minutes', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { link } = h.mailer.last
    h.clock.now += SIGN_IN_TTL_MS + 1
    expect((await h.call('POST', '/api/auth/link', { body: { token: tokenOfLink(link) } })).status).toBe(400)
  })

  it('rejects a made-up token', async () => {
    const h = await harness()
    expect((await h.call('POST', '/api/auth/link', { body: { token: 'ab'.repeat(32) } })).status).toBe(400)
  })
})

describe('Sign-in Code', () => {
  it('gives the same generic error for wrong, unknown, expired and malformed attempts', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { code } = h.mailer.last
    const wrong = code === '000000' ? '111111' : '000000'
    const results = [
      await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: wrong } }),
      await h.call('POST', '/api/auth/code', { body: { email: 'nobody@example.com', code: wrong } }),
      await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: 'abc' } }),
    ]
    h.clock.now += SIGN_IN_TTL_MS + 1
    results.push(await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code } }))
    const bodies = await Promise.all(results.map(async (r) => `${r.status} ${await r.text()}`))
    expect(new Set(bodies).size).toBe(1)
    expect(bodies[0]).toMatch(/^400 /)
  })

  it('is voided after five wrong codes, even for the right one', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { code } = h.mailer.last
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_CODE_ATTEMPTS; i++) {
      expect((await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: wrong } })).status).toBe(400)
    }
    expect((await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code } })).status).toBe(400)
  })

  it('still works after fewer than five wrong codes', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const { code } = h.mailer.last
    const wrong = code === '000000' ? '111111' : '000000'
    for (let i = 0; i < MAX_CODE_ATTEMPTS - 1; i++) await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: wrong } })
    expect((await h.call('POST', '/api/auth/code', { body: { email: ' PLAYER@example.com ', code } })).status).toBe(200)
  })

  it('cannot create an Account for an address removed from the Invite List meanwhile', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    await h.env.DB.prepare('DELETE FROM invites').run()
    const res = await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: h.mailer.last.code } })
    expect(res.status).toBe(400)
    expect((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM accounts').first<{ n: number }>())?.n).toBe(0)
  })
})

describe('session cookie', () => {
  it('is HttpOnly, Secure, SameSite=Lax, Path=/ and lasts a year', async () => {
    const h = await harness()
    await h.invite(NORMAL)
    await start(h)
    const res = await h.call('POST', '/api/auth/code', { body: { email: NORMAL, code: h.mailer.last.code } })
    const cookie = res.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Lax')
    expect(cookie).toContain('Path=/')
    expect(cookie).toContain(`Max-Age=${SESSION_MS / 1000}`)
  })

  it('is not stored in the clear', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const token = cookie.split('=')[1] ?? ''
    expect(JSON.stringify((await h.env.DB.prepare('SELECT * FROM sessions').all()).results)).not.toContain(token)
  })

  it('identifies the Account at /api/me, and signing out ends it', async () => {
    const h = await harness()
    expect((await h.call('GET', '/api/me')).status).toBe(401)
    const cookie = await signedIn(h)
    const me = await h.call('GET', '/api/me', { cookie })
    expect(await me.json()).toEqual({ email: NORMAL })
    const out = await h.call('POST', '/api/auth/signout', { cookie })
    expect(out.status).toBe(200)
    expect(out.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(401)
  })

  it('slides on each sync', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    h.clock.now += 200 * 24 * 60 * 60 * 1000
    const res = await h.call('POST', '/api/sync', { cookie, body: emptySyncDoc() })
    expect(res.status).toBe(200)
    expect(res.headers.get('set-cookie')).toContain('HttpOnly')
    const row = await h.env.DB.prepare('SELECT expires_at FROM sessions').first<{ expires_at: number }>()
    expect(row?.expires_at).toBe(h.clock.now + SESSION_MS)
    // 300 days later it would have expired without the slide.
    h.clock.now += 300 * 24 * 60 * 60 * 1000
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(200)
  })

  it('expires a year after the last sync', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    h.clock.now += SESSION_MS + 1
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(401)
  })

  it('is revoked when the address leaves the Invite List', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    await h.env.DB.prepare('DELETE FROM invites WHERE email = ?').bind(NORMAL).run()
    expect((await h.call('POST', '/api/sync', { cookie, body: emptySyncDoc() })).status).toBe(401)
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(401)
    expect((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sessions').first<{ n: number }>())?.n).toBe(0)
  })
})

describe('CSRF checks', () => {
  it('rejects a wrong or missing Origin on every state-changing endpoint', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    for (const path of ['/api/auth/start', '/api/auth/code', '/api/auth/link', '/api/auth/signout', '/api/sync']) {
      for (const origin of ['https://evil.example', null]) {
        const res = await h.call('POST', path, { cookie, origin, body: { email: NORMAL } })
        expect(res.status, `${path} from ${origin}`).toBe(403)
      }
    }
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(200)
  })

  it('rejects a body that is not JSON', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    for (const contentType of ['text/plain', 'application/x-www-form-urlencoded', null]) {
      const res = await h.call('POST', '/api/sync', { cookie, contentType, body: emptySyncDoc() })
      expect(res.status).toBe(415)
    }
  })

  it('does not sign out on a cross-origin request', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    await h.call('POST', '/api/auth/signout', { cookie, origin: 'https://evil.example' })
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(200)
  })

  it('allows an extra origin only when configured', async () => {
    const h = await harness()
    h.env.EXTRA_ORIGINS = 'http://localhost:5173'
    await h.invite(NORMAL)
    const res = await h.call('POST', '/api/auth/start', { origin: 'http://localhost:5173', body: { email: NORMAL } })
    expect(res.status).toBe(200)
    expect(h.mailer.sent).toHaveLength(1)
  })
})

describe('POST /api/sync', () => {
  it('requires a session', async () => {
    const h = await harness()
    expect((await h.call('POST', '/api/sync', { body: emptySyncDoc() })).status).toBe(401)
  })

  it('refuses to merge into an Account other than the one the client expects', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const doc = winGame(emptySyncDoc(), game('a-1', 1000, 90))
    const wrong = await h.call('POST', '/api/sync', { cookie, body: doc, headers: { 'x-expected-account': 'someone-else@example.com' } })
    expect(wrong.status).toBe(409)
    const right = await h.call('POST', '/api/sync', { cookie, body: emptySyncDoc(), headers: { 'x-expected-account': EMAIL } })
    expect(Object.keys(((await right.json()) as SyncDoc).games)).toEqual([])
  })

  it('does not let a device with its date set ahead push the Account clock into the future', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const ahead = { ...emptySyncDoc(), clock: h.clock.now + 100 * 86_400_000 }
    const res = await h.call('POST', '/api/sync', { cookie, body: ahead })
    expect(((await res.json()) as SyncDoc).clock).toBeLessThanOrEqual(h.clock.now + MAX_CLOCK_SKEW_MS)
  })

  it('rejects a malformed document', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    expect((await h.call('POST', '/api/sync', { cookie, body: { hello: 'world' } })).status).toBe(400)
  })

  it('round trips: a second device receives the first one\'s progress merged with its own', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const phone: SyncDoc = winGame(emptySyncDoc(), game('phone-1', 1000, 90))
    const laptop: SyncDoc = winGame(emptySyncDoc(), game('laptop-1', 2000, 120))
    const first = await h.call('POST', '/api/sync', { cookie, body: phone })
    expect(Object.keys(((await first.json()) as SyncDoc).games)).toEqual(['phone-1'])
    const second = await h.call('POST', '/api/sync', { cookie, body: laptop })
    const merged = (await second.json()) as SyncDoc
    expect(Object.keys(merged.games).sort()).toEqual(['laptop-1', 'phone-1'])
    // Asking with nothing returns everything.
    const third = (await (await h.call('POST', '/api/sync', { cookie, body: emptySyncDoc() })).json()) as SyncDoc
    expect(Object.keys(third.games).sort()).toEqual(['laptop-1', 'phone-1'])
  })

  it('syncing the same document twice does not double count', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const doc = winGame(emptySyncDoc(), game('g1', 1000, 90))
    await h.call('POST', '/api/sync', { cookie, body: doc })
    const again = (await (await h.call('POST', '/api/sync', { cookie, body: doc })).json()) as SyncDoc
    expect(Object.keys(again.games)).toEqual(['g1'])
  })

  it('a newer cleared marker clears the Game-in-progress on the other device', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const { newGame } = await import('../../src/core/gameState')
    const { generate } = await import('../../src/core/generator')
    const g = newGame(generate('easy'), 1000, 'g1')
    await h.call('POST', '/api/sync', { cookie, body: setSlot(emptySyncDoc(), 'game', g, 1000) })
    const cleared = setSlot(emptySyncDoc(), 'game', null, 2000)
    const merged = (await (await h.call('POST', '/api/sync', { cookie, body: cleared })).json()) as SyncDoc
    expect(merged.slots['game']?.game ?? null).toBeNull()
    // An older device that still has the Game cannot bring it back.
    const stale = (await (await h.call('POST', '/api/sync', { cookie, body: setSlot(emptySyncDoc(), 'game', g, 1500) })).json()) as SyncDoc
    expect(stale.slots['game']?.game ?? null).toBeNull()
  })

  it('keeps Accounts separate', async () => {
    const h = await harness()
    const a = await signedIn(h, 'a@example.com')
    const b = await signedIn(h, 'b@example.com')
    await h.call('POST', '/api/sync', { cookie: a, body: winGame(emptySyncDoc(), game('only-a', 1, 5)) })
    const seenByB = (await (await h.call('POST', '/api/sync', { cookie: b, body: emptySyncDoc() })).json()) as SyncDoc
    expect(seenByB.games).toEqual({})
  })

  it('does not lose a write when two syncs run at the same time', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    const docs = Array.from({ length: 6 }, (_, i) => winGame(emptySyncDoc(), game(`g${i}`, 1000 + i, 60 + i)))
    const results = await Promise.all(docs.map((d) => h.call('POST', '/api/sync', { cookie, body: d })))
    for (const r of results) expect([200, 503]).toContain(r.status)
    const final = (await (await h.call('POST', '/api/sync', { cookie, body: emptySyncDoc() })).json()) as SyncDoc
    const accepted = results.map((r, i) => (r.status === 200 ? `g${i}` : null)).filter((x) => x !== null)
    for (const id of accepted) expect(Object.keys(final.games)).toContain(id)
  })

  it('deleting an Account removes its data and sessions', async () => {
    const h = await harness()
    const cookie = await signedIn(h)
    await h.call('POST', '/api/sync', { cookie, body: winGame(emptySyncDoc(), game('g', 1, 5)) })
    await h.env.DB.prepare('DELETE FROM accounts WHERE email = ?').bind(NORMAL).run()
    expect((await h.env.DB.prepare('SELECT COUNT(*) AS n FROM sync_docs').first<{ n: number }>())?.n).toBe(0)
    expect((await h.call('GET', '/api/me', { cookie })).status).toBe(401)
  })
})

describe('routing', () => {
  it('serves static assets for other paths and 404s unknown API paths', async () => {
    const h = await harness()
    expect(await (await h.call('GET', '/')).text()).toBe('asset')
    expect((await h.call('GET', '/api/nope')).status).toBe(404)
    expect((await h.call('GET', '/api/sync')).status).toBe(405)
  })
})
