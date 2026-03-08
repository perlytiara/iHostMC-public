-- Soft-delete sync servers: move to trash (30-day retention like backups).
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_sync_servers_trashed_at ON sync_servers (user_id, trashed_at) WHERE trashed_at IS NOT NULL;
