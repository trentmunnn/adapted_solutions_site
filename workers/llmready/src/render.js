// Page rendering via Cloudflare Browser Rendering REST API + sidecar fetches
// for robots.txt / llms.txt / .well-known/llm.txt.
//
// Uses the REST API (rather than the puppeteer binding) so this worker needs
// no npm dependencies or build step — just secrets.
//
// Requires these secrets in wrangler.toml / `wrangler secret put`:
//   CLOUDFLARE_ACCOUNT_ID
//   CLOUDFLARE_API_TOKEN  (needs Browser Rendering: Edit permission)

export async function renderPage(url, env) {
  const [renderedHTML, rawHTML, robotsTxt, llmsTxt, wellKnownLlmTxt] = await Promise.all([
    fetchRendered(url, env).catch(err => {
      console.error('Browser Rendering failed, falling back to raw fetch:', err);
      return null;
    }),
    fetchRaw(url).catch(() => ''),
    fetchAtOrigin(url, '/robots.txt'),
    fetchAtOrigin(url, '/llms.txt'),
    fetchAtOrigin(url, '/.well-known/llm.txt'),
  ]);

  return {
    url,
    renderedHTML: renderedHTML || rawHTML,
    rawHTML,
    robotsTxt,
    llmsTxt,
    wellKnownLlmTxt,
    renderedViaBrowser: !!renderedHTML,
  };
}

async function fetchRendered(url, env) {
  if (!env.CLOUDFLARE_ACCOUNT_ID || !env.CLOUDFLARE_API_TOKEN) {
    throw new Error('Browser Rendering credentials not configured');
  }
  const api = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/browser-rendering/content`;
  const resp = await fetch(api, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      waitUntil: 'networkidle0',
      rejectResourceTypes: ['image', 'media', 'font'],
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Browser Rendering ${resp.status}: ${body.slice(0, 200)}`);
  }
  const data = await resp.json();
  if (!data.success) throw new Error('Browser Rendering returned success=false');
  return data.result;
}

async function fetchRaw(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'LLMReady/1.0 (+https://adaptedsolutionsco.com)' },
    redirect: 'follow',
  });
  if (!resp.ok) return '';
  return await resp.text();
}

async function fetchAtOrigin(pageUrl, path) {
  try {
    const origin = new URL(pageUrl).origin;
    const resp = await fetch(origin + path, {
      headers: { 'User-Agent': 'LLMReady/1.0' },
    });
    if (!resp.ok) return null;
    const text = await resp.text();
    // Cheap sanity check: if Cloudflare/etc returns an HTML error page, treat as missing
    if (text.slice(0, 200).toLowerCase().includes('<!doctype html')) return null;
    return text.slice(0, 20000);
  } catch {
    return null;
  }
}
