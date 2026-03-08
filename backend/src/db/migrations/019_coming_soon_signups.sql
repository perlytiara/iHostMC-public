-- Coming soon / notify-me email signups (no auth required).
CREATE TABLE IF NOT EXISTS coming_soon_signups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(email)
);
CREATE INDEX IF NOT EXISTS idx_coming_soon_signups_created_at ON coming_soon_signups (created_at DESC);
