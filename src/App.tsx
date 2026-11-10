import { useMemo, useState } from 'react';
import { parseManualCases } from './lib/parseManual';
import { parsePlaywright } from './lib/parsePlaywright';
import { analyze, overallCoverage, stepId, toChecklist, STATUS_LABEL, type CaseResult, type LineMatch, type Status, type StepResult } from './lib/match';
import { SAMPLE_AI_DRAFTS, SAMPLE_AI_VERDICTS, SAMPLE_MANUAL, SAMPLE_PLAYWRIGHT } from './lib/sample';
import { callClaude, checkPrompt, draftPrompt, parseDrafts, parseVerdicts, DEFAULT_MODEL, MAX_STEPS_PER_CLICK, type AiVerdict } from './lib/ai';
import { AiPanel, DraftBox, VerdictBadge } from './AiPanel';

const BADGE: Record<Status, string> = {
  covered: 'bg-emerald-100 text-emerald-800',
  partial: 'bg-amber-100 text-amber-800',
  not_covered: 'bg-rose-100 text-rose-800',
  human: 'bg-sky-100 text-sky-800',
};

const WHY: Record<Status, string> = {
  covered: 'Action and expected result are automated',
  partial: 'Action is automated, but the expected result is never asserted',
  not_covered: 'No matching Playwright action',
  human: 'Subjective check, keep it manual (not counted as a gap)',
};

const MANUAL_FORMAT = `TC-1: Login with valid credentials
1. Navigate to /login | Expected: Login form is displayed
2. Click Sign in
Expected: User is redirected to /dashboard`;

const pct = (n: number) => `${Math.round(n * 100)}%`;

interface Ai {
  verdicts: Record<string, AiVerdict>;
  drafts: Record<string, string>;
}

function Badge({ status }: { status: Status }) {
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${BADGE[status]}`}>{STATUS_LABEL[status]}</span>;
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full rounded bg-slate-200">
      <div className="h-2 rounded bg-emerald-500" style={{ width: pct(value) }} />
    </div>
  );
}

function MatchLine({ label, m }: { label: string; m: LineMatch }) {
  return (
    <div className="mb-1">
      <div className="font-mono text-[11px] text-slate-700">
        <span className="text-slate-400">{label} L{m.line.lineNo}:</span> {m.line.code}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1">
        {m.matched.map((t) => <span key={t} className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-600">{t}</span>)}
        <span className="text-[10px] text-slate-400">score {m.score.toFixed(2)}</span>
      </div>
    </div>
  );
}

function StepRow({ r, verdict, draft }: { r: StepResult; verdict?: AiVerdict; draft?: string }) {
  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="py-2 pr-2 text-slate-400">{r.step.number}</td>
      <td className="py-2 pr-3">
        <div>{r.step.text}</div>
        {r.step.expected && <div className="text-xs text-slate-500">Expected: {r.step.expected}</div>}
      </td>
      <td className="py-2 pr-3"><Badge status={r.status} /></td>
      <td className="py-2">
        {r.action && <MatchLine label="action" m={r.action} />}
        {r.assertion && <MatchLine label="assert" m={r.assertion} />}
        <div className="text-xs text-slate-500">{r.status === 'covered' && !r.step.expected ? 'Action is automated (no expected result to check)' : WHY[r.status]}</div>
        {verdict && <div className="mt-1 text-xs text-slate-600"><VerdictBadge v={verdict} /> {verdict.reason}</div>}
        {draft && <DraftBox code={draft} />}
      </td>
    </tr>
  );
}

function CaseCard({ r, testTitles, onPick, ai }: { r: CaseResult; testTitles: string[]; onPick: (i: number) => void; ai: Ai }) {
  const { counts } = r;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{r.manualCase.id}: {r.manualCase.title}</h3>
        <span className="text-2xl font-bold">{pct(r.coverage)}</span>
      </div>
      <div className="my-2"><Bar value={r.coverage} /></div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <label>
          Playwright test:{' '}
          <select className="rounded border border-slate-300 px-1 py-0.5" value={r.testIndex} onChange={(e) => onPick(Number(e.target.value))}>
            {testTitles.map((t, i) => <option key={i} value={i}>{t}{i === r.suggestedIndex ? ' (best match)' : ''}</option>)}
            <option value={-1}>No automated test</option>
          </select>
        </label>
        <span>{counts.covered} covered · {counts.partial} partial · {counts.not_covered} not covered · {counts.human} human judgment</span>
      </div>
      <table className="mt-3 w-full text-sm">
        <thead><tr className="text-left text-xs uppercase text-slate-400"><th>#</th><th>Manual step</th><th>Status</th><th>Matched by</th></tr></thead>
        <tbody>
          {r.steps.map((s) => {
            const id = stepId(r.manualCase, s.step);
            return <StepRow key={id + s.step.text} r={s} verdict={s.status === 'partial' ? ai.verdicts[id] : undefined} draft={s.status === 'not_covered' ? ai.drafts[id] : undefined} />;
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function App() {
  const [manual, setManual] = useState(SAMPLE_MANUAL);
  const [playwright, setPlaywright] = useState(SAMPLE_PLAYWRIGHT);
  const [threshold, setThreshold] = useState(0.34);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [copyMsg, setCopyMsg] = useState('');
  // AI state. The API key lives in React state only: never persisted or logged.
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [liveAi, setLiveAi] = useState<Ai>({ verdicts: {}, drafts: {} });
  const [useSampleAi, setUseSampleAi] = useState(true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState('');

  const cases = useMemo(() => parseManualCases(manual), [manual]);
  const tests = useMemo(() => parsePlaywright(playwright), [playwright]);
  const results = useMemo(() => analyze(cases, tests, threshold, overrides), [cases, tests, threshold, overrides]);
  const ready = cases.length > 0 && tests.length > 0;
  const isSample = manual === SAMPLE_MANUAL && playwright === SAMPLE_PLAYWRIGHT;
  const ai: Ai = isSample && useSampleAi ? { verdicts: SAMPLE_AI_VERDICTS, drafts: SAMPLE_AI_DRAFTS } : liveAi;

  // A PARTIAL step the AI says is verified leaves the manual list. Coverage % stays keyword-based.
  const resolved = (id: string) => ai.verdicts[id]?.verdict === 'verifies';
  const all = results.flatMap((r) => r.steps.map((s) => ({ r, s, id: stepId(r.manualCase, s.step) })));
  const todo = all.filter(({ s, id }) => s.status !== 'covered' && !(s.status === 'partial' && resolved(id)));
  const partials = all.filter(({ s, id }) => s.status === 'partial' && !liveAi.verdicts[id]);
  const gaps = all.filter(({ s, id }) => s.status === 'not_covered' && !liveAi.drafts[id]);

  const load = (m: string, p: string) => {
    setManual(m);
    setPlaywright(p);
    setOverrides({});
    setCopyMsg('');
    setLiveAi({ verdicts: {}, drafts: {} });
    setAiMsg('');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toChecklist(results, resolved));
      setCopyMsg('Copied!');
    } catch {
      setCopyMsg('Copy failed. Your browser blocked clipboard access.');
    }
  };

  const runAi = async (kind: 'check' | 'draft') => {
    setAiBusy(true);
    setAiMsg('');
    try {
      if (kind === 'check') {
        const items = partials.slice(0, MAX_STEPS_PER_CLICK).map(({ r, s, id }) => ({
          id,
          step: s.step.text,
          expected: s.step.expected ?? '',
          assertions: tests[r.testIndex]?.assertions.map((a) => a.code) ?? [],
        }));
        const verdicts = parseVerdicts(await callClaude(apiKey, model, checkPrompt(items)));
        if (!Object.keys(verdicts).length) throw new Error('Could not read the AI reply as the expected JSON. Try again.');
        setLiveAi((prev) => ({ ...prev, verdicts: { ...prev.verdicts, ...verdicts } }));
        setUseSampleAi(false);
      } else {
        const items = gaps.slice(0, MAX_STEPS_PER_CLICK).map(({ r, s, id }) => {
          const t = tests[r.testIndex];
          return { id, step: s.step.text, expected: s.step.expected, existingTest: t ? [...t.actions, ...t.assertions].sort((a, b) => a.lineNo - b.lineNo).map((l) => l.code) : [] };
        });
        const drafts = parseDrafts(await callClaude(apiKey, model, draftPrompt(items)));
        if (!Object.keys(drafts).length) throw new Error('Could not read the AI reply as the expected JSON. Try again.');
        setLiveAi((prev) => ({ ...prev, drafts: { ...prev.drafts, ...drafts } }));
        setUseSampleAi(false);
      }
    } catch (e) {
      setAiMsg(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 text-slate-800">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">Manual-to-Automation Step Coverage</h1>
        <p className="text-slate-600">Paste manual test cases and a Playwright spec. See which manual steps are already automated, and which ones a human still has to test.</p>
        <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Matching is keyword-based and approximate. It is a hint to help you decide what to test by hand, not proof of coverage.
        </p>
        <p className="mt-1 text-xs text-slate-500">The keyword matching runs entirely in your browser and nothing is uploaded. Text is only sent to an AI provider if you use the optional AI buttons with your own key.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          { label: 'Manual test cases', value: manual, set: setManual, found: `${cases.length} case(s) found` },
          { label: 'Playwright test file (.ts)', value: playwright, set: setPlaywright, found: `${tests.length} test(s) found` },
        ].map((f) => (
          <label key={f.label} className="block">
            <span className="flex justify-between text-sm font-medium">{f.label}<span className="font-normal text-slate-500">{f.found}</span></span>
            <textarea className="mt-1 h-56 w-full rounded border border-slate-300 bg-white p-2 font-mono text-xs" spellCheck={false} value={f.value} onChange={(e) => f.set(e.target.value)} />
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button className="rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700" onClick={() => load(SAMPLE_MANUAL, SAMPLE_PLAYWRIGHT)}>Load sample data</button>
        <button className="rounded border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-100" onClick={() => load('', '')}>Clear</button>
        <label className="ml-auto flex items-center gap-2">
          Match threshold
          <input type="range" min={0.05} max={1} step={0.01} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          <span className="w-10 font-mono">{threshold.toFixed(2)}</span>
        </label>
      </div>

      {ready && (
        <AiPanel
          apiKey={apiKey} setApiKey={setApiKey} model={model} setModel={setModel} busy={aiBusy} message={aiMsg}
          partialCount={partials.length} gapCount={gaps.length} onCheck={() => runAi('check')} onDraft={() => runAi('draft')}
          isSample={isSample} useSample={useSampleAi} setUseSample={setUseSampleAi}
        />
      )}

      {!ready ? (
        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          {cases.length === 0 && (
            <div className="mb-3">
              <p className="font-medium">No manual test cases found. Use this format (or start a case with "# Title"):</p>
              <pre className="mt-1 rounded bg-slate-100 p-2 text-xs">{MANUAL_FORMAT}</pre>
            </div>
          )}
          {tests.length === 0 && (
            <p className="font-medium">No Playwright tests found. Paste a spec file that contains <code className="rounded bg-slate-100 px-1">test('title', async ({'{ page }'}) =&gt; {'{ ... }'})</code> blocks.</p>
          )}
          <p className="mt-3 text-slate-500">Or click "Load sample data" to see a demo.</p>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          <section className="rounded-lg border-2 border-rose-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Still needs manual testing ({todo.length} steps)</h2>
              <div className="flex items-center gap-3">
                <span className="text-sm text-slate-500">Overall coverage <b className="text-xl text-slate-800">{pct(overallCoverage(results))}</b></span>
                <button className="rounded bg-rose-600 px-3 py-1.5 text-sm text-white hover:bg-rose-500" onClick={copy}>Copy as checklist</button>
              </div>
            </div>
            {copyMsg && <p className="mt-1 text-xs text-slate-500">{copyMsg}</p>}
            <ul className="mt-3 space-y-1 text-sm">
              {todo.map(({ r, s, id }) => (
                <li key={r.key + s.step.number} className="flex flex-wrap items-center gap-2">
                  <Badge status={s.status} />
                  {s.status === 'partial' && ai.verdicts[id] && <VerdictBadge v={ai.verdicts[id]} />}
                  <span className="text-slate-500">{r.manualCase.id} step {s.step.number}:</span>
                  <span>{s.step.text}</span>
                  {s.step.expected && <span className="text-slate-500">→ {s.step.expected}</span>}
                </li>
              ))}
              {todo.length === 0 && <li className="text-emerald-700">Every step has a matching action and assertion.</li>}
            </ul>
          </section>
          {results.map((r) => (
            <CaseCard key={r.key} r={r} ai={ai} testTitles={tests.map((t) => t.title)} onPick={(i) => setOverrides({ ...overrides, [r.key]: i })} />
          ))}
        </div>
      )}
    </div>
  );
}
