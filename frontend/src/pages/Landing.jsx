// The front door: what Stonks Lite is for, the Mac and Android apps, and Pro pricing.
import { useEffect, useRef, useState } from 'react'
import { LineChart } from '../components/Charts.jsx'
import { Icon } from '../components/Icons.jsx'
import { compactRupees, grown, lakhs, num, onCapital, pct, race, signedPct, useApi } from '../lib.js'
import './Landing.css'

// Where "Get Stonks Pro" goes. There is no checkout yet: until this is set the button goes to the waitlist (#/app).
const PRO_SIGNUP_URL = ''
const img = (name) => `/landing/${name}`
const year = (iso) => iso?.slice(0, 4)
const longMonth = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

const LITE = ['50 large NSE stocks, daily bars since 2005', "Tonight's ideas with the model's chance", 'A replay clock and a ₹10 lakh paper account',
  'The full model report and backtest']
const PRO = ['Everything in Lite', 'Stonks for Mac and Stonks for Android', 'Every NSE stock, with live quotes and minute bars',
  'Swing v4: trend score with fundamentals, cap tiers and a paper autopilot', 'MARL agents, portfolio optimisers and an F&O paper desk',
  'News sentiment, and an AI analyst you can point at any part of the screen', 'The full research gate: CPCV, deflated Sharpe and a trial ledger']
const PLATFORMS = [
  { icon: 'globe', name: 'Stonks Lite', where: 'Web · Free', text: '50 stocks, daily bars, one model. Open it in any browser.' },
  { icon: 'laptop', name: 'Stonks for Mac', where: 'macOS · Pro', text: 'The full engine: every NSE stock, live quotes, agents and the F&O desk.' },
  { icon: 'phone', name: 'Stonks for Android', where: 'Android · Pro', text: 'Your watchlist, ideas and paper account on your phone.' },
]
const FAQ = [
  ['Does Stonks place real trades?', 'No. Lite and Pro trade paper money only, at real prices. Nothing ever reaches an exchange.'],
  ['Is this investment advice?', 'No. Stonks is a research and learning tool. Its model has a small edge, and every backtest is flattered by testing on today’s 50 large companies, the ones that survived. We show you that rather than hide it.'],
  ['What does Pro add?', 'The macOS and Android apps, every NSE stock with live quotes and minute bars, the agents, sentiment and F&O desk, and the stricter research checks the full app runs.'],
  ['Where does the data come from?', 'Lite uses daily prices for 50 large NSE companies and the NIFTY 50 from 2005, adjusted for splits and bonus issues. Pro adds live market data.'],
  ['Why should I trust the numbers?', 'The model never trains on the years it is tested on, its probabilities are calibrated, every backtest pays costs both ways, and every setting we tried is logged. The full report, caveats included, is one click away in Lite.'],
]
const SECTIONS = [
  ['beat', 'Results', 'trend'],
  ['built', "What it's for", 'binoculars'],
  ['record', 'The record', 'list'],
  ['apps', 'Apps', 'laptop'],
  ['pricing', 'Pricing', 'tag'],
  ['faq', 'Questions', 'help'],
]
const SPY = ['top', ...SECTIONS.map(([id]) => id)]
const narrow = () => matchMedia('(max-width: 767px)').matches

// Fade sections up as they scroll into view; `ready` re-runs it once the data-driven sections have rendered.
function useReveal(ref, ready) {
  useEffect(() => {
    const items = ref.current.querySelectorAll('.lp-reveal:not(.is-in)')
    if (!('IntersectionObserver' in window)) return items.forEach((el) => el.classList.add('is-in'))
    const seen = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('is-in')
        seen.unobserve(e.target)
      }
    }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
    items.forEach((el) => seen.observe(el))
    return () => seen.disconnect()
  }, [ref, ready])
}

const jump = (id) => (event) => {
  event.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// The sidebar is open or collapsed as the reader last left it; phones start collapsed. Escape collapses it.
function useSidebar() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem('lp-sidebar') === 'open' && !narrow()
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('lp-sidebar', open ? 'open' : 'closed')
    } catch {
      // storage blocked (private mode): the choice lasts this visit only
    }
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  return [open, setOpen]
}

// Which section is under the middle of the screen.
function useActiveSection() {
  const [active, setActive] = useState('top')
  useEffect(() => {
    const spy = new IntersectionObserver((entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -54% 0px' })
    SPY.forEach((id) => document.getElementById(id) && spy.observe(document.getElementById(id)))
    return () => spy.disconnect()
  }, [])
  return active
}

// A rail that opens into a panel, like the Stonks app's sidebar. Collapsed, it sits exactly where the app's
// rail does, so opening the app morphs one into the other (view-transition-name: sidebar).
function Sidebar({ open, setOpen }) {
  const active = useActiveSection()
  const go = (id) => (event) => {
    jump(id)(event)
    if (narrow()) setOpen(false)
  }
  return (
    <>
      <aside className={`lp-side ${open ? 'open' : ''}`} aria-label="Stonks Lite">
        <button type="button" className="lp-side-toggle" onClick={() => setOpen(!open)} aria-expanded={open}
          aria-label={open ? 'Collapse the sidebar' : 'Expand the sidebar'}>
          <Icon name="sidebar" size={17} />
        </button>
        <div className="lp-side-body">
          <a className="lp-side-brand" href="#/" onClick={go('top')}>
            <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true"><path d="M5 22l6.5-6.5 4.5 3.5L27 8.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="lp-side-label">Stonks <em>Lite</em></span>
          </a>
          <nav aria-label="Sections">
            {SECTIONS.map(([id, label, icon]) => (
              <a key={id} href="#/" onClick={go(id)} className={active === id ? 'on' : ''} aria-current={active === id ? 'location' : undefined}>
                <Icon name={icon} size={18} />
                <span className="lp-side-label">{label}</span>
              </a>
            ))}
          </nav>
          <a className="lp-side-cta" href="#/ideas">
            <Icon name="arrowUpRight" size={17} />
            <span className="lp-side-label">Open the app</span>
          </a>
        </div>
      </aside>
      {open && <button type="button" className="lp-scrim" aria-label="Close the sidebar" onClick={() => setOpen(false)} />}
    </>
  )
}

function Primary({ href, children }) {
  return <a className="lp-btn primary" href={href}>{children}<span className="lp-btn-icon"><Icon name="arrowUpRight" size={14} /></span></a>
}

export default function Landing() {
  const ref = useRef(null)
  const [open, setOpen] = useSidebar()
  const { data: m } = useApi('/model', 0)
  const { data: b } = useApi('/backtest', 0)
  useReveal(ref, Boolean(b))
  return (
    <div className={`landing ${open ? 'side-open' : ''}`} ref={ref}>
      <Sidebar open={open} setOpen={setOpen} />

      <main id="main" tabIndex={-1}>
        <Hero b={b} />
        <Beat b={b} m={m} />
        <BuiltFor />
        <Record b={b} m={m} />
        <Apps />
        <Pricing />
        <Faq />
        <Final />
      </main>

      <footer className="lp-footer">
        <span className="lp-brand small">Stonks <span>Lite</span></span>
        <nav aria-label="App pages">
          {[['Ideas', 'ideas'], ['Stocks', 'stocks'], ['Paper account', 'portfolio'], ['Model', 'model'], ['Backtest', 'backtest'], ['How it works', 'about']]
            .map(([label, key]) => <a key={key} href={`#/${key}`}>{label}</a>)}
        </nav>
        <p>A research and paper-trading tool. Not investment advice, and no real order is ever placed.</p>
      </footer>
    </div>
  )
}

function Hero({ b }) {
  const r = race(b)
  return (
    <section id="top" className="lp-hero">
      <div className="lp-hero-copy lp-reveal">
        <p className="lp-eyebrow"><i /> Stonks Lite · free in your browser</p>
        <h1><span className="dim">Swing ideas,</span><br />tested honestly.</h1>
        <p className="lp-lede">Every evening three classic rules scan 50 large NSE stocks. A calibrated model says how often trades like
          each one paid off, and you try them with paper money.</p>
        <div className="lp-ctas">
          <Primary href="#/ideas">Open tonight's ideas</Primary>
          <a className="lp-btn ghost" href="#/" onClick={jump('pricing')}>See Stonks Pro</a>
        </div>
        {r?.ahead && (
          <a className="lp-proof" href="#/" onClick={jump('beat')}>
            <i /> Test years {r.from}–{r.to}: model picks <b>{signedPct(r.picks.cagr)}</b> a year, NIFTY 50 {signedPct(r.nifty.cagr)}
            <Icon name="chevronRight" size={13} />
          </a>
        )}
      </div>
      <div className="lp-stage lp-reveal">
        <figure className="lp-frame back"><img src={img('mac-stock.webp')} alt="" width="2000" height="1301" /></figure>
        <figure className="lp-frame front">
          <img src={img('lite-ideas.webp')} width="2000" height="1250" fetchPriority="high"
            alt="Stonks Lite's Ideas page: tonight's setups with the model's chance, a price ladder and a paper order ticket" />
        </figure>
      </div>
    </section>
  )
}

const EXITS = ([target, stop, days]) => (target ? `a ${target}× ATR target, a ${stop}× ATR stop and up to ${days} days`
  : `no fixed target, a ${stop}× ATR stop and up to ${days} days`)
const REGIME = {
  half: 'When the NIFTY 50 is below its 200-day average, new positions are half size. Less is at risk in falling markets.',
  skip: 'When the NIFTY 50 is below its 200-day average, no new positions are opened.',
}

// The highlight: ₹10 lakh in the model's picks against ₹10 lakh in the NIFTY 50, what changed, and what to be wary of.
function Beat({ b, m }) {
  const r = race(b)
  if (!r) return <section id="beat" className="lp-section lp-beat" aria-busy="true" />
  const sameDates = b.before?.curves.dates.length === b.curves.dates.length
  const series = [
    { key: 'picks', label: 'Model picks', values: onCapital(b.curves.series['Model picks'], r.capital), color: 'var(--yellow)', width: 2.4, area: true },
    { key: 'nifty', label: 'NIFTY 50', values: onCapital(b.curves.series['NIFTY 50'], r.capital), color: 'var(--label-2)', width: 1.6 },
    ...(r.before && sameDates
      ? [{ key: 'before', label: 'Model picks, old settings', values: onCapital(b.before.curves.series['Model picks'], r.capital), color: 'var(--label-3)', width: 1.3, dash: '4 4' }]
      : []),
  ]
  const exits = b.levers?.rule_exits
  const levers = [
    exits && ['Let winners run', `Momentum and breakout trades no longer cap their gains: ${EXITS(exits.momentum)}. Pullbacks keep ${EXITS(exits.pullback)}.`],
    REGIME[b.levers?.regime] && ['Bet smaller in weak markets', REGIME[b.levers.regime]],
    ['Only the best ideas', `A trade is taken only when the model expects at least ${signedPct(m?.settings.min_expected_return ?? 0.005)} after costs, best first when slots run short.`],
  ].filter(Boolean)
  return (
    <section id="beat" className="lp-section lp-beat">
      <div className="lp-beat-copy">
        <h2 className="lp-reveal"><span className="lp-kicker">Test years {r.from}–{r.to}</span>
          {r.ahead ? 'How we beat the NIFTY 50.' : 'How we compare with the NIFTY 50.'}</h2>
        <p className="lp-reveal">{lakhs(r.capital)} in the model's picks at the start of {r.from} was worth {grown(r.picks, r.capital)} by {longMonth(b.period.to)},
          after paying brokerage, taxes and slippage. The same {lakhs(r.capital)} in the NIFTY 50 was worth {grown(r.nifty, r.capital)}.</p>
        <div className="lp-beat-vs lp-reveal">
          <div className="lp-vs picks"><span>Model picks</span><b>{grown(r.picks, r.capital)}</b><small>{signedPct(r.picks.cagr)} a year · Sharpe {num(r.picks.sharpe, 2)}</small></div>
          <div className="lp-vs"><span>NIFTY 50</span><b>{grown(r.nifty, r.capital)}</b><small>{signedPct(r.nifty.cagr)} a year · Sharpe {num(r.nifty.sharpe, 2)}</small></div>
        </div>
        <p className="lp-beat-from lp-reveal">
          {r.picks.charges && `Brokerage, taxes and slippage cost the account ${compactRupees(r.picks.charges.charged)} along the way. `}
          {r.before && `With the old settings, the same picks made ${signedPct(r.before.cagr)} a year.`}
        </p>
      </div>
      <div className="lp-beat-chart lp-reveal">
        <div className="lp-beat-chart-core">
          <LineChart dates={b.curves.dates} series={series} legend height={320} yFormat={compactRupees}
            guides={[{ y: r.capital, label: `Start, ${lakhs(r.capital)}`, color: 'var(--label-3)' }]} />
        </div>
      </div>
      <ol className="lp-levers">
        {levers.map(([title, text], i) => (
          <li key={title} className="lp-reveal" style={{ '--d': `${i * 90}ms` }}><h3>{title}</h3><p>{text}</p></li>
        ))}
      </ol>
      <p className="lp-beat-note lp-reveal">
        <span><b>Read this as optimistic.</b> These are paper results on years we had already looked at, on today's 50 large companies.
          At its worst the model's account fell {pct(-r.picks.max_drawdown)},
          {r.picks.max_drawdown < r.nifty.max_drawdown ? ' more than' : ' against'} the NIFTY's {pct(-r.nifty.max_drawdown)}.</span>
        <a className="lp-link" href="#/backtest">Every strategy and caveat <Icon name="arrowUpRight" size={14} /></a>
      </p>
    </section>
  )
}

function BuiltFor() {
  const tiles = [
    { cls: 'wide', src: 'lite-idea.webp', w: 2000, h: 571, title: 'Rules propose', text: 'Momentum, breakout and pullback setups at every close, each with its exits already set.' },
    { cls: 'tall', src: 'lite-calibration.webp', w: 612, h: 576, title: 'A model scores the chance', text: 'Calibrated, so a 25% idea means about a quarter of trades like it paid off.' },
    { cls: '', src: 'lite-clock.webp', w: 868, h: 92, title: 'Replay any evening since 2006', text: 'Move the clock back and trade 2024 as if it were tonight, one day at a time.' },
    { cls: '', src: 'lite-backtest.webp', w: 2000, h: 699, title: 'Judged against the index', text: 'Every strategy is backtested on years the model never trained on, costs paid both ways.' },
  ]
  return (
    <section id="built" className="lp-section lp-built">
      <div className="lp-built-head">
        <h2 className="lp-reveal"><span className="lp-kicker">What it's for</span>Learning to swing trade without fooling yourself.</h2>
        <p className="lp-reveal" style={{ '--d': '120ms' }}>Most trading tools only show you the wins. Stonks Lite labels how every idea since 2006 ended,
          never lets its model learn from the years it is tested on, and lets you replay any evening to watch your paper trades play out.</p>
      </div>
      <div className="lp-bento">
        {tiles.map((t, i) => (
          <article key={t.title} className={`lp-tile ${t.cls} lp-reveal`} style={{ '--d': `${i * 90}ms` }}>
            <div className="lp-tile-core">
              <div className="lp-tile-media"><img src={img(t.src)} alt="" width={t.w} height={t.h} loading="lazy" /></div>
              <h3>{t.title}</h3>
              <p>{t.text}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

// The research record: the scale of the test, and what still didn't work.
function Record({ b, m }) {
  const nifty = b?.results.find((r) => r.name === 'NIFTY 50')
  const behind = b?.results.filter((r) => r.name !== 'NIFTY 50' && r.total_return < nifty.total_return).map((r) => r.name) || []
  const tried = b?.trials?.filter((t) => t.stage !== 'ref').length
  const metrics = [
    [m?.dataset.stocks ?? '–', 'NSE large caps, scanned every evening'],
    [m ? `${year(m.dataset.first_idea)}–${year(m.dataset.last_idea).slice(2)}` : '–', 'years of history behind every idea'],
    [m ? m.dataset.ideas.toLocaleString('en-IN') : '–', 'ideas, each labelled with how it ended'],
    [m ? num(m.test.roc_auc, 2) : '–', 'test AUC: a small edge, but a real one'],
    [tried ?? '–', 'settings tried on 2014–2021 before choosing, every one logged'],
  ]
  return (
    <section id="record" className="lp-section lp-record">
      <div className="lp-record-head lp-reveal">
        <span className="lp-kicker">The record</span>
        <h2>We publish what didn't work.</h2>
        <p>{behind.length ? `${new Intl.ListFormat('en', { type: 'conjunction' }).format(behind)} finished behind the NIFTY 50. ` : ''}The test years have been looked at more than once
          and the 50 stocks are today's large companies, so every result here is optimistic. A model that knows its limits is worth more than one that hides them.</p>
      </div>
      <dl className="lp-metrics">
        {metrics.map(([value, label], i) => (
          <div key={i} className="lp-reveal" style={{ '--d': `${i * 70}ms` }}><dt>{label}</dt><dd>{value}</dd></div>
        ))}
      </dl>
      <a className="lp-link lp-reveal" href="#/backtest">Read the full backtest <Icon name="arrowUpRight" size={14} /></a>
    </section>
  )
}

function Apps() {
  return (
    <section id="apps" className="lp-section lp-apps">
      <div className="lp-deck lp-reveal" aria-hidden="true">
        <img className="card-3" src={img('mac-signal.webp')} alt="" width="2000" height="1301" loading="lazy" />
        <img className="card-2" src={img('mac-execution.webp')} alt="" width="2000" height="1301" loading="lazy" />
        <img className="card-1" src={img('mac-stock.webp')} alt="" width="2000" height="1301" loading="lazy" />
      </div>
      <div className="lp-apps-copy">
        <h2 className="lp-reveal"><span className="lp-kicker">The family</span>One engine.<br />Three windows.</h2>
        <p className="lp-reveal">Lite is the small, open edition of Stonks, a native macOS app with a far larger research engine.
          Pro brings that engine to your Mac and your Android phone.</p>
        <ul className="lp-platforms">
          {PLATFORMS.map((p, i) => (
            <li key={p.name} className="lp-reveal" style={{ '--d': `${i * 90}ms` }}>
              <span className="lp-platform-icon"><Icon name={p.icon} size={20} /></span>
              <div><b>{p.name}</b><span>{p.where}</span><p>{p.text}</p></div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="lp-section lp-pricing">
      <div className="lp-pricing-head lp-reveal">
        <span className="lp-kicker">Pricing</span>
        <h2>Start free. Go Pro for the whole engine.</h2>
      </div>
      <div className="lp-plans">
        <article className="lp-plan lp-reveal">
          <div className="lp-plan-core">
            <h3>Lite</h3>
            <p className="lp-price">₹0</p>
            <p className="lp-plan-note">Free, in your browser.</p>
            <ul>{LITE.map((f) => <li key={f}><Icon name="tick" size={15} />{f}</li>)}</ul>
            <a className="lp-btn ghost" href="#/ideas">Open Stonks Lite</a>
          </div>
        </article>
        <article className="lp-plan pro lp-reveal" style={{ '--d': '120ms' }}>
          <div className="lp-plan-core">
            <div className="lp-plan-title"><h3>Pro</h3><span>Mac + Android</span></div>
            <p className="lp-price big">₹1,000<small>/ month</small></p>
            <ul>{PRO.map((f) => <li key={f}><Icon name="tick" size={15} />{f}</li>)}</ul>
            {PRO_SIGNUP_URL
              ? <Primary href={PRO_SIGNUP_URL}>Get Stonks Pro</Primary>
              : <Primary href="#/app/pricing">Join the waitlist</Primary>}
            <p className="lp-plan-note">Paper trading only. Stonks never places a real order.</p>
          </div>
        </article>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="lp-section lp-faq">
      <h2 className="lp-reveal"><span className="lp-kicker">Questions</span>Plain answers.</h2>
      <div className="lp-faq-list">
        {FAQ.map(([q, a], i) => (
          <details key={q} className="lp-reveal" style={{ '--d': `${i * 60}ms` }}>
            <summary>{q}<Icon name="plus" size={16} /></summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

function Final() {
  return (
    <section className="lp-final">
      <img src={img('lite-chart.webp')} alt="" width="2000" height="603" loading="lazy" />
      <div className="lp-final-copy lp-reveal">
        <h2>Tonight's ideas are in.</h2>
        <p>Open Stonks Lite and see what the rules found at the close.</p>
        <Primary href="#/ideas">Open Stonks Lite</Primary>
      </div>
    </section>
  )
}
