// Talking to the Flask API, the hash router, and number formatting.
import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'

export async function api(path, { method = 'GET', body } = {}) {
  const response = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || `The server answered ${response.status}.`)
  return data
}

export const post = (path, body = {}) => api(path, { method: 'POST', body })

// Fetch `path` whenever it or `version` changes. Old data stays on screen while the new data loads.
export function useApi(path, version) {
  const [state, setState] = useState({ data: null, error: null, loading: true })
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true }))
    api(path)
      .then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error) => live && setState({ data: null, error: error.message, loading: false }))
    return () => {
      live = false
    }
  }, [path, version])
  return state
}

// "#/stocks/TCS" -> ["stocks", "TCS"]; "#/" or no hash -> ["home"], the landing page
export function useRoute() {
  const read = () => (window.location.hash || '#/').replace(/^#\/?/, '').split('/').filter(Boolean)
  const [route, setRoute] = useState(read)
  useEffect(() => {
    // Pages change through a view transition (styles.css, "page transitions") where the browser has one.
    const onChange = () => {
      const update = () => {
        flushSync(() => setRoute(read()))
        window.scrollTo(0, 0)
      }
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(update)
      else update()
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route.length ? route : ['home']
}

// ---------------------------------------------------------------- formatting
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)

export function rupees(v, digits = 0) {
  if (!isNum(v)) return '–'
  const text = Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
  return `${v < 0 && Number(text.replace(/,/g, '')) !== 0 ? '−' : ''}₹${text}`
}

export const price = (v) => rupees(v, v >= 1000 ? 0 : 2)

// 18.28 L, 2.15 Cr: the Stonks app's compact Indian numbers; compactRupees adds the ₹.
export function compactNumber(v, prefix = '') {
  if (!isNum(v)) return '–'
  const sign = v < 0 ? '−' : ''
  const m = Math.abs(v)
  if (m >= 1e7) return `${sign}${prefix}${(m / 1e7).toFixed(2)} Cr`
  if (m >= 1e5) return `${sign}${prefix}${(m / 1e5).toFixed(2)} L`
  if (m >= 1e3) return `${sign}${prefix}${(m / 1e3).toFixed(1)}K`
  return `${sign}${prefix}${m.toFixed(0)}`
}

export const compactRupees = (v) => compactNumber(v, '₹')

export const pct = (v, digits = 1) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : '–')

export function signedPct(v, digits = 1) {
  if (!isNum(v)) return '–'
  const text = Math.abs(v * 100).toFixed(digits)
  if (Number(text) === 0) return `${(0).toFixed(digits)}%`
  return `${v > 0 ? '+' : '−'}${text}%`
}

export function num(v, digits = 1) {
  if (!isNum(v)) return '–'
  const text = v.toFixed(digits)
  return Number(text) === 0 ? (0).toFixed(digits) : text.replace('-', '−')
}

export const tone = (v) => (!isNum(v) || Math.abs(v) < 5e-4 ? '' : v > 0 ? 'gain' : 'loss')

// The headline comparison in /api/backtest: the model's picks against holding the NIFTY 50.
export function race(b) {
  const find = (list, name) => list?.find((r) => r.name === name)
  const picks = find(b?.results, 'Model picks')
  const nifty = find(b?.results, 'NIFTY 50')
  if (!picks || !nifty) return null
  return { picks, nifty, before: find(b.before?.results, 'Model picks'), ahead: picks.total_return > nifty.total_return,
    from: b.period.from.slice(0, 4), to: b.period.to.slice(0, 4), capital: b.capital ?? 1e6 }
}

// What the starting capital became (₹15.24 L), and the starting capital itself in words (₹10 lakh).
export const grown = (r, capital = 1e6) => compactRupees(capital * (1 + r.total_return))
export const lakhs = (v) => `₹${num(v / 1e5, v % 1e5 ? 2 : 0)} lakh`

// The backtest's curves start at 100; this puts them on an account of `capital` rupees.
export const onCapital = (values, capital = 1e6) => values?.map((v) => (v == null ? v : (v * capital) / 100))

export const monthYear = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })

export function longDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(`${iso}T00:00:00`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

export const RULE_TEXT = {
  momentum: 'Momentum',
  breakout: 'Breakout',
  pullback: 'Pullback',
}

// Each rule keeps one system colour, on its chips and its backtest line.
export const RULE_TINT = { momentum: 'blue', breakout: 'purple', pullback: 'pink' }

export const OUTCOME_TEXT = {
  target: 'Hit target',
  stop: 'Hit stop',
  time: 'Sold at time limit',
  open: 'Still open',
  running: 'Still running',
  manual: 'Sold by you',
  pending: 'Waiting',
}
