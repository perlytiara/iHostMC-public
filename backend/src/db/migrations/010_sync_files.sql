-- Synced files: individual files uploaded from app to backend (encrypted at rest).
-- Upsert by (server_id, file_path) so re-syncing the same file just updates it.
CREATE TABLE IF NOT EXISTS sync_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES sync_servers (id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL DEFAULT '',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_tier TEXT NOT NULL DEFAULT 'mini' CHECK (storage_tier IN ('mini', 'big')),
  encrypted BOOLEAN NOT NULL DEFAULT true,
  encryption_iv TEXT NOT NULL DEFAULT '',
  storage_path TEXT NOT NULL DEFAULT '',
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (server_id, file_path)
);

CREATE INDEX IF NOT EXISTS idx_sync_files_server_id ON sync_files (server_id);
CREATE INDEX IF NOT EXISTS idx_sync_files_user_id ON sync_files (user_id);

-- Sync manifests: snapshot of server file state at sync time.
-- Three types: mini (small files), big (large files, tracked only), combined (full picture).
CREATE TABLE IF NOT EXISTS sync_manifests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  server_id UUID NOT NULL REFERENCES sync_servers (id) ON DELETE CASCADE,
  manifest_type TEXT NOT NULL DEFAULT 'combined' CHECK (manifest_type IN ('mini', 'big', 'combined')),
  file_count INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  manifest_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_manifests_server_id ON sync_manifests (server_id);
CREATE INDEX IF NOT EXISTS idx_sync_manifests_user_type ON sync_manifests (user_id, server_id, manifest_type);
