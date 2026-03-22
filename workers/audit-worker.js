const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://adaptedsolutionsco.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
}

function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function getDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
}

function getOrigin(url) {
    try { return new URL(url).origin; } catch { return ''; }
}

async function checkHead(url) {
    try {
        const r = await fetch(url, { method: 'HEAD', redirect: 'follow', cf: { timeout: 5000 } });
        return r.status === 200;
    } catch {
        return false;
    }
}

function runChecks(html, url, llmsTxtExists, sitemapExists) {
    const text = html.toLowerCase();

    // Extract JSON-LD
    const jsonLdRegex = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jsonLdText = '';
    let match;
    while ((match = jsonLdRegex.exec(html)) !== null) {
        jsonLdText += match[1];
    }

    const hasJsonLd = jsonLdText.length > 0;
    const hasOrgSchema = /\"Organization\"|\"LocalBusiness\"/i.test(jsonLdText);
    const hasFaqSchema = /\"FAQPage\"|\"Question\"/i.test(jsonLdText);
    const hasServiceSchema = /\"Service\"/i.test(jsonLdText);
    const hasOpenGraph = /<meta[^>]*property\s*=\s*["']og:title["']/i.test(html);
    const hasCanonical = /<link[^>]*rel\s*=\s*["']canonical["']/i.test(html);

    // H1 count
    const h1Matches = html.match(/<h1[\s>]/gi);
    const h1Count = h1Matches ? h1Matches.length : 0;

    // H2 count
    const h2Matches = html.match(/<h2[\s>]/gi);
    const h2Count = h2Matches ? h2Matches.length : 0;

    // Meta description
    const metaDescMatch = html.match(/<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["']/i) ||
                          html.match(/<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']description["']/i);
    const hasMetaDescription = !!(metaDescMatch && metaDescMatch[1].trim().length > 0);

    const hasFaqContent = /faq|frequently asked/i.test(text);
    const isHttps = /^https:\/\//i.test(url);
    const hasViewport = /<meta[^>]*name\s*=\s*["']viewport["']/i.test(html);

    // Title tag
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const hasTitleTag = !!(titleMatch && titleMatch[1].trim().length > 0);

    // Entity definition: has title + meta desc + h1
    const hasEntityDefinition = hasTitleTag && hasMetaDescription && h1Count > 0;

    return {
        hasJsonLd,
        hasOrgSchema,
        hasFaqSchema,
        hasServiceSchema,
        hasLlmsTxt: llmsTxtExists,
        hasOpenGraph,
        hasEntityDefinition,
        hasCanonical,
        h1Count,
        h2Count,
        hasMetaDescription,
        hasFaqContent,
        isHttps,
        hasViewport,
        hasSitemap: sitemapExists,
        hasTitleTag,
    };
}

function calcScores(checks) {
    function catScore(keys) {
        let passed = 0;
        for (const k of keys) {
            if (k === 'h1Count') { if (checks[k] === 1) passed++; }
            else if (k === 'h2Count') { if (checks[k] >= 2) passed++; }
            else { if (checks[k]) passed++; }
        }
        return Math.round((passed / 4) * 100);
    }

    const sd = catScore(['hasJsonLd', 'hasOrgSchema', 'hasFaqSchema', 'hasServiceSchema']);
    const geo = catScore(['hasLlmsTxt', 'hasOpenGraph', 'hasEntityDefinition', 'hasCanonical']);
    const cs = catScore(['h1Count', 'h2Count', 'hasMetaDescription', 'hasFaqContent']);
    const tech = catScore(['isHttps', 'hasViewport', 'hasSitemap', 'hasTitleTag']);
    const aeo = Math.round((sd + cs) / 2);
    const geoScore = Math.round((geo * 0.6) + (sd * 0.4));
    const overall = Math.round((aeo + geoScore + tech) / 3);

    return { overall, aeo, geo: geoScore, structuredData: sd, geoSignals: geo, contentStructure: cs, technical: tech };
}

const ISSUE_MAP = {
    hasJsonLd: 'No structured data \u2014 AI engines cannot identify your business type or services',
    hasOrgSchema: 'Missing Organization schema \u2014 AI doesn\'t know who you are',
    hasLlmsTxt: 'No llms.txt file \u2014 AI crawlers have no instructions for your site',
    hasFaqSchema: 'No FAQ schema \u2014 missing featured snippet and AI answer opportunities',
    hasMetaDescription: 'Meta description missing \u2014 AI uses this as the primary answer summary',
    hasCanonical: 'No canonical tag \u2014 duplicate content signals confuse AI indexing',
    h1Count: 'H1 tag issue \u2014 unclear primary topic signal for AI',
    hasServiceSchema: 'No Service schema \u2014 AI cannot identify your specific offerings',
    hasOpenGraph: 'No Open Graph tags \u2014 missing social and AI preview signals',
    hasEntityDefinition: 'Weak entity signals \u2014 AI cannot clearly identify your business',
    h2Count: 'Too few H2 headings \u2014 limited content structure for AI parsing',
    hasFaqContent: 'No FAQ content \u2014 missing common question/answer patterns',
    isHttps: 'Site not using HTTPS \u2014 security baseline not met',
    hasViewport: 'No viewport meta tag \u2014 mobile and crawl issues',
    hasSitemap: 'No sitemap detected \u2014 AI crawlers may miss pages',
    hasTitleTag: 'Missing or empty title tag \u2014 no primary page identity',
};

const ISSUE_PRIORITY = [
    'hasJsonLd', 'hasOrgSchema', 'hasLlmsTxt', 'hasFaqSchema',
    'hasMetaDescription', 'hasCanonical', 'h1Count', 'hasServiceSchema',
    'hasOpenGraph', 'hasEntityDefinition', 'h2Count', 'hasFaqContent',
    'isHttps', 'hasViewport', 'hasSitemap', 'hasTitleTag',
];

function getTopIssues(checks) {
    const issues = [];
    for (const key of ISSUE_PRIORITY) {
        if (issues.length >= 3) break;
        let pass;
        if (key === 'h1Count') pass = checks[key] === 1;
        else if (key === 'h2Count') pass = checks[key] >= 2;
        else pass = !!checks[key];
        if (!pass) issues.push(ISSUE_MAP[key]);
    }
    return issues;
}

async function handleAudit(request) {
    let body;
    try { body = await request.json(); } catch { return jsonResponse({ success: false, error: 'Invalid request body' }); }

    let url = (body.url || '').trim();
    if (!url) return jsonResponse({ success: false, error: 'URL is required' });
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!isValidUrl(url)) return jsonResponse({ success: false, error: 'Invalid URL' });

    const domain = getDomain(url);
    const origin = getOrigin(url);

    let html;
    try {
        const resp = await fetch(url, {
            headers: { 'User-Agent': 'AdaptedSolutions-AuditBot/1.0' },
            redirect: 'follow',
            cf: { timeout: 10000 },
        });
        html = await resp.text();
    } catch {
        return jsonResponse({ success: false, error: 'Could not fetch site' });
    }

    const [llmsTxtExists, sitemapExists] = await Promise.all([
        checkHead(origin + '/llms.txt'),
        checkHead(origin + '/sitemap.xml'),
    ]);

    const checks = runChecks(html, url, llmsTxtExists, sitemapExists);
    const scores = calcScores(checks);
    const topIssues = getTopIssues(checks);

    return jsonResponse({
        success: true,
        domain,
        fetchedAt: new Date().toISOString(),
        checks,
        scores,
        topIssues,
    });
}

async function handleLead(request, env) {
    let payload;
    try { payload = await request.json(); } catch { return jsonResponse({ success: false, error: 'Invalid request' }); }

    if (!payload.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
        return jsonResponse({ success: false, error: 'Invalid email' });
    }

    if (env.N8N_WEBHOOK_URL) {
        try {
            await fetch(env.N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } catch {
            // Don't block lead capture if webhook fails
        }
    }

    return jsonResponse({ success: true });
}

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(request.url);

        if (request.method === 'POST' && url.pathname === '/api/audit') {
            return handleAudit(request);
        }

        if (request.method === 'POST' && url.pathname === '/api/audit-lead') {
            return handleLead(request, env);
        }

        return new Response('Not found', { status: 404, headers: corsHeaders });
    },
};
