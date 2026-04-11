// Thin wrapper around the Anthropic Messages API.
// Model ID is pinned here so prompt tuning / model upgrades are a single edit.

const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';
const CLAUDE_URL = 'https://api.anthropic.com/v1/messages';

export async function callClaude(env, { system, user, maxTokens = 4096 }) {
  const resp = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${text.slice(0, 300)}`);
  }

  const data = await resp.json();
  const block = data.content?.find(b => b.type === 'text');
  return block?.text || '';
}

// Extracts a JSON object from Claude's response, even if wrapped in prose or
// fenced with ```json. Throws if no valid JSON is found.
export function extractJson(text) {
  if (!text) throw new Error('Empty response');
  // Strip markdown fencing if present
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  // Find first { and last } to slice out the object
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('No JSON object found in response');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
