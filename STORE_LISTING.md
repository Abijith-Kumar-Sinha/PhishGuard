# Unmaskr — Chrome Web Store listing

Copy-and-paste source for the Chrome Web Store submission, plus the reviewer-facing
justifications. Keep this in sync with `manifest.json` and `PRIVACY.md`.

---

## Product name

```
Unmaskr - Lookalike Domain Detector
```

## Summary (short description — 132 char max)

```
Real-time warning when a site mimics a trusted brand — including invisible Unicode homoglyph (look-alike character) disguises.
```

(121 characters.)

## Category

`Privacy & Security` · primary language: English.

---

## Detailed description

> Unmaskr warns you the moment you land on a web address that is *pretending* to be
> a brand you trust — `paypa1.com`, `icic1bank.com`, or `paypal.com` written with a
> Cyrillic "а" that looks identical but isn't.
>
> **The gap it closes.** Most phishing defences either rely on a blocklist of
> already-reported bad sites, or compare domains character-by-character — which is
> blind to homoglyphs (different Unicode characters that *look* the same). Fresh
> look-alike domains are registered faster than blocklists can catch them, and they
> are the ones used in the most damaging targeted attacks. Unmaskr tackles exactly
> this slice: it reads the domain string and judges, in real time, how close it is to
> a brand you trust.
>
> **How it works (and why you can trust it).**
> 1. It normalises the domain to a homoglyph-free "skeleton" (Unicode UTS #39).
> 2. It measures similarity to a list of protected brands with a weighted
>    edit-distance algorithm.
> 3. It searches for brand names hidden inside the domain.
> 4. It explains its verdict: which brand is being impersonated, the exact trick used,
>    and a 0–100 risk score.
>
> **What you see.** A coloured toolbar badge on every page, a full-screen block on
> clearly dangerous sites, a warning bar on suspicious ones, and inline flags on
> dangerous links *before* you click them. A popup dashboard shows the current
> verdict, a manual "check any domain" box, and your local protection stats.
>
> **Private by design.** Everything runs on your device. Unmaskr makes **no
> network requests** — no servers, no accounts, no tracking, no analytics. It reads
> only the *address* of pages and links, never their content, your passwords, or your
> files. Your browsing never leaves your browser. (It's open-source — read the code.)
>
> **Not a replacement for Chrome's Safe Browsing — a complement to it.** Safe Browsing
> is great at known-bad URLs; Unmaskr focuses on the look-alike domains that slip
> past blocklists because they're brand new. Run both.
>
> Open-source (MIT): https://github.com/Abijith-Kumar-Sinha/Unmaskr

---

## Single-purpose description (reviewer field)

```
Unmaskr has a single purpose: to detect and warn the user when the domain of the
page they are viewing (or a link on that page) is a look-alike imitation of a trusted
brand, including Unicode homoglyph disguises. All detection is local string analysis;
the extension performs no other function.
```

---

## Permission justifications

The extension declares the **minimum** set needed for real-time, on-device detection.
It does **not** request `tabs`, `scripting`, `webRequest`, `cookies`, `history`, or any
other permission. (The `tabs` permission was removed once we confirmed that reading a
tab's URL is already covered by the host permissions below — fewer permissions, same
behaviour.)

| Declared | Type | Justification |
|----------|------|---------------|
| `http://*/*`, `https://*/*` | `host_permissions` | Required to read the **address** of each page you visit and the links on it, so the domain can be checked for look-alikes in real time. The matching content script (`content.js`) only inspects the URL string and link hrefs — never page content, form inputs, or credentials. Same host scope lets the background worker read the active tab's URL to set the badge. |
| `storage` | API permission | Stores your local visit counts (to also protect look-alikes of *your* frequent sites), protection stats, and settings (on/off, scoring mode) in `chrome.storage.local`. Never synced or transmitted. |

**Content-script scope.** `content_scripts.matches` is `http://*/*`, `https://*/*`,
`file:///*`. The `file:///*` entry only enables the offline demo page; it can be
removed for a stricter listing if a reviewer objects.

**Why broad host access is unavoidable.** A phishing look-alike can be hosted on *any*
domain, so the check has to be able to run on any site. The extension cannot know in
advance which domains are malicious — that's the whole point — so it cannot enumerate a
narrow host list. Access is used solely for local detection; nothing is sent anywhere.

---

## Privacy practices (Web Store "Privacy" tab)

- **Single purpose:** as above.
- **Data collected:** None is transmitted off the device. Local-only storage of visit
  counts, stats, and settings. Disclose on the form: *we do not collect or transmit any
  user data.* (See `PRIVACY.md` for the full policy.)
- **Remote code:** None. All code ships in the package; no `eval`, no remotely hosted
  scripts.
- **Privacy policy URL:** link to the hosted `PRIVACY.md`
  (e.g. `https://github.com/Abijith-Kumar-Sinha/Unmaskr/blob/main/PRIVACY.md`).
- Tick the certifications: *does not sell/transfer data to third parties*, *not used for
  purposes unrelated to the single purpose*, *not used for creditworthiness/lending*.

---

## Store assets checklist

| Asset | Spec | Status |
|-------|------|--------|
| Icon | 128×128 PNG | ✅ `icons/icon128.png` |
| Screenshots | 1280×800 or 640×400, 1–5 | ⬜ have block screen + inline flags + popup; crop to spec |
| Small promo tile | 440×280 | ⬜ optional |
| Privacy policy URL | public link | ✅ `PRIVACY.md` (host on GitHub) |

---

## Pre-submission build

Build the publishable package with the demo hook stripped:

```
npm run build:ext:store
```

Then zip the `extension-dist/` folder for upload. Verify before zipping:
- `manifest.json` permissions are `["storage"]` + host permissions only.
- `content.js` contains no `unmaskr-test` string (the demo hook is dead-code-
  eliminated in the store build — grep it to confirm).
