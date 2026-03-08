-- Purchased AI credits (topped up by credit pack purchases; consumed when over tier limit)
ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_credits_balance INTEGER NOT NULL DEFAULT 0;
