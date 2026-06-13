// Generate src/data/publicSuffix.ts from the Public Suffix List (ICANN section).
// Run: node scripts/gen-psl.mjs   (after downloading the .dat into data-eval/raw/)
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const raw = readFileSync(resolve(ROOT, 'data-eval/raw/public_suffix_list.dat'), 'utf8')

// ICANN section only (the registrable-domain standard); drop the private section.
const icann = raw.split('// ===BEGIN PRIVATE DOMAINS===')[0]

const normal = [], wildcard = [], exception = []
for (let line of icann.split(/\r?\n/)) {
  line = line.trim()
  if (!line || line.startsWith('//')) continue
  line = line.toLowerCase()
  if (line.startsWith('!')) exception.push(line.slice(1))
  else if (line.startsWith('*.')) wildcard.push(line.slice(2))
  else normal.push(line)
}

const arr = (a) => '[\n  ' + a.sort().map((s) => JSON.stringify(s)).join(',\n  ') + ',\n]'

const out = `// AUTO-GENERATED — do not edit by hand.
// Source: Public Suffix List (ICANN section), https://publicsuffix.org/list/public_suffix_list.dat
// Snapshot: ${new Date().toISOString().slice(0, 10)}.  Regenerate: node scripts/gen-psl.mjs
//
// Implements the registrable-domain algorithm (longest matching public suffix,
// wildcard '*' and exception '!' rules) so a brand on any ccTLD (amazon.co.jp,
// google.com.ua) is parsed with the brand as the registrable label.

const RULES = new Set<string>(${arr(normal)})
const WILDCARD = new Set<string>(${arr(wildcard)})
const EXCEPTION = new Set<string>(${arr(exception)})

export interface HostParts {
  sld: string // registrable label (e.g. 'amazon' in amazon.co.jp)
  suffix: string // public suffix (e.g. 'co.jp')
  subdomains: string[] // labels left of the registrable label
  registrable: string // sld + '.' + suffix
}

/** Split a host into registrable label, public suffix, and sub-domains per the PSL. */
export function registrableParts(host: string): HostParts {
  const labels = host.split('.').filter(Boolean)
  let suffixLen = 0 // number of labels in the winning public suffix

  // Exception rules win outright: the public suffix is the rule minus its first label.
  let exceptionMatched = false
  for (let i = 0; i < labels.length; i++) {
    if (EXCEPTION.has(labels.slice(i).join('.'))) {
      suffixLen = labels.length - i - 1
      exceptionMatched = true
      break
    }
  }

  if (!exceptionMatched) {
    for (let i = 0; i < labels.length; i++) {
      const numLabels = labels.length - i
      if (RULES.has(labels.slice(i).join('.'))) suffixLen = Math.max(suffixLen, numLabels)
      // Wildcard '*.X' matches <anyLabel>.X: labels[i] is the '*', rest must equal X.
      if (i < labels.length && WILDCARD.has(labels.slice(i + 1).join('.'))) {
        suffixLen = Math.max(suffixLen, numLabels)
      }
    }
    if (suffixLen === 0) suffixLen = 1 // default rule '*': the rightmost label
  }

  suffixLen = Math.min(suffixLen, labels.length)
  const suffix = labels.slice(labels.length - suffixLen)
  const rest = labels.slice(0, labels.length - suffixLen)
  const sld = rest.length ? rest[rest.length - 1] : ''
  const subdomains = rest.slice(0, -1)
  return {
    sld,
    suffix: suffix.join('.'),
    subdomains,
    registrable: (sld ? sld + '.' : '') + suffix.join('.'),
  }
}
`

writeFileSync(resolve(ROOT, 'src/data/publicSuffix.ts'), out)
console.log(`publicSuffix.ts written: ${normal.length} rules, ${wildcard.length} wildcard, ${exception.length} exception`)
