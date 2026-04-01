import { validateToken, corsHeaders, jsonResponse, htmlResponse } from './auth.js';
import { checkSEOPositions } from './checkers/seo.js';
import { checkLLMRecommendations } from './checkers/llm.js';
import { checkPresence } from './checkers/presence.js';
import { checkAEO } from './checkers/aeo.js';
import { calculateScores } from './scoring.js';
import { generateReport } from './report.js';

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function randomId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// Seed data for first-run initialization
const SEED_CLIENTS = [
  {
    name: 'Rich Valley Adventures',
    domain: 'richvalleyadventures.com',
    location: 'Aspen, CO',
    description: 'Adventure tourism and luxury private transportation in Aspen, Colorado. Fly fishing, horseback riding, paddle boarding, hiking, glamping, and scenic tours plus Aspen Alpenglow Limousine black car service.',
    keywords: [
      { keyword: 'best fly fishing guide Aspen Colorado', volume: 'High', category: 'adventure' },
      { keyword: 'Aspen limo service', volume: 'High', category: 'transport' },
      { keyword: 'black car service Aspen airport', volume: 'High', category: 'transport' },
      { keyword: 'outdoor adventure tours Aspen Colorado', volume: 'Med', category: 'adventure' },
      { keyword: 'luxury glamping Aspen Colorado', volume: 'Med', category: 'adventure' },
      { keyword: 'Aspen horseback riding guided', volume: 'Med', category: 'adventure' },
      { keyword: 'Aspen airport transportation private SUV', volume: 'High', category: 'transport' },
      { keyword: '"Rich Valley Adventures"', volume: 'Branded', category: 'brand' },
      { keyword: '"Aspen Alpenglow Limousine"', volume: 'Branded', category: 'brand' },
    ],
    prompts: [
      'What are the best guided fly fishing tours in Aspen?',
      'Recommend a limo service for Aspen airport transfer',
      'Best outdoor adventure companies in Aspen Colorado',
      'Luxury glamping near Aspen with guided activities',
      'Black car service Roaring Fork Valley weddings',
    ],
    detection_terms: {
      names: ['Rich Valley Adventures', 'Aspen Alpenglow Limousine', 'Aspen Alpenglow'],
      domains: ['richvalleyadventures.com', 'aspenalpenglowlimousine.com'],
      aliases: ['RVA', 'Alpenglow Limo', 'Kit McLendon'],
    },
  },
  {
    name: 'Rockwell Barbell',
    domain: 'rockwellbarbell.com',
    location: 'Chicago, IL',
    description: "Powerlifting-based facility in Chicago's Lakeview/Logan Square neighborhoods. Gym membership, personal training, and monthly programming. Specializes in powerlifting, bodybuilding, sport performance, corrective exercise, body alignment, and strength & conditioning.",
    keywords: [
      { keyword: 'best powerlifting gym Chicago', volume: 'High', category: 'powerlifting' },
      { keyword: 'personal training Chicago Lakeview', volume: 'High', category: 'personal training' },
      { keyword: 'bodybuilding gym Chicago', volume: 'Med', category: 'bodybuilding' },
      { keyword: 'sport performance training Chicago', volume: 'Med', category: 'sport performance' },
      { keyword: 'corrective exercise gym Chicago', volume: 'Low', category: 'corrective exercise' },
      { keyword: 'strength and conditioning Chicago', volume: 'Med', category: 's&c' },
      { keyword: 'gym membership Chicago north side', volume: 'High', category: 'general' },
      { keyword: 'monthly workout programming Chicago', volume: 'Low', category: 'programming' },
      { keyword: '"Rockwell Barbell"', volume: 'Branded', category: 'brand' },
      { keyword: '"Rockwell Barbell" Chicago', volume: 'Branded', category: 'brand' },
    ],
    prompts: [
      'Best powerlifting gym in Chicago?',
      'Where can I find a personal trainer in Lakeview Chicago?',
      'Best bodybuilding gym in Chicago?',
      'Corrective exercise or body alignment specialist in Chicago?',
      'Sport performance and strength conditioning gym Chicago?',
    ],
    detection_terms: {
      names: ['Rockwell Barbell'],
      domains: ['rockwellbarbell.com'],
      aliases: ['RWBB', 'Lawrence Scott', 'Rockwell'],
    },
  },
];

async function ensureTablesAndSeed(db) {
  // Create tables
  await db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
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
      id TEXT PRIMARY KEY,
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
  `);

  // Check if clients exist
  const existing = await db.prepare('SELECT COUNT(*) as count FROM clients').first();
  if (existing.count === 0) {
    for (const client of SEED_CLIENTS) {
      const id = randomId();
      const slug = slugify(client.name);
      await db.prepare(
        `INSERT INTO clients (id, slug, name, domain, keywords, prompts, detection_terms, location, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, slug, client.name, client.domain,
        JSON.stringify(client.keywords), JSON.stringify(client.prompts),
        JSON.stringify(client.detection_terms), client.location, client.description
      ).run();
    }
  }
}

// === ROUTE HANDLERS ===

async function handleListClients(db) {
  const clients = await db.prepare(`
    SELECT c.*,
      (SELECT a.score_total FROM audits a WHERE a.client_id = c.id ORDER BY a.started_at DESC LIMIT 1) as latest_score,
      (SELECT a.status FROM audits a WHERE a.client_id = c.id ORDER BY a.started_at DESC LIMIT 1) as latest_status,
      (SELECT a.id FROM audits a WHERE a.client_id = c.id ORDER BY a.started_at DESC LIMIT 1) as latest_audit_id,
      (SELECT a.started_at FROM audits a WHERE a.client_id = c.id ORDER BY a.started_at DESC LIMIT 1) as latest_audit_date,
      (SELECT COUNT(*) FROM audits a WHERE a.client_id = c.id) as audit_count
    FROM clients c ORDER BY c.name
  `).all();
  return clients.results;
}

async function handleGetClient(db, clientId) {
  return await db.prepare('SELECT * FROM clients WHERE id = ?').bind(clientId).first();
}

async function handleCreateClient(db, body) {
  const id = randomId();
  const slug = slugify(body.name);

  await db.prepare(
    `INSERT INTO clients (id, slug, name, domain, keywords, prompts, detection_terms, location, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, slug, body.name, body.domain,
    JSON.stringify(body.keywords || []),
    JSON.stringify(body.prompts || []),
    JSON.stringify(body.detection_terms || { names: [], domains: [], aliases: [] }),
    body.location || null,
    body.description || null
  ).run();

  return { id, slug };
}

async function handleUpdateClient(db, clientId, body) {
  const fields = [];
  const values = [];

  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.domain !== undefined) { fields.push('domain = ?'); values.push(body.domain); }
  if (body.location !== undefined) { fields.push('location = ?'); values.push(body.location); }
  if (body.description !== undefined) { fields.push('description = ?'); values.push(body.description); }
  if (body.keywords !== undefined) { fields.push('keywords = ?'); values.push(JSON.stringify(body.keywords)); }
  if (body.prompts !== undefined) { fields.push('prompts = ?'); values.push(JSON.stringify(body.prompts)); }
  if (body.detection_terms !== undefined) { fields.push('detection_terms = ?'); values.push(JSON.stringify(body.detection_terms)); }
  if (body.name !== undefined) { fields.push('slug = ?'); values.push(slugify(body.name)); }

  fields.push("updated_at = datetime('now')");
  values.push(clientId);

  await db.prepare(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();
  return { updated: true };
}

async function handleDeleteClient(db, clientId) {
  await db.prepare('DELETE FROM audits WHERE client_id = ?').bind(clientId).run();
  await db.prepare('DELETE FROM clients WHERE id = ?').bind(clientId).run();
  return { deleted: true };
}

async function handleRunAudit(db, env, ctx, body) {
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(body.client_id).first();
  if (!client) return null;

  const auditId = randomId();
  const shareToken = randomToken();

  await db.prepare(
    `INSERT INTO audits (id, client_id, status, share_token) VALUES (?, ?, 'running', ?)`
  ).bind(auditId, client.id, shareToken).run();

  // Run audit asynchronously
  ctx.waitUntil(runAuditChecks(db, env, auditId, client));

  return { audit_id: auditId, share_token: shareToken, status: 'running' };
}

async function runAuditChecks(db, env, auditId, client) {
  try {
    const keywords = JSON.parse(client.keywords);
    const prompts = JSON.parse(client.prompts);
    const detectionTerms = JSON.parse(client.detection_terms);

    // Run all checks in parallel
    const [seoResults, llmResults, presenceResults, aeoResults] = await Promise.all([
      checkSEOPositions(keywords, client.domain, env).catch(e => {
        console.error('SEO check failed:', e);
        return [];
      }),
      checkLLMRecommendations(prompts, detectionTerms, env).catch(e => {
        console.error('LLM check failed:', e);
        return [];
      }),
      checkPresence(client.name, client.domain, client.location, env).catch(e => {
        console.error('Presence check failed:', e);
        return [];
      }),
      checkAEO(client.domain).catch(e => {
        console.error('AEO check failed:', e);
        return { schema_types_found: [], schema_types_missing: [], has_faq_page: false, has_blog: false, has_llms_txt: false, nap_consistent: false, ai_overview_appearances: 0, service_pages_count: 0, structured_data_score: 0 };
      }),
    ]);

    const scores = calculateScores(seoResults, llmResults, presenceResults, aeoResults);

    await db.prepare(`
      UPDATE audits SET
        status = 'complete',
        score_seo = ?, score_aeo = ?, score_llm = ?, score_presence = ?, score_total = ?,
        results_seo = ?, results_aeo = ?, results_llm = ?, results_presence = ?,
        completed_at = datetime('now')
      WHERE id = ?
    `).bind(
      scores.score_seo, scores.score_aeo, scores.score_llm, scores.score_presence, scores.score_total,
      JSON.stringify(seoResults), JSON.stringify(aeoResults), JSON.stringify(llmResults), JSON.stringify(presenceResults),
      auditId
    ).run();
  } catch (err) {
    console.error('Audit failed:', err);
    await db.prepare("UPDATE audits SET status = 'failed', completed_at = datetime('now') WHERE id = ?")
      .bind(auditId).run();
  }
}

async function handleGetAudit(db, auditId) {
  return await db.prepare('SELECT * FROM audits WHERE id = ?').bind(auditId).first();
}

async function handleGetHistory(db, clientId) {
  const audits = await db.prepare(
    'SELECT id, status, score_seo, score_aeo, score_llm, score_presence, score_total, started_at, completed_at, share_token FROM audits WHERE client_id = ? ORDER BY started_at DESC'
  ).bind(clientId).all();
  return audits.results;
}

async function handleCompare(db, id1, id2) {
  const [a1, a2] = await Promise.all([
    db.prepare('SELECT a.*, c.name as client_name FROM audits a JOIN clients c ON a.client_id = c.id WHERE a.id = ?').bind(id1).first(),
    db.prepare('SELECT a.*, c.name as client_name FROM audits a JOIN clients c ON a.client_id = c.id WHERE a.id = ?').bind(id2).first(),
  ]);
  return { audit1: a1, audit2: a2 };
}

async function handleReport(db, auditId, shareToken) {
  let audit;
  if (shareToken) {
    audit = await db.prepare(
      'SELECT a.*, c.name as client_name, c.domain, c.location, c.description, c.keywords, c.prompts, c.detection_terms FROM audits a JOIN clients c ON a.client_id = c.id WHERE a.id = ? AND a.share_token = ?'
    ).bind(auditId, shareToken).first();
  } else {
    audit = await db.prepare(
      'SELECT a.*, c.name as client_name, c.domain, c.location, c.description, c.keywords, c.prompts, c.detection_terms FROM audits a JOIN clients c ON a.client_id = c.id WHERE a.id = ?'
    ).bind(auditId).first();
  }
  return audit;
}

// === MAIN ROUTER ===

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get('Origin')) });
    }

    const origin = request.headers.get('Origin');
    const db = env.AUDIT_DB;

    // Ensure tables exist
    await ensureTablesAndSeed(db);

    // === SHAREABLE REPORT (no auth needed) ===
    // GET /api/audits/report/:id?token=:shareToken
    const reportMatch = path.match(/^\/api\/audits\/report\/([a-f0-9]+)$/);
    if (reportMatch && method === 'GET') {
      const token = url.searchParams.get('token');
      const auditId = reportMatch[1];

      // If token provided, serve without auth; otherwise require auth
      if (token) {
        const audit = await handleReport(db, auditId, token);
        if (!audit) return jsonResponse({ error: 'Not found or invalid token' }, 404, origin);
        if (audit.status !== 'complete') return jsonResponse({ error: 'Audit not yet complete' }, 202, origin);
        const html = generateReport(audit);
        return htmlResponse(html);
      }

      // No token — require admin auth
      if (!validateToken(request, env)) {
        return jsonResponse({ error: 'Unauthorized' }, 401, origin);
      }
      const audit = await handleReport(db, auditId, null);
      if (!audit) return jsonResponse({ error: 'Not found' }, 404, origin);
      if (audit.status !== 'complete') return jsonResponse({ error: 'Audit not yet complete' }, 202, origin);
      const html = generateReport(audit);
      return htmlResponse(html);
    }

    // === ALL OTHER ROUTES REQUIRE AUTH ===
    if (!validateToken(request, env)) {
      return jsonResponse({ error: 'Unauthorized' }, 401, origin);
    }

    // POST /api/audits/clients — Create client
    if (path === '/api/audits/clients' && method === 'POST') {
      const body = await request.json();
      if (!body.name || !body.domain) {
        return jsonResponse({ error: 'name and domain required' }, 400, origin);
      }
      const result = await handleCreateClient(db, body);
      return jsonResponse(result, 201, origin);
    }

    // GET /api/audits/clients — List clients
    if (path === '/api/audits/clients' && method === 'GET') {
      const clients = await handleListClients(db);
      return jsonResponse(clients, 200, origin);
    }

    // GET /api/audits/clients/:id — Get client
    const clientGetMatch = path.match(/^\/api\/audits\/clients\/([a-f0-9]+)$/);
    if (clientGetMatch && method === 'GET') {
      const client = await handleGetClient(db, clientGetMatch[1]);
      if (!client) return jsonResponse({ error: 'Not found' }, 404, origin);
      return jsonResponse(client, 200, origin);
    }

    // PUT /api/audits/clients/:id — Update client
    if (clientGetMatch && method === 'PUT') {
      const body = await request.json();
      const result = await handleUpdateClient(db, clientGetMatch[1], body);
      return jsonResponse(result, 200, origin);
    }

    // DELETE /api/audits/clients/:id — Delete client
    if (clientGetMatch && method === 'DELETE') {
      const result = await handleDeleteClient(db, clientGetMatch[1]);
      return jsonResponse(result, 200, origin);
    }

    // POST /api/audits/run — Run audit
    if (path === '/api/audits/run' && method === 'POST') {
      const body = await request.json();
      if (!body.client_id) return jsonResponse({ error: 'client_id required' }, 400, origin);
      const result = await handleRunAudit(db, env, ctx, body);
      if (!result) return jsonResponse({ error: 'Client not found' }, 404, origin);
      return jsonResponse(result, 202, origin);
    }

    // GET /api/audits/history/:client_id — Audit history
    const historyMatch = path.match(/^\/api\/audits\/history\/([a-f0-9]+)$/);
    if (historyMatch && method === 'GET') {
      const history = await handleGetHistory(db, historyMatch[1]);
      return jsonResponse(history, 200, origin);
    }

    // GET /api/audits/compare/:id1/:id2 — Compare audits
    const compareMatch = path.match(/^\/api\/audits\/compare\/([a-f0-9]+)\/([a-f0-9]+)$/);
    if (compareMatch && method === 'GET') {
      const result = await handleCompare(db, compareMatch[1], compareMatch[2]);
      return jsonResponse(result, 200, origin);
    }

    // GET /api/audits/:id — Get audit
    const auditGetMatch = path.match(/^\/api\/audits\/([a-f0-9]+)$/);
    if (auditGetMatch && method === 'GET') {
      const audit = await handleGetAudit(db, auditGetMatch[1]);
      if (!audit) return jsonResponse({ error: 'Not found' }, 404, origin);
      return jsonResponse(audit, 200, origin);
    }

    return jsonResponse({ error: 'Not found' }, 404, origin);
  },
};
