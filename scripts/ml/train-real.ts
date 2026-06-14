// Retrain the Tier-1 LR on REAL data (dnstwist registered lookalikes) instead of
// only synthetic positives — the fix for the overfitting found in EVALUATION §6.1.
//
// Method (leakage-free):
//   positives = real (dnstwist) + synthetic (generator), negatives = Tranco
//   → stratified 70/30 split → standardize on TRAIN → GD logistic regression
//   → report on the held-out REAL positives (the honest metric), comparing the
//     NEW (real-trained) model against the OLD (synthetic-only) bundled model.
//   → emit src/data/modelWeights.ts retrained on the FULL dataset for shipping.
//
// Run: npx tsx scripts/ml/train-real.ts   (after the dnstwist harvest + prep)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractFeatures, FEATURE_NAMES } from '../../src/algorithms/features'
import { MODEL } from '../../src/data/modelWeights'
import { BRANDS } from '../../src/data/brands'
import { generateLookalikes } from '../eval/lookalikes'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const F = FEATURE_NAMES.length
const need = (f: string) => { const p = resolve(DATA, f); if (!existsSync(p)) { console.error(`Missing ${f}`); process.exit(1) } return readFileSync(p, 'utf8') }

// ── Build labelled rows ─────────────────────────────────────────────────────
interface Row { host: string; y: 0 | 1; src: 'real' | 'synth' | 'neg'; x: number[] }
const official = new Set<string>()
for (const b of BRANDS) { official.add(b.domain); for (const a of b.altDomains ?? []) official.add(a) }

const rows: Row[] = []
// real positives from dnstwist
const seen = new Set<string>()
for (const line of need('dnstwist/all.csv').split(/\r?\n/)) {
  if (!line || line.startsWith('>>')) continue
  const p = line.split(','); if (p.length < 3) continue
  const fuzzer = p[1].trim(), domain = p[2].trim().toLowerCase()
  if (!domain || fuzzer === '*original' || fuzzer === 'fuzzer' || official.has(domain) || seen.has(domain)) continue
  seen.add(domain); rows.push({ host: domain, y: 1, src: 'real', x: extractFeatures(domain).values })
}
const nReal = rows.length
// synthetic positives
for (const s of generateLookalikes()) rows.push({ host: s.domain, y: 1, src: 'synth', x: extractFeatures(s.domain).values })
const nSynth = rows.length - nReal
// negatives
const tranco = need('tranco-top.txt').split(/\r?\n/).filter(Boolean)
for (const d of tranco) rows.push({ host: d, y: 0, src: 'neg', x: extractFeatures(d).values })

// ── LR trainer (standardize on train, GD, class-weighted, L2) ───────────────
const sigmoid = (t: number) => 1 / (1 + Math.exp(-t))
function trainLR(train: Row[], epochs = 600) {
  const mean = new Array(F).fill(0), std = new Array(F).fill(0)
  for (const r of train) for (let j = 0; j < F; j++) mean[j] += r.x[j]
  for (let j = 0; j < F; j++) mean[j] /= train.length
  for (const r of train) for (let j = 0; j < F; j++) std[j] += (r.x[j] - mean[j]) ** 2
  for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / train.length) || 1
  const nP = train.filter((r) => r.y === 1).length || 1, nN = train.length - nP || 1
  const wP = train.length / (2 * nP), wN = train.length / (2 * nN)
  const w = new Array(F).fill(0); let b = 0
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(F).fill(0); let gb = 0, ws = 0
    for (const r of train) {
      let t = b; for (let j = 0; j < F; j++) t += w[j] * ((r.x[j] - mean[j]) / std[j])
      const pr = sigmoid(t), cw = r.y ? wP : wN, err = (pr - r.y) * cw
      for (let j = 0; j < F; j++) gw[j] += err * ((r.x[j] - mean[j]) / std[j])
      gb += err; ws += cw
    }
    for (let j = 0; j < F; j++) w[j] -= 0.5 * (gw[j] / ws + 1e-4 * w[j])
    b -= 0.5 * (gb / ws)
  }
  const prob = (r: Row) => { let t = b; for (let j = 0; j < F; j++) t += w[j] * ((r.x[j] - mean[j]) / std[j]); return sigmoid(t) }
  return { mean, std, w, b, prob }
}

// ── Stratified 70/30 split (seeded) ─────────────────────────────────────────
function mulberry32(s: number) { return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const rng = mulberry32(7)
function split(pred: (r: Row) => boolean) {
  const a = rows.filter(pred); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  const cut = Math.floor(a.length * 0.7); return { tr: a.slice(0, cut), te: a.slice(cut) }
}
const real = split((r) => r.src === 'real'), synth = split((r) => r.src === 'synth'), neg = split((r) => r.src === 'neg')
const train = [...real.tr, ...synth.tr, ...neg.tr]
const test = [...real.te, ...synth.te, ...neg.te]

// ── Train NEW model on the train split ──────────────────────────────────────
const m = trainLR(train)
// warn threshold = best F1 on train
let warn = 0.5, best = -1
for (let t = 0.05; t < 0.95; t += 0.01) { let tp = 0, fp = 0, fn = 0; for (const r of train) { const yp = m.prob(r) >= t ? 1 : 0; if (r.y && yp) tp++; else if (!r.y && yp) fp++; else if (r.y && !yp) fn++ } const pr = tp / (tp + fp || 1), rc = tp / (tp + fn || 1), f1 = 2 * pr * rc / (pr + rc || 1); if (f1 > best) { best = f1; warn = t } }

// ── OLD bundled model probability (synthetic-trained) ───────────────────────
const oldProb = (r: Row) => { let t = MODEL.bias; for (let j = 0; j < F; j++) t += MODEL.weights[j] * ((r.x[j] - MODEL.mean[j]) / (MODEL.std[j] || 1)); return sigmoid(t) }

const pct = (x: number) => (x * 100).toFixed(1) + '%'
const recallOn = (subset: Row[], prob: (r: Row) => number, thr: number) => subset.filter((r) => prob(r) >= thr).length / (subset.length || 1)
const realTe = test.filter((r) => r.src === 'real'), synthTe = test.filter((r) => r.src === 'synth'), negTe = test.filter((r) => r.src === 'neg')

console.log(`\nDataset: ${nReal} real + ${nSynth} synthetic positives + ${tranco.length} Tranco negatives`)
console.log(`Held-out test: ${realTe.length} real, ${synthTe.length} synth positives, ${negTe.length} negatives`)
console.log(`\nNEW model trained on REAL+synthetic (warn threshold ${warn.toFixed(2)}):`)
console.log('  recall on REAL test positives :', pct(recallOn(realTe, m.prob, warn)))
console.log('  recall on SYNTH test positives:', pct(recallOn(synthTe, m.prob, warn)))
console.log('  FPR on Tranco test            :', pct(recallOn(negTe, m.prob, warn)))
if (MODEL.weights.length === F) {
  console.log(`\nPreviously-bundled model on the SAME real test positives:`)
  console.log('  recall on REAL test positives :', pct(recallOn(realTe, oldProb, MODEL.warnThreshold)))
  console.log(`\n=> real-data recall: ${pct(recallOn(realTe, oldProb, MODEL.warnThreshold))} (bundled) -> ${pct(recallOn(realTe, m.prob, warn))} (new)`)
} else {
  console.log(`\n(Bundled model has ${MODEL.weights.length} features vs ${F} now — skipping direct comparison.`)
  console.log(` The synthetic-only baseline measured 86% real-data recall before retraining.)`)
}

// ── Retrain on FULL dataset and emit the shipped model ──────────────────────
const full = trainLR(rows)
let warnF = 0.5, bestF = -1
for (let t = 0.05; t < 0.95; t += 0.01) { let tp = 0, fp = 0, fn = 0; for (const r of rows) { const yp = full.prob(r) >= t ? 1 : 0; if (r.y && yp) tp++; else if (!r.y && yp) fp++; else if (r.y && !yp) fn++ } const pr = tp / (tp + fp || 1), rc = tp / (tp + fn || 1), f1 = 2 * pr * rc / (pr + rc || 1); if (f1 > bestF) { bestF = f1; warnF = t } }
const negP = rows.filter((r) => r.y === 0).map(full.prob).sort((a, b) => a - b)
const blockF = Math.min(0.995, Math.max(warnF + 0.02, (negP[negP.length - 1] ?? 0.9) + 1e-3))
const arr = (a: number[]) => '[' + a.map((v) => +v.toFixed(6)).join(', ') + ']'
writeFileSync(resolve(ROOT, 'src/data/modelWeights.ts'), `// AUTO-GENERATED by scripts/ml/train-real.ts — do not edit by hand.
// Tier-1 logistic-regression hybrid, retrained on REAL (dnstwist) + synthetic
// positives. Inference = sigmoid(w·z + b), z = (features - mean)/std.
// Trained ${new Date().toISOString().slice(0, 10)} on ${nReal} real + ${nSynth} synthetic positives.
export const MODEL = {
  features: ${JSON.stringify(FEATURE_NAMES)},
  mean: ${arr(full.mean)},
  std: ${arr(full.std)},
  weights: ${arr(full.w)},
  bias: ${+full.b.toFixed(6)},
  warnThreshold: ${warnF.toFixed(3)},
  blockThreshold: ${blockF.toFixed(3)},
} as const
`)
console.log('\nWrote src/data/modelWeights.ts (retrained on real + synthetic).')
