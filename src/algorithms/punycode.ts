// Punycode (RFC 3492) decoder. Browsers store internationalised domains in an
// ASCII "xn--" form (e.g. xn--pypal-4ve.com). To detect the homoglyph hidden
// inside, we first decode that back to the real Unicode (-> pаypal.com) and
// then run the normal analysis on it.

const BASE = 36, TMIN = 1, TMAX = 26, SKEW = 38, DAMP = 700
const INITIAL_BIAS = 72, INITIAL_N = 128

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  delta = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  delta += Math.floor(delta / numPoints)
  let k = 0
  while (delta > ((BASE - TMIN) * TMAX) >> 1) {
    delta = Math.floor(delta / (BASE - TMIN))
    k += BASE
  }
  return k + Math.floor(((BASE - TMIN + 1) * delta) / (delta + SKEW))
}

function basicToDigit(cp: number): number {
  if (cp - 48 < 10) return cp - 22 // '0'-'9' -> 26..35
  if (cp - 65 < 26) return cp - 65 // 'A'-'Z' -> 0..25
  if (cp - 97 < 26) return cp - 97 // 'a'-'z' -> 0..25
  return BASE
}

function decode(input: string): string {
  const output: number[] = []
  let n = INITIAL_N, i = 0, bias = INITIAL_BIAS
  let basic = input.lastIndexOf('-')
  if (basic < 0) basic = 0
  for (let j = 0; j < basic; j++) output.push(input.charCodeAt(j))
  let index = basic > 0 ? basic + 1 : 0
  while (index < input.length) {
    const oldi = i
    let w = 1, k = BASE
    for (;;) {
      if (index >= input.length) throw new Error('bad input')
      const digit = basicToDigit(input.charCodeAt(index++))
      if (digit >= BASE) throw new Error('bad digit')
      i += digit * w
      const t = k <= bias ? TMIN : k >= bias + TMAX ? TMAX : k - bias
      if (digit < t) break
      w *= BASE - t
      k += BASE
    }
    const out = output.length + 1
    bias = adapt(i - oldi, out, oldi === 0)
    n += Math.floor(i / out)
    i %= out
    output.splice(i++, 0, n)
  }
  return String.fromCodePoint(...output)
}

/** Decode a single label if it is in xn-- form; otherwise return it unchanged. */
export function toUnicodeLabel(label: string): string {
  if (label.toLowerCase().startsWith('xn--')) {
    try {
      return decode(label.slice(4))
    } catch {
      return label
    }
  }
  return label
}

/** Decode every xn-- label in a host. */
export function decodeHost(host: string): string {
  return host.split('.').map(toUnicodeLabel).join('.')
}
