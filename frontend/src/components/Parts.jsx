// Pieces specific to Stonks Lite, built from the kit: the price ladder, the trend score, rule chips,
// the paper order ticket and the replay clock.
import { useState } from 'react'
import { Icon } from './Icons.jsx'
import { Chip } from './Kit.jsx'
import { RULE_TEXT, RULE_TINT, compactRupees, grown, lakhs, longDate, num, post, price, race, signedPct, tone } from '../lib.js'

// How a trade is found, chosen, closed and sized, from the settings the backtest ran with (/api/backtest `levers`).
export function howItWorks(levers, minEv = 0.005) {
  const groups = {}
  for (const [rule, exit] of Object.entries(levers?.rule_exits || {})) (groups[exit] ||= { exit, rules: [] }).rules.push(RULE_TEXT[rule] || rule)
  const exits = Object.values(groups).map(({ exit: [target, stop, days], rules }) =>
    `${rules.join(' and ')}: ${target == null ? 'no target' : `a ${target}× ATR target`}, a ${stop}× ATR stop, up to ${days} days.`).join(' ')
  const sizing = { half: 'While the NIFTY 50 is under its 200-day average, new buys are half size.',
    skip: 'While the NIFTY 50 is under its 200-day average, nothing new is bought.' }[levers?.regime]
  return [
    ['Rules propose', 'At every close, the momentum, breakout and pullback rules flag stocks worth a look.'],
    ['The model chooses', `Only ideas it expects to make ${signedPct(minEv)} or more after costs are bought, best first, ten at a time.`],
    ['Winners run, losers stop', exits || 'Every trade has a stop, a target and a time limit.'],
    ['Smaller in falling markets', sizing || 'Every buy is the same size, whatever the market does.'],
  ]
}

// A link to the Backtest page with the headline comparison: what ₹10 lakh became in the model's picks and in the NIFTY 50.
export function ResultsLink({ backtest }) {
  const r = race(backtest)
  if (!r) return null
  return (
    <a className="card results-link" href="#/backtest">
      <span className="kicker">Test years {r.from}–{r.to} · from {lakhs(r.capital)}</span>
      <span className="results-line">
        <b className="lead">{grown(r.picks, r.capital)}</b><span>model picks, after charges</span>
        <b>{grown(r.nifty, r.capital)}</b><span>NIFTY 50</span>
      </span>
      <span className="results-cta">{r.ahead ? 'How we beat the index' : 'How it compares'}<Icon name="chevronRight" size={13} /></span>
    </a>
  )
}

// A quiet pointer to the Mac and Android apps, placed where Lite runs out. `from` names the spot, and is kept with
// a waitlist sign-up so we can see which spots send people.
export function AppHint({ from, children }) {
  return (
    <a className="app-hint" href={`#/app/${from}`}>
      <Icon name="laptop" size={14} className="tint-green" />
      <span>{children}</span>
      <b>Get the app<Icon name="chevronRight" size={12} /></b>
    </a>
  )
}

export const SCORE_PARTS = [
  { key: 'trend', label: 'Trend', weight: 0.3, help: 'Price against its 200-day average' },
  { key: 'momentum', label: 'Momentum', weight: 0.25, help: '12-month return, ranked among the 50 stocks' },
  { key: 'relative_strength', label: 'Relative strength', weight: 0.2, help: '6-month return against the other stocks and the NIFTY' },
  { key: 'quality', label: 'Near its high', weight: 0.15, help: 'How close the price is to its 52-week high' },
  { key: 'participation', label: 'Volume', weight: 0.1, help: 'Recent trading volume against the last six months' },
]

// The price ladder: where the stop and the target sit around today's price. An idea with no target
// (targetPct null) rides until its stop or its time limit, so the gain side is drawn open-ended.
export function Ladder({ close, stopPct, targetPct, holdDays }) {
  const open = !Number.isFinite(targetPct)
  const at = open ? 30 : (stopPct / (stopPct + targetPct)) * 100
  const stop = close * (1 - stopPct)
  const target = close * (1 + targetPct)
  const limit = holdDays ? `sells after ${holdDays} days` : 'sells at its time limit'
  return (
    <div className="ladder" role="img"
      aria-label={`Stop ${price(stop)}, now ${price(close)}, ${open ? `no target, ${limit}` : `target ${price(target)}`}`}>
      <div className="ladder-now" style={{ left: `${at}%` }}><span className="stat-label">Now</span> <b>{price(close)}</b></div>
      <div className="ladder-track">
        <span className="ladder-loss" style={{ width: `${at}%` }} />
        <span className={`ladder-gain ${open ? 'open' : ''}`} style={{ left: `${at}%`, width: `${100 - at}%` }} />
        <span className="ladder-tick" style={{ left: `${at}%` }} />
      </div>
      <div className="ladder-ends">
        <span><span className="stat-label">Stop</span><b>{price(stop)}</b><small className="loss">{signedPct(-stopPct)}</small></span>
        {open
          ? <span className="right"><span className="stat-label">Target</span><b>No target</b><small>{limit}</small></span>
          : <span className="right"><span className="stat-label">Target</span><b>{price(target)}</b><small className="gain">{signedPct(targetPct)}</small></span>}
      </div>
    </div>
  )
}

// The 0-10 trend score as a stacked bar: how much each part contributes.
export function ScoreMeter({ score, parts, band }) {
  const title = SCORE_PARTS.map((p) => `${p.label}: ${num((parts?.[p.key] ?? 0) * p.weight * 10)}`).join('\n')
  return (
    <span className="score-meter" title={title}>
      <span className={`score-number ${BAND_TONE[band] || ''}`}>{num(score)}</span>
      <span className="score-track" aria-hidden="true">
        {SCORE_PARTS.map((p, i) => (
          <span key={p.key} className={`score-seg s${i}`} style={{ width: `${(parts?.[p.key] ?? 0) * p.weight * 100}%` }} />
        ))}
      </span>
    </span>
  )
}

const BAND_TONE = { bullish: 'gain', bearish: 'loss' }
const BAND_CHIP = { bullish: ['green', 'Bullish'], neutral: ['gray', 'Neutral'], bearish: ['red', 'Bearish'] }

export function Band({ band }) {
  const [tint, text] = BAND_CHIP[band] || ['gray', 'No score']
  return <Chip tint={tint}>{text}</Chip>
}

export function RuleTags({ rules }) {
  return (
    <span className="chips">
      {rules.map((r) => <Chip key={r} tint={RULE_TINT[r] || 'gray'}>{RULE_TEXT[r] || r}</Chip>)}
    </span>
  )
}

export const PickChip = () => <Chip tint="yellow" icon="star">Model pick</Chip>

// Shares box and button that place a paper buy for the next open.
export function OrderForm({ symbol, suggested, close, onDone }) {
  const [qty, setQty] = useState(suggested || 1)
  const [busy, setBusy] = useState(false)
  const submit = async (event) => {
    event.preventDefault()
    setBusy(true)
    try {
      await post('/portfolio/orders', { symbol, qty: Number(qty) })
      onDone(`Paper order placed: buy ${qty} ${symbol} at the next open.`, 'ok')
    } catch (error) {
      onDone(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="order-form" onSubmit={submit}>
      <label className="field">
        <span className="stat-label">Shares</span>
        <input type="number" min="1" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
      </label>
      {close > 0 && <span className="notional">Notional about {compactRupees(qty * close)}</span>}
      <button type="submit" className="button buy" disabled={busy}>
        <Icon name="send" size={14} />
        {busy ? 'Placing…' : 'Buy on paper'}
      </button>
    </form>
  )
}

// The market at the clock's date: the replay state, the NIFTY and its trend.
export function MarketStrip({ status }) {
  if (!status) return <div className="market-strip" />
  const atLatest = status.as_of === status.latest
  const nifty = status.nifty
  return (
    <div className="market-strip">
      <span className={`capsule state ${atLatest ? '' : 'replaying'}`}>
        <i className="state-dot" />
        {atLatest ? 'Latest close' : 'Replaying'}
      </span>
      <span className="capsule">
        <span className="muted">NIFTY 50</span>
        <b>{nifty.close.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b>
        <b className={tone(nifty.change)}>{signedPct(nifty.change, 2)}</b>
      </span>
      <Chip tint={nifty.above_sma200 ? 'green' : 'red'}>{nifty.above_sma200 ? 'Above' : 'Below'} its 200-day average</Chip>
    </div>
  )
}

const STEPS = [
  { body: { step: -1 }, label: 'Back a day', icon: 'chevronLeft', back: true },
  { body: { step: 1 }, label: 'Next day', icon: 'chevronRight' },
  { body: { step: 5 }, label: 'Next week', text: '1W' },
  { body: { step: 21 }, label: 'Next month', text: '1M' },
  { body: { latest: true }, label: 'Latest day', icon: 'toEnd', text: 'Latest' },
]

// The replay clock: which evening the whole app is looking at.
export function ClockControl({ status, onMoved }) {
  const [busy, setBusy] = useState(false)
  if (!status) return null
  const atLatest = status.as_of === status.latest
  const move = async (body) => {
    setBusy(true)
    try {
      const result = await post('/clock', body)
      onMoved(result.reset ? 'You went back in time, so the paper account was reset.' : null)
    } catch (error) {
      onMoved(error.message, 'error')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="clock" role="group" aria-label="Replay clock">
      <label className="clock-date">
        <Icon name="clock" size={14} />
        <span className="sr-only">Evening shown</span>
        <input type="date" value={status.as_of} min={status.first} max={status.latest} disabled={busy}
          onChange={(e) => e.target.value && move({ date: e.target.value })} />
        <span className="clock-weekday">{longDate(status.as_of).split(',')[0]}</span>
      </label>
      {STEPS.map((s) => (
        <button key={s.label} type="button" aria-label={s.label} title={s.label} onClick={() => move(s.body)}
          disabled={busy || (s.back ? status.as_of <= status.first : atLatest)}>
          {s.icon && s.text && <span className="clock-text clock-latest">{s.text}</span>}
          {s.icon ? <Icon name={s.icon} size={14} /> : <span className="clock-text">+{s.text}</span>}
        </button>
      ))}
    </div>
  )
}
