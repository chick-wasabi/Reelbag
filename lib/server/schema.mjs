import { DEFAULT_AVATAR } from "../../utils/avatars.mjs";

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
  `CREATE TABLE IF NOT EXISTS device_accounts (
    device_hash TEXT NOT NULL, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(device_hash,user_id)
  )`,
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
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '${DEFAULT_AVATAR}'`,
  `ALTER TABLE users ALTER COLUMN avatar_url SET DEFAULT '${DEFAULT_AVATAR}'`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hint VARCHAR(160)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(60)`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS appearance JSONB NOT NULL DEFAULT '{"theme":"dark","accent":"#b5f36d","columns":"auto","spacing":"comfortable","avatarFrame":"accent"}'::jsonb`,
  `ALTER TABLE users ALTER COLUMN appearance SET DEFAULT '{"theme":"dark","accent":"#b5f36d","columns":"auto","spacing":"comfortable","avatarFrame":"accent"}'::jsonb`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS security_question TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS security_answer TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS trash_pin TEXT`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS reels_user_pinned_created ON reels(user_id,is_pinned DESC,created_at DESC)`,
  `ALTER TABLE folders ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid()`,
  `ALTER TABLE folders ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE folders ADD COLUMN IF NOT EXISTS icon VARCHAR(24) NOT NULL DEFAULT 'folder'`,
  `ALTER TABLE folders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`,
  `CREATE INDEX IF NOT EXISTS folders_user_deleted ON folders(user_id,deleted_at,created_at)`,
  `CREATE TABLE IF NOT EXISTS reel_folder_memberships (
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(reel_id,folder_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_folder_memberships_folder_added ON reel_folder_memberships(folder_id,added_at DESC)`,
  `INSERT INTO reel_folder_memberships(reel_id,folder_id,added_at)
   SELECT id,folder_id,created_at FROM reels WHERE folder_id IS NOT NULL
   ON CONFLICT(reel_id,folder_id) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS reel_view_flags (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    scope VARCHAR(48) NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    is_favorite BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,reel_id,scope)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_view_flags_user_scope ON reel_view_flags(user_id,scope,is_pinned,is_favorite)`,
  `INSERT INTO reel_view_flags(user_id,reel_id,scope,is_pinned,is_favorite)
   SELECT user_id,id,'all',is_pinned,is_favorite FROM reels WHERE is_pinned OR is_favorite
   ON CONFLICT(user_id,reel_id,scope) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS reel_hidden_views (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    scope VARCHAR(48) NOT NULL,
    hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,reel_id,scope)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_hidden_views_user_scope ON reel_hidden_views(user_id,scope,hidden_at DESC)`,
  `INSERT INTO reel_hidden_views(user_id,reel_id,scope,hidden_at)
   SELECT state.user_id,state.reel_id,
     CASE WHEN r.folder_id IS NULL THEN 'shared' ELSE 'folder:'||r.folder_id::text END,state.deleted_at
   FROM reel_user_states state JOIN reels r ON r.id=state.reel_id WHERE state.state='hidden'
   ON CONFLICT(user_id,reel_id,scope) DO NOTHING`,
  `DELETE FROM reel_user_states WHERE state='hidden'`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS share_token UUID DEFAULT gen_random_uuid()`,
  `ALTER TABLE reels ADD COLUMN IF NOT EXISTS share_enabled BOOLEAN NOT NULL DEFAULT false`,
  `CREATE UNIQUE INDEX IF NOT EXISTS folders_share_token ON folders(share_token)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reels_share_token ON reels(share_token)`,
  `CREATE TABLE IF NOT EXISTS folder_shares (
    id UUID PRIMARY KEY, folder_id UUID NOT NULL, owner_id UUID NOT NULL,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('viewer','collaborator')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(folder_id,owner_id) REFERENCES folders(id,user_id) ON DELETE CASCADE,
    UNIQUE(folder_id,recipient_id), CHECK(owner_id <> recipient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS folder_shares_recipient ON folder_shares(recipient_id,status)`,
  `CREATE TABLE IF NOT EXISTS shared_folder_pins (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    pin_code TEXT NOT NULL, pin_version INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(user_id,folder_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS reels_id_owner ON reels(id,user_id)`,
  `CREATE TABLE IF NOT EXISTS reel_shares (
    id UUID PRIMARY KEY, reel_id UUID NOT NULL, owner_id UUID NOT NULL,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'viewer' CHECK(role='viewer'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(reel_id,owner_id) REFERENCES reels(id,user_id) ON DELETE CASCADE,
    UNIQUE(reel_id,recipient_id), CHECK(owner_id <> recipient_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_shares_recipient ON reel_shares(recipient_id,status)`,
  `CREATE TABLE IF NOT EXISTS reel_user_states (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK(state IN ('trash','hidden')),
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,reel_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_user_states_user_state ON reel_user_states(user_id,state,deleted_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reel_reactions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reel_id UUID NOT NULL REFERENCES reels(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK(emoji IN ('❤️','😂','🔥','😮','👏')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(user_id,reel_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reel_reactions_reel ON reel_reactions(reel_id)`,
  `CREATE TABLE IF NOT EXISTS friendships (
    id UUID PRIMARY KEY,
    user_a UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_a,user_b), CHECK(user_a <> user_b),
    CHECK(requested_by=user_a OR requested_by=user_b)
  )`,
  `CREATE INDEX IF NOT EXISTS friendships_user_a_status ON friendships(user_a,status)`,
  `CREATE INDEX IF NOT EXISTS friendships_user_b_status ON friendships(user_b,status)`,
  `ALTER TABLE friendships ADD COLUMN IF NOT EXISTS notification_status TEXT NOT NULL DEFAULT 'unread' CHECK(notification_status IN ('unread','read'))`,
  `ALTER TABLE reel_shares ADD COLUMN IF NOT EXISTS friendship_id UUID REFERENCES friendships(id) ON DELETE CASCADE`,
  `ALTER TABLE folder_shares ADD COLUMN IF NOT EXISTS friendship_id UUID REFERENCES friendships(id) ON DELETE CASCADE`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK(type IN ('folder_invite','reel_invite')), entity_id UUID NOT NULL,
    folder_share_id UUID UNIQUE REFERENCES folder_shares(id) ON DELETE CASCADE,
    reel_share_id UUID UNIQUE REFERENCES reel_shares(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread','read')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK((type='folder_invite' AND folder_share_id IS NOT NULL AND reel_share_id IS NULL)
      OR (type='reel_invite' AND reel_share_id IS NOT NULL AND folder_share_id IS NULL))
  )`,
  `CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(user_id,created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS admin_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS security_lockouts (
    key_hash TEXT PRIMARY KEY,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    escalated BOOLEAN NOT NULL DEFAULT false,
    lockout_until TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS security_lockouts_expiry ON security_lockouts(lockout_until)`,
];
