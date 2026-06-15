/// <reference types="chrome" />
import { analyze, type Verdict } from '../algorithms/scoring'
import type { Brand } from '../data/brands'

// Three layers of protection on every page:
//  1. If the page itself is a dangerous lookalike  -> full-screen block screen.
//  2. If it is suspicious                          -> a top warning bar.
//  3. Any dangerous/suspicious LINK on the page    -> flagged inline before you click.

let TRUSTED: Brand[] = []
const cache = new Map<string, Verdict>()
// Re-inject guard state for the block screen (see blockScreen).
let blockGuard: MutationObserver | null = null
let blockDismissed = false

async function loadTrusted(): Promise<Brand[]> {
  try {
    const r = await chrome.storage.local.get('pg_visits')
    const v = (r['pg_visits'] ?? {}) as Record<string, { count: number; sld: string }>
    const out: Brand[] = []
    for (const [registrable, info] of Object.entries(v)) {
      if (info.count >= 3 && info.sld.length >= 4)
        out.push({ name: info.sld, core: info.sld, domain: registrable, category: 'Your site' })
    }
    return out
  } catch {
    return []
  }
}

function check(host: string): Verdict {
  let v = cache.get(host)
  if (!v) {
    v = analyze(host, TRUSTED)
    cache.set(host, v)
  }
  return v
}

// Escape every HTML metacharacter — used for ANY value interpolated into the
// shadow-DOM innerHTML below, so a hostile hostname/skeleton can never inject markup.
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c])
}

function glyphHtml(host: string): string {
  let s = ''
  for (const ch of host) {
    if (ch.charCodeAt(0) > 127) s += `<span class="pg-bad">${esc(ch)}</span>`
    else s += esc(ch)
  }
  return s
}

// ── 1. Full-screen block screen ──────────────────────────────────────────
function blockScreen(v: Verdict) {
  if (document.getElementById('phishguard-host')) return
  // Tell the background a block was actually shown, so "Threats blocked" counts it.
  chrome.runtime
    .sendMessage({ type: 'pg-block', host: v.host, brand: v.brand ? v.brand.name : 'a brand', score: v.score })
    .catch(() => {})
  const brand = esc(v.brand ? v.brand.name : 'a trusted site')
  const homo = v.homoglyphs.length
    ? `<div class="pg-note">Disguised with ${v.homoglyphs.length} look-alike character${v.homoglyphs.length > 1 ? 's' : ''}: real address is <b>${esc(v.skeleton)}</b></div>`
    : ''
  const host = document.createElement('div')
  host.id = 'phishguard-host'
  const sh = host.attachShadow({ mode: 'open' })
  sh.innerHTML = `
  <style>
    .wrap{position:fixed;inset:0;z-index:2147483647;background:radial-gradient(1200px 600px at 50% 0,#5b0f1a,#1a0509 70%);
      color:#fff;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;}
    .card{max-width:560px;width:90%;text-align:center;padding:8px;}
    .shield{font-size:64px;line-height:1;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5));}
    h1{font-size:30px;margin:18px 0 6px;font-weight:800;letter-spacing:-.5px;}
    .sub{font-size:15px;color:#ffd7dd;line-height:1.5;}
    .sub b{color:#fff;}
    .host{margin:18px auto;font-family:'JetBrains Mono',monospace;font-size:18px;background:rgba(0,0,0,.35);
      border:1px solid #f43f5e;border-radius:10px;padding:10px 14px;word-break:break-all;display:inline-block;}
    .pg-bad{background:rgba(244,63,94,.4);outline:1px solid #fff;border-radius:3px;padding:0 1px;}
    .pg-note{font-size:13px;color:#ffc7cf;margin-top:8px;}
    .risk{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#ffd7dd;margin-top:4px;}
    .dot{width:9px;height:9px;border-radius:50%;background:#f43f5e;box-shadow:0 0 10px #f43f5e;}
    .btns{display:flex;gap:12px;justify-content:center;margin-top:26px;flex-wrap:wrap;}
    button{font:inherit;font-size:15px;font-weight:700;border:0;border-radius:10px;padding:12px 22px;cursor:pointer;}
    .safe{background:#fff;color:#b91c3c;}
    .safe:hover{filter:brightness(.95);}
    .go{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.3);}
    .go:hover{background:rgba(255,255,255,.24);}
    .by{margin-top:22px;font-size:11px;color:#e79aa6;opacity:.8;}
  </style>
  <div class="wrap"><div class="card">
    <div class="shield">&#128737;&#65039;</div>
    <h1>Phishing site blocked</h1>
    <div class="sub">This page is pretending to be <b>${brand}</b>. Entering your password, OTP or payment details here could hand them to attackers.</div>
    <div class="host">${glyphHtml(v.host)}</div>
    ${homo}
    <div class="risk"><span class="dot"></span> Risk score ${v.score}/100</div>
    <div class="btns">
      <button class="safe" id="pg-back">&#8592; Back to safety</button>
      <button class="go" id="pg-go">Continue anyway (not recommended)</button>
    </div>
    <div class="by">Protected by PhishGuard</div>
  </div></div>`
  const reattach = () => {
    document.documentElement.appendChild(host)
    document.documentElement.style.overflow = 'hidden'
  }
  reattach()
  sh.getElementById('pg-back')?.addEventListener('click', () => {
    if (history.length > 1) history.back()
    else location.assign('about:blank')
  })
  sh.getElementById('pg-go')?.addEventListener('click', () => {
    blockDismissed = true
    blockGuard?.disconnect()
    blockGuard = null
    host.remove()
    document.documentElement.style.overflow = ''
  })
  // Re-inject guard: a hostile page can delete our overlay from its own DOM.
  // Put it back unless the user explicitly chose "Continue anyway" (or paused us).
  blockDismissed = false
  blockGuard?.disconnect()
  blockGuard = new MutationObserver(() => {
    if (!blockDismissed && !host.isConnected) reattach()
  })
  blockGuard.observe(document.documentElement, { childList: true })
}

// ── 2. Suspicious top bar ────────────────────────────────────────────────
function topBar(v: Verdict) {
  if (document.getElementById('phishguard-bar')) return
  const brand = esc(v.brand ? v.brand.name : 'a trusted site')
  const el = document.createElement('div')
  el.id = 'phishguard-bar'
  const sh = el.attachShadow({ mode: 'open' })
  sh.innerHTML = `
  <style>
    .bar{position:fixed;top:0;left:0;right:0;z-index:2147483646;background:linear-gradient(90deg,#7c5510,#b07d18);
      color:#fff;font-family:system-ui,sans-serif;display:flex;gap:12px;align-items:center;padding:10px 16px;
      box-shadow:0 3px 14px rgba(0,0,0,.35);font-size:13.5px;}
    b{color:#fff5dd;} button{margin-left:auto;font:inherit;font-size:12px;background:rgba(255,255,255,.18);
      color:#fff;border:0;border-radius:7px;padding:6px 12px;cursor:pointer;}
  </style>
  <div class="bar">&#9888;&#65039;&nbsp; <span>PhishGuard: this domain looks suspicious &mdash; possibly imitating <b>${brand}</b>. Be careful.</span>
  <button id="x">Dismiss</button></div>`
  document.documentElement.appendChild(el)
  sh.getElementById('x')?.addEventListener('click', () => el.remove())
}

// ── 3. In-page link scanning ─────────────────────────────────────────────
function ensureLinkStyle() {
  if (document.getElementById('pg-link-style')) return
  const st = document.createElement('style')
  st.id = 'pg-link-style'
  st.textContent = `
    a[data-pg="danger"]{outline:2px solid #f43f5e !important;outline-offset:1px;border-radius:3px;}
    a[data-pg="warn"]{outline:2px dashed #f59e0b !important;outline-offset:1px;border-radius:3px;}
    .pg-flag{display:inline-block;font-family:system-ui,sans-serif;font-size:10px;font-weight:700;
      vertical-align:super;margin-left:3px;padding:1px 5px;border-radius:6px;cursor:help;}
    .pg-flag.d{background:#f43f5e;color:#fff;} .pg-flag.w{background:#f59e0b;color:#1a1206;}
  `
  document.documentElement.appendChild(st)
}

function scanLinks() {
  ensureLinkStyle()
  const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href]')
  let flagged = 0
  anchors.forEach((a) => {
    if (a.dataset.pgSeen) return
    a.dataset.pgSeen = '1'
    let host: string
    try {
      const u = new URL(a.href, location.href)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      host = u.hostname
      if (host === location.hostname) return // same-site links
    } catch {
      return
    }
    const v = check(host)
    if (v.level === 'safe') return
    const danger = v.level === 'dangerous'
    a.dataset.pg = danger ? 'danger' : 'warn'
    const flag = document.createElement('span')
    flag.className = 'pg-flag ' + (danger ? 'd' : 'w')
    flag.textContent = danger ? '⚠ fake' : '⚠ risky'
    flag.title = `PhishGuard: ${host} ${danger ? 'looks like a fake of' : 'may imitate'} ${v.brand ? v.brand.name : 'a brand'} (risk ${v.score}/100)`
    a.insertAdjacentElement('afterend', flag)
    flagged++
  })
  return flagged
}

async function isEnabled(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get('pg_enabled')
    return (r['pg_enabled'] as boolean | undefined) ?? true
  } catch {
    return true
  }
}

// Remove everything PhishGuard injected (used when the user pauses protection).
function teardown() {
  blockDismissed = true
  blockGuard?.disconnect()
  blockGuard = null
  document.getElementById('phishguard-host')?.remove()
  document.getElementById('phishguard-bar')?.remove()
  document.documentElement.style.overflow = ''
  document.querySelectorAll('.pg-flag').forEach((e) => e.remove())
  document.querySelectorAll<HTMLAnchorElement>('a[data-pg]').forEach((a) => {
    a.removeAttribute('data-pg')
    delete a.dataset.pgSeen
  })
}

// ── Orchestrate ──────────────────────────────────────────────────────────
let observing = false

async function run() {
  if (window.top !== window.self) return
  if (!(await isEnabled())) return // master switch: paused
  TRUSTED = await loadTrusted()

  // Demo hook (#phishguard-test=<host>). The value is attacker-controllable, so
  // accept it ONLY if it is a plausible hostname — never HTML, spaces or scripts.
  // (Recommend stripping this hook entirely for the published store build.)
  const test = location.hash.match(/phishguard-test=([^&\s]+)/)
  let target = location.hostname
  if (test) {
    const cand = decodeURIComponent(test[1]).toLowerCase()
    // Accept it only if it has no HTML metacharacters or whitespace (IDN
    // hostnames still pass). Pure-ASCII pattern, so no high-codepoint byte ever
    // lands in the bundle. esc() also escapes at render time (defense in depth).
    if (/^[^\s<>"'&/\\]{1,253}$/.test(cand)) target = cand
  }
  const v = check(target)

  if (v.level === 'dangerous') blockScreen(v)
  else if (v.level === 'suspicious' || (test && v.level !== 'safe')) topBar(v)

  // Scan links now and again as the page grows (debounced). Attach the
  // observer only once, even if run() is re-invoked after re-enabling.
  scanLinks()
  if (!observing) {
    let t = 0
    const obs = new MutationObserver(() => {
      clearTimeout(t)
      t = window.setTimeout(scanLinks, 600)
    })
    obs.observe(document.documentElement, { childList: true, subtree: true })
    observing = true
  }
}

// React to the master switch flipping without needing a page reload.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['pg_enabled']) return
  if (changes['pg_enabled'].newValue === false) teardown()
  else run()
})

run()
