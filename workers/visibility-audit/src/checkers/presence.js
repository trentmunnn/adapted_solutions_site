export async function checkPresence(clientName, clientDomain, clientLocation, env) {
  const results = [];

  const checks = await Promise.allSettled([
    checkGoogleBusiness(clientName, clientLocation, env),
    checkYelp(clientName, clientLocation, env),
    checkTripAdvisor(clientName, env),
    checkFacebook(clientDomain),
    checkInstagram(clientDomain),
    checkSchemaOrg(clientDomain),
    checkLlmsTxt(clientDomain),
  ]);

  const platforms = [
    'google_business', 'yelp', 'tripadvisor',
    'facebook', 'instagram', 'schema_org', 'llms_txt',
  ];

  for (let i = 0; i < checks.length; i++) {
    if (checks[i].status === 'fulfilled') {
      results.push({ platform: platforms[i], ...checks[i].value });
    } else {
      results.push({
        platform: platforms[i],
        status: 'error',
        note: checks[i].reason?.message || 'Check failed',
      });
    }
  }

  return results;
}

async function checkGoogleBusiness(clientName, clientLocation, env) {
  if (!env.GOOGLE_CSE_KEY || !env.GOOGLE_CSE_ID) {
    return { status: 'skipped', note: 'Google CSE not configured' };
  }

  const query = `${clientName} ${clientLocation || ''}`.trim();
  const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_KEY}&cx=${env.GOOGLE_CSE_ID}&q=${encodeURIComponent(query + ' site:google.com/maps OR site:maps.google.com')}&num=5`;

  const resp = await fetch(url);
  if (!resp.ok) return { status: 'error', note: `Google API ${resp.status}` };
  const data = await resp.json();

  const found = (data.items || []).some(item =>
    item.title?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])
  );

  if (found) {
    const item = data.items.find(i =>
      i.title?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])
    );
    return {
      status: 'found',
      url: item?.link,
      note: item?.title,
    };
  }

  return { status: 'not_found' };
}

async function checkYelp(clientName, clientLocation, env) {
  if (!env.YELP_API_KEY) {
    return { status: 'skipped', note: 'Yelp API not configured' };
  }

  const url = `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(clientName)}&location=${encodeURIComponent(clientLocation || '')}&limit=5`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${env.YELP_API_KEY}` },
  });

  if (!resp.ok) return { status: 'error', note: `Yelp API ${resp.status}` };
  const data = await resp.json();

  const match = (data.businesses || []).find(b =>
    b.name?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])
  );

  if (match) {
    return {
      status: 'found',
      rating: match.rating,
      review_count: match.review_count,
      url: match.url,
    };
  }

  return { status: 'not_found' };
}

async function checkTripAdvisor(clientName, env) {
  if (!env.GOOGLE_CSE_KEY || !env.GOOGLE_CSE_ID) {
    return { status: 'skipped', note: 'Google CSE not configured' };
  }

  const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_KEY}&cx=${env.GOOGLE_CSE_ID}&q=${encodeURIComponent(clientName + ' site:tripadvisor.com')}&num=5`;
  const resp = await fetch(url);
  if (!resp.ok) return { status: 'error', note: `Google API ${resp.status}` };
  const data = await resp.json();

  const found = (data.items || []).some(item =>
    item.link?.includes('tripadvisor.com') &&
    item.title?.toLowerCase().includes(clientName.toLowerCase().split(' ')[0])
  );

  if (found) {
    const item = data.items.find(i => i.link?.includes('tripadvisor.com'));
    return { status: 'found', url: item?.link };
  }

  return { status: 'not_found' };
}

async function checkFacebook(clientDomain) {
  try {
    const resp = await fetch(`https://${clientDomain}`, {
      headers: { 'User-Agent': 'AdaptedSolutionsAuditBot/1.0' },
      redirect: 'follow',
    });
    if (!resp.ok) return { status: 'error', note: 'Could not fetch site' };
    const html = await resp.text();

    const fbMatch = html.match(/(?:facebook\.com|fb\.com)\/([a-zA-Z0-9._-]+)/);
    if (fbMatch) {
      return { status: 'found', url: `https://facebook.com/${fbMatch[1]}` };
    }
    return { status: 'not_found' };
  } catch {
    return { status: 'error', note: 'Could not check' };
  }
}

async function checkInstagram(clientDomain) {
  try {
    const resp = await fetch(`https://${clientDomain}`, {
      headers: { 'User-Agent': 'AdaptedSolutionsAuditBot/1.0' },
      redirect: 'follow',
    });
    if (!resp.ok) return { status: 'error', note: 'Could not fetch site' };
    const html = await resp.text();

    const igMatch = html.match(/instagram\.com\/([a-zA-Z0-9._-]+)/);
    if (igMatch) {
      return { status: 'found', url: `https://instagram.com/${igMatch[1]}` };
    }
    return { status: 'not_found' };
  } catch {
    return { status: 'error', note: 'Could not check' };
  }
}

async function checkSchemaOrg(clientDomain) {
  try {
    const resp = await fetch(`https://${clientDomain}`, {
      headers: { 'User-Agent': 'AdaptedSolutionsAuditBot/1.0' },
      redirect: 'follow',
    });
    if (!resp.ok) return { status: 'not_found' };
    const html = await resp.text();

    const schemaMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    if (schemaMatches.length > 0) {
      const types = [];
      for (const match of schemaMatches) {
        try {
          const json = JSON.parse(match.replace(/<\/?script[^>]*>/g, ''));
          if (json['@type']) types.push(json['@type']);
          if (json['@graph']) {
            for (const node of json['@graph']) {
              if (node['@type']) types.push(node['@type']);
            }
          }
        } catch {}
      }
      return { status: 'found', note: `Types: ${types.join(', ')}` };
    }
    return { status: 'not_found' };
  } catch {
    return { status: 'error', note: 'Could not check' };
  }
}

async function checkLlmsTxt(clientDomain) {
  try {
    const resp = await fetch(`https://${clientDomain}/llms.txt`, {
      redirect: 'follow',
    });
    if (resp.ok) {
      const text = await resp.text();
      return { status: 'found', note: `${text.length} bytes` };
    }
    return { status: 'not_found' };
  } catch {
    return { status: 'not_found' };
  }
}
