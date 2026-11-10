import { describe, expect, it } from 'vitest';
import { analyze, matchStep, suggestTest, toChecklist } from './match';
import { parseManualCases } from './parseManual';
import { parsePlaywright } from './parsePlaywright';
import { SAMPLE_MANUAL, SAMPLE_PLAYWRIGHT } from './sample';

const [test1] = parsePlaywright(`test('login', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\\/dashboard/);
});`);

const step = (text: string, expected?: string) => ({ number: 1, text, expected });

describe('matchStep statuses', () => {
  it('COVERED when the action matches and there is no expected result', () => {
    expect(matchStep(step('Navigate to /login'), test1, 0.34).status).toBe('covered');
  });

  it('COVERED when the action and the expected result both match', () => {
    const r = matchStep(step('Click Sign in', 'User is redirected to /dashboard'), test1, 0.34);
    expect(r.status).toBe('covered');
    expect(r.assertion?.matched).toEqual(['dashboard']);
  });

  it('PARTIAL when the action matches but nothing asserts the expected result', () => {
    const r = matchStep(step('Click Sign in', 'Error message is shown'), test1, 0.34);
    expect(r.status).toBe('partial');
    expect(r.action?.line.method).toBe('click');
  });

  it('NOT COVERED when no action matches', () => {
    expect(matchStep(step('Click Forgot password link'), test1, 0.34).status).toBe('not_covered');
  });

  it('NOT COVERED when the verb differs, even if keywords overlap', () => {
    expect(matchStep(step('Tick the Sign in checkbox'), test1, 0.34).status).toBe('not_covered');
  });

  it('NOT COVERED for every step when no test is chosen', () => {
    expect(matchStep(step('Navigate to /login'), undefined, 0.34).status).toBe('not_covered');
  });

  it('NEEDS HUMAN JUDGMENT for subjective wording, even if automated', () => {
    expect(matchStep(step('Navigate to /login', 'Page looks clean'), test1, 0.34).status).toBe('human');
    expect(matchStep(step('Check the layout on mobile'), test1, 0.34).status).toBe('human');
  });

  it('threshold changes the outcome', () => {
    const s = step('Click Sign in', 'Dashboard heading is visible');
    expect(matchStep(s, test1, 0.34).status).toBe('partial');
    expect(matchStep(s, test1, 0.3).status).toBe('covered');
  });
});

describe('sample data', () => {
  const cases = parseManualCases(SAMPLE_MANUAL);
  const tests = parsePlaywright(SAMPLE_PLAYWRIGHT);

  it('picks the matching test for each case', () => {
    expect(cases.map((c) => suggestTest(c, tests))).toEqual([0, 1, 2]);
  });

  it('shows all four statuses', () => {
    const statuses = new Set(analyze(cases, tests, 0.34).flatMap((r) => r.steps.map((s) => s.status)));
    expect([...statuses].sort()).toEqual(['covered', 'human', 'not_covered', 'partial']);
  });

  it('includes a weak heading assertion that still leaves a step PARTIAL', () => {
    const tc3 = analyze(cases, tests, 0.34)[2];
    expect(tc3.steps[1].status).toBe('partial');
    expect(tests[2].assertions.some((a) => a.code.includes("getByRole('heading', { level: 1 })"))).toBe(true);
  });

  it('checklist skips steps the caller marks as resolved', () => {
    const md = toChecklist(analyze(cases, tests, 0.34), (id) => id === 'TC-2:4');
    expect(md).not.toContain('Step 4: Click Sign in');
    expect(md).toContain('Step 6: Click "Forgot password?" link');
  });

  it('respects a "No automated test" override and builds a checklist', () => {
    const results = analyze(cases, tests, 0.34, { '0:TC-1': -1 });
    expect(results[0].testIndex).toBe(-1);
    expect(results[0].counts.covered).toBe(0);
    expect(toChecklist(results)).toContain('- [ ] Step 4: Tick the Remember me checkbox [NOT COVERED]');
  });
});
