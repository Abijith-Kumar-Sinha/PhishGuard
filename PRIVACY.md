# Unmaskr — Privacy Policy

_Last updated: 2026-06-15_

**Short version: Unmaskr does everything on your device and uploads nothing.
There are no servers, no accounts, no tracking, and no third parties. Your browsing
never leaves your browser.**

Unmaskr is a Chrome extension that warns you when a website is a look-alike of a
trusted brand (including invisible Unicode "homoglyph" disguises). To do that it has
to look at the address of the page you are on. This policy explains exactly what it
looks at, what it stores, and what it does **not** do.

---

## What Unmaskr accesses, and why

- **The address (hostname) of pages you visit.** Unmaskr reads the domain of the
  current page and of links on the page, compares it against a built-in list of
  protected brands using string algorithms, and shows a verdict (safe / suspicious /
  dangerous). This analysis happens **entirely in your browser, in real time.**
- It does **not** read your page content, form inputs, passwords, cookies, or files.
  It only analyses the domain **string**.

## What is stored, and where

- **Visit counts**, kept in `chrome.storage.local` **on your device only.** After you
  visit a site a few times it becomes one of "your sites," so Unmaskr can also flag
  look-alikes of the sites *you* use.
- **Local stats** (sites scanned, threats blocked, recent threats) and your settings
  (on/off, scoring mode) — also stored locally.
- This data **never leaves your device.** It is not synced, transmitted, or backed up
  by Unmaskr.

## What Unmaskr does NOT do

- ❌ No network requests, ever. Unmaskr makes **no** HTTP/HTTPS, WebSocket, or
  any other outbound connections. (You can verify this in the open-source code.)
- ❌ No analytics, telemetry, or tracking.
- ❌ No accounts, no sign-in, no cloud.
- ❌ No selling or sharing of data with anyone. There is no one to share it with —
  nothing is collected off your device.

## Permissions, explained

- **Access to the sites you visit** (`host_permissions`) — required so Unmaskr can
  read each page's address (and the addresses of links on it) to check for look-alikes
  in real time. This access is used *only* for on-device detection; no page data is
  transmitted. Unmaskr does **not** request the `tabs` permission.
- **`storage`** — to keep your local visit counts, stats, and settings on your device.

## Your control

- **Turn it off anytime** with the on/off switch in the popup.
- **Clear all stored data** by removing the extension (Chrome deletes its local
  storage), or by clearing the extension's site data in Chrome settings.

## Changes & contact

If this policy changes, the updated version will be published in this repository.
Questions or concerns: **Abijith Kumar Sinha** — abijithkumar2004@gmail.com ·
project repository: https://github.com/Abijith-Kumar-Sinha/Unmaskr

Unmaskr is open-source — you are welcome to read the code and confirm that every
claim above is true.
