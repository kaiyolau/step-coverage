import { tokenize } from './tokenize';

export interface PwLine {
  kind: 'action' | 'assertion';
  method: string; // e.g. "click" or "toBeVisible"
  verb: string; // canonical verb for actions, "expect" for assertions
  locator?: string; // e.g. getByRole('button', { name: 'Sign in' })
  code: string;
  lineNo: number;
  tokens: string[];
}

export interface PwTest {
  title: string;
  lineNo: number;
  actions: PwLine[];
  assertions: PwLine[];
  tokens: string[];
}

const ACTION_VERBS: Record<string, string> = {
  goto: 'goto', click: 'click', dblclick: 'click', press: 'click', fill: 'fill', type: 'fill',
  check: 'check', uncheck: 'uncheck', selectOption: 'select', hover: 'hover', setInputFiles: 'upload',
};
const ACTION_RE = /\.(goto|click|dblclick|fill|check|uncheck|selectOption|press|type|hover|setInputFiles)\s*\(/g;
const ASSERT_RE = /\bexpect(?:\.soft)?\s*\([\s\S]*\)\s*(?:\.not)?\s*\.(to[A-Z]\w*)\s*\(/;
const LOCATOR_RE = /\b(?:getBy(?:Role|Label|Text|TestId|Placeholder|AltText|Title)|locator)\s*\([^)]*\)/g;
const STRING_RE = /(['"`])((?:\\.|(?!\1)[^\\])*?)\1/g;
const REGEX_RE = /[(,]\s*\/((?:\\.|[^/\\\n])+)\/[a-z]*/g;
const TEST_RE = /\btest(?:\.only|\.skip|\.fixme)?\s*\(\s*(['"`])((?:\\.|(?!\1).)*?)\1/g;

// Replace comments with spaces so line numbers stay correct. "//" after ":" (URLs) is kept.
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/(^|\s)\/\/.*$/gm, '$1');

function skipString(src: string, i: number): number {
  for (let j = i + 1; j < src.length; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === src[i]) return j;
  }
  return src.length;
}

function blockEnd(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') i = skipString(src, i);
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return src.length;
}

const lineOf = (src: string, index: number) => src.slice(0, index).split('\n').length;

/** Groups body lines into statements, joining lines until parentheses balance and the chain ends. */
function statements(body: string, firstLine: number) {
  const out: { code: string; lineNo: number }[] = [];
  let buf = '';
  let depth = 0;
  let start = firstLine;
  const lines = body.split('\n');
  lines.forEach((line, i) => {
    if (!buf.trim()) start = firstLine + i;
    buf += line + '\n';
    depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
    const chainContinues = lines[i + 1]?.trim().startsWith('.');
    if ((depth <= 0 && !chainContinues) || line.trim().endsWith('{')) {
      if (buf.trim()) out.push({ code: buf.trim().replace(/\s*\n\s*/g, ' '), lineNo: start });
      buf = '';
      depth = 0;
    }
  });
  return out;
}

function classify(code: string, lineNo: number): PwLine | undefined {
  const strings = [...code.matchAll(STRING_RE)].map((m) => m[2]);
  const regexes = [...code.matchAll(REGEX_RE)].map((m) => m[1].replace(/\\/g, ''));
  const locator = code.match(LOCATOR_RE)?.join('.');
  const assertion = code.match(ASSERT_RE);
  if (assertion) {
    const method = assertion[1];
    const tokens = tokenize([...strings, ...regexes, method.slice(2)].join(' '));
    return { kind: 'assertion', method, verb: 'expect', locator, code, lineNo, tokens };
  }
  const action = [...code.matchAll(ACTION_RE)].pop();
  if (!action) return undefined;
  const method = action[1];
  return { kind: 'action', method, verb: ACTION_VERBS[method], locator, code, lineNo, tokens: tokenize([...strings, ...regexes].join(' ')) };
}

/** Finds test('title', ...) blocks and extracts actions and assertions from each. */
export function parsePlaywright(source: string): PwTest[] {
  const src = stripComments(source);
  const tests: PwTest[] = [];
  for (const m of src.matchAll(TEST_RE)) {
    const arrow = src.indexOf('=>', m.index);
    const open = arrow < 0 ? -1 : src.indexOf('{', arrow);
    if (open < 0) continue;
    const close = blockEnd(src, open);
    const body = src.slice(open + 1, close);
    const lines = statements(body, lineOf(src, open)).map((s) => classify(s.code, s.lineNo)).filter((l) => !!l);
    const title = m[2];
    tests.push({
      title,
      lineNo: lineOf(src, m.index!),
      actions: lines.filter((l) => l.kind === 'action'),
      assertions: lines.filter((l) => l.kind === 'assertion'),
      tokens: [...new Set([...tokenize(title), ...lines.flatMap((l) => l.tokens)])],
    });
  }
  return tests;
}
