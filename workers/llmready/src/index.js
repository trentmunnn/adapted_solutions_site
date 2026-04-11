import { validateToken, corsHeaders, jsonResponse } from './auth.js';
import { renderPage } from './render.js';
import { callClaude, extractJson } from './claude.js';
import {
  SEMANTIC_ASSESSMENT_PROMPT,
  buildAssessmentUserMessage,
  buildSchemaPrompt,
  buildLlmsTxtPrompt,
  buildMetaPrompt,
  buildRobotsPrompt,
} from './prompts.js';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function randomId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

let schemaEnsured = false;
async function ensureSchema(db) {
  if (schemaEnsured) return;
  // Idempotent CREATE statements — safe to call every cold start.
  const stmts = [
    `CREATE TABLE IF NOT EXISTS llmready_audits (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'running',
      overall_score INTEGER,
      verdict TEXT,
      dimensions TEXT,
      priority_issues TEXT,
      schema_types_found TEXT,
      schema_types_missing TEXT,
      critical_content_js_only INTEGER,
      llms_txt_exists INTEGER,
      robots_blocks_ai INTEGER,
      rendered_via_browser INTEGER,
      error TEXT,
      raw_html_key TEXT,
      rendered_html_key TEXT,
      robots_txt TEXT,
      llms_txt TEXT,
      well_known_llm_txt TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS llmready_fixes (
      audit_id TEXT PRIMARY KEY,
      schema_jsonld TEXT,
      llms_txt TEXT,
      meta_tags TEXT,
      robots_txt TEXT,
      generated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS llmready_jobs (
      id TEXT PRIMARY KEY,
      audit_id TEXT,
      status TEXT DEFAULT 'uploaded',
      platform TEXT,
      upload_key TEXT,
      optimized_key TEXT,
      report_key TEXT,
      business_info TEXT,
      findings TEXT,
      approved_changes TEXT,
      change_log TEXT,
      files_analyzed INTEGER DEFAULT 0,
      issues_found INTEGER DEFAULT 0,
      issues_fixed INTEGER DEFAULT 0,
      score_before INTEGER,
      score_after_estimate INTEGER,
      error TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    )`,
  ];
  for (const s of stmts) await db.prepare(s).run();
  schemaEnsured = true;
}

// ---------------------------------------------------------------------------
// Phase 1 — Audit
// ---------------------------------------------------------------------------

async function startAudit(db, env, ctx, url) {
  const id = randomId();
  await db.prepare(
    `INSERT INTO llmready_audits (id, url, status) VALUES (?, ?, 'running')`
  ).bind(id, url).run();
  ctx.waitUntil(runAuditBackground(db, env, id, url));
  return { id, audit_id: id, status: 'running', url };
}

async function runAuditBackground(db, env, id, url) {
  try {
    const pageData = await renderPage(url, env);

    // Persist raw/rendered HTML to R2 so we don't bloat D1
    if (env.FILES && pageData.rawHTML) {
      await env.FILES.put(`audits/${id}/raw.html`, pageData.rawHTML);
    }
    if (env.FILES && pageData.renderedHTML) {
      await env.FILES.put(`audits/${id}/rendered.html`, pageData.renderedHTML);
    }

    const raw = await callClaude(env, {
      system: SEMANTIC_ASSESSMENT_PROMPT,
      user: buildAssessmentUserMessage(pageData),
      maxTokens: 4096,
    });

    let parsed;
    try {
      parsed = extractJson(raw);
    } catch (e) {
      throw new Error(`Could not parse Claude JSON: ${e.message}`);
    }

    await db.prepare(`
      UPDATE llmready_audits SET
        status = 'complete',
        overall_score = ?,
        verdict = ?,
        dimensions = ?,
        priority_issues = ?,
        schema_types_found = ?,
        schema_types_missing = ?,
        critical_content_js_only = ?,
        llms_txt_exists = ?,
        robots_blocks_ai = ?,
        rendered_via_browser = ?,
        raw_html_key = ?,
        rendered_html_key = ?,
        robots_txt = ?,
        llms_txt = ?,
        well_known_llm_txt = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `).bind(
      parsed.overall_score ?? null,
      parsed.verdict ?? null,
      JSON.stringify(parsed.dimensions || {}),
      JSON.stringify(parsed.priority_issues || []),
      JSON.stringify(parsed.schema_types_found || []),
      JSON.stringify(parsed.schema_types_missing || []),
      parsed.critical_content_js_only ? 1 : 0,
      parsed.llms_txt_exists ? 1 : 0,
      parsed.robots_blocks_ai ? 1 : 0,
      pageData.renderedViaBrowser ? 1 : 0,
      `audits/${id}/raw.html`,
      `audits/${id}/rendered.html`,
      pageData.robotsTxt,
      pageData.llmsTxt,
      pageData.wellKnownLlmTxt,
      id
    ).run();
  } catch (err) {
    console.error('Audit failed:', err);
    await db.prepare(
      `UPDATE llmready_audits SET status = 'failed', error = ?, completed_at = datetime('now') WHERE id = ?`
    ).bind(String(err.message || err), id).run();
  }
}

async function getAudit(db, id) {
  const row = await db.prepare(`SELECT * FROM llmready_audits WHERE id = ?`).bind(id).first();
  if (!row) return null;
  return hydrateAudit(row);
}

function hydrateAudit(row) {
  const safe = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
  return {
    id: row.id,
    url: row.url,
    status: row.status,
    overall_score: row.overall_score,
    verdict: row.verdict,
    dimensions: safe(row.dimensions, {}),
    priority_issues: safe(row.priority_issues, []),
    schema_types_found: safe(row.schema_types_found, []),
    schema_types_missing: safe(row.schema_types_missing, []),
    critical_content_js_only: !!row.critical_content_js_only,
    llms_txt_exists: !!row.llms_txt_exists,
    robots_blocks_ai: !!row.robots_blocks_ai,
    rendered_via_browser: !!row.rendered_via_browser,
    error: row.error,
    started_at: row.started_at,
    completed_at: row.completed_at,
  };
}

// ---------------------------------------------------------------------------
// Phase 2 — Generate fixes
// ---------------------------------------------------------------------------

async function generateFixes(db, env, auditId, businessInfo) {
  const audit = await db.prepare(`SELECT * FROM llmready_audits WHERE id = ?`).bind(auditId).first();
  if (!audit) throw new Error('Audit not found');
  if (audit.status !== 'complete') throw new Error('Audit not yet complete');

  // Pull rendered HTML back from R2 (we don't store it in D1)
  let renderedHTML = '';
  if (env.FILES && audit.rendered_html_key) {
    const obj = await env.FILES.get(audit.rendered_html_key);
    if (obj) renderedHTML = await obj.text();
  }
  const pageData = { url: audit.url, renderedHTML };

  // Four Claude calls in parallel — each produces one artifact.
  const [schema, llmsTxt, meta, robotsTxt] = await Promise.all([
    callClaude(env, { user: buildSchemaPrompt(pageData, businessInfo), maxTokens: 4096 }).catch(e => `<!-- Schema generation failed: ${e.message} -->`),
    callClaude(env, { user: buildLlmsTxtPrompt(pageData, businessInfo), maxTokens: 4096 }).catch(e => `# Generation failed\n${e.message}`),
    callClaude(env, { user: buildMetaPrompt(pageData, businessInfo), maxTokens: 2048 }).catch(e => `<!-- Meta generation failed: ${e.message} -->`),
    callClaude(env, { user: buildRobotsPrompt(audit.robots_txt), maxTokens: 1024 }).catch(e => `# Generation failed\n# ${e.message}`),
  ]);

  await db.prepare(`
    INSERT INTO llmready_fixes (audit_id, schema_jsonld, llms_txt, meta_tags, robots_txt)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(audit_id) DO UPDATE SET
      schema_jsonld = excluded.schema_jsonld,
      llms_txt = excluded.llms_txt,
      meta_tags = excluded.meta_tags,
      robots_txt = excluded.robots_txt,
      generated_at = datetime('now')
  `).bind(auditId, schema, llmsTxt, meta, robotsTxt).run();

  return { schema, llms_txt: llmsTxt, meta, robots: robotsTxt };
}

async function getFixes(db, auditId) {
  const row = await db.prepare(`SELECT * FROM llmready_fixes WHERE audit_id = ?`).bind(auditId).first();
  if (!row) return null;
  return {
    schema: row.schema_jsonld,
    llms_txt: row.llms_txt,
    meta: row.meta_tags,
    robots: row.robots_txt,
    generated_at: row.generated_at,
  };
}

// ---------------------------------------------------------------------------
// Phase 3 — Optimize (scaffold)
// ---------------------------------------------------------------------------
//
// This phase accepts a ZIP upload, stores it in R2, lists its file entries
// from the ZIP central directory, detects the platform, and produces a
// `findings` payload describing proposed changes. The actual file rewrite +
// ZIP rebuild is a follow-up — see applyOptimizations() below.
// ---------------------------------------------------------------------------

async function createOptimizeJob(db, env, { file, businessInfo, auditId }) {
  const id = randomId();
  const bytes = new Uint8Array(await file.arrayBuffer());

  // Upload to R2
  const uploadKey = `uploads/${id}.zip`;
  if (env.FILES) {
    await env.FILES.put(uploadKey, bytes, {
      httpMetadata: { contentType: 'application/zip' },
      customMetadata: { originalName: file.name || 'upload.zip' },
    });
  }

  // Inspect the ZIP to list files and detect platform
  let fileList = [];
  try {
    fileList = listZipFiles(bytes);
  } catch (err) {
    console.error('ZIP parse failed:', err);
  }
  const platform = detectPlatform(fileList);
  const findings = buildFindings(platform, fileList);

  await db.prepare(`
    INSERT INTO llmready_jobs (
      id, audit_id, status, platform, upload_key, business_info, findings,
      files_analyzed, issues_found
    ) VALUES (?, ?, 'analyzed', ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    auditId || null,
    platform,
    uploadKey,
    JSON.stringify(businessInfo || {}),
    JSON.stringify(findings),
    fileList.length,
    (findings.critical?.length || 0) + (findings.important?.length || 0)
  ).run();

  return {
    id,
    job_id: id,
    status: 'analyzed',
    platform,
    findings,
    files_analyzed: fileList.length,
  };
}

async function approveOptimizeJob(db, env, jobId, approved) {
  const job = await db.prepare(`SELECT * FROM llmready_jobs WHERE id = ?`).bind(jobId).first();
  if (!job) throw new Error('Job not found');

  // Score-before comes from the linked audit if present
  let scoreBefore = null;
  if (job.audit_id) {
    const a = await db.prepare(`SELECT overall_score FROM llmready_audits WHERE id = ?`).bind(job.audit_id).first();
    scoreBefore = a?.overall_score ?? null;
  }
  // Crude lift estimate: +5 per critical, +2 per important, capped at 100
  const findings = JSON.parse(job.findings || '{}');
  const approvedSet = new Set(approved || []);
  let lift = 0;
  (findings.critical || []).forEach(i => { if (approvedSet.has(i.id)) lift += 5; });
  (findings.important || []).forEach(i => { if (approvedSet.has(i.id)) lift += 2; });
  const scoreAfter = Math.min(100, (scoreBefore ?? 40) + lift);

  // Actual ZIP rewrite happens here — scaffolded as a pass-through for now.
  // See applyOptimizations() for the extension point.
  const changeLog = await applyOptimizations(db, env, job, approvedSet);

  await db.prepare(`
    UPDATE llmready_jobs SET
      status = 'built',
      approved_changes = ?,
      change_log = ?,
      issues_fixed = ?,
      score_before = ?,
      score_after_estimate = ?,
      optimized_key = ?,
      completed_at = datetime('now')
    WHERE id = ?
  `).bind(
    JSON.stringify([...approvedSet]),
    JSON.stringify(changeLog),
    approvedSet.size,
    scoreBefore,
    scoreAfter,
    job.upload_key, // TODO: replace with optimized key once rewrite is implemented
    jobId
  ).run();

  return {
    id: jobId,
    status: 'built',
    approved_count: approvedSet.size,
    score_before: scoreBefore,
    score_after_estimate: scoreAfter,
    change_log: changeLog,
  };
}

// TODO: this is where the real codebase rewrite happens. It currently just
// echoes the approved changes so the end-to-end flow can be exercised. To
// actually modify the uploaded ZIP, implement:
//   1. Download job.upload_key from R2
//   2. Parse ZIP entries (use listZipFiles + inflate per-entry)
//   3. For each approved change: mutate the target file(s) in-memory
//   4. Rebuild ZIP (deflate each entry, assemble central directory)
//   5. Upload to R2 as `optimized/${jobId}.zip`, write key back to job row
async function applyOptimizations(_db, _env, job, approvedSet) {
  const findings = JSON.parse(job.findings || '{}');
  const all = [...(findings.critical || []), ...(findings.important || []), ...(findings.mirrors || [])];
  return all
    .filter(item => approvedSet.has(item.id))
    .map(item => ({ id: item.id, title: item.title, target: item.target || '(pending)', status: 'pending-rewrite' }));
}

async function getJob(db, jobId) {
  const row = await db.prepare(`SELECT * FROM llmready_jobs WHERE id = ?`).bind(jobId).first();
  if (!row) return null;
  return {
    id: row.id,
    audit_id: row.audit_id,
    status: row.status,
    platform: row.platform,
    business_info: tryParse(row.business_info, {}),
    findings: tryParse(row.findings, {}),
    approved_changes: tryParse(row.approved_changes, []),
    change_log: tryParse(row.change_log, []),
    files_analyzed: row.files_analyzed,
    issues_found: row.issues_found,
    issues_fixed: row.issues_fixed,
    score_before: row.score_before,
    score_after_estimate: row.score_after_estimate,
    error: row.error,
    created_at: row.created_at,
    completed_at: row.completed_at,
  };
}

function tryParse(s, fb) { try { return s ? JSON.parse(s) : fb; } catch { return fb; } }

// ---------------------------------------------------------------------------
// ZIP parsing — minimal central-directory reader
// ---------------------------------------------------------------------------
//
// Parses the End-Of-Central-Directory record and walks the central directory
// to enumerate file names. Does NOT inflate entries — that's for the rewrite
// step. This is enough to detect platform and produce findings.

const EOCD_SIG  = 0x06054b50;  // End of central directory
const CDH_SIG   = 0x02014b50;  // Central directory file header

function listZipFiles(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // Find EOCD by scanning backwards from the end
  let eocdOffset = -1;
  const maxScan = Math.min(bytes.length, 0xFFFF + 22);
  for (let i = bytes.length - 22; i >= bytes.length - maxScan && i >= 0; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocdOffset = i; break; }
  }
  if (eocdOffset < 0) throw new Error('ZIP EOCD not found');

  const cdEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset  = view.getUint32(eocdOffset + 16, true);

  const files = [];
  let p = cdOffset;
  const decoder = new TextDecoder('utf-8', { fatal: false });
  for (let i = 0; i < cdEntries; i++) {
    if (view.getUint32(p, true) !== CDH_SIG) break;
    const nameLen    = view.getUint16(p + 28, true);
    const extraLen   = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const uncompSize = view.getUint32(p + 24, true);
    const localOff   = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    files.push({ name, size: uncompSize, localOffset: localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

// ---------------------------------------------------------------------------
// Platform detection + findings
// ---------------------------------------------------------------------------

function detectPlatform(files) {
  const names = files.map(f => f.name.toLowerCase());
  if (names.some(n => n.includes('templates/') && n.endsWith('.liquid'))) return 'shopify';
  if (names.some(n => n.endsWith('wp-config.php') || n.endsWith('functions.php') || n.includes('wp-content/'))) return 'wordpress';
  if (names.some(n => n === 'next.config.js' || n === 'next.config.mjs' || n.startsWith('app/') || n.startsWith('pages/'))) return 'nextjs';
  if (names.some(n => n === 'index.html' || n.endsWith('/index.html'))) return 'static';
  return 'unknown';
}

function buildFindings(platform, files) {
  const hasLlmsTxt = files.some(f => f.name === 'llms.txt' || f.name.endsWith('/llms.txt'));
  const hasRobots  = files.some(f => f.name === 'robots.txt' || f.name.endsWith('/robots.txt'));
  const htmlFiles  = files.filter(f => f.name.endsWith('.html'));

  const critical = [];
  const important = [];
  const mirrors = [];

  critical.push({
    id: 'schema_missing',
    title: 'Inject LocalBusiness / Organization schema',
    desc: `Add JSON-LD to the <head> of the ${platform === 'shopify' ? 'theme layout' : platform === 'wordpress' ? 'header template' : 'main HTML'} so AI search can cite your business data.`,
    target: platformHeadTarget(platform),
  });
  if (!hasLlmsTxt) {
    critical.push({
      id: 'llms_txt_missing',
      title: 'Create llms.txt and .well-known/llm.txt',
      desc: 'Briefing document for AI crawlers — site description, page inventory, entity declarations.',
      target: '/llms.txt, /.well-known/llm.txt',
    });
  }
  if (htmlFiles.length > 0) {
    critical.push({
      id: 'meta_missing',
      title: `Audit meta tags across ${htmlFiles.length} HTML file${htmlFiles.length === 1 ? '' : 's'}`,
      desc: 'Generate missing <title>, <meta description>, Open Graph, Twitter Card, canonical tags.',
      target: htmlFiles.slice(0, 5).map(f => f.name).join(', ') + (htmlFiles.length > 5 ? `, +${htmlFiles.length - 5} more` : ''),
    });
  }

  important.push({
    id: 'og_missing',
    title: 'Add Open Graph tags',
    desc: 'og:title, og:description, og:image, og:type, og:url.',
    target: platformHeadTarget(platform),
  });
  important.push({
    id: 'faq_schema',
    title: 'Generate FAQPage schema',
    desc: 'Extract Q&A pairs from page content, emit FAQPage JSON-LD.',
    target: platformHeadTarget(platform),
  });
  important.push({
    id: 'twitter_card',
    title: 'Add Twitter Card tags',
    desc: 'summary_large_image card for link previews in X/Twitter and LLM context.',
    target: platformHeadTarget(platform),
  });
  if (!hasRobots) {
    important.push({
      id: 'robots_ai_allow',
      title: 'Create robots.txt with AI crawler allowances',
      desc: 'Explicitly allow GPTBot, ClaudeBot, PerplexityBot, Google-Extended.',
      target: '/robots.txt',
    });
  } else {
    important.push({
      id: 'robots_ai_allow',
      title: 'Update robots.txt to allow AI crawlers',
      desc: 'Current robots.txt may block AI crawlers — add explicit allowances.',
      target: '/robots.txt',
    });
  }
  important.push({
    id: 'alt_text',
    title: 'Generate descriptive alt text for images',
    desc: 'Replace empty/generic alt attributes with context-aware descriptions.',
    target: 'all .html / template files',
  });

  // Content mirrors — most valuable for JS-heavy platforms
  if (platform === 'nextjs' || platform === 'shopify') {
    mirrors.push({
      id: 'mirror_index',
      title: 'Create /content-mirror/index.md',
      desc: 'Markdown mirror of the home page — extractable even when JS crawling fails.',
      target: '/content-mirror/index.md',
    });
    mirrors.push({
      id: 'mirror_services',
      title: 'Create /content-mirror/services.md',
      desc: 'Markdown mirror of the services/products page.',
      target: '/content-mirror/services.md',
    });
  }

  return { critical, important, mirrors };
}

function platformHeadTarget(platform) {
  switch (platform) {
    case 'shopify':   return 'layout/theme.liquid';
    case 'wordpress': return 'header.php';
    case 'nextjs':    return 'app/layout.tsx';
    case 'static':    return 'index.html (and all other .html files)';
    default:          return '<head> of main template';
  }
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

async function streamDownload(db, env, jobId, which /* 'zip' | 'report' */) {
  const job = await db.prepare(`SELECT * FROM llmready_jobs WHERE id = ?`).bind(jobId).first();
  if (!job) return new Response('Not found', { status: 404 });

  const key = which === 'report'
    ? (job.report_key || null)
    : (job.optimized_key || job.upload_key);

  if (!key || !env.FILES) {
    return new Response(
      which === 'report'
        ? 'Change report not yet generated. Approve changes first, then download.'
        : 'Optimized ZIP not yet built. Approve changes first.',
      { status: 409 }
    );
  }

  const obj = await env.FILES.get(key);
  if (!obj) return new Response('File missing from storage', { status: 404 });

  const headers = new Headers();
  if (which === 'report') {
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.set('Content-Disposition', `inline; filename="llmready-report-${jobId}.html"`);
  } else {
    headers.set('Content-Type', 'application/zip');
    headers.set('Content-Disposition', `attachment; filename="llmready-optimized-${jobId}.zip"`);
  }
  return new Response(obj.body, { headers });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    const origin = request.headers.get('Origin');

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const db = env.LLM_DB;
    if (!db) return jsonResponse({ error: 'LLM_DB binding not configured' }, 500, origin);

    try {
      await ensureSchema(db);
    } catch (e) {
      return jsonResponse({ error: 'Schema init failed: ' + e.message }, 500, origin);
    }

    // All routes require auth
    if (!validateToken(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, origin);
    }

    try {
      // POST /api/llmready/audit
      if (path === '/api/llmready/audit' && method === 'POST') {
        const body = await request.json();
        if (!body.url) return jsonResponse({ error: 'url required' }, 400, origin);
        try { new URL(body.url); } catch { return jsonResponse({ error: 'invalid url' }, 400, origin); }
        const result = await startAudit(db, env, ctx, body.url);
        return jsonResponse(result, 202, origin);
      }

      // GET /api/llmready/audit/:id
      const auditGet = path.match(/^\/api\/llmready\/audit\/([a-zA-Z0-9-]+)$/);
      if (auditGet && method === 'GET') {
        const audit = await getAudit(db, auditGet[1]);
        if (!audit) return jsonResponse({ error: 'Not found' }, 404, origin);
        return jsonResponse(audit, 200, origin);
      }

      // GET /api/llmready/audit/:id/fixes  (generate + return)
      // POST same path to force regeneration; GET returns cached if present.
      const fixMatch = path.match(/^\/api\/llmready\/audit\/([a-zA-Z0-9-]+)\/fixes$/);
      if (fixMatch && (method === 'GET' || method === 'POST')) {
        const auditId = fixMatch[1];
        if (method === 'GET') {
          const existing = await getFixes(db, auditId);
          if (existing) return jsonResponse(existing, 200, origin);
        }
        let businessInfo = {};
        if (method === 'POST') {
          try { businessInfo = await request.json(); } catch {}
        }
        const fixes = await generateFixes(db, env, auditId, businessInfo);
        return jsonResponse(fixes, 200, origin);
      }

      // POST /api/llmready/optimize  (multipart upload)
      if (path === '/api/llmready/optimize' && method === 'POST') {
        const form = await request.formData();
        const file = form.get('file');
        if (!file || typeof file === 'string') {
          return jsonResponse({ error: 'file required' }, 400, origin);
        }
        const businessInfo = {
          name: form.get('business_name') || '',
          phone: form.get('business_phone') || '',
          address: form.get('business_address') || '',
          services: String(form.get('business_services') || '').split(',').map(s => s.trim()).filter(Boolean),
          description: form.get('business_description') || '',
        };
        const auditId = form.get('audit_id') || null;
        const result = await createOptimizeJob(db, env, { file, businessInfo, auditId });
        return jsonResponse(result, 201, origin);
      }

      // GET /api/llmready/optimize/:id
      const jobGet = path.match(/^\/api\/llmready\/optimize\/([a-zA-Z0-9-]+)$/);
      if (jobGet && method === 'GET') {
        const job = await getJob(db, jobGet[1]);
        if (!job) return jsonResponse({ error: 'Not found' }, 404, origin);
        return jsonResponse(job, 200, origin);
      }

      // POST /api/llmready/optimize/:id/approve
      const approveMatch = path.match(/^\/api\/llmready\/optimize\/([a-zA-Z0-9-]+)\/approve$/);
      if (approveMatch && method === 'POST') {
        const body = await request.json();
        const result = await approveOptimizeJob(db, env, approveMatch[1], body.approved || []);
        return jsonResponse(result, 200, origin);
      }

      // GET /api/llmready/optimize/:id/download
      const dlMatch = path.match(/^\/api\/llmready\/optimize\/([a-zA-Z0-9-]+)\/download$/);
      if (dlMatch && method === 'GET') {
        return streamDownload(db, env, dlMatch[1], 'zip');
      }

      // GET /api/llmready/optimize/:id/report
      const reportMatch = path.match(/^\/api\/llmready\/optimize\/([a-zA-Z0-9-]+)\/report$/);
      if (reportMatch && method === 'GET') {
        return streamDownload(db, env, reportMatch[1], 'report');
      }

      return jsonResponse({ error: 'Not found', path }, 404, origin);
    } catch (err) {
      console.error('Handler error:', err);
      return jsonResponse({ error: err.message || 'Internal error' }, 500, origin);
    }
  },
};
