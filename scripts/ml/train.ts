// Tier-1 ML hybrid — logistic-regression trainer (zero runtime deps).
//
// Positives  : generated lookalikes (6 attack families, deterministic).
// Negatives  : Tranco top-N legitimate domains.
// Pipeline   : extractFeatures() -> stratified 70/30 split -> standardize on
//              TRAIN only (no leakage) -> gradient-descent LR with class
//              weighting + L2 -> pick warn/block thresholds on TRAIN ->
//              evaluate LR vs the rule engine on the held-out TEST split.
// Output     : src/data/modelWeights.ts (means, stds, weights, bias,
//              thresholds) for the bundled, dependency-free inference path.
//
// Run: npx tsx scripts/ml/train.ts [negativesN]   (after scripts/eval/prep.ts)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractFeatures, FEATURE_NAMES } from '../../src/algorithms/features'
import { analyze } from '../../src/algorithms/scoring'
import { generateLookalikes } from '../eval/lookalikes'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const NEG_N = Number(process.argv[2] ?? 50000)
const F = FEATURE_NAMES.length

const trancoPath = resolve(DATA, 'tranco-top.txt')
if (!existsSync(trancoPath)) { console.error('Missing data-eval/tranco-top.txt — run scripts/eval/prep.ts'); process.exit(1) }
const tranco = readFileSync(trancoPath, 'utf8').split(/\r?\n/).filter(Boolean).slice(0, NEG_N)

// ── Build labelled samples ─────────────────────────────────────────────────
interface Sample { host: string; label: 0 | 1; x: number[] }
const samples: Sample[] = []
for (const s of generateLookalikes()) samples.push({ host: s.domain, label: 1, x: extractFeatures(s.domain).values })
for (const d of tranco) samples.push({ host: d, label: 0, x: extractFeatures(d).values })
const nPos = samples.filter((s) => s.label === 1).length
const nNeg = samples.length - nPos

// ── Deterministic shuffle + stratified 70/30 split ─────────────────────────
function mulberry32(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const rng = mulberry32(12345)
function splitByLabel(label: 0 | 1) {
  const arr = samples.filter((s) => s.label === label)
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[arr[i], arr[j]] = [arr[j], arr[i]] }
  const cut = Math.floor(arr.length * 0.7)
  return { train: arr.slice(0, cut), test: arr.slice(cut) }
}
const p = splitByLabel(1), n = splitByLabel(0)
const train = [...p.train, ...n.train]
const test = [...p.test, ...n.test]

// ── Standardize on TRAIN only ──────────────────────────────────────────────
const mean = new Array(F).fill(0), std = new Array(F).fill(0)
for (const s of train) for (let j = 0; j < F; j++) mean[j] += s.x[j]
for (let j = 0; j < F; j++) mean[j] /= train.length
for (const s of train) for (let j = 0; j < F; j++) std[j] += (s.x[j] - mean[j]) ** 2
for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / train.length) || 1
const z = (x: number[]) => x.map((v, j) => (v - mean[j]) / std[j])
const Xtr = train.map((s) => z(s.x)), Ytr = train.map((s) => s.label)

// ── Logistic regression via gradient descent (class-weighted + L2) ─────────
const sigmoid = (t: number) => 1 / (1 + Math.exp(-t))
const w = new Array(F).fill(0); let b = 0
const wPos = train.length / (2 * p.train.length), wNeg = train.length / (2 * n.train.length)
const LR = 0.5, EPOCHS = 600, L2 = 1e-4
for (let e = 0; e < EPOCHS; e++) {
  const gw = new Array(F).fill(0); let gb = 0, wsum = 0
  for (let i = 0; i < Xtr.length; i++) {
    const pr = sigmoid(w.reduce((a, wj, j) => a + wj * Xtr[i][j], b))
    const cw = Ytr[i] ? wPos : wNeg
    const err = (pr - Ytr[i]) * cw
    for (let j = 0; j < F; j++) gw[j] += err * Xtr[i][j]
    gb += err; wsum += cw
  }
  for (let j = 0; j < F; j++) w[j] -= LR * (gw[j] / wsum + L2 * w[j])
  b -= LR * (gb / wsum)
}
const prob = (x: number[]) => sigmoid(z(x).reduce((a, v, j) => a + w[j] * v, b))

// ── Pick thresholds on TRAIN ───────────────────────────────────────────────
//   warn  = best-F1 point (high recall, the top-bar warning)
//   block = a high-precision point with ~zero false positives (the block page)
// Enforce block >= warn so the two UI severities are ordered.
let warnThreshold = 0.5, bestF1 = -1
for (let t = 0.05; t < 0.95; t += 0.01) {
  let tp = 0, fp = 0, fn = 0
  for (const s of train) { const yp = prob(s.x) >= t ? 1 : 0; if (s.label && yp) tp++; else if (!s.label && yp) fp++; else if (s.label && !yp) fn++ }
  const prec = tp / (tp + fp || 1), rec = tp / (tp + fn || 1), f1 = (2 * prec * rec) / (prec + rec || 1)
  if (f1 > bestF1) { bestF1 = f1; warnThreshold = t }
}
const negTrainProbs = n.train.map((s) => prob(s.x)).sort((a, c) => a - c)
const blockThreshold = Math.min(
  0.995,
  Math.max(warnThreshold + 0.02, (negTrainProbs[negTrainProbs.length - 1] ?? 0.9) + 1e-3),
)

// ── Evaluate LR vs rule engine on the held-out TEST split ──────────────────
const pct = (x: number) => (x * 100).toFixed(1) + '%'
function metrics(pred: (s: Sample) => boolean) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const s of test) { const yp = pred(s); if (s.label && yp) tp++; else if (!s.label && yp) fp++; else if (s.label && !yp) fn++; else tn++ }
  const recall = tp / (tp + fn || 1), precision = tp / (tp + fp || 1), fpr = fp / (fp + tn || 1)
  const f1 = (2 * precision * recall) / (precision + recall || 1), acc = (tp + tn) / test.length
  return { recall, precision, fpr, f1, acc, tp, fp, fn }
}
const rOf = (m: ReturnType<typeof metrics>) => `${pct(m.recall).padStart(6)}  ${pct(m.precision).padStart(7)}  ${pct(m.fpr).padStart(6)}  ${pct(m.f1).padStart(6)}  ${pct(m.acc).padStart(7)}`

const lrWarn = metrics((s) => prob(s.x) >= warnThreshold)
const lrBlock = metrics((s) => prob(s.x) >= blockThreshold)
const ruleAny = metrics((s) => analyze(s.host).level !== 'safe')
const ruleDanger = metrics((s) => analyze(s.host).level === 'dangerous')

console.log(`\nDataset: ${nPos} positives + ${nNeg} negatives = ${samples.length}`)
console.log(`Train ${train.length}  |  Test ${test.length}  (stratified 70/30)`)
console.log(`Thresholds: warn=${warnThreshold.toFixed(2)}  block=${blockThreshold.toFixed(3)}\n`)
console.log('on held-out TEST     recall  precision    FPR      F1   accuracy')
console.log('LR  (warn)          ', rOf(lrWarn))
console.log('LR  (block)         ', rOf(lrBlock))
console.log('Rule (suspicious+)  ', rOf(ruleAny))
console.log('Rule (dangerous)    ', rOf(ruleDanger))

// ── Learned weights (interpretability) ─────────────────────────────────────
console.log('\nLearned weights (standardized; sign+magnitude = pull toward phishing):')
FEATURE_NAMES.map((nm, j) => [nm, w[j]] as [string, number])
  .sort((a, c) => Math.abs(c[1]) - Math.abs(a[1]))
  .forEach(([nm, wj]) => console.log(`  ${nm.padEnd(18)} ${wj >= 0 ? '+' : ''}${wj.toFixed(3)}`))

// ── Emit bundled model ──────────────────────────────────────────────────────
const arr = (a: number[]) => '[' + a.map((v) => +v.toFixed(6)).join(', ') + ']'
writeFileSync(resolve(ROOT, 'src/data/modelWeights.ts'), `// AUTO-GENERATED by scripts/ml/train.ts — do not edit by hand.
// Tier-1 logistic-regression hybrid. Inference = sigmoid(w·z + b) where
// z = (features - mean) / std. ~${F} floats; no runtime dependencies.
// Trained ${new Date().toISOString().slice(0, 10)} on ${nPos} positives + ${train.length - p.train.length} train negatives.
export const MODEL = {
  features: ${JSON.stringify(FEATURE_NAMES)},
  mean: ${arr(mean)},
  std: ${arr(std)},
  weights: ${arr(w)},
  bias: ${+b.toFixed(6)},
  warnThreshold: ${warnThreshold.toFixed(3)},
  blockThreshold: ${blockThreshold.toFixed(3)},
} as const
`)
console.log('\nWrote src/data/modelWeights.ts')
