import type { ManualCase, ManualStep } from './parseManual';
import type { PwLine, PwTest } from './parsePlaywright';
import { VERBS, stepVerb, tokenize } from './tokenize';

export type Status = 'covered' | 'partial' | 'not_covered' | 'human';

export const STATUS_LABEL: Record<Status, string> = {
  covered: 'COVERED',
  partial: 'PARTIAL',
  not_covered: 'NOT COVERED',
  human: 'NEEDS HUMAN JUDGMENT',
};

export const HUMAN_WORDS = /\b(looks?|feels?|visually|visual|readable|aesthetic\w*|colou?rs?|layout|smooth\w*|intuitive)\b/i;

export interface LineMatch {
  line: PwLine;
  matched: string[];
  score: number;
}

export interface StepResult {
  step: ManualStep;
  status: Status;
  action?: LineMatch;
  assertion?: LineMatch;
}

export interface CaseResult {
  manualCase: ManualCase;
  key: string;
  suggestedIndex: number; // -1 = no automated test
  testIndex: number;
  steps: StepResult[];
  counts: Record<Status, number>;
  coverage: number; // COVERED / total steps
}

export function jaccard(a: string[], b: string[]): number {
  const setB = new Set(b);
  const union = new Set([...a, ...b]).size;
  return union ? a.filter((t) => setB.has(t)).length / union : 0;
}

/** Index of the Playwright test with the highest token overlap, or -1. */
export function suggestTest(c: ManualCase, tests: PwTest[]): number {
  const caseTokens = tokenize([c.title, ...c.steps.map((s) => `${s.text} ${s.expected ?? ''}`)].join(' '));
  let best = -1;
  let bestScore = 0;
  tests.forEach((t, i) => {
    const score = jaccard(caseTokens, t.tokens);
    if (score > bestScore) [best, bestScore] = [i, score];
  });
  return best;
}

const contentTokens = (text: string) => tokenize(text).filter((t) => !VERBS.has(t));

/** Best line by share of the step's keywords found in it. If a verb is given, the line's verb must match. */
export function bestLine(content: string[], lines: PwLine[], verb?: string): LineMatch | undefined {
  let best: LineMatch | undefined;
  for (const line of lines) {
    if (verb && line.verb !== verb) continue;
    const matched = content.filter((t) => line.tokens.includes(t));
    const score = content.length ? matched.length / content.length : verb ? 1 : 0;
    if (!best || score > best.score) best = { line, matched, score };
  }
  return best;
}

export function matchStep(step: ManualStep, test: PwTest | undefined, threshold: number): StepResult {
  if (HUMAN_WORDS.test(`${step.text} ${step.expected ?? ''}`)) return { step, status: 'human' };
  if (!test) return { step, status: 'not_covered' };
  const action = bestLine(contentTokens(step.text), test.actions, stepVerb(step.text));
  if (!action || action.score < threshold) return { step, status: 'not_covered' };
  if (!step.expected) return { step, status: 'covered', action };
  const assertion = bestLine(contentTokens(step.expected), test.assertions);
  if (assertion && assertion.score >= threshold) return { step, status: 'covered', action, assertion };
  return { step, status: 'partial', action };
}

/** overrides: case key -> chosen test index (-1 = "No automated test"). */
export function analyze(cases: ManualCase[], tests: PwTest[], threshold: number, overrides: Record<string, number> = {}): CaseResult[] {
  return cases.map((c, i) => {
    const key = `${i}:${c.id}`;
    const suggestedIndex = suggestTest(c, tests);
    const override = overrides[key];
    const testIndex = override !== undefined && override < tests.length ? override : suggestedIndex;
    const steps = c.steps.map((s) => matchStep(s, tests[testIndex], threshold));
    const counts: Record<Status, number> = { covered: 0, partial: 0, not_covered: 0, human: 0 };
    steps.forEach((s) => counts[s.status]++);
    return { manualCase: c, key, suggestedIndex, testIndex, steps, counts, coverage: steps.length ? counts.covered / steps.length : 0 };
  });
}

export function overallCoverage(results: CaseResult[]): number {
  const total = results.reduce((n, r) => n + r.steps.length, 0);
  return total ? results.reduce((n, r) => n + r.counts.covered, 0) / total : 0;
}

/** Stable id of a step, used as the key for AI results: "<case id>:<step number>". */
export const stepId = (c: ManualCase, s: ManualStep) => `${c.id}:${s.number}`;

/** Markdown checklist of every step that is not COVERED, minus steps the caller marks as resolved. */
export function toChecklist(results: CaseResult[], resolved: (id: string) => boolean = () => false): string {
  const out = ['# Still needs manual testing', ''];
  for (const r of results) {
    const todo = r.steps.filter((s) => s.status !== 'covered' && !resolved(stepId(r.manualCase, s.step)));
    if (!todo.length) continue;
    out.push(`## ${r.manualCase.id}: ${r.manualCase.title}`);
    for (const { step, status } of todo) {
      const expected = step.expected ? ` (Expected: ${step.expected})` : '';
      out.push(`- [ ] Step ${step.number}: ${step.text}${expected} [${STATUS_LABEL[status]}]`);
    }
    out.push('');
  }
  return out.join('\n').trim() + '\n';
}
