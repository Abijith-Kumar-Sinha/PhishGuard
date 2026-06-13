// Generate src/data/confusablesMap.ts from the Unicode UTS #39 confusables.txt.
// Resolves each confusable to its final ASCII-alphanumeric skeleton (following
// the prototype chain), keeping only mappings useful for domain labels.
// Run: node scripts/gen-confusables.mjs  (after downloading the .txt).
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

const ROOT = resolvePath(import.meta.dirname, '..')
const raw = readFileSync(resolvePath(ROOT, 'data-eval/raw/confusables.txt'), 'utf8')

const cp = (hex) => String.fromCodePoint(parseInt(hex, 16))

// Parse "SOURCE ; TARGET TARGET... ; type # comment" into source-char -> target-string.
const rawMap = {}
for (const line of raw.split(/\r?\n/)) {
  const body = line.split('#')[0].trim()
  if (!body) continue
  const parts = body.split(';').map((s) => s.trim())
  if (parts.length < 2) continue
  const src = cp(parts[0])
  const tgt = parts[1].split(/\s+/).map(cp).join('')
  if (src && tgt) rawMap[src] = tgt
}

// Follow the chain (a target may itself be confusable) until it stabilises.
function chase(s, depth = 0) {
  if (depth > 12) return s
  let out = ''
  let changed = false
  for (const ch of s) {
    const t = rawMap[ch]
    if (t !== undefined && t !== ch) { out += t; changed = true }
    else out += ch
  }
  return changed ? chase(out, depth + 1) : out
}

// Keep only source chars that fold to an ASCII-alphanumeric skeleton (the form
// that matters for domain labels), and that actually change.
const map = {}
for (const src of Object.keys(rawMap)) {
  if (src.codePointAt(0) <= 0x7f) continue // already ASCII
  let folded = chase(src)
  folded = folded.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
  // Single ASCII-alphanumeric target only: a clean 1:1 homoglyph fold for
  // skeleton(). (Multi-char confusables like m↔rn, w↔vv are left for future
  // work to keep the per-character mapping predictable.)
  if (/^[a-z0-9]$/.test(folded) && folded !== src.toLowerCase()) map[src] = folded
}

const entries = Object.entries(map).sort((a, b) => a[0].codePointAt(0) - b[0].codePointAt(0))
const body = entries.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')

const out = `// AUTO-GENERATED — do not edit by hand.
// Source: Unicode UTS #39 confusables.txt, https://www.unicode.org/Public/security/latest/confusables.txt
// Snapshot: ${new Date().toISOString().slice(0, 10)}.  Regenerate: node scripts/gen-confusables.mjs
//
// ${entries.length} confusable characters that fold to an ASCII-alphanumeric
// skeleton — the full Unicode look-alike table, vs the curated subset we shipped
// before. Used by skeleton() to strip homoglyph disguises before comparison.
export const CONFUSABLES_FULL: Record<string, string> = {
${body}
}
`
writeFileSync(resolvePath(ROOT, 'src/data/confusablesMap.ts'), out)
console.log(`confusablesMap.ts written: ${entries.length} mappings`)
