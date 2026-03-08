-- Dev-only: override subscription tier for testing without Stripe.
-- When a row exists for user_id, GET /api/subscription/status and usage limits use this tier instead of subscriptions table.
CREATE TABLE IF NOT EXISTS dev_tier_overrides (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  tier_id TEXT NOT NULL CHECK (tier_id IN ('free', 'backup', 'pro')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
