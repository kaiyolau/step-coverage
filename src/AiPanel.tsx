import { useState } from 'react';
import type { AiVerdict, Verdict } from './lib/ai';

const VERDICT_STYLE: Record<Verdict, string> = {
  verifies: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  weak: 'bg-amber-50 text-amber-700 border-amber-200',
  does_not_verify: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function VerdictBadge({ v }: { v: AiVerdict }) {
  return (
    <span className={`whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${VERDICT_STYLE[v.verdict]}`}>
      AI: {v.verdict.replace(/_/g, ' ')}
    </span>
  );
}

export function DraftBox({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => navigator.clipboard.writeText(code).then(() => setCopied(true), () => setCopied(false));
  return (
    <div className="mt-1 rounded border border-violet-200 bg-violet-50">
      <div className="flex items-center justify-between px-2 py-1 text-[11px] text-violet-800">
        <span>AI draft. Review before using.</span>
        <button className="rounded border border-violet-300 bg-white px-1.5 hover:bg-violet-100" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
      </div>
      <pre className="overflow-x-auto px-2 pb-2 font-mono text-[11px] text-slate-800">{code}</pre>
    </div>
  );
}

interface PanelProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  busy: boolean;
  message: string;
  partialCount: number;
  gapCount: number;
  onCheck: () => void;
  onDraft: () => void;
  isSample: boolean;
  useSample: boolean;
  setUseSample: (v: boolean) => void;
}

export function AiPanel(p: PanelProps) {
  const disabled = p.busy || !p.apiKey.trim() || !p.model.trim();
  const btn = 'rounded bg-violet-700 px-3 py-1.5 text-white hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <section className="mt-3 rounded-lg border border-violet-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold text-violet-800">Optional AI helpers</span>
        <input type="password" autoComplete="off" placeholder="Anthropic API key" className="w-52 rounded border border-slate-300 px-2 py-1" value={p.apiKey} onChange={(e) => p.setApiKey(e.target.value)} />
        <label className="flex items-center gap-1">Model <input className="w-40 rounded border border-slate-300 px-2 py-1 font-mono text-xs" value={p.model} onChange={(e) => p.setModel(e.target.value)} /></label>
        <button className={btn} disabled={disabled || p.partialCount === 0} onClick={p.onCheck}>AI check weak matches ({p.partialCount})</button>
        <button className={btn} disabled={disabled || p.gapCount === 0} onClick={p.onDraft}>AI draft code for gaps ({p.gapCount})</button>
        {p.isSample && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={p.useSample} onChange={(e) => p.setUseSample(e.target.checked)} /> Use sample AI results
          </label>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        AI is optional. Your pasted text is sent to the AI provider. Do not paste confidential data. AI output can be wrong, so please review it.
        {' '}The key stays in this page's memory only. Each click sends at most 10 steps.
      </p>
      {p.busy && <p className="mt-1 text-xs text-violet-700">Asking the model...</p>}
      {p.message && <p className="mt-1 text-xs text-rose-700">{p.message}</p>}
    </section>
  );
}
