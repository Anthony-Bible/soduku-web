import { MAX_CLOCK_SKEW_MS, clampDoc, docsEqual, mergeDocs, parseSyncDoc, stableStringify, type SyncDoc } from '../src/core/syncDoc'
import { authenticate, slideSession, type Deps } from './auth'
import type { Env } from './env'
import { SESSION_COOKIE, checkStateChanging, errorResponse, json, readCookie, readJson } from './http'

/** The Account email the client expects its session to belong to. */
export const EXPECTED_ACCOUNT_HEADER = 'x-expected-account'
const MAX_WRITE_ATTEMPTS = 5
/** D1 rows are limited to 2 MB. */
const MAX_DOC_CHARS = 1_900_000

/**
 * POST /api/sync: merges the device's document into the Account's stored one and answers with the result.
 * The write is guarded by the row's version: if another request wrote first, merge again and retry.
 */
export async function sync(req: Request, env: Env, deps: Deps): Promise<Response> {
  const denied = checkStateChanging(req, env)
  if (denied) return denied
  const session = await authenticate(req, env, deps)
  if (!session) return errorResponse(401, 'unauthorized')

  // The client says which Account it believes it is syncing. If this browser's cookie belongs to another one
  // (a Magic Link for a different Account was opened), merging would copy one Account's progress into the other.
  const expected = req.headers.get(EXPECTED_ACCOUNT_HEADER)
  if (expected !== null && expected.trim().toLowerCase() !== session.email) return errorResponse(409, 'wrong_account')

  const body = await readJson(req)
  if (!body) return errorResponse(400, 'bad_request')
  if ('tooLarge' in body) return errorResponse(413, 'too_large')
  const parsed = parseSyncDoc(body.value)
  if (!parsed) return errorResponse(400, 'bad_document')
  // A device with its date set ahead must not push the Account's clock (and so its pruning) into the future.
  const incoming = clampDoc(parsed, deps.now() + MAX_CLOCK_SKEW_MS)

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const row = await env.DB.prepare('SELECT doc, version FROM sync_docs WHERE account_id = ?')
      .bind(session.accountId)
      .first<{ doc: string; version: number }>()
    let stored: SyncDoc | null = null
    if (row) {
      try {
        stored = parseSyncDoc(JSON.parse(row.doc))
      } catch {
        stored = null
      }
      if (!stored) return errorResponse(500, 'stored_document_unreadable')
    }
    const merged = stored ? mergeDocs(clampDoc(stored, deps.now() + MAX_CLOCK_SKEW_MS), incoming) : mergeDocs(incoming, incoming)
    const text = stableStringify(merged)
    if (text.length > MAX_DOC_CHARS) return errorResponse(413, 'too_large')

    const now = deps.now()
    let written: boolean
    if (!row) {
      const r = await env.DB.prepare('INSERT INTO sync_docs (account_id, doc, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT (account_id) DO NOTHING')
        .bind(session.accountId, text, now)
        .run()
      written = (r.meta.changes ?? 0) > 0
    } else if (stored && docsEqual(stored, merged)) {
      written = true // nothing new to store
    } else {
      const r = await env.DB.prepare('UPDATE sync_docs SET doc = ?, version = version + 1, updated_at = ? WHERE account_id = ? AND version = ?')
        .bind(text, now, session.accountId, row.version)
        .run()
      written = (r.meta.changes ?? 0) > 0
    }
    if (written) {
      const cookie = await slideSession(env, session, readCookie(req, SESSION_COOKIE) ?? '', now)
      return json(merged, 200, { 'set-cookie': cookie })
    }
  }
  return errorResponse(503, 'busy')
}
