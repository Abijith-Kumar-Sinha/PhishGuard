# PhishGuard — Tier-1 ML Hybrid (Logistic Regression)

An optional, **explainable, lightweight** machine-learning layer that sits on top
of the classic string engine. The engine is unchanged: it becomes a **feature
extractor**, and a learned linear model replaces the hand-tuned scoring weights.

> This lives on the `phase-c-ml` branch. `main` remains the pure rule-based DAA
> submission. The hybrid is additive — the rule engine still runs untouched.

---

## 1. Why

The rule engine combines its signals with **hand-picked weights** (`0.45`, `0.4`,
thresholds `30`/`65`). Those are intuition, not data. The hybrid lets a model
**learn** the weights from labelled examples — the "fit parameters to data instead
of guessing" idea. Crucially it stays:

- **Explainable** — logistic regression is *linear*, so every prediction
  decomposes into per-feature contributions (`wⱼ · standardized(xⱼ)`). No black box.
- **Lightweight** — the "model" is ~19 floats. Inference is one dot product:
  `p = sigmoid(b + Σ wⱼ·zⱼ)`. **No runtime dependency, no network, sub-millisecond.**
  Every non-functional guarantee from `main` survives.

---

## 2. Architecture

```
host ──▶ classic engine (skeleton · Damerau–Levenshtein · Horspool · PSL)
            │  extractFeatures()           src/algorithms/features.ts
            ▼
        19-feature vector ──▶ standardize ──▶ logistic regression ──▶ P(phishing)
                                  (z-score)        (19 floats)        src/algorithms/mlScore.ts
                                                                          │
                                            two learned thresholds ──▶ safe / suspicious / dangerous
```

**Features (20).** The 16 base signals the rule engine already computes
(nearest-brand similarity, homoglyph / mixed-script flags, skeleton-exact-brand,
brand-embedded, brand-in-subdomain, suspicious-TLD, lure count, label length,
digit ratio, hyphen count, official-domain …) **plus 3 interaction terms** that
give the linear model the conjunctions the rules encode:

- `simUnofficial = bestSim × (1 − official)` — *looks like a brand but isn't it*
- `embedLure = embedded × (lure present)` — combosquat
- `subUnofficial = subBrand × (1 − official)` — brand in a sub-domain of an attacker

Adding these was the difference between the LR *trailing* the rules and *matching*
them (§4) — a concrete demonstration that gains come from **richer features**, not
just re-weighting.

…and one **language-model feature**: `ngramImprob` — a character-bigram surprisal
score (`ngram.ts`, model learned from Tranco labels) that measures how *unlike a real
domain label* a string looks. **Honest ablation result: it does not change lookalike
recall (98.3 % with and without)** — because lookalikes deliberately mimic real words,
so they score as word-like. It is kept as a near-zero-cost *complementary* signal for
random / DGA-style domains (a different threat class) and as a classic-algorithms
component. A clean example of measuring a feature and reporting that it didn't help the
target metric, rather than assuming it would.

---

## 3. Training (`scripts/ml/train.ts`, zero dependencies)

| Choice | Value |
|--------|-------|
| Positives | 333 generated lookalikes (6 attack families, deterministic) |
| Negatives | 50,000 Tranco legitimate domains |
| Split | stratified **70 / 30** train/test (seeded) |
| Standardization | mean/std fit on **TRAIN only** (no leakage), applied to test |
| Model | logistic regression, batch gradient descent, **class-weighted** (≈150:1 imbalance) + L2 |
| Thresholds | `warn` = best-F1 on train; `block` = high-precision point, enforced ≥ `warn` |

Reproduce: `npx tsx scripts/eval/prep.ts 50000 && npx tsx scripts/ml/train.ts`
→ writes `src/data/modelWeights.ts`.

---

## 4. Results — LR vs the rule engine (held-out TEST split)

| on held-out test | Recall | Precision | FPR | F1 | Accuracy |
|------------------|-------:|----------:|----:|---:|---------:|
| **LR (warn)** | 98.0 % | **93.3 %** | 0.0 % | **95.6 %** | 99.9 % |
| **LR (block)** | 72.0 % | 96.0 % | 0.0 % | 82.3 % | 99.8 % |
| Rule engine (suspicious+) | 100.0 % | 92.6 % | 0.1 % | 96.2 % | 99.9 % |
| Rule engine (dangerous) | 25.0 % | 100.0 % | 0.0 % | 40.0 % | 99.5 % |

**Honest reading:**

- The LR **matches the rule engine's warn tier** (95.6 vs 96.2 F1) at *higher*
  precision (93.3 % vs 92.6 %).
- The LR gives a **much better block tier**: 72 % recall at 96 % precision, versus
  the rules' 25 % recall — i.e. it can confidently block far more attacks while
  almost never blocking a legitimate site.
- This validates the rule engine (a simple linear model can't beat well-crafted
  rules by much) **and** shows where ML adds value: a better-calibrated, smoothly
  tunable decision boundary, especially for the high-precision blocking action.

**Learned weights** (standardized; larger = stronger pull toward phishing):
`simUnofficial +0.95`, `bestSim +0.85`, `skelExact +0.69`, `homoglyph +0.64`,
`embedLure +0.60`, `mixedScript +0.55`, `subBrand/subUnofficial +0.55`. The model
independently learned that a brand resemblance only matters when the domain is **not**
the official one — the same logic the rules hand-code.

---

## 5. Full evaluation (5-fold cross-validation)

Beyond the single split in §4, the model was evaluated with **stratified 5-fold
cross-validation** using out-of-fold (OOF) predictions — 333 positives + 25,000
negatives. Reproduce: `npx tsx scripts/ml/evaluate.ts`.

| Metric | Value |
|--------|-------|
| **ROC-AUC** | **0.9998** |
| **PR-AUC** (average precision) | **0.976** |
| Recall (τ = 0.92) | 99.7 % |
| Precision | 94.9 % |
| FPR | 0.1 % |
| **F1** | **97.2 %** |
| F1 stability across folds | **97.2 % ± 0.5 pts** |
| Confusion (OOF) | TP 332 · FP 18 · FN 1 · TN 24,982 |

- **Per-family recall (OOF):** homoglyph 100 %, typo 99.1 %, digit-swap 100 %,
  combosquat 100 %, tld-swap 100 %, subdomain 100 %.
- **Not overfitting:** resubstitution F1 97.4 % vs out-of-fold 97.2 % — a **0.2-pt
  gap**, so the model is not memorising the training set. The ±0.5-pt fold variance
  confirms the single-split result wasn't luck.
- **Ablation:** removing the 3 interaction features drops F1 from 97.2 % to 95.3 %
  (ROC-AUC 0.9998 → 0.9996) — they contribute ~1.9 F1 points.
- **Inference latency:** **0.16 ms/verdict** (feature extraction + dot product) — the
  lightweight guarantee holds.
- **External validity (honest limit):** on the live OpenPhish snapshot only ~2 hosts
  even loosely resemble a *protected* brand, and those aren't true brand
  impersonations — so a real-positive external test is currently inconclusive (0/2).
  This is the strongest argument for the §6 next step: real labelled lookalikes.

---

## 6. Honest caveats

- **Synthetic positives — found *and fixed*.** Training only on generated positives
  made the LR overfit: on **579 real registered look-alikes** (dnstwist) its recall was
  **86 %** vs the rule engine's 97 %. **Retraining on real + synthetic positives**
  (`scripts/ml/train-real.ts`) lifted held-out real-data recall **86 % → 98.3 %** at
  0.1 % FPR — now on par with the rules. The bundled `modelWeights.ts` is trained on
  real + synthetic data. (More harvested brands would strengthen it further.)
- **Linear ceiling.** A linear model can only represent the interactions we hand it as
  features. Non-linear models (gradient-boosted trees, or the Tier-2 visual/Siamese
  network) could push further — at the cost of size and the explainability/offline
  guarantees this tier deliberately keeps.

---

## 7. Status & next steps

- ✅ Feature extractor (`features.ts`), trainer (`scripts/ml/train.ts`), bundled model
  (`modelWeights.ts`), explainable inference (`mlScore.ts`), rule-vs-LR comparison.
- ⏭ Real labelled positives + a by-brand generalization split.
- ⏭ New features: character n-gram language-model improbability of the SLD,
  brand-popularity weighting.
- ⏭ Tier 2: visual/Siamese model as an optional heavy mode.
- ⏭ Wire an experimental "ML mode" toggle into the extension popup.
