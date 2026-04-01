import { detectMention, extractSnippet } from '../detection.js';

export async function checkLLMRecommendations(prompts, detectionTerms, env) {
  const results = [];
  for (const prompt of prompts) {
    const models = {};
    const checks = await Promise.allSettled([
      queryClaude(prompt, env),
      queryChatGPT(prompt, env),
      queryGemini(prompt, env),
      queryGrok(prompt, env),
    ]);

    const modelNames = ['claude', 'chatgpt', 'gemini', 'grok'];
    for (let i = 0; i < checks.length; i++) {
      const name = modelNames[i];
      if (checks[i].status === 'fulfilled') {
        const { text, citations } = checks[i].value;
        const detection = detectMention(text, citations, detectionTerms);
        models[name] = {
          mentioned: detection.mentioned,
          position: detection.position,
          raw_snippet: extractSnippet(text, detectionTerms),
          ...(citations?.length ? { citations } : {}),
        };
      } else {
        models[name] = {
          mentioned: false,
          position: null,
          raw_snippet: `Error: ${checks[i].reason?.message || 'Unknown error'}`,
          error: true,
        };
      }
    }

    results.push({ prompt, models });
  }
  return results;
}

async function queryClaude(prompt, env) {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`Claude API ${resp.status}`);
  const data = await resp.json();

  let text = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') text += block.text;
  }
  return { text, citations: [] };
}

async function queryChatGPT(prompt, env) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      tools: [{ type: 'web_search_preview' }],
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!resp.ok) throw new Error(`OpenAI API ${resp.status}`);
  const data = await resp.json();

  const text = data.choices?.[0]?.message?.content || '';
  return { text, citations: [] };
}

async function queryGemini(prompt, env) {
  if (!env.GOOGLE_API_KEY) throw new Error('GOOGLE_API_KEY not configured');
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${env.GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
      }),
    }
  );

  if (!resp.ok) throw new Error(`Gemini API ${resp.status}`);
  const data = await resp.json();

  let text = '';
  const candidates = data.candidates || [];
  for (const candidate of candidates) {
    for (const part of (candidate.content?.parts || [])) {
      if (part.text) text += part.text;
    }
  }

  // Extract grounding citations
  const citations = [];
  const groundingMetadata = candidates[0]?.groundingMetadata;
  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web?.uri) citations.push(chunk.web.uri);
    }
  }

  return { text, citations };
}

async function queryGrok(prompt, env) {
  if (!env.XAI_API_KEY) throw new Error('XAI_API_KEY not configured');
  const resp = await fetch('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-4-1-fast',
      input: [{ role: 'user', content: prompt }],
      tools: [{ type: 'web_search' }],
    }),
  });

  if (!resp.ok) throw new Error(`Grok API ${resp.status}`);
  const data = await resp.json();

  const text = (data.output || [])
    .filter(item => item.type === 'text')
    .map(item => item.text)
    .join(' ');

  const citations = [];
  for (const item of (data.output || [])) {
    if (item.type === 'tool_result' && item.content) {
      for (const c of (Array.isArray(item.content) ? item.content : [item.content])) {
        if (c.url) citations.push(c.url);
      }
    }
  }

  return { text, citations };
}

