/// <reference types="chrome" />
import { analyze, type Level } from '../algorithms/scoring'
import { getTrustedBrands, recordVisit, bumpScanned, pushThreat } from './storage'

const BADGE: Record<Level, { text: string; color: string }> = {
  safe: { text: '', color: '#34d399' },
  suspicious: { text: '!', color: '#f59e0b' },
  dangerous: { text: '✕', color: '#f43f5e' },
}

function hostFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    return u.hostname
  } catch {
    return null
  }
}

async function checkTab(tabId: number, url: string | undefined, count: boolean) {
  if (!url) return
  const host = hostFromUrl(url)
  if (!host) {
    chrome.action.setBadgeText({ tabId, text: '' }).catch(() => {})
    return
  }

  const trusted = await getTrustedBrands()
  const v = analyze(host, trusted)

  const b = BADGE[v.level]
  chrome.action.setBadgeText({ tabId, text: b.text }).catch(() => {})
  chrome.action.setBadgeBackgroundColor({ tabId, color: b.color }).catch(() => {})

  if (count) {
    await bumpScanned(v.level === 'dangerous')
    if (v.level === 'dangerous') {
      await pushThreat({
        host: v.host,
        brand: v.brand ? v.brand.name : 'a brand',
        score: v.score,
        ts: Date.now(),
      })
    }
    if (v.level === 'safe') {
      const registrable = v.sld + (v.tld ? '.' + v.tld : '')
      await recordVisit(registrable, v.sld)
    }
  }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.status === 'complete') checkTab(tabId, tab.url, true)
  else if (info.url) checkTab(tabId, info.url, false)
})

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId)
    checkTab(tabId, tab.url, false)
  } catch {
    /* tab gone */
  }
})

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.setBadgeTextColor?.({ color: '#0a0b12' }).catch(() => {})
})
