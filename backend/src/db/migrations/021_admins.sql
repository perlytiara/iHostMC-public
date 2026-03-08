-- Admin users table: store admins in DB so they can be managed by other admins.
-- Bootstrap admins from DEV_TIER_OVERRIDE_EMAIL (config) still work; DB admins are additive.
CREATE TABLE IF NOT EXISTS admins (
  user_id UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  added_by UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admins_user_id ON admins (user_id);
