// Full evaluation of the Tier-1 logistic-regression hybrid.
//
// Goes well beyond a single split: stratified 5-fold cross-validation with
// out-of-fold (OOF) predictions, ROC-AUC + PR-AUC, per-family recall, confusion
// matrices, an overfitting check (in-fold train vs OOF), an ablation of the
// interaction features, an external test on real OpenPhish positives the model
// never trained on, and inference latency.
//
// Run: npx tsx scripts/ml/evaluate.ts [negativesN]   (after scripts/eval/prep.ts)
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { extractFeatures, FEATURE_NAMES } from '../../src/algorithms/features'
import { predictML } from '../../src/algorithms/mlScore'
import { skeleton } from '../../src/algorithms/confusables'
import { BRANDS } from '../../src/data/brands'
import { generateLookalikes } from '../eval/lookalikes'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const NEG_N = Number(process.argv[2] ?? 25000)
const F = FEATURE_NAMES.length
const K = 5
const EPOCHS = 300
const need = (f: string) => { const p = resolve(DATA, f); if (!existsSync(p)) { console.error(`Missing ${f} — run scripts/eval/prep.ts`); process.exit(1) } return readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean) }

// ── Dataset ────────────────────────────────────────────────────────────────
interface Row { host: string; y: 0 | 1; family: string; x: number[] }
const rows: Row[] = []
for (const s of generateLookalikes()) rows.push({ host: s.domain, y: 1, family: s.family, x: extractFeatures(s.domain).values })
for (const d of need('tranco-top.txt').slice(0, NEG_N)) rows.push({ host: d, y: 0, family: 'legit', x: extractFeatures(d).values })
const pos = rows.filter((r) => r.y === 1), neg = rows.filter((r) => r.y === 0)

// ── Logistic regression (subset of features by index) ──────────────────────
function mulberry32(seed: number) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
const sigmoid = (t: number) => 1 / (1 + Math.exp(-t))

function trainLR(train: Row[], idx: number[]) {
  const d = idx.length
  const mean = new Array(d).fill(0), std = new Array(d).fill(0)
  for (const r of train) for (let j = 0; j < d; j++) mean[j] += r.x[idx[j]]
  for (let j = 0; j < d; j++) mean[j] /= train.length
  for (const r of train) for (let j = 0; j < d; j++) std[j] += (r.x[idx[j]] - mean[j]) ** 2
  for (let j = 0; j < d; j++) std[j] = Math.sqrt(std[j] / train.length) || 1
  const nP = train.filter((r) => r.y === 1).length || 1, nN = train.length - nP || 1
  const wP = train.length / (2 * nP), wN = train.length / (2 * nN)
  const w = new Array(d).fill(0); let b = 0
  for (let e = 0; e < EPOCHS; e++) {
    const gw = new Array(d).fill(0); let gb = 0, ws = 0
    for (const r of train) {
      let t = b; for (let j = 0; j < d; j++) t += w[j] * ((r.x[idx[j]] - mean[j]) / std[j])
      const pr = sigmoid(t), cw = r.y ? wP : wN, err = (pr - r.y) * cw
      for (let j = 0; j < d; j++) gw[j] += err * ((r.x[idx[j]] - mean[j]) / std[j])
      gb += err; ws += cw
    }
    for (let j = 0; j < d; j++) w[j] -= 0.5 * (gw[j] / ws + 1e-4 * w[j])
    b -= 0.5 * (gb / ws)
  }
  return (r: Row) => { let t = b; for (let j = 0; j < d; j++) t += w[j] * ((r.x[idx[j]] - mean[j]) / std[j]); return sigmoid(t) }
}

// ── Stratified k-fold assignment ───────────────────────────────────────────
function assignFolds(arr: Row[], seed: number) {
  const rng = mulberry32(seed), a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }
  return a.map((r, i) => ({ r, fold: i % K }))
}
const folded = [...assignFolds(pos, 1), ...assignFolds(neg, 2)]

// ── Cross-validation with out-of-fold predictions ──────────────────────────
function crossVal(idx: number[]) {
  const oof = new Map<Row, number>()
  for (let k = 0; k < K; k++) {
    const train = folded.filter((f) => f.fold !== k).map((f) => f.r)
    const predict = trainLR(train, idx)
    for (const f of folded.filter((f) => f.fold === k)) oof.set(f.r, predict(f.r))
  }
  return oof
}

// ── Metric helpers ─────────────────────────────────────────────────────────
const pct = (x: number) => (x * 100).toFixed(1) + '%'
function confusion(scored: { p: number; y: 0 | 1 }[], thr: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const s of scored) { const yp = s.p >= thr ? 1 : 0; if (s.y && yp) tp++; else if (!s.y && yp) fp++; else if (s.y && !yp) fn++; else tn++ }
  const recall = tp / (tp + fn || 1), precision = tp / (tp + fp || 1), fpr = fp / (fp + tn || 1)
  return { tp, fp, fn, tn, recall, precision, fpr, f1: (2 * precision * recall) / (precision + recall || 1), acc: (tp + tn) / scored.length }
}
function rocAuc(scored: { p: number; y: 0 | 1 }[]) { // Mann–Whitney U
  const sorted = [...scored].sort((a, b) => a.p - b.p)
  let rank = 1, i = 0, rankSumPos = 0, nP = 0, nN = 0
  while (i < sorted.length) { let j = i; while (j < sorted.length && sorted[j].p === sorted[i].p) j++; const avg = (rank + (rank + (j - i) - 1)) / 2; for (let k = i; k < j; k++) if (sorted[k].y === 1) rankSumPos += avg; rank += j - i; i = j }
  nP = scored.filter((s) => s.y === 1).length; nN = scored.length - nP
  return (rankSumPos - (nP * (nP + 1)) / 2) / (nP * nN)
}
function prAuc(scored: { p: number; y: 0 | 1 }[]) { // average precision
  const sorted = [...scored].sort((a, b) => b.p - a.p)
  const nP = scored.filter((s) => s.y === 1).length
  let tp = 0, fp = 0, ap = 0
  for (const s of sorted) { if (s.y) { tp++; ap += tp / (tp + fp) } else fp++ }
  return ap / nP
}
function bestF1(scored: { p: number; y: 0 | 1 }[]) {
  let best = 0, thr = 0.5
  for (let t = 0.02; t < 0.99; t += 0.01) { const c = confusion(scored, t); if (c.f1 > best) { best = c.f1; thr = t } }
  return thr
}

// ── 1. Cross-validated headline (full feature set) ─────────────────────────
const allIdx = FEATURE_NAMES.map((_, j) => j)
const oof = crossVal(allIdx)
const scored = folded.map((f) => ({ p: oof.get(f.r)!, y: f.r.y, r: f.r }))
const thr = bestF1(scored)
const overall = confusion(scored, thr)
const auc = rocAuc(scored), ap = prAuc(scored)

// per-fold F1 at the global threshold (stability)
const foldF1: number[] = []
for (let k = 0; k < K; k++) { const sub = scored.filter((s) => folded.find((f) => f.r === s.r)!.fold === k); foldF1.push(confusion(sub, thr).f1) }
const mean = foldF1.reduce((a, b) => a + b, 0) / K
const sd = Math.sqrt(foldF1.reduce((a, b) => a + (b - mean) ** 2, 0) / K)

console.log(`\n${'='.repeat(64)}\nFull evaluation — Tier-1 LR hybrid`)
console.log(`Dataset: ${pos.length} positives + ${neg.length} negatives | ${K}-fold CV | OOF predictions`)
console.log('='.repeat(64))
console.log(`\nThreshold-free separability:  ROC-AUC ${auc.toFixed(4)}   PR-AUC ${ap.toFixed(4)}`)
console.log(`\nAt F1-optimal threshold τ=${thr.toFixed(2)} (out-of-fold):`)
console.log(`  recall ${pct(overall.recall)}  precision ${pct(overall.precision)}  FPR ${pct(overall.fpr)}  F1 ${pct(overall.f1)}  acc ${pct(overall.acc)}`)
console.log(`  confusion: TP=${overall.tp} FP=${overall.fp} FN=${overall.fn} TN=${overall.tn}`)
console.log(`  per-fold F1: ${pct(mean)} ± ${(sd * 100).toFixed(1)} pts  (stability across folds)`)
// Overfitting: resubstitution (train-on-all, score-all) vs out-of-fold, same τ.
const fullPredict = trainLR(folded.map((f) => f.r), allIdx)
const resub = confusion(folded.map((f) => ({ p: fullPredict(f.r), y: f.r.y })), thr)
console.log(`\nOverfitting check (same τ):  resubstitution F1 ${pct(resub.f1)}  vs  out-of-fold F1 ${pct(overall.f1)}  (gap ${((resub.f1 - overall.f1) * 100).toFixed(1)} pts)`)

// ── 2. Per-family recall (OOF) ─────────────────────────────────────────────
console.log('\nPer-family recall (out-of-fold, τ):')
const families = ['homoglyph', 'typo', 'digit-swap', 'combosquat', 'tld-swap', 'subdomain']
for (const fam of families) {
  const sub = scored.filter((s) => s.r.family === fam)
  const caught = sub.filter((s) => s.p >= thr).length
  console.log(`  ${fam.padEnd(12)} ${String(caught).padStart(3)}/${String(sub.length).padStart(3)}  ${pct(caught / sub.length)}`)
}

// ── 3. Ablation: drop the 3 interaction features ───────────────────────────
const baseIdx = FEATURE_NAMES.map((_, j) => j).filter((j) => j < 16)
const oofAbl = crossVal(baseIdx)
const scoredAbl = folded.map((f) => ({ p: oofAbl.get(f.r)!, y: f.r.y }))
const ablThr = bestF1(scoredAbl), ablC = confusion(scoredAbl, ablThr)
console.log(`\nAblation (no interaction features):  F1 ${pct(ablC.f1)}  ROC-AUC ${rocAuc(scoredAbl).toFixed(4)}`)
console.log(`  vs full model:                     F1 ${pct(overall.f1)}  ROC-AUC ${auc.toFixed(4)}   (interactions add ${((overall.f1 - ablC.f1) * 100).toFixed(1)} F1 pts)`)

// ── 4. External test: real OpenPhish positives (never trained on) ──────────
const cores = BRANDS.filter((b) => b.core.length >= 4).map((b) => b.core)
function lev(a: string, b: string) { const n = a.length, m = b.length; let pr = Array.from({ length: m + 1 }, (_, j) => j), cu = new Array(m + 1).fill(0); for (let i = 1; i <= n; i++) { cu[0] = i; for (let j = 1; j <= m; j++) cu[j] = Math.min(pr[j] + 1, cu[j - 1] + 1, pr[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));[pr, cu] = [cu, pr] } return pr[m] }
const opHosts = need('openphish-hosts.txt')
const opLookalike = opHosts.filter((h) => { if ([...h].some((c) => c.charCodeAt(0) > 127)) return true; const sld = skeleton(h.split('.').slice(-2)[0] ?? ''); return cores.some((c) => sld.includes(c) || lev(sld, c) <= 2) })
const opCaught = opLookalike.filter((h) => predictML(h).level !== 'safe').length
console.log(`\nExternal (real OpenPhish, bundled model): brand-lookalike subset ${opCaught}/${opLookalike.length} flagged; full feed ${opHosts.filter((h) => predictML(h).level !== 'safe').length}/${opHosts.length}`)

// ── 5. Inference latency (predictML = features + dot product) ──────────────
const sample = neg.slice(0, 5000).map((r) => r.host)
const t0 = performance.now(); for (const h of sample) predictML(h); const dt = (performance.now() - t0) / sample.length
console.log(`\nInference latency: ${dt.toFixed(3)} ms/verdict (predictML over ${sample.length} hosts)`)
console.log('='.repeat(64) + '\n')
