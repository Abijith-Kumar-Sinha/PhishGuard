/// <reference types="chrome" />
import type { Brand } from '../data/brands'

// Learns the domains you visit repeatedly and turns them into extra "brands"
// to protect, so lookalikes of YOUR sites are flagged too. Everything is kept
// in chrome.storage.local on this device only - nothing leaves the browser.

const KEY = 'pg_visits'
export const TRUST_THRESHOLD = 3
const MAX_TRACKED = 300

interface Visit {
  count: number
  sld: string
}
type Visits = Record<string, Visit>

export async function getVisits(): Promise<Visits> {
  try {
    const r = await chrome.storage.local.get(KEY)
    return (r[KEY] as Visits) ?? {}
  } catch {
    return {}
  }
}

export async function recordVisit(registrable: string, sld: string): Promise<void> {
  if (!registrable || !sld || sld.length < 4) return
  const v = await getVisits()
  const cur = v[registrable] ?? { count: 0, sld }
  cur.count = Math.min(cur.count + 1, 999)
  cur.sld = sld
  v[registrable] = cur

  const keys = Object.keys(v)
  if (keys.length > MAX_TRACKED) {
    keys.sort((a, b) => v[a].count - v[b].count)
    for (const k of keys.slice(0, keys.length - MAX_TRACKED)) delete v[k]
  }
  try {
    await chrome.storage.local.set({ [KEY]: v })
  } catch {
    /* ignore */
  }
}

/** Visited-enough domains, as extra brands to screen lookalikes against. */
export async function getTrustedBrands(): Promise<Brand[]> {
  const v = await getVisits()
  const out: Brand[] = []
  for (const [registrable, info] of Object.entries(v)) {
    if (info.count < TRUST_THRESHOLD || info.sld.length < 4) continue
    out.push({
      name: info.sld,
      core: info.sld,
      domain: registrable,
      category: 'Your site',
    })
  }
  return out
}

export async function trustedCount(): Promise<number> {
  const v = await getVisits()
  return Object.values(v).filter((x) => x.count >= TRUST_THRESHOLD).length
}

// ── Protection stats + recent threats (for the popup dashboard) ──────────
const STATS = 'pg_stats'
const RECENT = 'pg_recent'

export interface Stats { scanned: number; blocked: number }
export interface Threat { host: string; brand: string; score: number; ts: number }

export async function getStats(): Promise<Stats> {
  try {
    const r = await chrome.storage.local.get(STATS)
    return (r[STATS] as Stats) ?? { scanned: 0, blocked: 0 }
  } catch {
    return { scanned: 0, blocked: 0 }
  }
}

export async function bumpScanned(blocked: boolean): Promise<void> {
  const s = await getStats()
  s.scanned++
  if (blocked) s.blocked++
  try {
    await chrome.storage.local.set({ [STATS]: s })
  } catch {
    /* ignore */
  }
}

export async function getRecent(): Promise<Threat[]> {
  try {
    const r = await chrome.storage.local.get(RECENT)
    return (r[RECENT] as Threat[]) ?? []
  } catch {
    return []
  }
}

export async function pushThreat(t: Threat): Promise<void> {
  const list = await getRecent()
  // de-dup consecutive same host
  if (list[0]?.host === t.host) return
  list.unshift(t)
  try {
    await chrome.storage.local.set({ [RECENT]: list.slice(0, 8) })
  } catch {
    /* ignore */
  }
}

// ── Master on/off switch ─────────────────────────────────────────────────
// Lets the user pause all protection. On by default. Persisted in
// chrome.storage.local so background + content scripts and the popup agree.
export const ENABLED_KEY = 'pg_enabled'

export async function getEnabled(): Promise<boolean> {
  try {
    const r = await chrome.storage.local.get(ENABLED_KEY)
    return (r[ENABLED_KEY] as boolean | undefined) ?? true
  } catch {
    return true
  }
}

export async function setEnabled(on: boolean): Promise<void> {
  try {
    await chrome.storage.local.set({ [ENABLED_KEY]: on })
  } catch {
    /* ignore */
  }
}
