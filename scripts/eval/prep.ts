// Data-prep step for the real-data evaluation.
//
// Reads the raw downloads in data-eval/raw/ and produces cleaned, cached
// host lists the evaluation harness consumes. Re-running is offline once the
// raw files exist, so the evaluation is reproducible.
//
//   raw/top-1m.csv    (Tranco, "rank,domain")  -> tranco-top.txt   (legit negatives)
//   raw/openphish.txt (OpenPhish URL feed)      -> openphish-hosts.txt (in-the-wild positives)
//
// Usage:  npx tsx scripts/eval/prep.ts [trancoN]
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { skeleton } from '../../src/algorithms/confusables'
import { BRANDS } from '../../src/data/brands'

const ROOT = resolve(import.meta.dirname, '../..')
const RAW = resolve(ROOT, 'data-eval/raw')
const OUT = resolve(ROOT, 'data-eval')

const TRANCO_N = Number(process.argv[2] ?? 50000)

// ── Tranco: top-N legitimate registrable domains ──────────────────────────
const trancoCsv = readFileSync(resolve(RAW, 'top-1m.csv'), 'utf8')
const tranco: string[] = []
for (const line of trancoCsv.split(/\r?\n/)) {
  if (!line) continue
  const domain = line.slice(line.indexOf(',') + 1).trim().toLowerCase()
  if (domain) tranco.push(domain)
  if (tranco.length >= TRANCO_N) break
}
writeFileSync(resolve(OUT, 'tranco-top.txt'), tranco.join('\n'))

// ── OpenPhish: dedupe URL feed down to registrable hosts ──────────────────
const opRaw = readFileSync(resolve(RAW, 'openphish.txt'), 'utf8')
const hosts = new Set<string>()
let unparsed = 0
for (const line of opRaw.split(/\r?\n/)) {
  const url = line.trim()
  if (!url) continue
  try {
    const h = new URL(url).hostname.toLowerCase().replace(/^www\./, '')
    if (h && h.includes('.')) hosts.add(h)
  } catch {
    unparsed++
  }
}
const openphish = [...hosts]
writeFileSync(resolve(OUT, 'openphish-hosts.txt'), openphish.join('\n'))

// ── Probe: how many OpenPhish hosts lexically resemble a protected brand? ──
// Independent of PhishGuard's scoring: a host is "brand-resembling" if its
// skeleton SLD embeds a brand core (>=4 chars), or is within raw Levenshtein 2
// of one, or carries any non-ASCII char. This bounds the in-scope subset.
const cores = BRANDS.filter((b) => b.core.length >= 4).map((b) => b.core)
function lev(a: string, b: string): number {
  const n = a.length, m = b.length
  const d = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++)
    for (let j = 1; j <= m; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[n][m]
}
function brandResembling(host: string): boolean {
  if ([...host].some((c) => c.charCodeAt(0) > 127)) return true
  const labels = host.split('.')
  const sld = skeleton(labels.length >= 2 ? labels[labels.length - 2] : labels[0])
  for (const c of cores) {
    if (sld.includes(c) || c.includes(sld)) return true
    if (lev(sld, c) <= 2) return true
  }
  return false
}
const resembling = openphish.filter(brandResembling)

console.log('Tranco negatives written  :', tranco.length, '-> data-eval/tranco-top.txt')
console.log('OpenPhish hosts written   :', openphish.length, '-> data-eval/openphish-hosts.txt', `(${unparsed} URLs unparsed)`)
console.log('OpenPhish brand-resembling:', resembling.length, `(${Math.round((resembling.length / openphish.length) * 100)}% of feed)`)
if (resembling.length) console.log('  e.g.', resembling.slice(0, 12).join(', '))
