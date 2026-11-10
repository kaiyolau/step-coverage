// Demo data: designed so the result shows all four statuses.
import type { AiVerdict } from './ai';

export const SAMPLE_MANUAL = `TC-1: Login with valid credentials
1. Navigate to /login | Expected: Login form is displayed
2. Enter email in the Email field
3. Enter password in the Password field
4. Tick the Remember me checkbox
5. Click Sign in | Expected: User is redirected to /dashboard
6. Verify the dashboard looks correct after login

TC-2: Login with wrong password
1. Navigate to /login
2. Enter a registered email
3. Enter a wrong password
4. Click Sign in
Expected: Error message "Invalid email or password" is shown
5. Verify the error text is readable
6. Click "Forgot password?" link | Expected: Password reset page opens

TC-3: Checkout with saved card
1. Navigate to /cart | Expected: Cart shows 2 items
2. Click Proceed to checkout | Expected: Checkout page is displayed
3. Select "Express" from the Shipping method dropdown | Expected: Shipping cost updates to $9.99
4. Enter promo code SAVE10 | Expected: Discount of 10% is applied
5. Click Place order | Expected: Order confirmation number is displayed
6. Check that the checkout layout feels intuitive on mobile
`;

export const SAMPLE_PLAYWRIGHT = `import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('form', { name: 'Login' })).toBeVisible();
    await page.getByLabel('Email').fill('qa@example.com');
    await page.getByLabel('Password').fill('S3cret!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\\/dashboard/);
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('qa@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // TODO: assert the error message
    await expect(page).toHaveURL(/\\/login/);
  });
});

test('checkout with saved card', async ({ page }) => {
  await page.goto('/cart');
  await expect(page.getByTestId('cart-item')).toHaveCount(2);
  await page.getByRole('button', { name: 'Proceed to checkout' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('Shipping method').selectOption('Express');
  await expect(page.getByTestId('shipping-cost')).toHaveText('$9.99');
  await page.getByRole('button', { name: 'Place order' }).click();
  await expect(page.getByText('Order confirmed')).toBeVisible();
});
`;

// Pre-saved AI output for the sample data, so the demo works without an API key.
// Keys are "<case id>:<step number>".
export const SAMPLE_AI_VERDICTS: Record<string, AiVerdict> = {
  'TC-2:4': {
    verdict: 'does_not_verify',
    reason: 'toHaveURL(/login/) only shows the user stayed on the login page; nothing checks the error message.',
  },
  'TC-3:2': {
    verdict: 'weak',
    reason: 'The h1 heading check passes on almost every page, so it does not prove the checkout page opened.',
  },
};

export const SAMPLE_AI_DRAFTS: Record<string, string> = {
  'TC-1:4': `await page.getByLabel('Remember me').check();
await expect(page.getByLabel('Remember me')).toBeChecked();`,
  'TC-2:6': `await page.getByRole('link', { name: 'Forgot password?' }).click();
await expect(page).toHaveURL(/\\/reset-password/);
await expect(page.getByRole('heading', { name: 'Reset password' })).toBeVisible();`,
  'TC-3:4': `await page.getByLabel('Promo code').fill('SAVE10');
await page.getByRole('button', { name: 'Apply' }).click();
await expect(page.getByTestId('discount')).toContainText('10%');`,
};
