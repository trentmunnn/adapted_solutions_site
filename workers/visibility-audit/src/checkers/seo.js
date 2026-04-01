export async function checkSEOPositions(keywords, clientDomain, env) {
  const results = [];
  for (const kw of keywords) {
    try {
      const result = await checkSingleKeyword(kw, clientDomain, env);
      results.push(result);
    } catch (err) {
      results.push({
        keyword: kw.keyword,
        volume: kw.volume,
        category: kw.category,
        position: null,
        in_local_pack: false,
        top_3: [],
        note: `Error: ${err.message}`,
      });
    }
  }
  return results;
}

async function checkSingleKeyword(kw, clientDomain, env) {
  const allResults = [];

  // Check first 50 results (5 pages of 10)
  for (let start = 1; start <= 41; start += 10) {
    const url = `https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_KEY}&cx=${env.GOOGLE_CSE_ID}&q=${encodeURIComponent(kw.keyword)}&num=10&start=${start}`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        if (resp.status === 429) break; // Rate limited, stop pagination
        continue;
      }
      const data = await resp.json();
      if (data.items) allResults.push(...data.items);
      if (!data.items || data.items.length < 10) break; // No more results
    } catch {
      break;
    }
  }

  // Find client position
  const domain = clientDomain.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/$/, '');
  const position = allResults.findIndex(item => {
    const itemDomain = (item.link || '').replace(/^(https?:\/\/)?(www\.)?/, '');
    return itemDomain.includes(domain);
  });

  // Check for local pack (map results in search features)
  const inLocalPack = allResults.some(item =>
    item.link?.includes('maps.google') ||
    item.pagemap?.metatags?.[0]?.['og:type'] === 'place'
  );

  return {
    keyword: kw.keyword,
    volume: kw.volume,
    category: kw.category,
    position: position >= 0 ? position + 1 : null,
    in_local_pack: inLocalPack,
    top_3: allResults.slice(0, 3).map(i => ({ title: i.title, url: i.link })),
    note: position >= 0
      ? `Found at position ${position + 1}`
      : `Not found in first ${allResults.length} results`,
  };
}
