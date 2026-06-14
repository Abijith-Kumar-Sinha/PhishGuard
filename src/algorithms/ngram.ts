// Character bigram "improbability" score — how unlike a real domain label a
// string looks. Real names follow common letter patterns (low surprise); random
// or DGA-style strings have unusual letter pairs (high surprise). Backed by a
// bigram model learned from legitimate Tranco labels (src/data/ngram.ts).
import { ALPHABET, LOGP } from '../data/ngram'

const idx: Record<string, number> = {}
for (let i = 0; i < ALPHABET.length; i++) idx[ALPHABET[i]] = i
const N = ALPHABET.length
const UNSEEN = Math.log(1 / N) // log-prob fallback for out-of-alphabet characters

/**
 * Average per-character surprisal (nats) of `label` under the legit-domain bigram
 * model, bracketed with start/end markers. Low ≈ word-like; high ≈ random.
 */
export function improbability(label: string): number {
  const s = '^' + label.toLowerCase() + '$'
  let sum = 0
  let n = 0
  for (let i = 1; i < s.length; i++) {
    const a = idx[s[i - 1]]
    const b = idx[s[i]]
    sum += a !== undefined && b !== undefined ? -LOGP[a][b] : -UNSEEN
    n++
  }
  return n ? sum / n : 0
}
