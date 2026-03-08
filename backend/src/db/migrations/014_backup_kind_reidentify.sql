-- Allow backup kind to be snapshot | structural | full (and legacy mini).
-- Re-identify existing backups so they display correctly (Full / Structural / Snapshot).

-- Drop existing kind check constraint(s)
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'backups' AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) LIKE '%kind%'
  LOOP
    EXECUTE format('ALTER TABLE backups DROP CONSTRAINT IF EXISTS %I', cname);
  END LOOP;
END $$;

-- Add new check allowing snapshot, structural, full, mini
ALTER TABLE backups ADD CONSTRAINT backups_kind_check CHECK (kind IN ('full', 'mini', 'structural', 'snapshot'));

-- Re-identify: set kind and metadata.saveTier from content.
-- Full: has bigFiles in metadata, or large size (>= 10 MB) with files (likely had worlds/large files).
UPDATE backups
SET
  kind = 'full',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{saveTier}', '"full"', true)
WHERE kind = 'mini'
  AND (
    jsonb_array_length(COALESCE(metadata->'bigFiles', '[]'::jsonb)) > 0
    OR (
      size_bytes >= 10 * 1024 * 1024
      AND (
        COALESCE((metadata->>'filesOnBackup')::int, 0) > 0
        OR jsonb_array_length(COALESCE(metadata->'fileList', '[]'::jsonb)) > 0
      )
    )
  );

-- Structural: has files but not classified as full above.
UPDATE backups
SET
  kind = 'structural',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{saveTier}', '"structural"', true)
WHERE kind = 'mini'
  AND (
    COALESCE((metadata->>'filesOnBackup')::int, 0) > 0
    OR jsonb_array_length(COALESCE(metadata->'fileList', '[]'::jsonb)) > 0
    OR jsonb_array_length(COALESCE(metadata->'miniFiles', '[]'::jsonb)) > 0
  );

-- Snapshot: remaining mini with no file content (metadata-only).
UPDATE backups
SET
  kind = 'snapshot',
  metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{saveTier}', '"snapshot"', true)
WHERE kind = 'mini';
