-- Server Advisor conversations per user. Messages stored encrypted at rest.
CREATE TABLE IF NOT EXISTS advisor_conversations (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  server_id TEXT,
  server_name TEXT,
  encrypted_messages TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_advisor_conversations_user_updated ON advisor_conversations (user_id, updated_at DESC);
