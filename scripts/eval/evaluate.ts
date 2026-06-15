// Unmaskr real-data evaluation harness.
//
// Datasets:
//   • Tranco top-N legitimate domains      (negatives)        data-eval/tranco-top.txt
//   • OpenPhish live feed hosts             (in-the-wild pos.) data-eval/openphish-hosts.txt
//   • Generated lookalikes (6 families)     (controlled pos.)  scripts/eval/lookalikes.ts
//
// Run `npx tsx scripts/eval/prep.ts` first to produce the cached lists.
//
// Reports: confusion matrix, recall / precision / FPR / F1 / accuracy,
// per-family recall, raw-Levenshtein baseline at t=1/2/3, verdict latency,
// and the honest in-the-wild scope discussion. Writes data-eval/results.json.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { analyze } from '../../src/algorithms/scoring'
import { skeleton } from '../../src/algorithms/confusables'
import { BRANDS } from '../../src/data/brands'
import { generateLookalikes, type Family } from './lookalikes'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const need = (f: string) => {
  const p = resolve(DATA, f)
  if (!existsSync(p)) { console.error(`Missing ${f}. Run: npx tsx scripts/eval/prep.ts`); process.exit(1) }
  return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)
}

const tranco = need('tranco-top.txt')
const openphish = need('openphish-hosts.txt')
const looks = generateLookalikes()

// ── Predictors ─────────────────────────────────────────────────────────────
// Unmaskr: a verdict above 'safe' is a flag. Two operating points.
const pgAny = (d: string) => analyze(d).level !== 'safe'
const pgDanger = (d: string) => analyze(d).level === 'dangerous'

// Naive baseline: raw (homoglyph-blind) Levenshtein from the SLD to any brand
// core, flag if min distance <= t. No skeleton, no punycode — the standard
// edit-distance defence Unmaskr is argued to improve on.
const cores = BRANDS.filter((b) => b.core.length >= 4).map((b) => b.core)
const realDomains = new Set(BRANDS.map((b) => b.domain))
function lev(a: string, b: string): number {
  const n = a.length, m = b.length
  let prev = Array.from({ length: m + 1 }, (_, j) => j)
  let cur = new Array(m + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    for (let j = 1; j <= m; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    ;[prev, cur] = [cur, prev]
  }
  return prev[m]
}
function naiveSld(host: string): { sld: string; reg: string } {
  const h = host.trim().toLowerCase().split('/')[0]
  const labels = h.split('.').filter(Boolean)
  const sld = labels.length >= 2 ? labels[labels.length - 2] : (labels[0] ?? '')
  const reg = labels.slice(-2).join('.')
  return { sld, reg }
}
function baseFlag(host: string, t: number): boolean {
  const { sld, reg } = naiveSld(host)
  if (realDomains.has(reg)) return false
  let mn = Infinity
  for (const c of cores) { const d = lev(sld, c); if (d < mn) mn = d; if (mn === 0) break }
  return mn <= t
}

// ── Metric helpers ───────────────────────────────────────────────────────
interface CM { tp: number; fp: number; tn: number; fn: number }
function rates(cm: CM) {
  const { tp, fp, tn, fn } = cm
  const recall = tp + fn ? tp / (tp + fn) : 0
  const precision = tp + fp ? tp / (tp + fp) : 0
  const fpr = fp + tn ? fp / (fp + tn) : 0
  const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0
  const acc = (tp + tn) / (tp + fp + tn + fn)
  return { recall, precision, fpr, f1, acc }
}
const pct = (x: number) => (x * 100).toFixed(1) + '%'

// ── 1. Negatives sweep over Tranco (FPR + latency) ─────────────────────────
let pgAnyFP = 0, pgDangerFP = 0, b1FP = 0, b2FP = 0, b3FP = 0
const fpExamples: string[] = []
const durations: number[] = []
for (const d of tranco) {
  const t0 = performance.now()
  const flagged = pgAny(d)
  durations.push(performance.now() - t0)
  if (flagged) { pgAnyFP++; if (fpExamples.length < 40) fpExamples.push(d) }
  if (pgDanger(d)) pgDangerFP++
  if (baseFlag(d, 1)) b1FP++
  if (baseFlag(d, 2)) b2FP++
  if (baseFlag(d, 3)) b3FP++
}
const N = tranco.length

// ── 2. Controlled positives: recall overall + per family ───────────────────
const families: Family[] = ['homoglyph', 'typo', 'digit-swap', 'combosquat', 'tld-swap', 'subdomain']
type Counter = Record<string, { total: number; pgAny: number; pgDanger: number; b1: number; b2: number; b3: number }>
const fam: Counter = {}
for (const f of [...families, 'ALL']) fam[f] = { total: 0, pgAny: 0, pgDanger: 0, b1: 0, b2: 0, b3: 0 }
for (const s of looks) {
  for (const key of [s.family, 'ALL']) {
    const c = fam[key]
    c.total++
    if (pgAny(s.domain)) c.pgAny++
    if (pgDanger(s.domain)) c.pgDanger++
    if (baseFlag(s.domain, 1)) c.b1++
    if (baseFlag(s.domain, 2)) c.b2++
    if (baseFlag(s.domain, 3)) c.b3++
  }
}

// ── 3. Combined confusion matrix (controlled positives + Tranco negatives) ──
const P = fam.ALL.total
const cmPgAny: CM = { tp: fam.ALL.pgAny, fn: P - fam.ALL.pgAny, fp: pgAnyFP, tn: N - pgAnyFP }
const cmPgDanger: CM = { tp: fam.ALL.pgDanger, fn: P - fam.ALL.pgDanger, fp: pgDangerFP, tn: N - pgDangerFP }
const cmB1: CM = { tp: fam.ALL.b1, fn: P - fam.ALL.b1, fp: b1FP, tn: N - b1FP }
const cmB2: CM = { tp: fam.ALL.b2, fn: P - fam.ALL.b2, fp: b2FP, tn: N - b2FP }
const cmB3: CM = { tp: fam.ALL.b3, fn: P - fam.ALL.b3, fp: b3FP, tn: N - b3FP }

// ── 4. OpenPhish in-the-wild recall (full + brand-resembling subset) ────────
function brandResembling(host: string): boolean {
  if ([...host].some((c) => c.charCodeAt(0) > 127)) return true
  const { sld } = naiveSld(host)
  const sk = skeleton(sld)
  for (const c of cores) { if (sk.includes(c) || c.includes(sk) || lev(sk, c) <= 2) return true }
  return false
}
const opResembling = openphish.filter(brandResembling)
const opFullFlag = openphish.filter(pgAny).length
const opSubFlag = opResembling.filter(pgAny).length

// ── Latency stats ──────────────────────────────────────────────────────────
durations.sort((a, b) => a - b)
const q = (p: number) => durations[Math.min(durations.length - 1, Math.floor(p * durations.length))]
const latency = {
  mean: durations.reduce((a, b) => a + b, 0) / durations.length,
  median: q(0.5), p95: q(0.95), p99: q(0.99), max: durations[durations.length - 1],
}

// ── Report ───────────────────────────────────────────────────────────────
const line = '─'.repeat(72)
console.log('\n' + line)
console.log('Unmaskr — Real-Data Evaluation')
console.log(line)
console.log(`Negatives (Tranco legit)     : ${N}`)
console.log(`Controlled positives (gen.)  : ${P}`)
console.log(`In-the-wild positives (OpenPhish): ${openphish.length}  (${opResembling.length} brand-resembling)`)

console.log('\n── Combined confusion matrix (controlled pos. + Tranco neg.) ──')
console.log('detector             recall   precision   FPR      F1      accuracy   (TP/FP/FN)')
const row = (name: string, cm: CM) => {
  const r = rates(cm)
  console.log(
    name.padEnd(20),
    pct(r.recall).padStart(6), '  ', pct(r.precision).padStart(7), '',
    pct(r.fpr).padStart(6), '', pct(r.f1).padStart(6), '', pct(r.acc).padStart(7),
    `  (${cm.tp}/${cm.fp}/${cm.fn})`,
  )
}
row('Unmaskr (any)', cmPgAny)
row('Unmaskr (danger)', cmPgDanger)
row('Levenshtein t=1', cmB1)
row('Levenshtein t=2', cmB2)
row('Levenshtein t=3', cmB3)

console.log('\n── Recall by attack family (controlled positives) ──')
console.log('family          n     Unmaskr   Lev t=1   Lev t=2   Lev t=3')
for (const f of families) {
  const c = fam[f]
  const r = (x: number) => pct(x / c.total).padStart(7)
  console.log(f.padEnd(14), String(c.total).padStart(3), '  ', r(c.pgAny), '  ', r(c.b1), '', r(c.b2), '', r(c.b3))
}
{
  const c = fam.ALL
  const r = (x: number) => pct(x / c.total).padStart(7)
  console.log('OVERALL'.padEnd(14), String(c.total).padStart(3), '  ', r(c.pgAny), '  ', r(c.b1), '', r(c.b2), '', r(c.b3))
}

console.log('\n── False positives on Tranco legit domains ──')
console.log(`Unmaskr (any)    : ${pgAnyFP}/${N}  = ${pct(pgAnyFP / N)} FPR`)
console.log(`Unmaskr (danger) : ${pgDangerFP}/${N}  = ${pct(pgDangerFP / N)} FPR`)
console.log(`Levenshtein t=1     : ${b1FP}/${N}  = ${pct(b1FP / N)} FPR`)
console.log(`Levenshtein t=2     : ${b2FP}/${N}  = ${pct(b2FP / N)} FPR`)
console.log(`Levenshtein t=3     : ${b3FP}/${N}  = ${pct(b3FP / N)} FPR`)
console.log('  Unmaskr FP examples:', fpExamples.slice(0, 15).join(', ') || '(none)')

console.log('\n── In-the-wild (OpenPhish) ──')
console.log(`Full feed recall          : ${opFullFlag}/${openphish.length} = ${pct(opFullFlag / openphish.length)}`)
console.log(`Brand-resembling subset   : ${opSubFlag}/${opResembling.length} = ${opResembling.length ? pct(opSubFlag / opResembling.length) : 'n/a'}`)
console.log('  (most in-the-wild phishing uses compromised sites / free hosting, not lookalike domains — see EVALUATION.md)')

console.log('\n── Verdict latency (per analyze() call, over Tranco sweep) ──')
console.log(`mean ${latency.mean.toFixed(3)}ms  median ${latency.median.toFixed(3)}ms  p95 ${latency.p95.toFixed(3)}ms  p99 ${latency.p99.toFixed(3)}ms  max ${latency.max.toFixed(2)}ms`)
console.log(`  non-functional target <5ms: ${latency.p99 < 5 ? 'MET at p99' : latency.median < 5 ? 'MET at median' : 'NOT MET'}`)
console.log(line + '\n')

// ── Persist machine-readable results ───────────────────────────────────────
const results = {
  generatedAt: new Date().toISOString(),
  datasets: { trancoNegatives: N, controlledPositives: P, openphishHosts: openphish.length, openphishResembling: opResembling.length },
  confusion: {
    pgAny: { ...cmPgAny, ...rates(cmPgAny) },
    pgDanger: { ...cmPgDanger, ...rates(cmPgDanger) },
    levT1: { ...cmB1, ...rates(cmB1) },
    levT2: { ...cmB2, ...rates(cmB2) },
    levT3: { ...cmB3, ...rates(cmB3) },
  },
  perFamily: Object.fromEntries(families.map((f) => [f, { ...fam[f], recallPg: fam[f].pgAny / fam[f].total }])),
  falsePositives: { pgAny: pgAnyFP, pgDanger: pgDangerFP, levT1: b1FP, levT2: b2FP, levT3: b3FP, examples: fpExamples },
  openphish: { fullRecall: opFullFlag / openphish.length, subsetRecall: opResembling.length ? opSubFlag / opResembling.length : null, flaggedFull: opFullFlag, flaggedSubset: opSubFlag },
  latencyMs: latency,
}
writeFileSync(resolve(DATA, 'results.json'), JSON.stringify(results, null, 2))
console.log('Wrote data-eval/results.json')
