import { execFileSync } from 'node:child_process'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const STATE = '.wrangler/e2e'

/** Runs SQL against the local D1 database the e2e Worker uses and returns the last statement's rows. */
export function sql(command: string): Record<string, unknown>[] {
  const out = execFileSync(
    './node_modules/.bin/wrangler',
    ['d1', 'execute', 'sudoku', '--local', '--persist-to', STATE, '--yes', '--json', '--command', command],
    { stdio: 'pipe', encoding: 'utf8' },
  )
  const results = JSON.parse(out) as { results: Record<string, unknown>[] }[]
  return results.at(-1)?.results ?? []
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`

/** A fresh address on the Invite List, so tests never share an Account or rate limits. */
export function invitedEmail(label: string): string {
  const email = `${label}-${randomBytes(4).toString('hex')}@example.test`
  sql(`INSERT INTO invites (email) VALUES (${q(email)})`)
  return email
}

export function signInEmailCount(email: string): number {
  return Number(sql(`SELECT COUNT(*) AS n FROM sign_in_emails WHERE email = ${q(email)}`)[0]?.n ?? 0)
}

/**
 * Stands in for the Sign-in Email: stores a row the way worker/auth.ts does (code hashed with the row id)
 * and returns its Sign-in Code. The Worker stores its own row after replying and then voids every older
 * one, so wait for that row first (signInEmailCount above `before`) or it may void this one.
 */
export function seedSignInCode(email: string): string {
  const id = randomUUID()
  const code = String(100000 + (randomBytes(4).readUInt32BE() % 900000))
  const sha = (s: string) => createHash('sha256').update(s).digest('hex')
  const now = Date.now() + 1000
  sql(
    `UPDATE sign_in_emails SET used_at = ${now} WHERE email = ${q(email)} AND used_at IS NULL;
     INSERT INTO sign_in_emails (id, email, link_token_hash, code_hash, expires_at, attempts, used_at, created_at)
     VALUES (${q(id)}, ${q(email)}, ${q(sha(randomUUID()))}, ${q(sha(`${id}:${code}`))}, ${now + 600_000}, 0, NULL, ${now})`,
  )
  return code
}
