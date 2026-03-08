-- Users (password hash stored server-side)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  email_verified_at TIMESTAMPTZ,
  email_verification_token TEXT,
  email_verification_expires_at TIMESTAMPTZ,
  preferred_language TEXT,
  password_reset_token TEXT,
  password_reset_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add display_name if upgrading from an older schema (run once)
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
-- Email verification columns (run once):
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_token TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT;
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- Stripe customer ID for billing
CREATE TABLE IF NOT EXISTS stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Encrypted API keys (e.g. CurseForge) per user
CREATE TABLE IF NOT EXISTS user_api_keys (
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key_name)
);

-- Usage tracking for billing (AI usage, etc.)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  units INTEGER NOT NULL DEFAULT 1,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_created ON usage_events (user_id, created_at);

-- Subscriptions (synced from Stripe webhooks)
CREATE TABLE IF NOT EXISTS subscriptions (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  stripe_subscription_id TEXT,
  stripe_price_id TEXT,
  status TEXT NOT NULL DEFAULT 'inactive',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sync servers: app-registered Minecraft server instances (per user).
CREATE TABLE IF NOT EXISTS sync_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  host_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  last_synced_at TIMESTAMPTZ,
  last_backup_at TIMESTAMPTZ,
  backup_count INTEGER NOT NULL DEFAULT 0,
  mini_synced BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, host_id)
);

CREATE INDEX IF NOT EXISTS idx_sync_servers_user_id ON sync_servers (user_id);

-- User server backups (stored on disk; path relative to BACKUP_STORAGE_PATH)
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  server_id UUID REFERENCES sync_servers (id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'mini')),
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_backups_user_id ON backups (user_id);
-- idx_backups_server_id created in migration 009 (schema runs first; existing DBs lack server_id until migration)
