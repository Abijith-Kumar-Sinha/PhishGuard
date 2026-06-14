// Leave-one-brand-out (LOBO) cross-validation — the strict generalization test.
// For each harvested brand: train the LR on every OTHER brand's look-alikes
// (real + synthetic) + Tranco, then test recall on the held-out brand's REAL
// look-alikes. High held-out recall ⇒ the model learned general signals, not
// brand-specific memorization.
//
// Run: npx tsx scripts/ml/bybrand.ts   (after the dnstwist harvest + prep)
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractFeatures, FEATURE_NAMES } from '../../src/algorithms/features'
import { BRANDS } from '../../src/data/brands'
import { generateLookalikes } from '../eval/lookalikes'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'data-eval')
const F = FEATURE_NAMES.length
const need = (f: string) => { const p = resolve(DATA, f); if (!existsSync(p)) { console.error(`Missing ${f}`); process.exit(1) } return readFileSync(p, 'utf8') }

const domainToCore = new Map(BRANDS.map((b) => [b.domain, b.core]))
const official = new Set<string>()
for (const b of BRANDS) { official.add(b.domain); for (const a of b.altDomains ?? []) official.add(a) }

interface Pos { host: string; core: string; x: number[] }
// Real positives (dnstwist), tagged with the brand core they were twisted from.
const real: Pos[] = []
const seen = new Set<string>()
for (const line of need('dnstwist/all.csv').split(/\r?\n/)) {
  if (!line || line.startsWith('>>')) continue
  const p = line.split(','); if (p.length < 3) continue
  const core = domainToCore.get(p[0].trim()) ?? p[0].split('.')[0]
  const fuzzer = p[1].trim(), domain = p[2].trim().toLowerCase()
  if (!domain || fuzzer === '*original' || fuzzer === 'fuzzer' || official.has(domain) || seen.has(domain)) continue
  seen.add(domain); real.push({ host: domain, core, x: extractFeatures(domain).values })
}
// Synthetic positives, tagged with brand core.
const synth: Pos[] = generateLookalikes().map((s) => ({ host: s.domain, core: s.brand, x: extractFeatures(s.domain).values }))
// Negatives: a fixed Tranco split (same for every fold).
const tranco = need('tranco-top.txt').split(/\r?\n/).filter(Boolean)
const negTrain = tranco.slice(0, 12000).map((d) => extractFeatures(d).values)
const negTest = tranco.slice(40000, 50000).map((d) => extractFeatures(d).values)

// ── LR trainer (standardize on train, GD, class-weighted, L2) ───────────────
const sigmoid = (t: number) => 1 / (1 + Math.exp(-t))
function trainLR(posX: number[][], negX: number[][], epochs = 400) {
  const all = [...posX.map((x) => ({ x, y: 1 })), ...negX.map((x) => ({ x, y: 0 }))]
  const mean = new Array(F).fill(0), std = new Array(F).fill(0)
  for (const r of all) for (let j = 0; j < F; j++) mean[j] += r.x[j]
  for (let j = 0; j < F; j++) mean[j] /= all.length
  for (const r of all) for (let j = 0; j < F; j++) std[j] += (r.x[j] - mean[j]) ** 2
  for (let j = 0; j < F; j++) std[j] = Math.sqrt(std[j] / all.length) || 1
  const wP = all.length / (2 * posX.length || 1), wN = all.length / (2 * negX.length || 1)
  const w = new Array(F).fill(0); let b = 0
  for (let e = 0; e < epochs; e++) {
    const gw = new Array(F).fill(0); let gb = 0, ws = 0
    for (const r of all) {
      let t = b; for (let j = 0; j < F; j++) t += w[j] * ((r.x[j] - mean[j]) / std[j])
      const pr = sigmoid(t), cw = r.y ? wP : wN, err = (pr - r.y) * cw
      for (let j = 0; j < F; j++) gw[j] += err * ((r.x[j] - mean[j]) / std[j])
      gb += err; ws += cw
    }
    for (let j = 0; j < F; j++) w[j] -= 0.5 * (gw[j] / ws + 1e-4 * w[j])
    b -= 0.5 * (gb / ws)
  }
  // warn threshold = best F1 on the training data
  const prob = (x: number[]) => { let t = b; for (let j = 0; j < F; j++) t += w[j] * ((x[j] - mean[j]) / std[j]); return sigmoid(t) }
  let warn = 0.5, best = -1
  for (let t = 0.05; t < 0.95; t += 0.01) { let tp = 0, fp = 0, fn = 0; for (const r of all) { const yp = prob(r.x) >= t ? 1 : 0; if (r.y && yp) tp++; else if (!r.y && yp) fp++; else if (r.y && !yp) fn++ } const pr = tp / (tp + fp || 1), rc = tp / (tp + fn || 1), f1 = 2 * pr * rc / (pr + rc || 1); if (f1 > best) { best = f1; warn = t } }
  return { prob, warn }
}

// ── LOBO over the harvested brands ──────────────────────────────────────────
const pct = (x: number) => (x * 100).toFixed(1) + '%'
const brands = [...new Set(real.map((p) => p.core))]
console.log(`\nLeave-one-brand-out CV — ${real.length} real + ${synth.length} synthetic positives, ${brands.length} held-out brands`)
console.log('held-out brand     n    recall on UNSEEN brand   FPR')
let macroRecall = 0, macroFpr = 0
for (const hb of brands) {
  const testPos = real.filter((p) => p.core === hb)
  const trainPos = [...real.filter((p) => p.core !== hb), ...synth.filter((p) => p.core !== hb)].map((p) => p.x)
  const { prob, warn } = trainLR(trainPos, negTrain)
  const recall = testPos.filter((p) => prob(p.x) >= warn).length / (testPos.length || 1)
  const fpr = negTest.filter((x) => prob(x) >= warn).length / negTest.length
  macroRecall += recall; macroFpr += fpr
  console.log('  ' + hb.padEnd(14), String(testPos.length).padStart(3), '       ' + pct(recall).padStart(6) + '            ' + pct(fpr))
}
console.log(`\nMacro-average over held-out brands:  recall ${pct(macroRecall / brands.length)}   FPR ${pct(macroFpr / brands.length)}`)
console.log('(High held-out recall ⇒ generalizes to brands unseen in training.)')
