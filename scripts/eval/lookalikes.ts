// Reproducible lookalike generator for the controlled positive set.
//
// Produces labelled phishing variants of the protected brands across the six
// attack families PhishGuard claims to catch. Generation is deterministic
// (seeded PRNG) so the evaluation reproduces exactly on every run.
//
// IMPORTANT (fairness): the homoglyph table below is an INDEPENDENT, richer
// Unicode confusables set — deliberately a superset of the detector's own
// curated map in src/algorithms/confusables.ts. If we generated homoglyphs
// only from the detector's own table, it would catch 100% by construction.
// Drawing from a broader set measures GENUINE coverage and exposes gaps.
import { BRANDS } from '../../src/data/brands'

export type Family =
  | 'homoglyph'
  | 'typo'
  | 'digit-swap'
  | 'combosquat'
  | 'tld-swap'
  | 'subdomain'

export interface Sample {
  domain: string
  family: Family
  brand: string // brand core impersonated
}

// ── Independent homoglyph table (real Unicode confusables, UTS #39 spirit) ──
// Multiple candidates per Latin letter, spanning Cyrillic, Greek, Armenian,
// fullwidth and other look-alikes. Some entries are NOT in the detector's map.
const HOMOGLYPHS: Record<string, string[]> = {
  a: ['а', 'α', 'ạ', 'ä', 'ａ', 'ɑ'], // Cyrillic a, Greek alpha, dotted, umlaut, fullwidth, latin alpha
  b: ['Ь', 'ƅ', 'Ƅ', 'ｂ', 'б'],
  c: ['с', 'ϲ', 'ç', 'ｃ', 'ċ'], // Cyrillic es, Greek lunate sigma
  d: ['ԁ', 'ɗ', 'ｄ', 'ḍ'],
  e: ['е', 'ε', 'ё', 'ｅ', 'ė', 'ҽ'], // Cyrillic ie, Greek epsilon
  f: ['ｆ', 'ḟ'],
  g: ['ɡ', 'ｇ', 'ġ', 'ǵ'], // latin script g
  h: ['һ', 'ｈ', 'ḥ', 'ʜ'], // Cyrillic shha
  i: ['і', 'ı', 'ӏ', 'ｉ', ' í', 'ϊ'], // Ukrainian i, dotless i, Cyrillic palochka
  j: ['ј', 'ｊ', 'ϳ'], // Cyrillic je
  k: ['к', 'ｋ', 'ḳ', 'κ'], // Cyrillic ka, Greek kappa
  l: ['ӏ', 'ḷ', 'ｌ', 'ⅼ', 'ı'], // Cyrillic palochka, roman numeral
  m: ['м', 'ｍ', 'ṃ', 'ⅿ'], // Cyrillic em
  n: ['ｎ', 'ṇ', 'ո'], // Armenian vo
  o: ['о', 'ο', 'ｏ', 'ọ', 'ö', '٥'], // Cyrillic o, Greek omicron, arabic-indic 5
  p: ['р', 'ρ', 'ｐ', 'ṗ'], // Cyrillic er, Greek rho
  q: ['ԛ', 'ｑ', 'զ'], // Cyrillic qa, Armenian
  r: ['г', 'ｒ', 'ṛ', 'ꭇ'], // (г is a weak homoglyph but realistic)
  s: ['ѕ', 'ｓ', 'ṣ', 'ʂ'], // Cyrillic dze
  t: ['т', 'ｔ', 'ṭ', 'τ'], // Cyrillic te, Greek tau
  u: ['υ', 'ｕ', 'ս', 'ц'], // Greek upsilon, Armenian
  v: ['ν', 'ｖ', 'ѵ', 'ⅴ'], // Greek nu, Cyrillic izhitsa
  w: ['ԝ', 'ｗ', 'ѡ', 'ա'], // Cyrillic we, Armenian
  x: ['х', 'ｘ', 'χ', 'ⅹ'], // Cyrillic ha, Greek chi
  y: ['у', 'ｙ', 'ý', 'ỵ'], // Cyrillic u
  z: ['ｚ', 'ż', 'ẓ'],
}

const SUSPICIOUS_TLDS_GEN = ['xyz', 'top', 'tk', 'online', 'click', 'site', 'live', 'club', 'shop', 'cf']
const LURES_GEN = ['login', 'verify', 'secure', 'account', 'update', 'kyc', 'reward', 'wallet', 'signin', 'support']
const SUB_PREFIXES = ['account-verify', 'secure-login', 'kyc-update', 'verify', 'login', 'auth']

// ── deterministic PRNG (mulberry32) so runs are reproducible ──
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rng = makeRng(0x9e3779b9)
const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length)]

const DIGIT_SWAP: Record<string, string> = {
  o: '0', l: '1', i: '1', e: '3', a: '4', s: '5', g: '9', b: '8', t: '7', z: '2',
}
const QWERTY = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
function qwertyNeighbour(ch: string): string | null {
  for (const row of QWERTY) {
    const i = row.indexOf(ch)
    if (i === -1) continue
    const cands = [row[i - 1], row[i + 1]].filter(Boolean)
    return cands.length ? pick(cands) : null
  }
  return null
}

function realTld(domain: string): string {
  const parts = domain.split('.')
  return parts.slice(1).join('.') // everything after the first label
}

// ── per-family generators (return registrable-or-host strings) ──
function genHomoglyph(core: string): string[] {
  const out: string[] = []
  const idxs = [...core].map((c, i) => (HOMOGLYPHS[c] ? i : -1)).filter((i) => i >= 0)
  if (!idxs.length) return out
  // single-glyph and multi-glyph variants
  for (let k = 0; k < 2; k++) {
    const chars = [...core]
    const swapCount = k === 0 ? 1 : Math.min(idxs.length, 2 + Math.floor(rng() * 2))
    const chosen = [...idxs].sort(() => rng() - 0.5).slice(0, swapCount)
    for (const i of chosen) chars[i] = pick(HOMOGLYPHS[core[i]])
    out.push(chars.join(''))
  }
  return out
}
function genTypo(core: string): string[] {
  const out: string[] = []
  // replacement (qwerty neighbour)
  {
    const i = Math.floor(rng() * core.length)
    const nb = qwertyNeighbour(core[i])
    if (nb) out.push(core.slice(0, i) + nb + core.slice(i + 1))
  }
  // deletion
  {
    const i = Math.floor(rng() * core.length)
    if (core.length > 4) out.push(core.slice(0, i) + core.slice(i + 1))
  }
  // insertion (double a letter)
  {
    const i = Math.floor(rng() * core.length)
    out.push(core.slice(0, i + 1) + core[i] + core.slice(i + 1))
  }
  // transposition (swap adjacent)
  {
    const i = Math.floor(rng() * (core.length - 1))
    const a = [...core]
    ;[a[i], a[i + 1]] = [a[i + 1], a[i]]
    if (a.join('') !== core) out.push(a.join(''))
  }
  return out
}
function genDigit(core: string): string[] {
  const swappable = [...core].map((c, i) => (DIGIT_SWAP[c] ? i : -1)).filter((i) => i >= 0)
  if (!swappable.length) return []
  const out: string[] = []
  // swap one
  {
    const i = pick(swappable)
    const a = [...core]; a[i] = DIGIT_SWAP[core[i]]; out.push(a.join(''))
  }
  // swap all
  out.push([...core].map((c) => DIGIT_SWAP[c] ?? c).join(''))
  return [...new Set(out)]
}

/** Build the full labelled set across all six families. */
export function generateLookalikes(): Sample[] {
  const samples: Sample[] = []
  const seen = new Set<string>()
  const realDomains = new Set(BRANDS.map((b) => b.domain))
  const push = (domain: string, family: Family, brand: string) => {
    const key = family + '|' + domain
    if (seen.has(key) || realDomains.has(domain)) return
    seen.add(key)
    samples.push({ domain, family, brand })
  }

  for (const b of BRANDS) {
    if (b.core.length < 4) continue
    const tld = realTld(b.domain) || 'com'

    for (const v of genHomoglyph(b.core)) push(`${v}.${tld}`, 'homoglyph', b.core)
    for (const v of genTypo(b.core)) push(`${v}.${tld}`, 'typo', b.core)
    for (const v of genDigit(b.core)) push(`${v}.${tld}`, 'digit-swap', b.core)

    // combosquat: brand + lure on a normal-ish or suspicious tld
    push(`${b.core}-${pick(LURES_GEN)}.com`, 'combosquat', b.core)
    push(`${pick(LURES_GEN)}-${b.core}.${pick(SUSPICIOUS_TLDS_GEN)}`, 'combosquat', b.core)

    // tld-swap: real brand label on a throwaway tld (skip the real tld)
    {
      let st = pick(SUSPICIOUS_TLDS_GEN)
      if (st === tld) st = SUSPICIOUS_TLDS_GEN[(SUSPICIOUS_TLDS_GEN.indexOf(st) + 1) % SUSPICIOUS_TLDS_GEN.length]
      push(`${b.core}.${st}`, 'tld-swap', b.core)
    }

    // subdomain trick: brand as a sub-domain of an attacker-owned domain
    push(`${b.core}.${pick(SUB_PREFIXES)}.com`, 'subdomain', b.core)
  }
  return samples
}

if (import.meta.filename === process.argv[1] || process.argv[1]?.endsWith('lookalikes.ts')) {
  const s = generateLookalikes()
  const byFam: Record<string, number> = {}
  for (const x of s) byFam[x.family] = (byFam[x.family] ?? 0) + 1
  console.log('generated', s.length, 'lookalikes:', byFam)
  console.log('sample:', s.slice(0, 18).map((x) => x.domain).join('  '))
}
