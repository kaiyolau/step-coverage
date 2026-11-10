export interface ManualStep {
  number: number;
  text: string;
  expected?: string;
}

export interface ManualCase {
  id: string;
  title: string;
  steps: ManualStep[];
}

const TC_HEADER = /^(TC-[\w-]+)\s*:\s*(.*)$/i;
const HASH_HEADER = /^#+\s+(.+)$/;
const STEP = /^(\d+)[.)]\s+(.+)$/;
const EXPECTED_LINE = /^Expected\s*:\s*(.*)$/i;
const EXPECTED_INLINE = /\s*\|\s*Expected\s*:\s*/i;

/** Parses "TC-1: title" / "# title" headers followed by numbered steps. */
export function parseManualCases(text: string): ManualCase[] {
  const cases: ManualCase[] = [];
  let current: ManualCase | undefined;
  const start = (id: string, title: string) => {
    current = { id, title, steps: [] };
    cases.push(current);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) continue;
    if ((m = line.match(TC_HEADER))) start(m[1].toUpperCase(), m[2].trim() || m[1]);
    else if ((m = line.match(HASH_HEADER))) start(`Case ${cases.length + 1}`, m[1].trim());
    else if ((m = line.match(STEP))) {
      if (!current) start('Case 1', 'Untitled case');
      const [stepText, expected] = m[2].split(EXPECTED_INLINE);
      current!.steps.push({ number: Number(m[1]), text: stepText.trim(), expected: expected?.trim() || undefined });
    } else if ((m = line.match(EXPECTED_LINE)) && current?.steps.length) {
      current.steps[current.steps.length - 1].expected = m[1].trim() || undefined;
    }
  }
  return cases.filter((c) => c.steps.length > 0);
}
