// Optional AI helpers. Calls the Anthropic Messages API directly from the browser.
// The API key is passed in per call and never stored or logged.

export type Verdict = 'verifies' | 'weak' | 'does_not_verify';
export interface AiVerdict {
  verdict: Verdict;
  reason: string;
}

export const MAX_STEPS_PER_CLICK = 10;
export const DEFAULT_MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';
// Models that accept server-side refusal fallbacks.
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
const VERDICTS = new Set<Verdict>(['verifies', 'weak', 'does_not_verify']);

const between = (text: string, open: string, close: string) => {
  const start = text.indexOf(open);
  const end = text.lastIndexOf(close);
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
};

/** Parses JSON from a model reply: raw JSON, JSON in a ``` code fence, or the first {...}/[...] span. */
export function parseJsonReply(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  for (const candidate of [text.trim(), fenced?.trim(), between(text, '[', ']'), between(text, '{', '}')]) {
    if (!candidate) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}

const asItems = (value: unknown): Record<string, unknown>[] => {
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
  return list.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && typeof v.id === 'string');
};

/** Validates a verdict reply into { id: verdict }. Unknown or malformed items are dropped. */
export function parseVerdicts(text: string): Record<string, AiVerdict> {
  const out: Record<string, AiVerdict> = {};
  for (const item of asItems(parseJsonReply(text))) {
    if (VERDICTS.has(item.verdict as Verdict) && typeof item.reason === 'string') {
      out[item.id as string] = { verdict: item.verdict as Verdict, reason: item.reason.slice(0, 300) };
    }
  }
  return out;
}

/** Validates a draft-code reply into { id: code }. */
export function parseDrafts(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of asItems(parseJsonReply(text))) {
    if (typeof item.code === 'string' && item.code.trim()) out[item.id as string] = item.code.trim().slice(0, 3000);
  }
  return out;
}

export interface CheckItem {
  id: string;
  step: string;
  expected: string;
  assertions: string[];
}

export interface DraftItem {
  id: string;
  step: string;
  expected?: string;
  existingTest: string[];
}

export const checkPrompt = (items: CheckItem[]) => `For each item, decide whether any of the listed Playwright assertions really verifies the manual expected result.
- "verifies": an assertion clearly checks the expected result.
- "weak": an assertion is related but would also pass when the expected result is wrong (for example, it only checks a generic heading).
- "does_not_verify": no assertion checks the expected result.
Answer with JSON only, no prose, no code fence: [{"id": "<id>", "verdict": "verifies" | "weak" | "does_not_verify", "reason": "<one short sentence>"}]

Items:
${JSON.stringify(items, null, 2)}`;

export const draftPrompt = (items: DraftItem[]) => `For each item, write a short Playwright TypeScript snippet that automates the manual step and asserts its expected result (if given).
Write only the lines that go inside an existing test body that has \`page\` and \`expect\`. Reuse the style and locators of the existing test lines. Keep it under 8 lines.
Answer with JSON only, no prose, no code fence: [{"id": "<id>", "code": "<snippet>"}]

Items:
${JSON.stringify(items, null, 2)}`;

/** Sends one prompt and returns the reply text. Throws an Error with a user-friendly message. */
export async function callClaude(apiKey: string, model: string, prompt: string): Promise<string> {
  const useFallback = FALLBACK_MODELS.has(model);
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (useFallback) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  const body = {
    model,
    max_tokens: 16000,
    system: 'You review Playwright end-to-end tests against manual test cases. Reply with JSON only.',
    messages: [{ role: 'user', content: prompt }],
    ...(useFallback ? { fallbacks: 'default' } : {}),
  };

  let res: Response;
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new Error('Could not reach the Anthropic API. Check your network connection.');
  }
  const data = await res.json().catch(() => undefined);
  if (!res.ok) {
    if (res.status === 401) throw new Error('The API key was rejected. Check that you pasted it correctly.');
    if (res.status === 429) throw new Error('Rate limited by the API. Wait a moment and try again.');
    throw new Error(`API error ${res.status}: ${data?.error?.message ?? 'unknown error'}`);
  }
  if (data?.stop_reason === 'refusal') throw new Error('The model declined this request.');
  const text = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  if (!text) throw new Error('The model returned an empty reply.');
  return text;
}
