import { describe, expect, it } from 'vitest';
import { parseManualCases } from './parseManual';

describe('parseManualCases', () => {
  it('parses inline "| Expected:" results', () => {
    const [c] = parseManualCases('TC-1: Login\n1. Navigate to /login | Expected: Login form is displayed');
    expect(c).toEqual({
      id: 'TC-1',
      title: 'Login',
      steps: [{ number: 1, text: 'Navigate to /login', expected: 'Login form is displayed' }],
    });
  });

  it('parses "Expected:" on the next line', () => {
    const [c] = parseManualCases('TC-2: Login\n1. Click Sign in\n   Expected: Dashboard opens');
    expect(c.steps[0]).toEqual({ number: 1, text: 'Click Sign in', expected: 'Dashboard opens' });
  });

  it('allows steps without an expected result', () => {
    const [c] = parseManualCases('TC-3: Cart\n1. Navigate to /cart\n2. Click Checkout');
    expect(c.steps.map((s) => s.expected)).toEqual([undefined, undefined]);
  });

  it('parses multiple cases and "# " headers', () => {
    const cases = parseManualCases('TC-1: A\n1. Open /a\n\n# Second case\n1. Open /b\n2. Click Save');
    expect(cases.map((c) => c.title)).toEqual(['A', 'Second case']);
    expect(cases[1].steps).toHaveLength(2);
  });

  it('returns nothing for text without numbered steps', () => {
    expect(parseManualCases('hello world\nTC-1: no steps')).toEqual([]);
  });
});
