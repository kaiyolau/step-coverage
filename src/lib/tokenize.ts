// Shared text normalization for manual steps and Playwright code.

export const STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'and', 'or', 'is', 'are', 'be', 'been', 'should', 'user', 'of', 'on', 'in',
  'for', 'with', 'that', 'this', 'it', 'its', 'as', 'at', 'by', 'from', 'into', 'then', 'will', 'can',
  'has', 'have', 'was', 'not', 'my', 'your', 'me', 'i', 'we', 'you', 'after', 'when', 'if',
]);

// Many words -> one canonical word, so "navigate" and page.goto() compare equal.
const SYNONYMS: Record<string, string> = {
  navigate: 'goto', open: 'goto', visit: 'goto', goto: 'goto',
  click: 'click', press: 'click', tap: 'click',
  enter: 'fill', type: 'fill', input: 'fill', fill: 'fill',
  check: 'check', tick: 'check',
  choose: 'select', select: 'select',
  display: 'visible', displayed: 'visible', show: 'visible', shown: 'visible', appear: 'visible',
  appears: 'visible', visible: 'visible',
};

/** Canonical verbs a manual step can carry. */
export const VERBS = new Set(['goto', 'click', 'fill', 'check', 'select']);

// Very light stemming: drop a plural "s" ("items" -> "item").
const stem = (w: string) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);

/** Lowercase keyword tokens: splits camelCase, kebab-case, URLs; drops stopwords; maps synonyms. */
export function tokenize(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/\bgo to\b/g, 'goto')
    .split(/[^a-z0-9]+/);
  const out = new Set<string>();
  for (const w of words) {
    if (!w || STOPWORDS.has(w)) continue;
    out.add(SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? stem(w));
  }
  return [...out];
}

/** The canonical verb of a manual step, if any. "Select" on a button/link means click. */
export function stepVerb(text: string): string | undefined {
  const verb = tokenize(text).find((t) => VERBS.has(t));
  if (verb === 'select' && /\b(button|link|tab|icon)\b/i.test(text)) return 'click';
  return verb;
}
