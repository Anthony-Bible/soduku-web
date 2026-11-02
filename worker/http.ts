import type { Env } from './env'

export const SESSION_COOKIE = 'sudoku_session'
export const SESSION_MS = 365 * 24 * 60 * 60 * 1000
const MAX_BODY_BYTES = 1_500_000

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  })
}

export const errorResponse = (status: number, error: string): Response => json({ error }, status)

/** Lowercase and trim. Returns null for something that cannot be an email address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function allowedOrigins(env: Env): string[] {
  const extra = (env.EXTRA_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  return [env.APP_ORIGIN, ...extra]
}

/**
 * CSRF guard for every state-changing request: it must be a JSON POST from our own origin. The session
 * cookie is SameSite=Lax; this is the second layer.
 */
export function checkStateChanging(req: Request, env: Env): Response | null {
  const origin = req.headers.get('origin')
  if (!origin || !allowedOrigins(env).includes(origin)) return errorResponse(403, 'forbidden')
  const type = req.headers.get('content-type') ?? ''
  if (!/^application\/json\s*(;|$)/i.test(type)) return errorResponse(415, 'unsupported_media_type')
  return null
}

/** Reads a JSON body of bounded size. Returns undefined if it is missing, too large or not JSON. */
export async function readJson(req: Request): Promise<{ value: unknown } | { tooLarge: true } | undefined> {
  const length = Number(req.headers.get('content-length') ?? '0')
  if (length > MAX_BODY_BYTES) return { tooLarge: true }
  const text = await req.text()
  if (text.length > MAX_BODY_BYTES) return { tooLarge: true }
  try {
    return { value: JSON.parse(text) as unknown }
  } catch {
    return undefined
  }
}

export function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim()
  }
  return null
}

/** HttpOnly; SameSite=Lax; Secure whenever the app is served over https; one year, or 0 to clear. */
export function sessionCookie(env: Env, token: string, maxAgeSeconds: number): string {
  const secure = env.APP_ORIGIN.startsWith('https://') ? '; Secure' : ''
  return `${SESSION_COOKIE}=${token}; HttpOnly${secure}; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`
}
export const clearedCookie = (env: Env): string => sessionCookie(env, '', 0)
export const SESSION_SECONDS = SESSION_MS / 1000
