# PhishGuard — Research Gap & Positioning

This note grounds PhishGuard in the recent literature: it states the documented
research gap, lists verifiable 2022–2025 sources, and maps precisely what PhishGuard
tackles within that gap — including, honestly, what it does **not** solve.

> Citation note: for paywalled venues (IEEE, Elsevier, Springer) the gap statements
> below are drawn from the publicly visible abstract / publisher metadata, not the
> full text. Bibliographic details (authors, venue, year, DOI) were verified against
> IEEE Xplore, ACM Digital Library, arXiv, and publisher DOIs.

---

## 1. The gap, in one paragraph

Blacklists structurally lag zero-day domains by hours to days; ML-based phishing
detectors are opaque, data-hungry, and generalize poorly to novel attacks; and
homoglyph / visual-confusable detection specifically remains under-studied and
dependent on manually-maintained character-mapping tables that miss any character not
already in the map. **No lightweight, explainable, training-free method occupies the
intersection of all three** — fast enough to run on-device at navigation time,
transparent enough to justify each verdict, and robust to Unicode homoglyphs that
defeat plain edit distance. PhishGuard targets exactly that intersection.

---

## 2. Gap 1 — Homoglyph / IDN homograph detection is under-solved

- **S. Munir, A. Khan, F. Athar, A. Al-Rasheed (2025).** *A Web Protection Model
  Against Internationalized Domain Name Homograph Exploits.* **IEEE Access.**
  DOI: 10.1109/ACCESS.2025.3642468. <https://ieeexplore.ieee.org/document/11296804/>
  — A full 2025 IEEE paper devoted to detecting IDN homograph exploits, which it
  describes as producing URLs "visually indistinguishable from legitimate sites."
  Its own approach extracts `xn--` IDNs and compares against a reference list using a
  confusable database (Unisimchar) — i.e. the *same algorithmic family* as PhishGuard,
  confirming this is a live, current research direction (not a solved problem).

- **M. Wang, X. Zang, J. Cao, S. Li (2023).** *PhishHunter: Detecting camouflaged
  IDN-based phishing attacks via Siamese neural network.* **Computers & Security**,
  Vol. 138, 103668. DOI: 10.1016/j.cose.2023.103668.
  <https://dl.acm.org/doi/10.1016/j.cose.2023.103668>
  — A top-tier security venue stating there are **few studies in visual homograph
  detection**, and that learning-based approaches must contend with **data imbalance
  and limited generalization**.

- **Homoglyph Attack Detection Model Using Machine Learning and Hash Function (2022).**
  **Journal of Sensor and Actuator Networks**, 11(3):54, MDPI.
  <https://www.mdpi.com/2224-2708/11/3/54>
  — Source of the core limitation of mapping-based detection: methods **cannot detect
  homographs composed of characters not present in the mapping, and the mapping must
  be updated manually.**

---

## 3. Gap 2 — Zero-day / newly-registered domains defeat blacklists

- **Y. Tian, Y. Yu, J. Sun, Y. Wang (2025).** *From Past to Present: A Survey of
  Malicious URL Detection Techniques, Datasets and Code Repositories.*
  arXiv:2504.16449 (under review, *Computer Science Review*).
  <https://arxiv.org/abs/2504.16449>
  — 2025 survey spanning detection from traditional blacklisting to deep learning;
  establishes the current landscape and its open problems.

- **Leveraging machine learning to proactively identify phishing campaigns before they
  strike (2025).** **Journal of Big Data** (Springer).
  DOI: 10.1186/s40537-025-01174-x.
  <https://link.springer.com/article/10.1186/s40537-025-01174-x>
  — Premised explicitly on blacklists reacting too late; argues for catching domains
  *before* the campaign lands.

- **Registration, Detection, and Deregistration: Analyzing DNS Abuse for Phishing
  Attacks (2025).** arXiv:2502.09549. <https://arxiv.org/pdf/2502.09549>
  **& Examining Newly Registered Phishing Domains at Scale, WEIS 2025.**
  <https://discovery.ucl.ac.uk/10209951/1/CDA_Domains___WEIS_25.pdf>
  — Empirical measurements of the zero-day window: blacklists catch **< 20 % of phish
  at hour zero**; ~**60 %** of new phishing domains hold a valid SSL certificate within
  **2 hours**; a large share of campaigns last under **2 hours** — far faster than
  blacklist/crawler turnaround.

---

## 4. What PhishGuard tackles — and what it does not

| Documented gap | PhishGuard's response | Honest limitation |
|----------------|-----------------------|-------------------|
| Blacklist zero-day latency (hours–days) | On-device, **zero-network**, string-time verdict at the moment of navigation — independent of any list | Purely **lexical**: cannot catch compromised legitimate sites or free-hosting phishing (≈ 98 % of live OpenPhish volume — see `EVALUATION.md §6`) |
| ML opacity & data-hunger | **Training-free, fully explainable** — every risk point traces to a named signal; classic DP + string matching, nothing to train | Risk weights are currently **hand-tuned** (calibration against labelled data is the planned fix) |
| Homoglyphs break edit distance; mapping tables miss unmapped chars | **UTS #39 skeleton normalization + weighted Damerau–Levenshtein + Horspool** — folds whole script families to a Latin skeleton *before* comparison | Ships a **curated** confusables subset — the same "manual mapping" weakness the literature flags; mitigated by loading the **full UTS #39** table + **mixed-script detection** |

---

## 5. The contribution (DAA framing)

The recent literature attacks homoglyph phishing mainly with **heavy ML** — Siamese
neural networks (PhishHunter), GAN-based augmentation, image-similarity models. These
are accurate but opaque, data-hungry, and not designed for sub-millisecond on-device
use.

PhishGuard's contribution is to show that a **fused classical-algorithms pipeline** —
skeleton-normalized **weighted Damerau–Levenshtein** (Dynamic Programming, DAA Unit IV)
combined with **Horspool** substring matching (string matching, DAA Unit III) and
**UTS #39 transform-and-conquer normalization** — reaches competitive detection
(99.1 % recall on a six-family lookalike set; 0 false positives at the block threshold
over 50,000 real domains; ~0.15 ms/verdict; see `EVALUATION.md`) while remaining
**explainable, training-free, and private** — placing it precisely in the
under-served intersection of the three gaps above.
