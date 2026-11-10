import { describe, expect, it } from 'vitest';
import { parsePlaywright } from './parsePlaywright';

const SPEC = `import { test, expect } from '@playwright/test';
test.describe('Auth', () => {
  test('logs in', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('qa@example.com');
    // await page.getByRole('button', { name: 'Ignored' }).click();
    await page
      .getByRole('button', { name: 'Sign in' })
      .click();
    await expect(page).toHaveURL(/\\/dashboard/);
    await expect(page.getByTestId('welcome-banner')).toBeVisible();
  });
});
test('settings', async ({ page }) => {
  await page.locator('#theme-select').selectOption('dark');
  await page.getByRole('checkbox', { name: 'Newsletter' }).check();
  await expect(page.getByText('Saved')).not.toBeVisible();
});`;

describe('parsePlaywright', () => {
  const tests = parsePlaywright(SPEC);

  it('finds test blocks and ignores test.describe', () => {
    expect(tests.map((t) => t.title)).toEqual(['logs in', 'settings']);
  });

  it('extracts actions with canonical verbs and tokens', () => {
    const [login] = tests;
    expect(login.actions.map((a) => a.verb)).toEqual(['goto', 'fill', 'click']);
    expect(login.actions[0].tokens).toEqual(['login']);
    expect(login.actions[1].tokens).toEqual(expect.arrayContaining(['email', 'qa', 'example', 'com']));
    expect(tests[1].actions.map((a) => a.method)).toEqual(['selectOption', 'check']);
  });

  it('joins multi-line chains and skips commented-out code', () => {
    const click = tests[0].actions[2];
    expect(click.code).toContain("getByRole('button', { name: 'Sign in' })");
    expect(click.lineNo).toBe(7);
    expect(tests[0].actions.some((a) => a.code.includes('Ignored'))).toBe(false);
  });

  it('extracts assertions with matcher and locator text', () => {
    const [url, visible] = tests[0].assertions;
    expect(url.method).toBe('toHaveURL');
    expect(url.tokens).toEqual(expect.arrayContaining(['dashboard', 'url']));
    expect(visible.locator).toBe("getByTestId('welcome-banner')");
    expect(visible.tokens).toEqual(expect.arrayContaining(['welcome', 'banner', 'visible']));
    expect(tests[1].assertions[0].method).toBe('toBeVisible');
  });

  it('keeps locator text for actions', () => {
    expect(tests[1].actions[0].locator).toBe("locator('#theme-select')");
    expect(tests[1].actions[0].tokens).toEqual(expect.arrayContaining(['theme', 'select', 'dark']));
  });

  it('returns nothing for non-Playwright text', () => {
    expect(parsePlaywright('const x = 1;')).toEqual([]);
  });
});
