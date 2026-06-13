/// <reference types="chrome" />
import { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { analyze, type Verdict, type Level } from '../algorithms/scoring'
import type { EditOp } from '../algorithms/editDistance'
import type { Brand } from '../data/brands'
import { getTrustedBrands, trustedCount, getStats, getRecent, getEnabled, setEnabled, type Threat } from './storage'
import './popup.css'

const META: Record<Level, { label: string; color: string; icon: string }> = {
  safe: { label: 'Looks Safe', color: '#34d399', icon: '✓' },
  suspicious: { label: 'Suspicious', color: '#f59e0b', icon: '!' },
  dangerous: { label: 'Likely Phishing', color: '#f43f5e', icon: '⚠' },
}

function Popup() {
  const [tabHost, setTabHost] = useState<string | null>(null)
  const [trusted, setTrusted] = useState<Brand[]>([])
  const [learned, setLearned] = useState(0)
  const [stats, setStats] = useState({ scanned: 0, blocked: 0 })
  const [recent, setRecent] = useState<Threat[]>([])
  const [manual, setManual] = useState('')
  const [override, setOverride] = useState<string | null>(null)
  const [enabled, setEnabledState] = useState(true)

  useEffect(() => {
    ;(async () => {
      setEnabledState(await getEnabled())
      setTrusted(await getTrustedBrands())
      setLearned(await trustedCount())
      setStats(await getStats())
      setRecent(await getRecent())
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tab?.url) {
          const u = new URL(tab.url)
          if (u.protocol === 'http:' || u.protocol === 'https:') setTabHost(u.hostname)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [])

  const target = override ?? tabHost
  const verdict = useMemo<Verdict | null>(
    () => (target ? analyze(target, trusted) : null),
    [target, trusted],
  )

  const toggle = async () => {
    const next = !enabled
    setEnabledState(next)
    await setEnabled(next)
  }

  return (
    <div>
      <div className="hd">
        <div className="mark">🛡️</div>
        <div>
          <div className="name">Phish<span>Guard</span></div>
          <div className="sub">Lookalike-domain detector</div>
        </div>
        <button
          className={'switch' + (enabled ? ' on' : '')}
          role="switch"
          aria-checked={enabled}
          aria-label="Toggle protection"
          title={enabled ? 'Protection on — click to pause' : 'Protection paused — click to enable'}
          onClick={toggle}
        >
          <span className="knob" />
        </button>
      </div>

      {!enabled && (
        <div className="paused">⏸ Protection paused — sites are not being checked.</div>
      )}

      {/* Stats dashboard */}
      <div className="stats">
        <Stat n={stats.blocked} l="Threats blocked" c="#f43f5e" />
        <Stat n={stats.scanned} l="Sites scanned" c="#22d3ee" />
        <Stat n={learned} l="Sites learned" c="#34d399" />
      </div>

      <div className="section">
        <div className="lbl">{override ? 'Checked domain' : 'Current tab'}</div>
        {verdict ? (
          <VerdictBlock v={verdict} />
        ) : (
          <div className="muted" style={{ fontSize: 13, padding: '6px 0' }}>
            Open a website to see its safety verdict, or check any domain below.
          </div>
        )}
      </div>

      <div className="divider" />

      <div className="section">
        <div className="lbl">Check any domain</div>
        <form
          className="checkrow"
          onSubmit={(e) => {
            e.preventDefault()
            if (manual.trim()) setOverride(manual.trim())
          }}
        >
          <input value={manual} spellCheck={false} placeholder="e.g. pаypal.com" onChange={(e) => setManual(e.target.value)} />
          <button type="submit">Check</button>
        </form>
        {override && (
          <button className="link" onClick={() => { setOverride(null); setManual('') }}>
            ← back to current tab
          </button>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <div className="divider" />
          <div className="section">
            <div className="lbl">Recent threats blocked</div>
            <ul className="recent">
              {recent.map((t, i) => (
                <li key={i}>
                  <span className="rdot" />
                  <span className="rhost mono">{t.host}</span>
                  <span className="rbrand muted">fake {t.brand}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="foot">
        <span>Processed on-device · nothing uploaded</span>
        <span>Abijith · RVCE</span>
      </div>
    </div>
  )
}

function Stat({ n, l, c }: { n: number; l: string; c: string }) {
  return (
    <div className="stat">
      <div className="snum" style={{ color: c }}>{n}</div>
      <div className="slab">{l}</div>
    </div>
  )
}

function VerdictBlock({ v }: { v: Verdict }) {
  const m = META[v.level]
  return (
    <div>
      <div className="verdict" style={{ background: `${m.color}1f` }}>
        <div className="vbadge" style={{ background: m.color }}>{m.icon}</div>
        <div style={{ minWidth: 0 }}>
          <div className="vlevel" style={{ color: m.color }}>{m.label}</div>
          <div className="vhost mono muted">{v.host}</div>
        </div>
        <div className="vscore" style={{ color: m.color }}>{v.score}</div>
      </div>

      {v.brand && (
        <div className="brandline">
          {v.level === 'safe' ? 'Matches' : 'Looks like'} <b>{v.brand.name}</b>{' '}
          <span className="muted mono" style={{ fontSize: 11 }}>({v.brand.domain})</span>
        </div>
      )}

      {v.homoglyphs.length > 0 && (
        <div className="glyphs mono">
          {[...v.host].map((ch, i) => (
            <span key={i} className={ch.charCodeAt(0) > 127 ? 'bad' : ''}>{ch}</span>
          ))}
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
            real form: <span style={{ color: '#22d3ee' }}>{v.skeleton}</span>
          </div>
        </div>
      )}

      {v.brand && v.trace.length > 0 && v.level !== 'safe' && (
        <Alignment trace={v.trace} brand={v.brand.core} />
      )}

      <ul className="sigs">
        {v.signals.slice(0, 3).map((s, i) => (
          <li key={i} className="sig">
            <div className="t">{s.label}</div>
            <div className="d">{s.detail}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Alignment({ trace, brand }: { trace: EditOp[]; brand: string }) {
  const col = (op: EditOp) => {
    if (op.type === 'match') return '#34d399'
    if (op.type === 'sub') return op.kind === 'visual' ? '#f59e0b' : op.kind === 'keyboard' ? '#fb923c' : '#f43f5e'
    return '#8b90a8'
  }
  return (
    <div className="align">
      <div className="alabel muted">vs “{brand}”</div>
      <div className="arow mono">
        {trace.map((op, i) => (
          <div key={i} className="acol">
            <span style={{ color: col(op) }}>{op.a ?? '–'}</span>
            <span className="aline" style={{ background: col(op) }} />
            <span className="muted">{op.b ?? '–'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Popup />)
