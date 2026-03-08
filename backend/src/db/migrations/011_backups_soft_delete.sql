-- Soft delete for backups: move to trash, purge after 30 days.
ALTER TABLE backups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_backups_deleted_at ON backups (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
