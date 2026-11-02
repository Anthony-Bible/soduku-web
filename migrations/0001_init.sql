-- Accounts, invite-only sign-in, sessions and the synced document. Times are epoch milliseconds.

-- The Invite List: only these addresses can ever be sent a Sign-in Email or get an Account.
CREATE TABLE invites (
  -- Lowercase and trimmed, like every address the Worker looks up; a mixed-case row could never match.
  email TEXT PRIMARY KEY NOT NULL CHECK (email = lower(trim(email))),
  created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s', 'now') AS INTEGER) * 1000)
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- One row per Sign-in Email. Only SHA-256 hashes of the Magic Link token and the Sign-in Code are stored.
-- used_at is set when the email is spent by its link or code, voided by a newer one, or locked by wrong codes.
CREATE TABLE sign_in_emails (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  link_token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX sign_in_emails_email_created ON sign_in_emails (email, created_at);

-- The session cookie's token is never stored, only its SHA-256 hash.
CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  account_id TEXT NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);
CREATE INDEX sessions_account ON sessions (account_id);

-- The Account's synced document (see docs/adr/0002). `version` counts writes, for optimistic concurrency.
CREATE TABLE sync_docs (
  account_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  doc TEXT NOT NULL,
  version INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
