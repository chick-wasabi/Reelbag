// All instances take the same transaction-scoped lock before applying additive DDL.
export const MIGRATIONS = [
  `SELECT pg_advisory_xact_lock(746335821)`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY, username VARCHAR(32) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (username ~ '^[a-z0-9_]{3,32}$')
  )`,
  `CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL CHECK (length(trim(name)) > 0), pin_code TEXT,
    pin_version INTEGER NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, user_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS folders_user_name ON folders(user_id, lower(name))`,
  `CREATE TABLE IF NOT EXISTS reels (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID, title VARCHAR(200) NOT NULL CHECK (length(trim(title)) > 0),
    url TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (folder_id, user_id) REFERENCES folders(id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reels_user_created ON reels(user_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS reels_folder ON reels(folder_id)`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at)`,
  `CREATE TABLE IF NOT EXISTS folder_unlocks (
    session_hash TEXT NOT NULL REFERENCES sessions(token_hash) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, PRIMARY KEY (session_hash, folder_id)
  )`,
  `CREATE TABLE IF NOT EXISTS rate_limits (
    key_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL,
    window_expires TIMESTAMPTZ NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(window_expires)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer TEXT`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS reels_user_pinned_created ON reels(user_id,is_pinned DESC,created_at DESC)`,
];
