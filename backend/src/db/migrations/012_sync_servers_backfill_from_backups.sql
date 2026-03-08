-- Ensure every server_id that appears in backups has a sync_servers row (handles partial restore or legacy data).
-- Safe if rows already exist (ON CONFLICT DO NOTHING).
INSERT INTO sync_servers (id, user_id, host_id, name, backup_count, last_backup_at, updated_at)
SELECT b.server_id, b.user_id, b.server_id::text, 'Server', 0, NULL, now()
FROM (SELECT DISTINCT server_id, user_id FROM backups WHERE server_id IS NOT NULL) b
WHERE NOT EXISTS (SELECT 1 FROM sync_servers s WHERE s.id = b.server_id)
ON CONFLICT (id) DO NOTHING;
