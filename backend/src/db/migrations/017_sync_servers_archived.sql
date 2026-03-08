-- Allow archiving sync servers (hide from main list; expandable archive on app/website).
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_sync_servers_user_archived ON sync_servers (user_id, archived);
