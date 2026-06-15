# Unmaskr — Research Gap & Positioning

This note grounds Unmaskr in the recent literature: it states the documented
research gap, lists verifiable 2022–2025 sources, and maps precisely what Unmaskr
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
defeat plain edit distance. Unmaskr targets exactly that intersection.

---

## 2. At a glance — paper → gap → how Unmaskr tackles it

| Paper (year · venue) | What it's about | Research gap it states | How Unmaskr tackles it |
|----------------------|-----------------|------------------------|---------------------------|
| **Munir et al. 2025** · IEEE Access | A web-protection model for detecting IDN homograph exploits | IDN homographs are "visually indistinguishable from legitimate sites"; detection still leans on confusable DBs + reference lists and needs improving | UTS #39 **skeleton normalisation** + **weighted Damerau–Levenshtein**, on-device & explainable; ships the full 1,624-entry confusables table |
| **Wang et al. 2023** · Computers & Security (*PhishHunter*) | Siamese neural network for camouflaged IDN phishing | "**Few studies in visual homograph detection**"; learning methods struggle with **data imbalance** and **generalization** | **Training-free** classic algorithms (no data imbalance); proven to generalize — **96.8 % leave-one-brand-out** recall on unseen brands |
| **Homoglyph Detection w/ ML + Hash 2022** · J. Sensor & Actuator Networks (MDPI) | ML + hash function for homoglyph attacks | Mapping-table methods "**cannot detect homographs whose characters are not in the mapping**, and the mapping must be updated manually" | Loads the **full Unicode UTS #39** table (1,624 folds) + **mixed-script detection**, not a hand-curated subset |
| **Tian et al. 2025** · arXiv (survey → *Computer Science Review*) | Survey of malicious-URL detection (blacklists → deep learning) | Blacklists lag; ML detectors are **opaque and data-hungry** | Real-time, **string-only, explainable** verdict — every point traces to a named signal; no blacklist, no ML core |
| **"Leveraging ML to proactively identify phishing campaigns" 2025** · J. Big Data (Springer) | Catching phishing campaigns *before* they strike | Blacklists **react too late** — blind to brand-new zero-day domains | Flags look-alikes at **navigation / first sight** from the domain string alone — no list to wait on |
| **WEIS 2025** / arXiv 2502.09549 | Newly-registered phishing domains at scale | **<20 %** of phish are on blacklists at hour-zero; many campaigns last **<2 h** | **On-device, instant** verdict — covers exactly the zero-day window blacklists miss |

The detailed sources and quotes follow in §3–§4; the honest scope (what Unmaskr does
*not* solve) is in §5.

---

## 3. Gap 1 — Homoglyph / IDN homograph detection is under-solved

- **S. Munir, A. Khan, F. Athar, A. Al-Rasheed (2025).** *A Web Protection Model
  Against Internationalized Domain Name Homograph Exploits.* **IEEE Access.**
  DOI: 10.1109/ACCESS.2025.3642468. <https://ieeexplore.ieee.org/document/11296804/>
  — A full 2025 IEEE paper devoted to detecting IDN homograph exploits, which it
  describes as producing URLs "visually indistinguishable from legitimate sites."
  Its own approach extracts `xn--` IDNs and compares against a reference list using a
  confusable database (Unisimchar) — i.e. the *same algorithmic family* as Unmaskr,
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

## 4. Gap 2 — Zero-day / newly-registered domains defeat blacklists

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

## 5. What Unmaskr tackles — and what it does not

| Documented gap | Unmaskr's response | Honest limitation |
|----------------|-----------------------|-------------------|
| Blacklist zero-day latency (hours–days) | On-device, **zero-network**, string-time verdict at the moment of navigation — independent of any list | Purely **lexical**: cannot catch compromised legitimate sites or free-hosting phishing (≈ 98 % of live OpenPhish volume — see `EVALUATION.md §6`) |
| ML opacity & data-hunger | **Training-free, fully explainable** — every risk point traces to a named signal; classic DP + string matching, nothing to train | Risk weights are currently **hand-tuned** (calibration against labelled data is the planned fix) |
| Homoglyphs break edit distance; mapping tables miss unmapped chars | **UTS #39 skeleton normalization + weighted Damerau–Levenshtein + Horspool** — folds whole script families to a Latin skeleton *before* comparison | Ships a **curated** confusables subset — the same "manual mapping" weakness the literature flags; mitigated by loading the **full UTS #39** table + **mixed-script detection** |

---

## 6. The contribution (DAA framing)

The recent literature attacks homoglyph phishing mainly with **heavy ML** — Siamese
neural networks (PhishHunter), GAN-based augmentation, image-similarity models. These
are accurate but opaque, data-hungry, and not designed for sub-millisecond on-device
use.

Unmaskr's contribution is to show that a **fused classical-algorithms pipeline** —
skeleton-normalized **weighted Damerau–Levenshtein** (Dynamic Programming, DAA Unit IV)
combined with **Horspool** substring matching (string matching, DAA Unit III) and
**UTS #39 transform-and-conquer normalization** — reaches competitive detection
(99.1 % recall on a six-family lookalike set; 0 false positives at the block threshold
over 50,000 real domains; ~0.15 ms/verdict; see `EVALUATION.md`) while remaining
**explainable, training-free, and private** — placing it precisely in the
under-served intersection of the three gaps above.
