export async function checkAEO(clientDomain) {
  let html = '';
  try {
    const resp = await fetch(`https://${clientDomain}`, {
      headers: { 'User-Agent': 'AdaptedSolutionsAuditBot/1.0' },
      redirect: 'follow',
    });
    if (resp.ok) html = await resp.text();
  } catch {
    return defaultAEOResult();
  }

  // Check for JSON-LD schema
  const schemaMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  const schemaTypesFound = [];
  for (const match of schemaMatches) {
    try {
      const json = JSON.parse(match.replace(/<\/?script[^>]*>/g, ''));
      extractTypes(json, schemaTypesFound);
    } catch {}
  }

  const commonMissing = [
    'LocalBusiness', 'Organization', 'FAQPage', 'Service',
    'Product', 'Review', 'BreadcrumbList', 'WebSite',
  ].filter(t => !schemaTypesFound.includes(t));

  // Check for llms.txt
  let hasLlmsTxt = false;
  try {
    const llmsResp = await fetch(`https://${clientDomain}/llms.txt`, { redirect: 'follow' });
    hasLlmsTxt = llmsResp.ok;
  } catch {}

  // Check for blog
  const hasBlog = /\/blog[\/'">\s]|\/posts[\/'">\s]|\/articles[\/'">\s]/i.test(html);

  // Check for FAQ
  const hasFaqPage = /\/faq[\/'">\s]/i.test(html) || schemaTypesFound.includes('FAQPage');

  // Count service pages (links with /service or similar patterns)
  const serviceLinks = html.match(/href=["'][^"']*(?:service|offering|solution|product)[^"']*["']/gi) || [];
  const servicePagesCount = new Set(serviceLinks.map(l => l.match(/href=["']([^"']*)/)?.[1]).filter(Boolean)).size;

  // Check NAP consistency (basic: look for phone number pattern)
  const phones = html.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [];
  const uniquePhones = new Set(phones.map(p => p.replace(/\D/g, '')));
  const napConsistent = uniquePhones.size <= 1;

  // Structured data score (0-100 sub-score)
  let structuredDataScore = 0;
  if (schemaTypesFound.length > 0) structuredDataScore += 25;
  if (schemaTypesFound.length > 2) structuredDataScore += 15;
  if (schemaTypesFound.includes('LocalBusiness') || schemaTypesFound.includes('Organization')) structuredDataScore += 20;
  if (schemaTypesFound.includes('FAQPage')) structuredDataScore += 15;
  if (schemaTypesFound.includes('BreadcrumbList')) structuredDataScore += 10;
  if (schemaTypesFound.includes('WebSite')) structuredDataScore += 10;
  structuredDataScore = Math.min(100, structuredDataScore);

  return {
    schema_types_found: schemaTypesFound,
    schema_types_missing: commonMissing,
    has_faq_page: hasFaqPage,
    has_blog: hasBlog,
    has_llms_txt: hasLlmsTxt,
    nap_consistent: napConsistent,
    ai_overview_appearances: 0, // Would need separate check
    service_pages_count: servicePagesCount,
    structured_data_score: structuredDataScore,
  };
}

function extractTypes(json, types) {
  if (Array.isArray(json)) {
    for (const item of json) extractTypes(item, types);
  } else if (json && typeof json === 'object') {
    if (json['@type']) {
      const t = Array.isArray(json['@type']) ? json['@type'] : [json['@type']];
      for (const type of t) {
        if (!types.includes(type)) types.push(type);
      }
    }
    if (json['@graph']) extractTypes(json['@graph'], types);
  }
}

function defaultAEOResult() {
  return {
    schema_types_found: [],
    schema_types_missing: ['LocalBusiness', 'Organization', 'FAQPage', 'Service'],
    has_faq_page: false,
    has_blog: false,
    has_llms_txt: false,
    nap_consistent: false,
    ai_overview_appearances: 0,
    service_pages_count: 0,
    structured_data_score: 0,
  };
}
