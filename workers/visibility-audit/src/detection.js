export function detectMention(responseText, citations, detectionTerms) {
  const text = (responseText || '').toLowerCase();
  const allTerms = [
    ...(detectionTerms.names || []),
    ...(detectionTerms.domains || []),
    ...(detectionTerms.aliases || []),
  ].map(t => t.toLowerCase());

  for (const term of allTerms) {
    if (text.includes(term)) {
      return { mentioned: true, position: estimatePosition(text, term), source: 'text' };
    }
  }

  if (citations?.length) {
    for (const cite of citations) {
      const url = typeof cite === 'string' ? cite : cite?.url;
      if (!url) continue;
      for (const domain of (detectionTerms.domains || [])) {
        if (url.includes(domain)) {
          return { mentioned: true, position: null, source: 'citation' };
        }
      }
    }
  }

  return { mentioned: false, position: null, source: null };
}

function estimatePosition(text, term) {
  const idx = text.indexOf(term.toLowerCase());
  if (idx < 0) return null;
  const before = text.substring(0, idx);
  const numbers = before.match(/\d+\.\s/g);
  return numbers ? numbers.length + 1 : 1;
}

export function extractSnippet(text, detectionTerms, maxLen = 300) {
  const lower = (text || '').toLowerCase();
  const allTerms = [
    ...(detectionTerms.names || []),
    ...(detectionTerms.domains || []),
    ...(detectionTerms.aliases || []),
  ].map(t => t.toLowerCase());

  for (const term of allTerms) {
    const idx = lower.indexOf(term);
    if (idx >= 0) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(text.length, idx + term.length + 80);
      return (start > 0 ? '...' : '') + text.substring(start, end) + (end < text.length ? '...' : '');
    }
  }

  return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '');
}
