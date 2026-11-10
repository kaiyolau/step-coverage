import { describe, expect, it } from 'vitest';
import { parseDrafts, parseJsonReply, parseVerdicts } from './ai';

describe('parseJsonReply', () => {
  it('parses plain JSON', () => {
    expect(parseJsonReply('[{"id":"TC-1:2","verdict":"weak","reason":"x"}]')).toEqual([{ id: 'TC-1:2', verdict: 'weak', reason: 'x' }]);
  });

  it('parses JSON inside a code fence', () => {
    const reply = 'Here you go:\n```json\n{"id": "TC-1:2", "code": "await page.goto(\'/\');"}\n```\nDone.';
    expect(parseJsonReply(reply)).toEqual({ id: 'TC-1:2', code: "await page.goto('/');" });
  });

  it('finds JSON surrounded by prose', () => {
    expect(parseJsonReply('Result: [{"id":"a"}] hope this helps')).toEqual([{ id: 'a' }]);
  });

  it('returns undefined for invalid text', () => {
    expect(parseJsonReply('Sorry, I cannot help with that.')).toBeUndefined();
    expect(parseJsonReply('{"id": "broken",')).toBeUndefined();
  });
});

describe('parseVerdicts / parseDrafts', () => {
  it('keeps only valid verdict items', () => {
    const reply = JSON.stringify([
      { id: 'TC-1:1', verdict: 'verifies', reason: 'ok' },
      { id: 'TC-1:2', verdict: 'maybe', reason: 'bad verdict' },
      { id: 'TC-1:3', verdict: 'weak' },
      { verdict: 'weak', reason: 'no id' },
    ]);
    expect(parseVerdicts(reply)).toEqual({ 'TC-1:1': { verdict: 'verifies', reason: 'ok' } });
  });

  it('returns empty results for invalid text', () => {
    expect(parseVerdicts('not json')).toEqual({});
    expect(parseDrafts('not json')).toEqual({});
  });

  it('reads drafts from a fenced reply', () => {
    const reply = '```\n[{"id":"TC-2:6","code":"await page.click(\'a\');"}]\n```';
    expect(parseDrafts(reply)).toEqual({ 'TC-2:6': "await page.click('a');" });
  });
});
