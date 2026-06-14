// Real-data evaluation: registered lookalike domains (from dnstwist) as
// positives, Tranco as negatives. Replaces the synthetic generator's positives
// with real-world registered look-alikes someone actually bothered to register.
//
// Input : data-eval/dnstwist/all.csv  (rows: brand,fuzzer,domain,dns_a,dns_aaaa)
// Run   : npx tsx scripts/eval/realdata.ts   (after the dnstwist harvest)
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyze } from '../../src/algorithms/scoring'
import { predictML } from '../../src/algorithms/mlScore'
import { BRANDS } from '../../src/data/brands'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const csvPath = resolve(DATA, 'dnstwist/all.csv')
if (!existsSync(csvPath)) { console.error('Missing data-eval/dnstwist/all.csv — run the dnstwist harvest first'); process.exit(1) }

// ── Parse registered lookalikes (real positives) ───────────────────────────
const official = new Set<string>()
for (const b of BRANDS) { official.add(b.domain); for (const a of b.altDomains ?? []) official.add(a) }

interface Pos { domain: string; fuzzer: string }
const seen = new Set<string>()
const positives: Pos[] = []
for (const line of readFileSync(csvPath, 'utf8').split(/\r?\n/)) {
  if (!line || line.startsWith('>>')) continue
  const parts = line.split(',')
  if (parts.length < 3) continue
  const fuzzer = parts[1].trim()
  const domain = parts[2].trim().toLowerCase()
  if (!domain || fuzzer === '*original' || fuzzer === 'fuzzer') continue
  if (official.has(domain)) continue // a brand's own domain isn't a lookalike of itself
  if (seen.has(domain)) continue
  seen.add(domain)
  positives.push({ domain, fuzzer })
}

const tranco = readFileSync(resolve(DATA, 'tranco-top.txt'), 'utf8').split(/\r?\n/).filter(Boolean)

// ── Metrics ────────────────────────────────────────────────────────────────
const pct = (x: number) => (x * 100).toFixed(1) + '%'
const ruleAny = (d: string) => analyze(d).level !== 'safe'
const ruleDanger = (d: string) => analyze(d).level === 'dangerous'
const mlWarn = (d: string) => predictML(d).level !== 'safe'
const mlBlock = (d: string) => predictML(d).level === 'dangerous'

const posFlag = (pred: (d: string) => boolean) => positives.filter((p) => pred(p.domain)).length
const negFlag = (pred: (d: string) => boolean) => tranco.filter(pred).length

function row(name: string, pred: (d: string) => boolean) {
  const tp = posFlag(pred), fn = positives.length - tp
  const fp = negFlag(pred), tn = tranco.length - fp
  const recall = tp / (tp + fn || 1), precision = tp / (tp + fp || 1), fpr = fp / (fp + tn || 1)
  const f1 = (2 * precision * recall) / (precision + recall || 1)
  console.log(name.padEnd(20), pct(recall).padStart(7), pct(precision).padStart(10), pct(fpr).padStart(8), pct(f1).padStart(8), `   (TP ${tp}/${positives.length}, FP ${fp})`)
}

console.log(`\n${'='.repeat(74)}`)
console.log('Real-data evaluation — dnstwist registered lookalikes vs Tranco')
console.log('='.repeat(74))
console.log(`Real positives (unique registered lookalikes): ${positives.length}`)
console.log(`Negatives (Tranco legit): ${tranco.length}\n`)
console.log('detector             recall  precision     FPR      F1')
row('Rule (suspicious+)', ruleAny)
row('Rule (dangerous)', ruleDanger)
row('LR (warn)', mlWarn)
row('LR (block)', mlBlock)

// ── Recall by dnstwist fuzzer family (rule, suspicious+) ───────────────────
console.log('\nRule recall by dnstwist fuzzer family (real positives):')
const fams = new Map<string, { n: number; hit: number }>()
for (const p of positives) {
  const f = fams.get(p.fuzzer) ?? { n: 0, hit: 0 }
  f.n++; if (ruleAny(p.domain)) f.hit++
  fams.set(p.fuzzer, f)
}
for (const [fam, c] of [...fams.entries()].sort((a, b) => b[1].n - a[1].n)) {
  console.log('  ' + fam.padEnd(16), String(c.hit).padStart(4) + '/' + String(c.n).padEnd(5), pct(c.hit / c.n))
}

// ── A few misses (for the honest discussion) ────────────────────────────────
const missed = positives.filter((p) => !ruleAny(p.domain)).slice(0, 15)
console.log('\nSample missed positives:', missed.map((p) => `${p.domain}[${p.fuzzer}]`).join(', ') || '(none)')
console.log('='.repeat(74) + '\n')
