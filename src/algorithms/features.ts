// Feature extraction for the Tier-1 ML hybrid.
//
// Turns a host into a fixed numeric feature vector using the SAME classic
// algorithms the rule engine uses (skeleton normalization, weighted Damerau–
// Levenshtein, Horspool, PSL parse, UTS #39 script analysis). The rule-based
// analyze() in scoring.ts is left completely untouched — this is a parallel,
// dependency-free read-only view of the signals, so a learned model can decide
// how to weight them instead of the hand-picked constants.

import { skeleton } from './confusables'
import { weightedEditDistance, similarity } from './editDistance'
import { findPatterns } from './horspool'
import { parseHost, letterScriptsOf } from './scoring'
import { BRANDS, SUSPICIOUS_TLDS, LURE_WORDS } from '../data/brands'

// Stable feature order shared by the trainer and the inference path.
export const FEATURE_NAMES = [
  'bestSim', // max weighted-similarity to any brand core (0..1)
  'nearestVisual', // nearest match used a digit/letter look-alike swap
  'nearestTranspose', // nearest match used an adjacent transposition
  'homoglyph', // mixed-script OR whole-script-confusable folding onto a brand
  'mixedScript', // label mixes Latin with another script
  'homoglyphCount', // # confusable characters in the label
  'skelExact', // skeleton(sld) exactly equals a brand core
  'exactCore', // raw sld exactly equals a brand core (non-official)
  'embedded', // a brand core is a substring of skeleton(sld)
  'subBrand', // a brand core appears in a sub-domain
  'tldSuspicious', // throwaway / abuse TLD
  'lureCount', // # urgency/lure words present
  'sldLen', // length of the registrable label
  'digitRatio', // digits / label length
  'hyphenCount', // hyphens in the label
  'official', // exact official / alt / owned-name domain (strong negative)
] as const

const ASCII_ONLY = /^[\x00-\x7f]*$/
const cores = BRANDS.filter((b) => b.core.length >= 4)

export interface FeatureVector {
  names: readonly string[]
  values: number[]
}

export function extractFeatures(input: string): FeatureVector {
  const { sld, subdomains, lastLabel, registrable } = parseHost(input)
  const sldSkel = skeleton(sld)

  // Nearest brand by weighted edit distance + how the cheapest edit happened.
  let bestSim = 0
  let nearestVisual = 0
  let nearestTranspose = 0
  for (const b of cores) {
    const r = weightedEditDistance(sldSkel, b.core)
    const sim = similarity(r.distance, sldSkel, b.core)
    if (sim > bestSim) {
      bestSim = sim
      nearestVisual = r.trace.some((o) => o.kind === 'visual') ? 1 : 0
      nearestTranspose = r.trace.some((o) => o.type === 'transpose') ? 1 : 0
    }
  }

  // Script / homoglyph analysis (UTS #39), mirroring scoring.ts.
  const scripts = letterScriptsOf(sld)
  const mixedScript = scripts.size > 1 && [...scripts].some((s) => s !== 'Latin') ? 1 : 0
  let homoglyphCount = 0
  for (const ch of sld) {
    if (ch.charCodeAt(0) <= 127) continue
    const canon = skeleton(ch)
    if (canon !== ch && ASCII_ONLY.test(canon)) homoglyphCount++
  }

  const skelCoreBrand = BRANDS.find((b) => b.core === sldSkel)
  const exactCoreBrand = BRANDS.find((b) => b.core === sld)
  const subMatches = findPatterns(sldSkel, cores.map((b) => b.core))
  const embedded = subMatches.some((m) => m.pattern !== sld && m.pattern.length >= 4) ? 1 : 0
  const subBrand = cores.some((b) => subdomains.some((s) => skeleton(s).includes(b.core))) ? 1 : 0
  const tldSuspicious = SUSPICIOUS_TLDS.has(lastLabel) ? 1 : 0
  const lureCount = LURE_WORDS.filter(
    (w) => sldSkel.includes(w) || subdomains.some((s) => skeleton(s).includes(w)),
  ).length

  const official = BRANDS.find(
    (b) =>
      registrable === b.domain ||
      b.altDomains?.includes(registrable) ||
      (b.ownsName === true && sld === b.core && !SUSPICIOUS_TLDS.has(lastLabel)),
  )
    ? 1
    : 0

  const brandProximate = !!skelCoreBrand || subMatches.length > 0 || bestSim >= 0.85
  const confusableFold = homoglyphCount > 0
  const homoglyph = mixedScript || (confusableFold && brandProximate) ? 1 : 0

  const digits = (sld.match(/\d/g) ?? []).length
  const values = [
    bestSim,
    nearestVisual,
    nearestTranspose,
    homoglyph,
    mixedScript,
    homoglyphCount,
    skelCoreBrand && !exactCoreBrand ? 1 : 0,
    exactCoreBrand && !official ? 1 : 0,
    embedded,
    subBrand,
    tldSuspicious,
    lureCount,
    sld.length,
    sld.length ? digits / sld.length : 0,
    (sld.match(/-/g) ?? []).length,
    official,
  ]
  return { names: FEATURE_NAMES, values }
}
