-- App login handoff: session created by app, registered by website, claimed by app. Persisted so multiple backend instances and restarts work.
CREATE TABLE IF NOT EXISTS app_sessions (
  id TEXT PRIMARY KEY,
  token TEXT,
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  email TEXT,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions (expires_at);
