# PhishGuard — Roadmap

Where the project can go next, with honest **impact** and **difficulty** for each
item. Ratings are relative to a solo student project.

**Impact:** 🟢 high · 🟡 medium · ⚪ low — value to the DAA grade, the portfolio,
a possible paper, or real users.
**Difficulty:** Easy (hours) · Medium (a day-ish) · Hard (days–weeks).

Current state (2026-06-14): rule engine 99.7 % recall / 92.5 % precision / 0 block-FPs;
Tier-1 ML hybrid trained + cross-validated (ROC-AUC 0.9998, F1 97.2 %); on/off switch +
live Rules/ML popup toggle. All merged to `main` and pushed.

Recently hardened (live-testing fixes): short brand cores now caught as hyphen tokens
(`sbi-rewards.online`); "Threats blocked" now counts each block screen actually shown;
learned sites' alternate TLDs no longer false-flagged (`github.community`, `github.io`).

---

## Phase 0 — Ship the submission (do first)

| Item | What | Status | Impact | Difficulty |
|------|------|:------:|:------:|:----------:|
| Merge `phase-c-ml` → `main` | Bring toggle + ML into the live repo | ✅ done | 🟡 | Easy |
| Report screenshots | Block screen ✅ · inline link flags ✅ · popup Rules/ML (in progress) | 🔄 2 / 4 | 🟢 | Easy |
| Defense Guide PDF | Regenerate so it says **Horspool** (code already swapped from Aho-Corasick) | ⬜ todo | 🟡 | Easy |

**Why first:** these finish the deliverable you're actually graded on, with near-zero
risk. Nothing here needs new code — just packaging.

---

## Phase 1 — Strengthen the evidence (paper-grade)

| Item | What | Impact | Difficulty | Effort |
|------|------|:------:|:----------:|--------|
| **Real attack dataset** | Replace synthetic positives: dnstwist permutations cross-checked against *actually-registered* domains, and/or a brand-filtered URLhaus/PhishTank sample | 🟢 | Medium | ½ day |
| New ML features | Character **n-gram improbability** of the SLD (real brands aren't random strings) + brand-popularity weighting — the lever to push *past* the rules | 🟢 | Medium | ½ day |
| By-brand split | Train on some brands' lookalikes, test on **unseen** brands — proves generalization, not memorization | 🟡 | Easy | 1 hr |
| Bigger, weighted brand list | Grow beyond the ~30 India-focused brands; add popularity weights | 🟡 | Easy–Med | 2 hr |

**Why:** the one honest gap in the current ML evaluation is that positives are
synthetic. Real positives + a by-brand split would make the numbers airtight — the
single biggest credibility upgrade, and the prerequisite for a paper.

---

## Phase 2 — Product completeness

| Item | What | Impact | Difficulty | Effort |
|------|------|:------:|:----------:|--------|
| Options / settings page | Sensitivity slider, manage/add brands, whitelist, view & clear learned sites | 🟡 | Medium | ½ day |
| ML drives live protection | Let the Rules/ML choice also drive the badge + block screen (not just the popup view) | 🟡 | Medium | 3 hr |
| Indic-script homoglyphs | Kannada / Devanagari look-alikes — regionally novel, fits the India focus | 🟡 | Medium | ½ day |

**Why:** turns a strong prototype into a complete, configurable product — good for the
demo and the portfolio, lower marginal value for the grade.

---

## Phase 3 — Advanced ML (the "wow")

| Item | What | Impact | Difficulty | Effort |
|------|------|:------:|:----------:|--------|
| **Tier-2 visual model** | Render domain ↔ brand as images, score visual similarity with a small CNN / Siamese net (PhishHunter-style) — catches font-dependent look-alikes skeletons miss | 🟢 | Hard | days |
| Probability calibration | Reliability curve + isotonic/Platt scaling so the % means what it says | ⚪ | Easy | 2 hr |

**Why:** Tier-2 is the headline differentiator and matches the SOTA literature, but it
breaks "lightweight" (model weights in MBs, a TF.js/ONNX runtime in the extension) and
is real engineering. Do it only after Phase 1, and keep it an *optional* heavy mode.

---

## Phase 4 — Dissemination

| Item | What | Impact | Difficulty | Effort |
|------|------|:------:|:----------:|--------|
| Chrome Web Store | Manifest/permissions polish, privacy policy, store assets, submit for review | 🟢 | Medium | 1 day + review |
| **IEEE-format paper** | "Homoglyph-aware weighted edit-distance for real-time lookalike detection" + the evaluation | 🟢 | Hard | weeks |
| Registrar-side screening | Concept/whitepaper: flag abusive registrations at creation time | ⚪ | Hard | — |

**Why:** real users (Web Store) and an academic credential (paper) are the highest-
ceiling outcomes — but both depend on Phase 1's real-data evaluation existing first.

---

## Recommended critical path

The smallest sequence that maximises grade **and** keeps the paper door open:

1. **Phase 0** — merge + screenshots + PDF (finish the submission). ~1.5 hr.
2. **Phase 1: real dataset + by-brand split** — make the evaluation airtight. ~1 day.
3. **Phase 1: n-gram + brand-popularity features** — push the engine past its ceiling. ~½ day.
4. *Then branch:* portfolio path → **Web Store** + options page; or research path → **IEEE paper** + Tier-2 visual.

Everything else is optional polish that can follow.
