CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  domain TEXT NOT NULL,
  keywords TEXT NOT NULL,
  prompts TEXT NOT NULL,
  detection_terms TEXT NOT NULL,
  location TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audits (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  client_id TEXT NOT NULL REFERENCES clients(id),
  status TEXT DEFAULT 'running',
  share_token TEXT,
  score_seo INTEGER DEFAULT 0,
  score_aeo INTEGER DEFAULT 0,
  score_llm INTEGER DEFAULT 0,
  score_presence INTEGER DEFAULT 0,
  score_total INTEGER DEFAULT 0,
  results_seo TEXT,
  results_aeo TEXT,
  results_llm TEXT,
  results_presence TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_audits_client_id ON audits(client_id);
CREATE INDEX IF NOT EXISTS idx_audits_share_token ON audits(share_token);
CREATE INDEX IF NOT EXISTS idx_audits_status ON audits(status);
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
