-- Contact form submissions
CREATE TABLE IF NOT EXISTS contact_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  service_interest TEXT NOT NULL,
  message TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_contact_submitted_at ON contact_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_email ON contact_submissions(email);

-- Audit submissions (URL + lead capture)
CREATE TABLE IF NOT EXISTS audit_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,
  email TEXT,
  overall_score INTEGER,
  aeo_score INTEGER,
  geo_score INTEGER,
  structured_data_score INTEGER,
  content_structure_score INTEGER,
  technical_score INTEGER,
  top_issues TEXT,
  full_checks TEXT,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  lead_captured_at TEXT,
  status TEXT NOT NULL DEFAULT 'new'
);

CREATE INDEX IF NOT EXISTS idx_audit_submitted_at ON audit_submissions(submitted_at);
CREATE INDEX IF NOT EXISTS idx_audit_domain ON audit_submissions(domain);
CREATE INDEX IF NOT EXISTS idx_audit_email ON audit_submissions(email);
CREATE INDEX IF NOT EXISTS idx_audit_status ON audit_submissions(status);
