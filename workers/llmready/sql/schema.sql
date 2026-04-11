-- LLMReady worker D1 schema.
-- Apply with: npm run db:init (local) or db:init:remote (production).

CREATE TABLE IF NOT EXISTS llmready_audits (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',   -- running | complete | failed
  overall_score INTEGER,
  verdict TEXT,
  dimensions TEXT,                          -- JSON: full 8-dimension breakdown
  priority_issues TEXT,                     -- JSON: ranked issues
  schema_types_found TEXT,                  -- JSON array
  schema_types_missing TEXT,                -- JSON array
  critical_content_js_only INTEGER,         -- 0/1
  llms_txt_exists INTEGER,
  robots_blocks_ai INTEGER,
  rendered_via_browser INTEGER,
  error TEXT,
  raw_html_key TEXT,                        -- R2 key for stored raw HTML
  rendered_html_key TEXT,                   -- R2 key for stored rendered HTML
  robots_txt TEXT,
  llms_txt TEXT,
  well_known_llm_txt TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_llmready_audits_started ON llmready_audits(started_at DESC);

CREATE TABLE IF NOT EXISTS llmready_fixes (
  audit_id TEXT PRIMARY KEY REFERENCES llmready_audits(id) ON DELETE CASCADE,
  schema_jsonld TEXT,
  llms_txt TEXT,
  meta_tags TEXT,
  robots_txt TEXT,
  generated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS llmready_jobs (
  id TEXT PRIMARY KEY,
  audit_id TEXT REFERENCES llmready_audits(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'uploaded',           -- uploaded | analyzed | approved | built | failed
  platform TEXT,                            -- shopify | wordpress | static | nextjs | unknown
  upload_key TEXT,                          -- R2 key of the uploaded ZIP
  optimized_key TEXT,                       -- R2 key of the built-out ZIP
  report_key TEXT,                          -- R2 key of the HTML change report
  business_info TEXT,                       -- JSON
  findings TEXT,                            -- JSON: proposed changes grouped
  approved_changes TEXT,                    -- JSON array of change ids
  change_log TEXT,                          -- JSON: what was actually modified
  files_analyzed INTEGER DEFAULT 0,
  issues_found INTEGER DEFAULT 0,
  issues_fixed INTEGER DEFAULT 0,
  score_before INTEGER,
  score_after_estimate INTEGER,
  error TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_llmready_jobs_created ON llmready_jobs(created_at DESC);
