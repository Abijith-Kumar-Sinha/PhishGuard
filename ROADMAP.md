# Unmaskr — Roadmap

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
| Defense Guide PDF | Done — regenerated (Horspool, Damerau, real eval numbers, resolved limits) via `scripts/gen-defense-guide.py`; output in `DAA/Unmaskr_Defense_Guide.pdf` | ✅ done | 🟡 | Easy |

**Why first:** these finish the deliverable you're actually graded on, with near-zero
risk. Nothing here needs new code — just packaging.

---

## Phase 1 — Strengthen the evidence (paper-grade)

| Item | What | Status | Impact | Difficulty |
|------|------|:------:|:------:|:----------:|
| **Real attack dataset + eval** | dnstwist registered look-alikes vs Tranco. **Result: rules 96.4 % F1 / 97.4 % recall on 579 real look-alikes** (`EVALUATION.md §6.1`) — validated. | ✅ done | 🟢 | Medium |
| **Retrain LR on real positives** | Done — retrained on real + synthetic; held-out real-data recall **86 % → 98.3 %** at 0.1 % FPR, matching the rules (`scripts/ml/train-real.ts`). | ✅ done | 🟢 | Medium |
| New ML features | **n-gram improbability — done**, but honest ablation showed *no* lookalike-recall lift (lookalikes mimic real words); kept as a complementary/DGA signal. Brand-popularity weighting still open. | 🟡 partial | 🟡 | Medium |
| By-brand split | Done — leave-one-brand-out CV: **96.8 % macro recall on unseen brands** at 0.1 % FPR (`scripts/ml/bybrand.ts`). Proves transferable, not memorized. | ✅ done | 🟡 | Easy |
| Bigger, weighted brand list | Grow beyond the ~30 India-focused brands; add popularity weights | ⬜ todo | 🟡 | Easy–Med |

**Why:** the synthetic-positives gap is now *closed for the rule engine* (validated on
real data) and *quantified for the LR* (it overfit). Retraining the LR on the real
positives is the immediate, high-value next step toward paper-grade numbers.

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

## Security & Chrome Web Store readiness

Findings from the self-audit (treating the extension as the attack target):

| Item | Status |
|------|--------|
| **DOM-injection / XSS** via `#unmaskr-test=` hook + unescaped shadow-DOM `innerHTML` | ✅ fixed — all dynamic values HTML-escaped; hook value validated as a hostname |
| **Message-handler abuse** (`pg-block`) | ✅ hardened — payload type-checked, length-capped, score clamped |
| **No network / no exfiltration** (`fetch`/XHR/beacon/WebSocket) | ✅ verified — none in `src/`; 100 % on-device |
| Strip the `#unmaskr-test` demo hook for the published build | ✅ done — gated behind `__PG_DEMO__`; `npm run build:ext:store` dead-code-eliminates it (dev build keeps it for the demo) |
| Privacy policy — discloses local visit-count learning, no upload | ✅ done (`PRIVACY.md`) |
| Permission justification — `<all_urls>` (needed to scan every page) | ✅ done — documented in `STORE_LISTING.md`; **dropped `tabs`** (tab URLs are already covered by host permissions) |
| Store assets — icon, screenshots (have them), description | 🔄 description + permission copy done (`STORE_LISTING.md`); screenshots still need cropping to 1280×800 |
| Open-source license (MIT) | ✅ done — `LICENSE` + `package.json` |
| **Overlay-removal resilience** — re-inject guard re-adds the block screen if a hostile page deletes it; badge is background-drawn (page-proof) | ✅ mitigated (re-inject guard added) |
| Badge now turns red on every block shown (incl. demo) — pair with "pin me" | ✅ done |

---

## Recommended critical path

The smallest sequence that maximises grade **and** keeps the paper door open:

1. **Phase 0** — merge + screenshots + PDF (finish the submission). ~1.5 hr.
2. **Phase 1: real dataset + by-brand split** — make the evaluation airtight. ~1 day.
3. **Phase 1: n-gram + brand-popularity features** — push the engine past its ceiling. ~½ day.
4. *Then branch:* portfolio path → **Web Store** + options page; or research path → **IEEE paper** + Tier-2 visual.

Everything else is optional polish that can follow.
