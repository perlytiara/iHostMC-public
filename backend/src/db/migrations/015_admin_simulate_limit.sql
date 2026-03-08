-- Admin-only: simulate "at limit" for a user (testing). When set, usage recording returns 402 for that user.
CREATE TABLE IF NOT EXISTS admin_simulate_limit (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
