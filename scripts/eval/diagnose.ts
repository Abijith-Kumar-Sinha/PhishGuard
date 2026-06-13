// One-off diagnostic: decompose PhishGuard's Tranco false positives by WHY
// they fire (using the verdict itself), and classify the missed typos.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyze } from '../../src/algorithms/scoring'
import { generateLookalikes } from './lookalikes'

const DATA = resolve(import.meta.dirname, '../../data-eval')
const tranco = readFileSync(resolve(DATA, 'tranco-top.txt'), 'utf8').split(/\r?\n/).filter(Boolean)

// ── (a) FP composition by verdict ──
let pinnedToBrand = 0, noBrand = 0
const signalTally: Record<string, number> = {}
const noBrandEx: string[] = []
for (const d of tranco) {
  const v = analyze(d)
  if (v.level === 'safe') continue
  const sig = v.signals[0]?.label ?? '(none)'
  signalTally[sig] = (signalTally[sig] ?? 0) + 1
  if (v.brand) pinnedToBrand++
  else { noBrand++; if (noBrandEx.length < 25) noBrandEx.push(`${d} [${v.level}]`) }
}
console.log('── PhishGuard Tranco FP composition (by verdict) ──')
console.log('pinned to a protected brand :', pinnedToBrand, '(legit brand-owned domains on other TLDs, or brand infra)')
console.log('no brand pinned             :', noBrand)
console.log('\nprimary-signal tally:')
for (const [k, n] of Object.entries(signalTally).sort((a, b) => b[1] - a[1])) console.log('  ', String(n).padStart(4), k)
console.log('\nno-brand FP examples:', noBrandEx.join(', '))

// ── (b) missed typos by sub-type ──
const typos = generateLookalikes().filter((s) => s.family === 'typo')
const missed = typos.filter((s) => analyze(s.domain).level === 'safe')
console.log(`\n── Missed typos: ${missed.length}/${typos.length} ──`)
console.log(missed.map((s) => `${s.domain} (vs ${s.brand})`).join('\n'))
