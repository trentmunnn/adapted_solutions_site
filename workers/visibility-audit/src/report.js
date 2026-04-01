export function generateReport(audit) {
  const clientName = audit.client_name || 'Client';
  const domain = audit.domain || '';
  const location = audit.location || '';
  const auditDate = audit.completed_at ? new Date(audit.completed_at + 'Z').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Pending';
  const totalScore = audit.score_total || 0;
  const scoreColor = totalScore <= 30 ? 'var(--red)' : totalScore <= 60 ? 'var(--yellow)' : 'var(--green)';

  const seoResults = safeJSON(audit.results_seo, []);
  const llmResults = safeJSON(audit.results_llm, []);
  const presenceResults = safeJSON(audit.results_presence, []);
  const aeoResults = safeJSON(audit.results_aeo, {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Digital Visibility Audit — ${esc(clientName)} | Adapted Solutions Co</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Instrument+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${CSS}
</style>
</head>
<body>

<div class="header">
  <div class="header-inner">
    <div>
      <div class="brand-label">Adapted Solutions Co — Digital Visibility Audit</div>
      <h1 class="title">${esc(clientName)}</h1>
      <p class="subtitle">${esc(location)}${location ? ' • ' : ''}Captured ${auditDate}</p>
    </div>
    <div class="score-box" style="background:${scoreColor}15;border-color:${scoreColor}55">
      <div class="num" style="color:${scoreColor}">${totalScore}</div>
      <div class="label" style="color:${scoreColor}">Overall / 100</div>
    </div>
  </div>
  <div class="tabs" id="tabs">
    <button class="tab active" data-tab="overview">Overview</button>
    <button class="tab" data-tab="seo">SEO & Positions</button>
    <button class="tab" data-tab="aeo">AEO / GEO</button>
    <button class="tab" data-tab="llm">LLM × Model</button>
    <button class="tab" data-tab="presence">Digital Presence</button>
    <button class="tab" data-tab="actions">Next Best Actions</button>
    <button class="tab" data-tab="method">Methodology</button>
  </div>
</div>

<div class="content" id="content"></div>

<div class="footer">Prepared by <span>Adapted Solutions Co</span> • adaptedsolutionsco.com • ${auditDate}</div>

<script>
const AUDIT = ${JSON.stringify({
    client_name: clientName,
    domain,
    location,
    score_seo: audit.score_seo,
    score_aeo: audit.score_aeo,
    score_llm: audit.score_llm,
    score_presence: audit.score_presence,
    score_total: totalScore,
    seo: seoResults,
    llm: llmResults,
    presence: presenceResults,
    aeo: aeoResults,
  })};

${REPORT_JS}
</script>
</body>
</html>`;
}

function safeJSON(str, fallback) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const CSS = `
:root {
  --gold: #c4a35a; --dark: #0d1117; --card: #161b22; --border: #30363d;
  --red: #f85149; --yellow: #d29922; --green: #3fb950; --blue: #58a6ff;
  --purple: #bc8cff; --muted: #8b949e; --white: #e6edf3;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--dark); color: var(--white); font-family: 'Instrument Sans', 'Segoe UI', system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.mono { font-family: 'DM Mono', monospace; }
.header { border-bottom: 1px solid var(--border); padding: 32px 32px 0; }
.header-inner { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px; max-width: 1200px; margin: 0 auto; }
.brand-label { font-size: 11px; color: var(--gold); letter-spacing: 0.15em; text-transform: uppercase; font-weight: 600; font-family: 'DM Mono', monospace; margin-bottom: 8px; }
.title { font-size: 28px; font-weight: 700; line-height: 1.2; }
.title span { color: var(--muted); font-weight: 400; }
.subtitle { color: var(--muted); margin-top: 8px; font-size: 14px; }
.score-box { border-radius: 10px; padding: 12px 20px; text-align: center; border: 1px solid; }
.score-box .num { font-size: 32px; font-weight: 700; font-family: 'DM Mono', monospace; }
.score-box .label { font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; }
.tabs { display: flex; gap: 0; margin-top: 24px; overflow-x: auto; max-width: 1200px; margin-left: auto; margin-right: auto; }
.tab { background: none; border: none; color: var(--muted); border-bottom: 2px solid transparent; padding: 10px 16px; font-size: 13px; font-weight: 600; cursor: pointer; letter-spacing: 0.02em; white-space: nowrap; transition: all 0.2s; font-family: inherit; }
.tab:hover { color: var(--white); }
.tab.active { color: var(--gold); border-bottom-color: var(--gold); }
.content { padding: 32px; max-width: 1200px; margin: 0 auto; }
.tab-panel { display: none; flex-direction: column; gap: 24px; }
.tab-panel.active { display: flex; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 24px; }
.card.accent-gold { border-top: 3px solid var(--gold); }
.card.accent-red { border-top: 3px solid var(--red); }
.card.accent-yellow { border-top: 3px solid var(--yellow); }
.card.accent-blue { border-top: 3px solid var(--blue); }
.card-title { margin: 0 0 4px; font-size: 14px; font-weight: 600; color: var(--white); letter-spacing: 0.04em; text-transform: uppercase; font-family: 'DM Mono', monospace; }
.card-subtitle { margin: 0 0 16px; font-size: 12px; color: var(--muted); }
.gauges { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 24px; }
.gauge { text-align: center; }
.gauge-ring { position: relative; width: 100px; height: 100px; margin: 0 auto; }
.gauge-ring svg { transform: rotate(-90deg); }
.gauge-value { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 22px; font-weight: 700; color: var(--white); font-family: 'DM Mono', monospace; }
.gauge-value span { font-size: 11px; color: var(--muted); }
.gauge-label { margin-top: 8px; font-size: 11px; color: var(--muted); letter-spacing: 0.05em; text-transform: uppercase; }
.badge { display: inline-flex; align-items: center; gap: 5px; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 600; }
.badge-red { background: rgba(248,81,73,0.15); color: var(--red); }
.badge-green { background: rgba(63,185,80,0.15); color: var(--green); }
.badge-yellow { background: rgba(210,153,34,0.15); color: var(--yellow); }
.badge-blue { background: rgba(88,166,255,0.15); color: var(--blue); }
.badge-muted { background: rgba(139,148,158,0.15); color: var(--muted); }
.row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(48,54,61,0.13); }
.row-label { color: var(--muted); font-size: 13px; flex: 1; }
.row-right { display: flex; align-items: center; gap: 10px; }
.row-value { color: var(--white); font-size: 13px; font-family: 'DM Mono', monospace; }
.pos-cell { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 28px; border-radius: 6px; font-family: 'DM Mono', monospace; font-weight: 700; font-size: 12px; }
.pos-red { background: rgba(248,81,73,0.12); border: 1px solid rgba(248,81,73,0.25); color: var(--red); font-size: 11px; }
.pos-green { background: rgba(63,185,80,0.12); border: 1px solid rgba(63,185,80,0.25); color: var(--green); }
.pos-yellow { background: rgba(210,153,34,0.12); border: 1px solid rgba(210,153,34,0.25); color: var(--yellow); }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th { text-align: left; padding: 10px 8px; color: var(--gold); font-size: 11px; font-weight: 600; letter-spacing: 0.05em; }
th.center { text-align: center; }
td { padding: 12px 8px; vertical-align: top; border-bottom: 1px solid rgba(48,54,61,0.13); }
td.center { text-align: center; vertical-align: middle; }
thead tr { border-bottom: 2px solid var(--border); }
.findings { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
.finding { display: flex; gap: 12px; padding: 12px; border-radius: 8px; }
.finding-icon { font-size: 20px; }
.finding-label { font-size: 13px; font-weight: 600; color: var(--white); }
.finding-detail { font-size: 12px; margin-top: 2px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 20px; }
.stat { text-align: center; padding: 14px; background: var(--dark); border-radius: 8px; border: 1px solid var(--border); }
.stat-value { font-size: 24px; font-weight: 700; font-family: 'DM Mono', monospace; }
.stat-label { font-size: 10px; color: var(--muted); margin-top: 2px; text-transform: uppercase; letter-spacing: 0.05em; }
.stat-sub { font-size: 9px; margin-top: 2px; }
.llm-scores { display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
.llm-card { flex: 1; min-width: 100px; text-align: center; padding: 14px; background: var(--dark); border-radius: 8px; border: 1px solid var(--border); }
.llm-card .icon { font-size: 20px; margin-bottom: 4px; }
.llm-card .name { font-size: 12px; font-weight: 600; color: var(--white); }
.llm-card .score { font-size: 22px; font-weight: 700; font-family: 'DM Mono', monospace; margin-top: 4px; }
.llm-card .method { font-size: 8px; color: var(--muted); margin-top: 4px; }
.llm-prompt-row { cursor: pointer; transition: background 0.15s; }
.llm-prompt-row:hover { background: rgba(88,166,255,0.04); }
.llm-prompt-row.expanded { background: rgba(88,166,255,0.06); }
.llm-detail { display: none; background: rgba(88,166,255,0.03); }
.llm-detail.show { display: table-row; }
.llm-detail-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; padding: 8px; }
.llm-detail-card { padding: 10px; background: var(--dark); border-radius: 6px; border: 1px solid var(--border); }
.llm-detail-name { font-size: 11px; font-weight: 600; margin-bottom: 4px; }
.llm-detail-text { font-size: 10px; color: var(--muted); line-height: 1.5; }
.grand-total { margin-top: 20px; padding: 16px; border-radius: 8px; border: 1px solid; text-align: center; }
.grand-total .num { font-size: 36px; font-weight: 700; font-family: 'DM Mono', monospace; }
.grand-total .label { font-size: 12px; margin-top: 4px; }
.section-label { font-size: 11px; color: var(--gold); font-weight: 600; letter-spacing: 0.1em; margin: 20px 0 8px; }
.section-label:first-child { margin-top: 0; }
.action-item { padding: 16px; background: var(--dark); border-radius: 8px; border: 1px solid var(--border); border-left-width: 3px; }
.action-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap; }
.action-title { font-size: 13px; font-weight: 600; color: var(--white); }
.action-desc { font-size: 12px; color: var(--muted); line-height: 1.6; }
.action-pills { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.pill { font-size: 9px; padding: 2px 6px; border-radius: 4px; }
.callout-gold { padding: 16px; background: rgba(196,163,90,0.08); border-radius: 8px; border: 1px solid rgba(196,163,90,0.25); }
.callout-gold .callout-title { color: var(--gold); font-size: 13px; font-weight: 600; margin-bottom: 8px; }
.callout-gold p { color: var(--muted); font-size: 12px; margin: 0; line-height: 1.7; }
.prompt-arrow { color: var(--muted); font-size: 10px; transition: transform 0.2s; display: inline-block; margin-right: 6px; }
.prompt-arrow.open { transform: rotate(90deg); }
.cat-tag { font-size: 9px; padding: 1px 6px; border-radius: 6px; margin: 0 6px; }
.footer { border-top: 1px solid var(--border); padding: 20px 32px; text-align: center; font-size: 11px; color: var(--muted); }
.footer span { color: var(--gold); }
@media (max-width: 768px) {
  .header { padding: 20px 16px 0; }
  .content { padding: 20px 16px; }
  .title { font-size: 20px; }
  .card { padding: 16px; }
  .findings { grid-template-columns: 1fr; }
  .llm-scores { flex-direction: column; }
  .llm-card { min-width: unset; }
}
@media print {
  body { background: white; color: #111; }
  .tab, .tabs { display: none !important; }
  .tab-panel { display: flex !important; }
  .card { border: 1px solid #ccc; break-inside: avoid; }
}
`;

const REPORT_JS = `
const models = [
  { key:'claude', name:'Claude', icon:'\\u{1F7E0}', color:'#e8956a' },
  { key:'chatgpt', name:'ChatGPT', icon:'\\u{1F7E2}', color:'#74aa9c' },
  { key:'gemini', name:'Gemini', icon:'\\u{1F535}', color:'#4285f4' },
  { key:'grok', name:'Grok', icon:'\\u26AA', color:'#999' },
];

function badge(mentioned) {
  if (mentioned) return '<span class="badge badge-green">\\u2713 Mentioned</span>';
  return '<span class="badge badge-red">\\u2717 Not Mentioned</span>';
}

function posCell(pos) {
  if (!pos) return '<div class="pos-cell pos-red">50+</div>';
  if (pos <= 10) return '<div class="pos-cell pos-green">#' + pos + '</div>';
  if (pos <= 30) return '<div class="pos-cell pos-yellow">#' + pos + '</div>';
  return '<div class="pos-cell pos-red">#' + pos + '</div>';
}

function gauge(score, max, label, color) {
  var pct = (score / max) * 100;
  return '<div class="gauge"><div class="gauge-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" stroke-width="3"/><circle cx="18" cy="18" r="15.9" fill="none" stroke="' + color + '" stroke-width="3" stroke-dasharray="' + pct + ' ' + (100 - pct) + '" stroke-linecap="round"/></svg><div class="gauge-value">' + score + '<span>/' + max + '</span></div></div><div class="gauge-label">' + label + '</div></div>';
}

function row(label, value, status) {
  var statusBadge = '';
  if (status) {
    var cls = { found:'badge-green', not_found:'badge-red', error:'badge-yellow', skipped:'badge-muted', minimal:'badge-yellow' };
    var icons = { found:'\\u2713', not_found:'\\u2717', error:'~', skipped:'-', minimal:'~' };
    var displayStatus = status.replace(/_/g, ' ').replace(/\\b\\w/g, function(c){return c.toUpperCase();});
    statusBadge = '<span class="badge ' + (cls[status] || 'badge-muted') + '">' + (icons[status] || '?') + ' ' + displayStatus + '</span>';
  }
  return '<div class="row"><span class="row-label">' + label + '</span><div class="row-right">' + (value ? '<span class="row-value">' + value + '</span>' : '') + statusBadge + '</div></div>';
}

function scoreColor(score, max) {
  var pct = score / max;
  if (pct <= 0.3) return 'var(--red)';
  if (pct <= 0.6) return 'var(--yellow)';
  return 'var(--green)';
}

// === BUILD PANELS ===
var panels = {};
var A = AUDIT;

// Overview
var seoRanked = A.seo.filter(function(r) { return r.position && r.position <= 20 && !r.keyword.startsWith('"'); }).length;
var totalSeoCompetitive = A.seo.filter(function(r) { return !r.keyword.startsWith('"'); }).length;
var totalLlmMentions = 0, totalLlmPossible = 0;
A.llm.forEach(function(p) {
  models.forEach(function(m) {
    totalLlmPossible++;
    if (p.models && p.models[m.key] && p.models[m.key].mentioned) totalLlmMentions++;
  });
});
var presFound = A.presence.filter(function(p) { return p.status === 'found'; }).length;

panels.overview = '<div class="gauges">' +
  gauge(A.score_seo, 25, 'SEO / Web Search', scoreColor(A.score_seo, 25)) +
  gauge(A.score_aeo, 25, 'AEO / GEO', scoreColor(A.score_aeo, 25)) +
  gauge(A.score_llm, 25, 'LLM Recommend', scoreColor(A.score_llm, 25)) +
  gauge(A.score_presence, 25, 'Digital Presence', scoreColor(A.score_presence, 25)) +
  '</div>' +
  '<div class="card accent-gold"><h3 class="card-title">Executive Summary</h3><div style="height:12px"></div>' +
  '<div style="font-size:14px;color:var(--muted);line-height:1.7">' +
  '<p style="margin:0 0 12px">Digital visibility audit for <span style="color:var(--white);font-weight:600">' + A.client_name + '</span>' + (A.location ? ' (' + A.location + ')' : '') + '. Overall score: <span style="color:' + scoreColor(A.score_total, 100) + ';font-weight:700">' + A.score_total + '/100</span>.</p>' +
  '<p style="margin:0 0 12px">Across <span style="color:var(--white)">' + A.seo.length + ' keywords</span>: ' + seoRanked + '/' + totalSeoCompetitive + ' competitive terms ranked in top 20.</p>' +
  '<p style="margin:0">Across <span style="color:var(--white)">' + A.llm.length + ' prompts \\u00D7 ' + models.length + ' LLMs = ' + totalLlmPossible + ' tests</span>: <span style="color:' + scoreColor(totalLlmMentions, totalLlmPossible) + ';font-weight:700">' + totalLlmMentions + ' mentions</span>.</p>' +
  '</div></div>' +
  '<div class="card"><h3 class="card-title">Key Findings</h3><div style="height:12px"></div><div class="findings">' +
  finding('\\u{1F50D}', 'SEO: ' + seoRanked + '/' + totalSeoCompetitive + ' competitive keywords ranked', seoRanked > 0 ? 'Top 20 positions' : 'No competitive rankings', seoRanked > 2 ? 'green' : seoRanked > 0 ? 'yellow' : 'red') +
  finding('\\u{1F916}', 'LLM: ' + totalLlmMentions + '/' + totalLlmPossible + ' mentions', totalLlmMentions > 0 ? 'Mentioned by AI models' : 'Not recommended by any AI', totalLlmMentions > 5 ? 'green' : totalLlmMentions > 0 ? 'yellow' : 'red') +
  finding('\\u{1F4CD}', 'Presence: ' + presFound + '/' + A.presence.length + ' platforms', presFound > 3 ? 'Strong platform coverage' : 'Limited platform coverage', presFound > 3 ? 'green' : presFound > 1 ? 'yellow' : 'red') +
  finding('\\u{1F4CA}', 'AEO Score: ' + A.score_aeo + '/25', A.aeo.schema_types_found && A.aeo.schema_types_found.length > 0 ? A.aeo.schema_types_found.length + ' schema types found' : 'No structured data', A.score_aeo > 15 ? 'green' : A.score_aeo > 5 ? 'yellow' : 'red') +
  '</div></div>';

// SEO
panels.seo = '<div class="card accent-red"><h3 class="card-title">Search Position Benchmark</h3><p class="card-subtitle">Exact position where ' + A.client_name + ' appears. 50+ = not found in first 50 results.</p>' +
  '<div style="overflow-x:auto"><table><thead><tr><th>KEYWORD</th><th class="center" style="width:55px">VOL</th><th class="center" style="width:80px">POSITION</th><th>WHO RANKS INSTEAD</th></tr></thead><tbody>' +
  A.seo.map(function(k) {
    return '<tr><td><div style="color:var(--white);font-size:13px;font-weight:500">' + k.keyword + '</div>' +
      '<div style="color:var(--muted);font-size:10px;margin-top:4px">' + (k.note || '') + '</div></td>' +
      '<td class="center"><span class="badge badge-muted">' + (k.volume || '') + '</span></td>' +
      '<td class="center">' + posCell(k.position) + '</td>' +
      '<td>' + (k.top_3 || []).map(function(c, j) {
        return '<div style="font-size:11px;color:' + (j === 0 ? 'var(--green)' : 'var(--white)') + ';padding:1px 0"><span class="mono" style="color:var(--muted);font-size:10px;margin-right:6px">#' + (j + 1) + '</span>' + (c.title || c.url || '') + '</div>';
      }).join('') + '</td></tr>';
  }).join('') +
  '</tbody></table></div>' +
  '<div class="stats">' +
  stat(A.seo.length, 'Total Keywords', '', 'white') +
  stat(A.seo.filter(function(r){return r.position && r.position <= 10;}).length, 'Top 10', '', A.seo.some(function(r){return r.position && r.position <= 10;}) ? 'green' : 'red') +
  stat(A.seo.filter(function(r){return !r.position;}).length + '/' + A.seo.length, 'Not Found (50+)', '', 'red') +
  '</div></div>';

// AEO
var schemaFound = (A.aeo.schema_types_found || []);
var schemaMissing = (A.aeo.schema_types_missing || []);
panels.aeo = '<div class="card accent-yellow"><h3 class="card-title">AEO Compliance</h3><p class="card-subtitle">Can AI systems extract and cite this business?</p>' +
  row('Schema.org structured data', schemaFound.length > 0 ? schemaFound.join(', ') : null, schemaFound.length > 0 ? 'found' : 'not_found') +
  row('FAQ schema on website', null, A.aeo.has_faq_page ? 'found' : 'not_found') +
  row('Blog / content section', null, A.aeo.has_blog ? 'found' : 'not_found') +
  row('llms.txt file', null, A.aeo.has_llms_txt ? 'found' : 'not_found') +
  row('NAP consistency', null, A.aeo.nap_consistent ? 'found' : 'not_found') +
  row('Service pages', A.aeo.service_pages_count > 0 ? A.aeo.service_pages_count + ' found' : null, A.aeo.service_pages_count > 0 ? 'found' : 'not_found') +
  '</div>' +
  '<div class="card"><h3 class="card-title">Schema Types</h3><div style="height:8px"></div>' +
  (schemaFound.length > 0 ? '<div class="section-label" style="margin-top:0">FOUND</div>' + schemaFound.map(function(t){ return '<span class="badge badge-green" style="margin:2px">' + t + '</span>'; }).join(' ') : '') +
  (schemaMissing.length > 0 ? '<div class="section-label">RECOMMENDED</div>' + schemaMissing.map(function(t){ return '<span class="badge badge-muted" style="margin:2px">' + t + '</span>'; }).join(' ') : '') +
  '</div>';

// LLM
var modelScores = {};
models.forEach(function(m) { modelScores[m.key] = 0; });
A.llm.forEach(function(p) {
  if (!p.models) return;
  models.forEach(function(m) {
    if (p.models[m.key] && p.models[m.key].mentioned) modelScores[m.key]++;
  });
});

panels.llm = '<div class="card accent-blue"><h3 class="card-title">LLM Recommendation Matrix</h3><p class="card-subtitle">' + A.llm.length + ' prompts \\u00D7 ' + models.length + ' models. Click any row to expand per-model detail.</p>' +
  '<div class="llm-scores">' + models.map(function(m) {
    var sc = modelScores[m.key];
    var total = A.llm.length;
    var color = sc === 0 ? 'var(--red)' : sc < total / 2 ? 'var(--yellow)' : 'var(--green)';
    return '<div class="llm-card"><div class="icon">' + m.icon + '</div><div class="name">' + m.name + '</div><div class="score" style="color:' + color + '">' + sc + '/' + total + '</div></div>';
  }).join('') + '</div>' +
  '<div style="overflow-x:auto"><table><thead><tr><th style="min-width:200px">PROMPT</th>' +
  models.map(function(m) { return '<th class="center" style="min-width:80px;color:' + m.color + ';font-size:10px">' + m.icon + ' ' + m.name + '</th>'; }).join('') +
  '</tr></thead><tbody>' +
  A.llm.map(function(p, i) {
    var promptRow = '<tr class="llm-prompt-row" data-idx="' + i + '"><td><span class="prompt-arrow" id="arrow-' + i + '">\\u25B6</span><span style="color:var(--white);font-size:12px">' + p.prompt + '</span></td>';
    models.forEach(function(m) {
      var result = p.models && p.models[m.key];
      promptRow += '<td class="center">' + badge(result && result.mentioned) + '</td>';
    });
    promptRow += '</tr>';

    var detailRow = '<tr class="llm-detail" id="detail-' + i + '"><td colspan="' + (models.length + 1) + '"><div class="llm-detail-grid">';
    models.forEach(function(m) {
      var result = p.models && p.models[m.key];
      var snippet = result ? (result.raw_snippet || 'No data') : 'No data';
      detailRow += '<div class="llm-detail-card"><div class="llm-detail-name" style="color:' + m.color + '">' + m.icon + ' ' + m.name + '</div><div class="llm-detail-text">' + snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</div></div>';
    });
    detailRow += '</div></td></tr>';

    return promptRow + detailRow;
  }).join('') +
  '</tbody></table></div>' +
  '<div class="grand-total" style="background:' + scoreColor(totalLlmMentions, totalLlmPossible) + '12;border-color:' + scoreColor(totalLlmMentions, totalLlmPossible) + '40"><div class="num" style="color:' + scoreColor(totalLlmMentions, totalLlmPossible) + '">' + totalLlmMentions + ' / ' + totalLlmPossible + '</div><div class="label" style="color:' + scoreColor(totalLlmMentions, totalLlmPossible) + '">Total mentions across all models \\u00D7 all prompts</div></div></div>';

// Presence
panels.presence = '<div class="card accent-gold"><h3 class="card-title">Platform Audit</h3><div style="height:12px"></div>';
var platformLabels = {
  google_business: 'Google Business Profile',
  yelp: 'Yelp',
  tripadvisor: 'TripAdvisor',
  facebook: 'Facebook',
  instagram: 'Instagram',
  schema_org: 'Schema.org Markup',
  llms_txt: 'llms.txt',
};
A.presence.forEach(function(p) {
  var label = platformLabels[p.platform] || p.platform;
  var detail = [];
  if (p.rating) detail.push(p.rating + '\\u2605');
  if (p.review_count) detail.push(p.review_count + ' reviews');
  if (p.note) detail.push(p.note);
  panels.presence += row(label, detail.join(' \\u2022 ') || null, p.status);
});
panels.presence += '</div>';

// Actions (auto-generated from gaps)
var actions = [];
var aeo = A.aeo || {};
if (!aeo.schema_types_found || aeo.schema_types_found.length === 0) {
  actions.push({ title: 'Add Schema.org structured data', desc: 'Implement LocalBusiness, FAQPage, and Service JSON-LD markup on your website. This is the foundation for AI engines to understand your business.', impact: 'Critical', affects: ['AEO', 'SEO'] });
}
if (!aeo.has_faq_page) {
  actions.push({ title: 'Create FAQ page with schema', desc: 'Build an FAQ page targeting common customer questions. Add FAQPage schema markup. FAQs are a primary source for AI-generated answers.', impact: 'High', affects: ['AEO', 'LLM'] });
}
if (!aeo.has_blog) {
  actions.push({ title: 'Start a blog / content section', desc: 'Publish keyword-targeted articles addressing the exact queries where competitors currently rank. Content is the #1 driver of both SEO and LLM training data.', impact: 'High', affects: ['SEO', 'AEO', 'LLM'] });
}
if (!aeo.has_llms_txt) {
  actions.push({ title: 'Add llms.txt file', desc: 'Create a /llms.txt file to help AI crawlers understand your business. This is a new standard being adopted by forward-thinking businesses.', impact: 'Medium', affects: ['AEO', 'LLM'] });
}

var yelpResult = A.presence.find(function(p){ return p.platform === 'yelp'; });
if (!yelpResult || yelpResult.status !== 'found') {
  actions.push({ title: 'Create Yelp business listing', desc: 'Yelp is a primary data source for AI models. Claim your listing, complete all fields, and begin soliciting reviews.', impact: 'Critical', affects: ['LLM', 'Presence'] });
}
var tripResult = A.presence.find(function(p){ return p.platform === 'tripadvisor'; });
if (!tripResult || tripResult.status !== 'found') {
  actions.push({ title: 'Create TripAdvisor listing', desc: 'Claim as a business/attraction. TripAdvisor data feeds multiple AI models and search engines.', impact: 'High', affects: ['LLM', 'Presence'] });
}
var gbpResult = A.presence.find(function(p){ return p.platform === 'google_business'; });
if (!gbpResult || gbpResult.status !== 'found') {
  actions.push({ title: 'Claim & optimize Google Business Profile', desc: 'Complete business info, photos, categories. Single highest-impact action for local visibility and AI mentions.', impact: 'Critical', affects: ['SEO', 'AEO', 'LLM', 'Presence'] });
}

if (totalLlmMentions === 0) {
  actions.push({ title: 'Build citable content for LLM training', desc: 'Create authoritative content on review platforms, directories, and your own site. AI models need multiple independent sources to recommend your business.', impact: 'Critical', affects: ['LLM'] });
} else if (totalLlmMentions < totalLlmPossible / 2) {
  actions.push({ title: 'Expand LLM visibility', desc: 'Some AI models mention you but coverage is inconsistent. Focus on building presence on platforms that feed the models not yet recommending you.', impact: 'High', affects: ['LLM'] });
}

if (seoRanked === 0) {
  actions.push({ title: 'Target competitive keyword rankings', desc: 'Create dedicated landing pages for each high-volume keyword. Optimize with proper headings, meta descriptions, and internal linking.', impact: 'High', affects: ['SEO'] });
}

if (actions.length === 0) {
  actions.push({ title: 'Maintain current momentum', desc: 'Your visibility scores are strong. Focus on review generation, content freshness, and monitoring competitors.', impact: 'Medium', affects: ['All'] });
}

var impactColors = { Critical: 'red', High: 'yellow', Medium: 'blue' };
var affectColors = { SEO: 'red', AEO: 'yellow', LLM: 'blue', Presence: 'green', All: 'gold' };
panels.actions = '<div class="card accent-gold"><h3 class="card-title">Next Best Actions</h3><p class="card-subtitle">Auto-generated recommendations based on audit findings.</p></div>';
panels.actions += '<div class="card"><div style="display:flex;flex-direction:column;gap:16px">' +
  actions.map(function(a, i) {
    var ic = impactColors[a.impact] || 'muted';
    return '<div class="action-item" style="border-left-color:var(--' + ic + ')"><div class="action-header"><span class="action-title">' + (i + 1) + '. ' + a.title + '</span><span class="badge badge-' + ic + '" style="font-size:9px">' + a.impact + '</span></div><div class="action-desc">' + a.desc + '</div><div class="action-pills">' + a.affects.map(function(p) { return '<span class="pill" style="background:var(--' + (affectColors[p] || 'muted') + ')15;color:var(--' + (affectColors[p] || 'muted') + ')">' + p + '</span>'; }).join('') + '</div></div>';
  }).join('') + '</div></div>';

// Methodology
panels.method = '<div class="card accent-gold"><h3 class="card-title">Methodology</h3><div style="height:12px"></div><div style="font-size:13px;color:var(--muted);line-height:1.8">' +
  methodSection('1. SEO POSITIONS (25 pts)', 'Search each keyword via Google Custom Search API. Record exact position in first 50 results. Track local pack appearance.') +
  methodSection('2. AEO / GEO (25 pts)', 'Analyze homepage for JSON-LD schema types, llms.txt, blog, FAQ, NAP consistency, and service pages.') +
  methodSection('3. LLM MATRIX (25 pts)', 'Query all prompts to Claude (web search), ChatGPT (web search), Gemini (grounded), Grok (web search), and Perplexity (sonar). Detect brand mentions in responses and citations.') +
  methodSection('4. DIGITAL PRESENCE (25 pts)', 'Check Google Business, Yelp, TripAdvisor, Facebook, Instagram, Schema.org markup, and llms.txt availability.') +
  '</div></div>';

function finding(icon, label, detail, color) {
  return '<div class="finding" style="background:var(--' + color + ')08;border:1px solid var(--' + color + ')20"><span class="finding-icon">' + icon + '</span><div><div class="finding-label">' + label + '</div><div class="finding-detail" style="color:var(--' + color + ')">' + detail + '</div></div></div>';
}

function stat(value, label, sub, color) {
  return '<div class="stat"><div class="stat-value" style="color:var(--' + color + ')">' + value + '</div><div class="stat-label">' + label + '</div>' + (sub ? '<div class="stat-sub" style="color:var(--' + color + ')">' + sub + '</div>' : '') + '</div>';
}

function methodSection(title, desc) {
  return '<div style="font-size:12px;color:var(--gold);font-weight:600;letter-spacing:0.1em;margin:12px 0 4px">' + title + '</div><p style="margin:0 0 4px">' + desc + '</p>';
}

// === INIT ===
var content = document.getElementById('content');
var tabBtns = document.querySelectorAll('.tab');

function showTab(id) {
  content.innerHTML = '<div class="tab-panel active">' + (panels[id] || '') + '</div>';
  tabBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.tab === id); });
  if (id === 'llm') {
    document.querySelectorAll('.llm-prompt-row').forEach(function(row) {
      row.addEventListener('click', function() {
        var idx = row.dataset.idx;
        var detail = document.getElementById('detail-' + idx);
        var arrow = document.getElementById('arrow-' + idx);
        var isOpen = detail.classList.contains('show');
        document.querySelectorAll('.llm-detail').forEach(function(d) { d.classList.remove('show'); });
        document.querySelectorAll('.prompt-arrow').forEach(function(a) { a.classList.remove('open'); });
        document.querySelectorAll('.llm-prompt-row').forEach(function(r) { r.classList.remove('expanded'); });
        if (!isOpen) {
          detail.classList.add('show');
          arrow.classList.add('open');
          row.classList.add('expanded');
        }
      });
    });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

tabBtns.forEach(function(btn) { btn.addEventListener('click', function() { showTab(btn.dataset.tab); }); });
showTab('overview');
`;
