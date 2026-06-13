# PhishGuard — Algorithm & Complexity Analysis

Time and space complexity of every stage in the detection pipeline, with the
DAA-course technique each one illustrates. Notation:

- **n** — length of the registrable label (SLD) under test (typically 5–15 chars)
- **m** — length of a brand core (4–12 chars); **m̄** average, **m̂** max
- **B** — number of protected brands (currently 29; 28 with core length ≥ 4)
- **L** — number of dot-separated labels in the host (typically 2–4)
- **σ** — alphabet size (constant)

---

## 1. Pipeline overview

| Stage | Module | Technique (DAA unit) | Time | Space |
|-------|--------|----------------------|------|-------|
| Host parse + registrable split | `publicSuffix.ts` | Public Suffix List longest-match | O(L²) ≈ O(1) | O(1) |
| IDN decode (`xn--`) | `punycode.ts` | RFC 3492 decode (transform) | O(n) | O(n) |
| Skeleton normalization | `confusables.ts` | Transform-and-conquer (UTS #39) | O(n) | O(n) |
| Similarity to each brand | `editDistance.ts` | **Dynamic programming** (Unit IV) | O(n·m) per brand | O(n·m) |
| Embedded-brand search | `horspool.ts` | **Horspool string matching** (Unit III) | O(n) avg | O(m+σ) |
| Signal fusion / scoring | `scoring.ts` | Rule aggregation | O(1) | O(1) |

**Overall `analyze()`** is dominated by the edit-distance loop over all brands:

> **T(analyze) = O(B · n · m̂)**  — linear in the domain length, with B and m̂ bounded constants ⇒ effectively **O(n)** per domain.

Measured: **1,020–3,468 DP cell evaluations** per verdict (≈ B·n·m̄), completing in
**~0.16 ms mean / 0.37 ms p99** over 50,000 domains (see `EVALUATION.md §7`).

---

## 2. Skeleton normalization — Transform-and-Conquer

`skeleton()` maps a label to a canonical homoglyph-free form, so the disguise is
removed *before* any comparison (the transform-and-conquer idea: normalise the
input, then solve the easier instance).

1. NFKD Unicode decomposition — O(n)
2. Drop combining marks — O(n)
3. Per-character confusable fold via a precomputed hash map (1,624 UTS #39 entries),
   O(1) per char — O(n)

**Time O(n), Space O(n).** The confusables table is a classic **space–time trade-off**:
a precomputed map turns each fold into an O(1) lookup.

---

## 3. Weighted Damerau–Levenshtein — Dynamic Programming (Unit IV)

The core DAA contribution. `dp[i][j]` = minimum cost to transform `a[0..i)` into
`b[0..j)`, filled bottom-up:

```
dp[i][j] = min(
    dp[i-1][j]   + 1,                      // deletion
    dp[i][j-1]   + 1,                      // insertion
    dp[i-1][j-1] + cost(aᵢ, bⱼ),           // substitution (weighted, see below)
    dp[i-2][j-2] + 1   if aᵢ = bⱼ₋₁ ∧ aᵢ₋₁ = bⱼ   // transposition (Damerau)
)
```

The substitution cost is **not** a flat 1 — a homoglyph or keyboard-neighbour swap is
charged far less, so a disguised brand lands close to the real one while an unrelated
name stays far:

| Substitution | Cost |
|--------------|------|
| identical | 0 |
| visual look-alike (`0↔o`, `1↔l`, `rn↔m`…) | 0.25 |
| QWERTY neighbour | 0.6 |
| arbitrary | 1.0 |

- **Time:** O(n·m) to fill the table; backtracking the alignment is O(n+m).
- **Space:** O(n·m) for the table (reducible to O(min(n,m)) with a rolling row — the
  distance-only path already uses two rows; the full table is kept here only to
  reconstruct the human-readable alignment for the explanation).
- **Per domain:** computed against every brand core ⇒ **O(B · n · m̂)**.

This is a textbook **overlapping-subproblems / optimal-substructure** DP, extended
with the Damerau transposition (optimal-string-alignment variant).

---

## 4. Horspool substring search — String Matching (Unit III)

`findPatterns()` checks whether any brand core occurs *inside* a longer label
(`hdfcbank` inside `hdfcbank-kyc`) using Boyer–Moore–Horspool.

- **Preprocessing:** build the bad-character shift table — **O(m + σ)** per pattern.
- **Search:** align right-to-left; on a mismatch, jump by the shift table.
  - Best case **O(n / m)** (large skips), average **O(n)**, worst **O(n·m)**.
- Over B brand patterns: **O(Σ (n + mᵢ))**.

The shift table is again a **space–time trade-off**: O(m+σ) extra memory buys
sub-linear average-case scanning.

---

## 5. Host parse + Public Suffix List

`registrableParts()` finds the longest matching public suffix to split the host into
sub-domains / registrable label / suffix.

- For each of L label positions, test membership of the joined candidate in a hash
  set (rules / wildcard / exception): **O(L)** candidates × O(L) to build each joined
  string = **O(L²)**, with L ≤ ~6 ⇒ effectively **O(1)**.
- Lookups are O(1) average against ~6,900 precomputed ICANN rules.

---

## 6. Why it is fast in practice

- All reference tables (confusables, PSL, brand list, shift tables) are **precomputed
  once**; per-query work is a handful of linear passes.
- B and m̂ are small constants, so the asymptotic **O(B·n·m̂)** behaves linearly in
  domain length.
- No network, no model inference — a verdict is a few thousand integer operations,
  validating the **< 5 ms** non-functional requirement with a >13× margin at p99.

---

## 7. Summary table

| Algorithm | Best | Average | Worst | Space | DAA technique |
|-----------|------|---------|-------|-------|---------------|
| Skeleton normalize | O(n) | O(n) | O(n) | O(n) | Transform-and-conquer |
| Damerau–Levenshtein (per brand) | O(n·m) | O(n·m) | O(n·m) | O(n·m) | Dynamic programming |
| Horspool (per brand) | O(n/m) | O(n) | O(n·m) | O(m+σ) | String matching |
| PSL parse | O(L) | O(L²) | O(L²) | O(1) | Hashing / longest-match |
| **`analyze()` total** | — | **O(B·n·m̄)** | O(B·n·m̂) | O(n·m̂) | composed pipeline |
