// Horspool's string-matching algorithm (Boyer-Moore-Horspool).
// Syllabus: Unit III - "Input Enhancement in String Matching" (Levitin, sec. 7.2).
//
// Idea: pre-compute, for every character, how far the pattern can safely be
// shifted right when a mismatch happens - the "shift table". On a mismatch we
// jump ahead instead of stepping one character at a time, giving fast
// average-case search. We use it to detect whether a brand name occurs as a
// substring of a domain (e.g. "paypal" inside "secure-paypal-login").

export interface Match {
  pattern: string
  start: number
  end: number
}

/** Shift table: distance of each character from the end among the first m-1
 *  characters of the pattern; characters not present shift by the full length. */
function shiftTable(pattern: string): Map<string, number> {
  const m = pattern.length
  const table = new Map<string, number>()
  for (let i = 0; i < m - 1; i++) table.set(pattern[i], m - 1 - i)
  return table
}

/** All start indices where `pattern` occurs in `text` (Horspool). */
export function horspoolAll(text: string, pattern: string): number[] {
  const m = pattern.length
  const n = text.length
  const out: number[] = []
  if (m === 0 || m > n) return out
  const table = shiftTable(pattern)
  let i = m - 1
  while (i <= n - 1) {
    let k = 0
    while (k < m && pattern[m - 1 - k] === text[i - k]) k++
    if (k === m) {
      out.push(i - m + 1)
      i += 1 // continue scanning for further (possibly overlapping) matches
    } else {
      i += table.get(text[i]) ?? m
    }
  }
  return out
}

/** Find every pattern (brand core) that occurs inside `text`. */
export function findPatterns(text: string, patterns: string[]): Match[] {
  const matches: Match[] = []
  for (const p of patterns) {
    for (const s of horspoolAll(text, p)) {
      matches.push({ pattern: p, start: s, end: s + p.length })
    }
  }
  return matches
}
