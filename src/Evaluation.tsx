import { useMemo } from 'react'
import { analyze } from './algorithms/scoring'
import { weightedEditDistance } from './algorithms/editDistance'
import { BRANDS } from './data/brands'

// ── A small labelled test set ────────────────────────────────────────────
type Kind = 'homoglyph' | 'typo' | 'embed' | 'legit' | 'unrelated'
interface Case { d: string; phish: boolean; kind: Kind }

const SET: Case[] = [
  // homoglyph (Unicode look-alikes)
  { d: 'pаypal.com', phish: true, kind: 'homoglyph' },
  { d: 'аррӏе.com', phish: true, kind: 'homoglyph' },
  { d: 'gооgle.com', phish: true, kind: 'homoglyph' },
  { d: 'phonepе.com', phish: true, kind: 'homoglyph' },
  { d: 'microsоft.com', phish: true, kind: 'homoglyph' },
  { d: 'hdfcbаnk.com', phish: true, kind: 'homoglyph' },
  { d: 'аmazon.in', phish: true, kind: 'homoglyph' },
  // typo / digit-for-letter
  { d: 'paypa1.com', phish: true, kind: 'typo' },
  { d: 'g00gle.com', phish: true, kind: 'typo' },
  { d: 'faceb00k.com', phish: true, kind: 'typo' },
  { d: 'amaz0n.in', phish: true, kind: 'typo' },
  // brand embedded / sub-domain / lure
  { d: 'secure-paypal.xyz', phish: true, kind: 'embed' },
  { d: 'amazon-kyc-update.tk', phish: true, kind: 'embed' },
  { d: 'sbi-rewards.tk', phish: true, kind: 'embed' },
  { d: 'hdfcbank.account-verify.com', phish: true, kind: 'embed' },
  { d: 'paytm-cashback.online', phish: true, kind: 'embed' },
  // legitimate brand domains
  { d: 'paypal.com', phish: false, kind: 'legit' },
  { d: 'google.com', phish: false, kind: 'legit' },
  { d: 'hdfcbank.com', phish: false, kind: 'legit' },
  { d: 'amazon.in', phish: false, kind: 'legit' },
  { d: 'microsoft.com', phish: false, kind: 'legit' },
  { d: 'flipkart.com', phish: false, kind: 'legit' },
  // unrelated
  { d: 'randomblog.dev', phish: false, kind: 'unrelated' },
  { d: 'mycoolwebsite.com', phish: false, kind: 'unrelated' },
  { d: 'example.org', phish: false, kind: 'unrelated' },
  { d: 'notabank.net', phish: false, kind: 'unrelated' },
]

// ── Plain (un-weighted, no-skeleton) Levenshtein baseline ────────────────
function plainLevenshtein(a: string, b: string): number {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 1; i <= n; i++) dp[i][0] = i
  for (let j = 1; j <= m; j++) dp[0][j] = j
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return dp[n][m]
}
function parts(domain: string) {
  const host = domain.toLowerCase().replace(/^[a-z]+:\/\//, '').split('/')[0]
  const labels = host.split('.')
  const sld = labels[labels.length - 2] ?? ''
  const reg = labels.slice(-2).join('.')
  return { sld, reg }
}
const CORES = BRANDS.filter((b) => b.core.length >= 4)
function baselinePhish(domain: string, threshold: number): boolean {
  const { sld, reg } = parts(domain)
  if (BRANDS.some((b) => b.domain === reg)) return false // fair: official whitelist
  let min = Infinity
  for (const b of CORES) min = Math.min(min, plainLevenshtein(sld, b.core))
  return min <= threshold
}

interface Metrics { recall: number; fpr: number; acc: number; tp: number; fn: number; fp: number; tn: number }
function evalMethod(predict: (c: Case) => boolean): Metrics {
  let tp = 0, fn = 0, fp = 0, tn = 0
  for (const c of SET) {
    const p = predict(c)
    if (c.phish && p) tp++
    else if (c.phish && !p) fn++
    else if (!c.phish && p) fp++
    else tn++
  }
  const recall = tp + fn ? tp / (tp + fn) : 0
  const fpr = fp + tn ? fp / (fp + tn) : 0
  const acc = (tp + tn) / SET.length
  return { recall, fpr, acc, tp, fn, fp, tn }
}

export default function Evaluation() {
  const data = useMemo(() => {
    const pg = evalMethod((c) => analyze(c.d).level !== 'safe')
    const b1 = evalMethod((c) => baselinePhish(c.d, 1))
    const b3 = evalMethod((c) => baselinePhish(c.d, 3))
    // recall per kind for PhishGuard vs baseline(t=1)
    const kinds: Kind[] = ['homoglyph', 'typo', 'embed']
    const byKind = kinds.map((k) => {
      const sub = SET.filter((c) => c.kind === k)
      const pgr = sub.filter((c) => analyze(c.d).level !== 'safe').length / sub.length
      const br = sub.filter((c) => baselinePhish(c.d, 1)).length / sub.length
      return { k, pg: pgr, base: br }
    })
    // complexity: edit-distance ops vs input length n (fixed brand length)
    const brand = 'protectedbrand'
    const comp = [4, 8, 12, 16, 20, 24].map((n) => {
      const s = 'x'.repeat(n)
      return { n, ops: weightedEditDistance(s, brand).ops }
    })
    return { pg, b1, b3, byKind, comp }
  }, [])

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-10">
      <h2 className="text-2xl font-bold">Evaluation &amp; Results</h2>
      <p className="mt-1 text-sm text-muted">
        PhishGuard vs a plain edit-distance baseline on a {SET.length}-domain
        labelled set, plus an empirical check of the O(n·m) complexity.
      </p>

      {/* Headline */}
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Headline title="Detection recall" pg={data.pg.recall} base={data.b1.recall} fmt={pct} />
        <Headline title="False-alarm rate" pg={data.pg.fpr} base={data.b3.fpr} fmt={pct} lowerBetter baseLabel="baseline (t=3)" />
        <Headline title="Overall accuracy" pg={data.pg.acc} base={data.b1.acc} fmt={pct} />
      </div>

      {/* Method comparison table */}
      <h3 className="mt-8 text-sm font-bold uppercase tracking-wider text-muted">Method comparison</h3>
      <div className="mt-2 overflow-hidden rounded-xl border border-[#222639]">
        <table className="w-full text-sm">
          <thead className="bg-panel-2 text-left text-xs text-muted">
            <tr><th className="p-2.5">Method</th><th className="p-2.5">Recall (phish caught)</th><th className="p-2.5">False-alarm rate</th><th className="p-2.5">Accuracy</th></tr>
          </thead>
          <tbody className="font-mono">
            <Row name="PhishGuard (skeleton + weighted DP + Horspool)" m={data.pg} highlight />
            <Row name="Plain edit distance (threshold = 1)" m={data.b1} />
            <Row name="Plain edit distance (threshold = 3)" m={data.b3} />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Plain edit distance faces a trade-off: a tight threshold (1) misses
        multi-character disguises; a loose one (3) raises false alarms.
        Skeleton normalization collapses every homoglyph to distance ~0, so
        PhishGuard gets high recall <i>and</i> low false alarms.
      </p>

      {/* Recall by attack type */}
      <h3 className="mt-8 text-sm font-bold uppercase tracking-wider text-muted">Recall by attack type</h3>
      <div className="mt-3 rounded-xl border border-[#222639] bg-panel p-5">
        {data.byKind.map((r) => (
          <div key={r.k} className="mb-4 last:mb-0">
            <div className="mb-1 flex justify-between text-xs">
              <span className="capitalize text-ink">{r.k} attacks</span>
              <span className="text-muted">PhishGuard {pct(r.pg)} · baseline {pct(r.base)}</span>
            </div>
            <Bar value={r.pg} color="var(--color-safe)" />
            <div className="h-1" />
            <Bar value={r.base} color="var(--color-danger)" />
          </div>
        ))}
        <div className="mt-2 flex gap-4 text-[11px] text-muted">
          <Legend c="var(--color-safe)" l="PhishGuard" />
          <Legend c="var(--color-danger)" l="Plain edit distance (t=1)" />
        </div>
      </div>

      {/* Complexity */}
      <h3 className="mt-8 text-sm font-bold uppercase tracking-wider text-muted">Empirical complexity — weighted edit distance</h3>
      <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_220px]">
        <div className="rounded-xl border border-[#222639] bg-panel p-4">
          <ComplexityChart comp={data.comp} brandLen={14} />
        </div>
        <div className="rounded-xl border border-[#222639] bg-panel p-4 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted">Theory</div>
          <div className="mt-1 font-mono text-lg text-[var(--color-accent-2)]">O(n · m)</div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            The DP table has (n+1)·(m+1) cells, each filled once. With brand
            length m fixed, the operation count grows <i>linearly</i> in the
            domain length n — which is exactly what the measured points show.
          </p>
        </div>
      </div>
    </div>
  )
}

const pct = (x: number) => `${Math.round(x * 100)}%`

function Headline({ title, pg, base, fmt, lowerBetter, baseLabel }: { title: string; pg: number; base: number; fmt: (x: number) => string; lowerBetter?: boolean; baseLabel?: string }) {
  const good = lowerBetter ? pg <= base : pg >= base
  return (
    <div className="rounded-xl border border-[#222639] bg-panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{title}</div>
      <div className="mt-1 flex items-end gap-2">
        <span className="text-3xl font-bold" style={{ color: good ? 'var(--color-safe)' : 'var(--color-ink)' }}>{fmt(pg)}</span>
        <span className="pb-1 text-xs text-muted">PhishGuard</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">vs {fmt(base)} — {baseLabel ?? 'plain edit distance'}</div>
    </div>
  )
}

function Row({ name, m, highlight }: { name: string; m: Metrics; highlight?: boolean }) {
  return (
    <tr className={highlight ? 'bg-[#0e1424]' : ''} style={{ borderTop: '1px solid #1a1d2e' }}>
      <td className="p-2.5 font-sans text-xs" style={{ color: highlight ? 'var(--color-accent-2)' : 'var(--color-ink)', fontWeight: highlight ? 700 : 400 }}>{name}</td>
      <td className="p-2.5">{pct(m.recall)}</td>
      <td className="p-2.5">{pct(m.fpr)}</td>
      <td className="p-2.5">{pct(m.acc)}</td>
    </tr>
  )
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-4 overflow-hidden rounded bg-panel-2">
      <div className="flex h-4 items-center justify-end pr-1.5 text-[10px] font-bold text-bg" style={{ width: `${Math.max(value * 100, 8)}%`, background: color }}>
        {pct(value)}
      </div>
    </div>
  )
}

function Legend({ c, l }: { c: string; l: string }) {
  return <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</span>
}

function ComplexityChart({ comp, brandLen }: { comp: { n: number; ops: number }[]; brandLen: number }) {
  const W = 520, H = 200, pad = 34
  const maxN = Math.max(...comp.map((c) => c.n))
  const maxOps = Math.max(...comp.map((c) => c.ops))
  const x = (n: number) => pad + (n / maxN) * (W - pad - 10)
  const y = (o: number) => H - pad - (o / maxOps) * (H - pad - 10)
  const measured = comp.map((c) => `${x(c.n)},${y(c.ops)}`).join(' ')
  const theory = comp.map((c) => `${x(c.n)},${y(c.n * brandLen)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <line x1={pad} y1={H - pad} x2={W - 10} y2={H - pad} stroke="#2a2e44" />
      <line x1={pad} y1={10} x2={pad} y2={H - pad} stroke="#2a2e44" />
      <polyline points={theory} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeDasharray="5 5" />
      <polyline points={measured} fill="none" stroke="var(--color-accent-2)" strokeWidth="2.5" />
      {comp.map((c) => (<circle key={c.n} cx={x(c.n)} cy={y(c.ops)} r="3.5" fill="var(--color-accent-2)" />))}
      <text x={W / 2} y={H - 6} fill="#8b90a8" fontSize="10" textAnchor="middle">domain length n</text>
      <text x={12} y={H / 2} fill="#8b90a8" fontSize="10" textAnchor="middle" transform={`rotate(-90 12 ${H / 2})`}>DP operations</text>
      <text x={W - 14} y={22} fill="var(--color-accent-2)" fontSize="10" textAnchor="end">measured</text>
      <text x={W - 14} y={36} fill="var(--color-accent)" fontSize="10" textAnchor="end">theory n·m</text>
    </svg>
  )
}
