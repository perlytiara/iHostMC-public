-- Sync servers: app-registered Minecraft server instances (per user).
-- host_id = app-side stable id so we can upsert when app syncs.
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

-- Backups: link to server, kind (full vs mini), and metadata (mods, plugins, file lists).
ALTER TABLE backups ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES sync_servers (id) ON DELETE SET NULL;
ALTER TABLE backups ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'full' CHECK (kind IN ('full', 'mini'));
ALTER TABLE backups ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_backups_server_id ON backups (server_id);
