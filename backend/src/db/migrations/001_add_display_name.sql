-- Run once on existing databases to add display_name to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
