// Prompts for LLMReady's Claude calls. Kept separate from index.js so they
// can be tuned without touching routing.

export const SEMANTIC_ASSESSMENT_PROMPT = `You are an LLM Visibility Auditor. Your job is to evaluate a website through the eyes of a language model — how well can AI systems parse, extract, and cite this content?

Do NOT use traditional SEO or keyword logic. Evaluate purely for structured machine-readability across these 8 dimensions:

1. STRUCTURED DATA (JSON-LD / Schema.org) — Score 0-100
   Is product, article, FAQ, HowTo, or Organization data encoded in machine-readable format? Or is it trapped in unstructured <div> soup? Look for <script type="application/ld+json"> blocks. Check Schema.org type correctness and completeness.

2. SEMANTIC HTML5 TAG USAGE — Score 0-100
   Presence and correct nesting of <article>, <main>, <nav>, <section>, <aside>. Heading hierarchy H1→H2→H3. Are content regions clearly delineated, or is everything generic <div>s?

3. INFORMATION DENSITY — Score 0-100
   Ratio of factual, extractable content to boilerplate (nav chrome, cookie banners, footer noise, CTA filler text, marketing fluff). How much of the page is actual information an LLM could cite?

4. JAVASCRIPT RENDER DEPENDENCY — Score 0-100
   Is the critical content available in the initial HTML response (rawHTML), or does it only exist post-JS execution (renderedHTML)? Content that requires JS to appear is invisible to most LLM crawlers. Compare the raw vs rendered HTML to determine this. Higher score = less JS dependency.

5. ALT TEXT & IMAGE CONTEXT — Score 0-100
   Percentage of <img> tags with descriptive, context-rich alt attributes. Generic alts like "image" or "photo" or empty alt="" count as missing. Also check for <figure> and <figcaption> usage.

6. ROBOTS.TXT / LLMS.TXT COMPLIANCE — Score 0-100
   Does robots.txt explicitly allow GPTBot, ClaudeBot, PerplexityBot, Googlebot? Or does it block them? Does /llms.txt exist? Does /.well-known/llm.txt exist? Are they well-structured with site description, page inventory, and entity declarations?

7. META & CANONICAL COMPLETENESS — Score 0-100
   <title> tag present and descriptive? <meta name="description"> present and useful? Open Graph tags (og:title, og:description, og:image, og:type, og:url)? Canonical URL? Twitter Card tags?

8. LINK ANCHOR CONTEXT QUALITY — Score 0-100
   Are link anchors descriptive ("See our enterprise pricing", "Read the deployment guide") or generic ("click here", "read more", "learn more")? Descriptive anchors help LLMs understand link destinations without following them.

RESPOND WITH ONLY THIS JSON STRUCTURE (no other text, no markdown fencing):
{
  "overall_score": <0-100 weighted average>,
  "verdict": "<one plain-English sentence explaining the overall LLM visibility>",
  "dimensions": {
    "structured_data":        { "score": <0-100>, "finding": "<one sentence>", "details": "<2-3 sentences>", "impact": "<real-world consequence>" },
    "semantic_html":          { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "information_density":    { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "js_render_dependency":   { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "alt_text":               { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "robots_llms_compliance": { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "meta_canonical":         { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." },
    "anchor_quality":         { "score": <0-100>, "finding": "...", "details": "...", "impact": "..." }
  },
  "priority_issues": [
    { "rank": 1, "dimension": "<key>", "issue": "<specific issue>", "consequence": "<real-world impact>", "fix_complexity": "simple|moderate|complex" }
  ],
  "schema_types_found": ["LocalBusiness", "..."],
  "schema_types_missing": ["FAQPage", "Product"],
  "critical_content_js_only": <true|false>,
  "llms_txt_exists": <true|false>,
  "robots_blocks_ai": <true|false>
}`;

export function buildAssessmentUserMessage(pageData) {
  return `Analyze this website for LLM visibility.

URL: ${pageData.url}

RENDERED HTML (post-JavaScript):
${(pageData.renderedHTML || '').slice(0, 100000)}

RAW HTML (pre-JavaScript):
${(pageData.rawHTML || '').slice(0, 50000)}

robots.txt: ${pageData.robotsTxt || 'NOT FOUND'}
llms.txt: ${pageData.llmsTxt || 'NOT FOUND'}
.well-known/llm.txt: ${pageData.wellKnownLlmTxt || 'NOT FOUND'}`;
}

export function buildSchemaPrompt(pageData, businessInfo) {
  return `Generate the exact JSON-LD schema markup for this page.

Page URL: ${pageData.url}
Business info: ${JSON.stringify(businessInfo || {})}

Page content (rendered HTML, truncated):
${(pageData.renderedHTML || '').slice(0, 60000)}

Requirements:
- Use the most specific Schema.org type(s) for this content
- Include ALL extractable data visible on the page (prices, hours, addresses, team, services, FAQs)
- Output ONLY the complete <script type="application/ld+json"> block(s), ready to paste
- If multiple schema types apply, output multiple script blocks concatenated
- For LocalBusiness, include: name, address, telephone, url, openingHours, geo, sameAs (social links), hasOfferCatalog (services)
- For FAQPage, extract all Q&A pairs from the page content
- No explanation, no markdown fencing — just the raw <script> tags`;
}

export function buildLlmsTxtPrompt(pageData, businessInfo) {
  return `Generate a complete llms.txt file for this website. This file acts as a direct briefing document for AI crawlers.

Business: ${businessInfo?.name || '(unknown)'}
URL: ${pageData.url}
Location: ${businessInfo?.location || businessInfo?.address || ''}
Services: ${(businessInfo?.services || []).join(', ')}
Description: ${businessInfo?.description || ''}

Page content (rendered HTML, truncated):
${(pageData.renderedHTML || '').slice(0, 40000)}

Requirements:
- Follow the llms.txt specification format (H1 title, blockquote summary, H2 section headers with markdown link lists)
- Include: site description, page inventory with one-line summaries, key entities, contact info
- Be factual and concise — this is for machine consumption
- Output ONLY the file content, no markdown fencing, no explanation`;
}

export function buildMetaPrompt(pageData, businessInfo) {
  return `Generate a complete set of HTML <head> meta tags for this page, optimized for LLM and answer-engine visibility.

Page URL: ${pageData.url}
Business: ${businessInfo?.name || ''}
Description: ${businessInfo?.description || ''}

Page content (rendered HTML, truncated):
${(pageData.renderedHTML || '').slice(0, 40000)}

Requirements:
- Output <title>, <meta name="description">, Open Graph tags (og:title, og:description, og:image, og:type, og:url), Twitter Card tags (summary_large_image), canonical link
- Be factual, derived from actual page content — do not invent details
- Output ONLY the raw HTML tags, one per line, no explanation or markdown fencing`;
}

export function buildRobotsPrompt(existingRobots) {
  return `Generate an updated robots.txt that explicitly allows major AI crawlers while preserving any existing restrictions.

Existing robots.txt:
${existingRobots || '(none)'}

Requirements:
- Allow: GPTBot, ClaudeBot, Claude-Web, PerplexityBot, Google-Extended, CCBot, anthropic-ai
- Preserve any existing Disallow directives for Googlebot/Bingbot etc.
- Include Sitemap: directive if one is detectable from the existing file
- Output ONLY the raw robots.txt content, no explanation`;
}
