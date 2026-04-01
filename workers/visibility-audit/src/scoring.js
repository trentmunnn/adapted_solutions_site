export function calculateScores(seoResults, llmResults, presenceResults, aeoResults) {
  // SEO (25 pts)
  const seoItems = seoResults || [];
  const competitiveRanked = seoItems.filter(r =>
    r.position && r.position <= 20 && !r.keyword.startsWith('"')
  ).length;
  const top10 = seoItems.filter(r =>
    r.position && r.position <= 10 && !r.keyword.startsWith('"')
  ).length;
  const inLocalPack = seoItems.some(r => r.in_local_pack);

  let score_seo;
  if (competitiveRanked === 0) score_seo = Math.min(5, seoItems.filter(r => r.position).length);
  else if (competitiveRanked <= 2) score_seo = 8 + (top10 * 2);
  else if (competitiveRanked <= 4) score_seo = 14 + (top10 * 1);
  else score_seo = 18 + (top10 * 1);
  if (inLocalPack) score_seo += 3;
  score_seo = Math.min(25, score_seo);

  // LLM (25 pts)
  const llmItems = llmResults || [];
  let totalMentions = 0;
  let totalPossible = 0;
  for (const prompt of llmItems) {
    if (!prompt.models) continue;
    for (const model of Object.values(prompt.models)) {
      totalPossible++;
      if (model.mentioned) totalMentions++;
    }
  }
  const score_llm = totalPossible > 0 ? Math.round((totalMentions / totalPossible) * 25) : 0;

  // Presence (25 pts)
  const presItems = presenceResults || [];
  const found = presItems.filter(p => p.status === 'found').length;
  const strong = presItems.filter(p => (p.review_count || 0) > 20).length;
  const hasHighRating = presItems.filter(p => (p.rating || 0) >= 4.5 && (p.review_count || 0) > 10).length;
  const score_presence = Math.min(25, found * 2 + strong * 3 + hasHighRating * 2);

  // AEO (25 pts)
  const aeo = aeoResults || {};
  let score_aeo = 0;
  const schemaTypes = aeo.schema_types_found || [];
  if (schemaTypes.length > 0) score_aeo += 5;
  if (schemaTypes.length > 3) score_aeo += 3;
  if (aeo.has_llms_txt) score_aeo += 4;
  if (aeo.has_blog) score_aeo += 3;
  if (aeo.has_faq_page) score_aeo += 3;
  if (aeo.nap_consistent) score_aeo += 2;
  if (aeo.ai_overview_appearances > 0) score_aeo += 3;
  if ((aeo.service_pages_count || 0) >= 3) score_aeo += 2;
  score_aeo = Math.min(25, score_aeo);

  return {
    score_seo,
    score_llm,
    score_presence,
    score_aeo,
    score_total: score_seo + score_llm + score_presence + score_aeo,
  };
}
