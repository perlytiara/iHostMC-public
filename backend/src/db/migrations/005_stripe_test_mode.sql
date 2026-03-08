-- Dev-only: per-user preference to use Stripe test mode (no real charges)
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_test_mode BOOLEAN NOT NULL DEFAULT false;

-- Test-mode Stripe customer ID (live customer id remains in stripe_customer_id)
ALTER TABLE stripe_customers ADD COLUMN IF NOT EXISTS stripe_customer_id_test TEXT;
