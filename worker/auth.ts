import { randomCode, randomHex, sha256Hex, timingSafeEqual } from './crypto'
import type { Env } from './env'
import {
  SESSION_COOKIE,
  SESSION_MS,
  SESSION_SECONDS,
  checkStateChanging,
  clearedCookie,
  errorResponse,
  json,
  normalizeEmail,
  readCookie,
  readJson,
  sessionCookie,
} from './http'
import type { Mailer } from './mailer'

export interface Deps {
  mailer: Mailer
  now: () => number
}
export type Waiter = { waitUntil(p: Promise<unknown>): void }

export const SIGN_IN_TTL_MS = 15 * 60 * 1000
export const MAX_CODE_ATTEMPTS = 5
export const MAX_EMAILS_PER_HOUR = 5
/** Caps Sign-in Code guesses per address at MAX_CODE_ATTEMPTS × this per day, since each new email brings fresh guesses. */
export const MAX_EMAILS_PER_DAY = 10
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

/** Same body for every address, listed or not. */
const START_RESPONSE = { ok: true }
const INVALID_SIGN_IN = 'invalid_or_expired'

export interface AuthedSession {
  tokenHash: string
  accountId: string
  email: string
}

// MARK: Sign-in Emails

/**
 * Always answers the same 200. Only an address on the Invite List (and under the rate limit) gets a row and an
 * email, both written after the response, so nothing the caller can time tells the two cases apart.
 */
export async function startSignIn(req: Request, env: Env, deps: Deps, ctx: Waiter): Promise<Response> {
  const denied = checkStateChanging(req, env)
  if (denied) return denied
  const body = await readJson(req)
  const email = body && 'value' in body ? normalizeEmail((body.value as { email?: unknown } | null)?.email) : null
  const now = deps.now()
  // An unusable address is treated like an unlisted one: same response, nothing stored.
  const probe = email ?? 'nobody@invalid.example'

  const invited = await env.DB.prepare('SELECT 1 AS ok FROM invites WHERE email = ?').bind(probe).first()

  const id = randomHex(16)
  const linkToken = randomHex(32)
  const code = randomCode()
  const linkHash = await sha256Hex(linkToken)
  const codeHash = await sha256Hex(`${id}:${code}`)

  if (email && invited) {
    // The write and the email both happen after the response, so listed and unlisted addresses do the same
    // awaited work (a read and hashing) and the response time says nothing about the Invite List.
    ctx.waitUntil(
      (async () => {
        // The hourly limit is checked inside the INSERT itself, so parallel requests can't all slip under it.
        const inserted = await env.DB.prepare(
          `INSERT INTO sign_in_emails (id, email, link_token_hash, code_hash, expires_at, attempts, used_at, created_at)
           SELECT ?, ?, ?, ?, ?, 0, NULL, ?
           WHERE (SELECT COUNT(*) FROM sign_in_emails WHERE email = ? AND created_at > ?) < ?
             AND (SELECT COUNT(*) FROM sign_in_emails WHERE email = ? AND created_at > ?) < ?`,
        )
          .bind(id, email, linkHash, codeHash, now + SIGN_IN_TTL_MS, now, email, now - HOUR_MS, MAX_EMAILS_PER_HOUR, email, now - 24 * HOUR_MS, MAX_EMAILS_PER_DAY)
          .run()
        if ((inserted.meta.changes ?? 0) === 0) return // over the limit: send nothing
        // A new Sign-in Email voids the address's earlier unused ones (never a newer one a parallel request made).
        // Order is insertion order (rowid), not created_at, so two made in the same millisecond can't void each other.
        await env.DB.prepare(
          'UPDATE sign_in_emails SET used_at = ? WHERE email = ? AND used_at IS NULL AND rowid < (SELECT rowid FROM sign_in_emails WHERE id = ?)',
        )
          .bind(now, email, id)
          .run()
        await deps.mailer.sendSignInEmail({ to: email, link: `${env.APP_ORIGIN}/auth/link?token=${linkToken}`, code })
      })().catch((e: unknown) => console.error('sign-in email failed', e instanceof Error ? e.message : e)),
    )
  }
  ctx.waitUntil(tidy(env, now))
  return json(START_RESPONSE)
}

/** Drops Sign-in Emails and sessions that expired a day or more ago. */
async function tidy(env: Env, now: number): Promise<void> {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sign_in_emails WHERE expires_at < ?').bind(now - DAY_MS),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now - DAY_MS),
  ])
}

// MARK: Spending a Sign-in Email

/** GET /auth/link: a page with a button. Showing it spends nothing, because mail scanners prefetch links. */
export function linkPage(req: Request): Response {
  const token = new URL(req.url).searchParams.get('token') ?? ''
  const valid = /^[0-9a-f]{64}$/.test(token)
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>Sign in to Sudoku</title>
<style>
body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f5f7;color:#111}
@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}
main{text-align:center;padding:24px;max-width:22rem}
button{font:inherit;font-weight:600;padding:12px 28px;border:0;border-radius:10px;background:#4f46e5;color:#fff;cursor:pointer}
button:disabled{opacity:.6}
p{color:#777}
</style></head>
<body data-token="${valid ? token : ''}"><main>
<h1>Sudoku</h1>
${
  valid
    ? '<p>Sign in on this device?</p><button id="go" type="button">Sign in</button><p id="msg" role="status"></p>'
    : '<p>This sign-in link is not valid. Ask for a new sign-in email in the app.</p>'
}
</main>
<script>
var b=document.getElementById('go');
if(b){b.addEventListener('click',function(){
  b.disabled=true;
  var m=document.getElementById('msg');
  fetch('/api/auth/link',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:JSON.stringify({token:document.body.dataset.token})})
    .then(function(r){ if(r.ok){location.replace('/');} else {m.textContent='This link has expired or was already used. Ask for a new sign-in email in the app.';} })
    .catch(function(){ b.disabled=false; m.textContent='Could not reach the server. Try again.'; });
});}
</script></body></html>`
  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'",
    },
  })
}

/** POST /api/auth/link {token}: spends the whole Sign-in Email and signs this browser in. */
export async function spendLink(req: Request, env: Env, deps: Deps): Promise<Response> {
  const denied = checkStateChanging(req, env)
  if (denied) return denied
  const body = await readJson(req)
  const token = body && 'value' in body ? (body.value as { token?: unknown } | null)?.token : null
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return errorResponse(400, INVALID_SIGN_IN)
  const now = deps.now()
  const spent = await env.DB.prepare(
    'UPDATE sign_in_emails SET used_at = ? WHERE link_token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email',
  )
    .bind(now, await sha256Hex(token), now)
    .first<{ email: string }>()
  if (!spent) return errorResponse(400, INVALID_SIGN_IN)
  return signIn(env, spent.email, now)
}

/** POST /api/auth/code {email, code}: the same, for the Sign-in Code typed into the app. */
export async function spendCode(req: Request, env: Env, deps: Deps): Promise<Response> {
  const denied = checkStateChanging(req, env)
  if (denied) return denied
  const body = await readJson(req)
  const value = body && 'value' in body ? (body.value as { email?: unknown; code?: unknown } | null) : null
  const email = normalizeEmail(value?.email)
  const code = typeof value?.code === 'string' && /^\d{6}$/.test(value.code) ? value.code : null
  const now = deps.now()

  const row = email
    ? await env.DB.prepare(
        'SELECT id, code_hash FROM sign_in_emails WHERE email = ? AND used_at IS NULL AND expires_at > ? ORDER BY created_at DESC LIMIT 1',
      )
        .bind(email, now)
        .first<{ id: string; code_hash: string }>()
    : null

  // Unknown, expired and void all do the same work and fail the same way.
  const salt = row?.id ?? 'none'
  const guess = await sha256Hex(`${salt}:${code ?? '------'}`)
  const matches = timingSafeEqual(guess, row?.code_hash ?? '0'.repeat(64))

  // Reserve an attempt before answering, so parallel guesses cannot exceed the limit. The fifth wrong guess
  // voids the Sign-in Email in this same statement. Every request makes exactly this one write (matching no
  // row when there is nothing to guess against), so timing doesn't reveal whether an address has a pending
  // Sign-in Email or how many guesses it has left.
  const reserved = await env.DB.prepare(
    `UPDATE sign_in_emails
     SET attempts = attempts + 1,
         used_at = CASE WHEN ?1 = 0 AND attempts + 1 >= ?2 THEN ?3 ELSE used_at END
     WHERE id = ?4 AND used_at IS NULL AND attempts < ?2 RETURNING attempts`,
  )
    .bind(matches ? 1 : 0, MAX_CODE_ATTEMPTS, now, row?.id ?? 'none')
    .first<{ attempts: number }>()
  if (!row || !email || !code || !reserved || !matches) return errorResponse(400, INVALID_SIGN_IN)
  const spent = await env.DB.prepare('UPDATE sign_in_emails SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? RETURNING id')
    .bind(now, row.id, now)
    .first()
  if (!spent) return errorResponse(400, INVALID_SIGN_IN)
  return signIn(env, email, now)
}

/** Creates the Account if this is its first sign-in (possible only for a listed address) and a session for it. */
async function signIn(env: Env, email: string, now: number): Promise<Response> {
  const invited = await env.DB.prepare('SELECT 1 AS ok FROM invites WHERE email = ?').bind(email).first()
  if (!invited) return errorResponse(400, INVALID_SIGN_IN)
  await env.DB.prepare('INSERT INTO accounts (id, email, created_at) VALUES (?, ?, ?) ON CONFLICT (email) DO NOTHING')
    .bind(randomHex(16), email, now)
    .run()
  const account = await env.DB.prepare('SELECT id FROM accounts WHERE email = ?').bind(email).first<{ id: string }>()
  if (!account) return errorResponse(500, 'server_error')
  const token = randomHex(32)
  await env.DB.prepare('INSERT INTO sessions (token_hash, account_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), account.id, now, now + SESSION_MS, now)
    .run()
  return json({ email }, 200, { 'set-cookie': sessionCookie(env, token, SESSION_SECONDS) })
}

// MARK: Sessions

/**
 * The signed-in Account for a request, or null. A session whose email has left the Invite List is deleted
 * (along with the Account's other sessions) and rejected.
 */
export async function authenticate(req: Request, env: Env, deps: Deps): Promise<AuthedSession | null> {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null
  const tokenHash = await sha256Hex(token)
  const row = await env.DB.prepare(
    `SELECT s.account_id AS accountId, a.email AS email, (SELECT 1 FROM invites i WHERE i.email = a.email) AS invited
     FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, deps.now())
    .first<{ accountId: string; email: string; invited: number | null }>()
  if (!row) return null
  if (!row.invited) {
    await env.DB.prepare('DELETE FROM sessions WHERE account_id = ?').bind(row.accountId).run()
    return null
  }
  return { tokenHash, accountId: row.accountId, email: row.email }
}

/** Sliding session: each authenticated sync pushes the expiry a year out. Returns the refreshed cookie. */
export async function slideSession(env: Env, session: AuthedSession, token: string, now: number): Promise<string> {
  await env.DB.prepare('UPDATE sessions SET expires_at = ?, last_seen_at = ? WHERE token_hash = ?')
    .bind(now + SESSION_MS, now, session.tokenHash)
    .run()
  return sessionCookie(env, token, SESSION_SECONDS)
}

export async function signOut(req: Request, env: Env): Promise<Response> {
  const denied = checkStateChanging(req, env)
  if (denied) return denied
  const token = readCookie(req, SESSION_COOKIE)
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
  return json({ ok: true }, 200, { 'set-cookie': clearedCookie(env) })
}

export async function me(req: Request, env: Env, deps: Deps): Promise<Response> {
  const session = await authenticate(req, env, deps)
  return session ? json({ email: session.email }) : errorResponse(401, 'unauthorized')
}
