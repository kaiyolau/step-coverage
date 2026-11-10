import { describe, expect, it } from 'vitest';
import { stepVerb, tokenize } from './tokenize';

describe('tokenize', () => {
  it('splits camelCase, kebab-case and URLs and drops stopwords', () => {
    expect(tokenize('The user should see shippingCost')).toEqual(['see', 'shipping', 'cost']);
    expect(tokenize('promo-code')).toEqual(['promo', 'code']);
    expect(tokenize('https://shop.dev/cart?step=2')).toEqual(['http', 'shop', 'dev', 'cart', 'step', '2']);
  });

  it('applies light plural stemming', () => {
    expect(tokenize('items address')).toEqual(['item', 'address']);
  });
});

describe('synonym mapping', () => {
  it.each([
    ['Navigate to /login', 'goto'],
    ['Open the cart', 'goto'],
    ['Go to settings', 'goto'],
    ['Visit the home page', 'goto'],
    ['Click Save', 'click'],
    ['Press Submit', 'click'],
    ['Tap the menu', 'click'],
    ['Select the Submit button', 'click'],
    ['Enter email', 'fill'],
    ['Type the password', 'fill'],
    ['Input a name', 'fill'],
    ['Fill the form', 'fill'],
    ['Tick Remember me', 'check'],
    ['Check the terms box', 'check'],
    ['Choose Express shipping', 'select'],
    ['Select Express from the dropdown', 'select'],
  ])('"%s" -> %s', (text, verb) => {
    expect(stepVerb(text)).toBe(verb);
  });

  it('returns undefined when there is no known verb', () => {
    expect(stepVerb('Verify the total')).toBeUndefined();
  });
});
