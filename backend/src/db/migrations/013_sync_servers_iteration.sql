-- Iteration schedule and last run per sync_server (for backend cron / app sync). Default false so cron only runs when app has synced schedule.
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_every3h BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_daily BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_weekly BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_last_3h_at TIMESTAMPTZ;
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_last_daily_at TIMESTAMPTZ;
ALTER TABLE sync_servers ADD COLUMN IF NOT EXISTS iteration_last_weekly_at TIMESTAMPTZ;
