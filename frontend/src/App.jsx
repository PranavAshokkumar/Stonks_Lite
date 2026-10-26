import { Fragment, useCallback, useEffect, useState } from 'react'
import { Icon } from './components/Icons.jsx'
import { Banner } from './components/Kit.jsx'
import { ClockControl, MarketStrip } from './components/Parts.jsx'
import { api, signedPct, useApi, useRoute } from './lib.js'
import About from './pages/About.jsx'
import Backtest from './pages/Backtest.jsx'
import GetApp from './pages/GetApp.jsx'
import Ideas from './pages/Ideas.jsx'
import Landing from './pages/Landing.jsx'
import Model from './pages/Model.jsx'
import Portfolio from './pages/Portfolio.jsx'
import StockDetail from './pages/StockDetail.jsx'
import Stocks from './pages/Stocks.jsx'

// The floating dock, as in the Stonks app (icons after its SF Symbols). The Mac and Android apps sit last, past a divider.
const DOCK = [
  { key: 'ideas', label: 'Ideas', icon: 'binoculars' },
  { key: 'stocks', label: 'Stocks', icon: 'chart' },
  { key: 'portfolio', label: 'Paper account', icon: 'pie' },
  { key: 'model', label: 'Model', icon: 'cpu' },
  { key: 'backtest', label: 'Backtest', icon: 'trend' },
  { key: 'about', label: 'How it works', icon: 'info', narrowOnly: true },
  { key: 'app', label: 'Get the app', icon: 'laptop', apart: true },
]

export default function App() {
  const [page, param] = useRoute()
  const [status, setStatus] = useState(null)
  const [statusError, setStatusError] = useState(null)
  const [version, setVersion] = useState(0)          // bumped after anything changes, so pages reload
  const [toast, setToast] = useState(null)

  const refresh = useCallback(() => setVersion((v) => v + 1), [])

  useEffect(() => {
    api('/status')
      .then((s) => {
        setStatus(s)
        setStatusError(null)
      })
      .catch((e) => setStatusError(e.message))
  }, [version])

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  const notify = useCallback((text, kind = 'info') => {
    if (text) setToast({ text, kind })
    if (kind !== 'error') refresh()
  }, [refresh])

  // The hash is the router, so the skip link moves focus instead of setting "#main".
  const skip = (
    <a className="skip" href="#/" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus() }}>Skip to content</a>
  )
  if (page === 'home') return <>{skip}<Landing /></>

  const props = { status, version, notify, refresh }
  const pages = {
    ideas: <Ideas {...props} />,
    stocks: param ? <StockDetail symbol={decodeURIComponent(param)} {...props} /> : <Stocks {...props} />,
    portfolio: <Portfolio {...props} />,
    model: <Model {...props} />,
    backtest: <Backtest {...props} />,
    about: <About />,
    app: <GetApp from={param} />,
  }

  return (
    <>
      {skip}
      <Rail page={page} symbol={param && decodeURIComponent(param)} version={version} />
      <div className="window">
        <div className="toolbar">
          <MarketStrip status={status} />
          <ClockControl status={status} onMoved={notify} />
        </div>
        <main id="main" tabIndex={-1}>
          {statusError && (
            <Banner kind="error">
              The app can't reach its server ({statusError}). Start it with <code>python -m backend.app</code> in the project folder, then reload.
            </Banner>
          )}
          {pages[page] || <Banner kind="error">There is no page called “{page}”. <a href="#/ideas">Go to Ideas</a>.</Banner>}
        </main>
        <footer className="footer">A semester project built on 50 NSE stocks. Paper trading only: no real orders, and not investment advice.</footer>
      </div>
      <nav className="dock" aria-label="Pages">
        {DOCK.map((d) => {
          const on = page === d.key
          return (
            <Fragment key={d.key}>
              {d.apart && <i className="dock-sep" aria-hidden="true" />}
              <a href={`#/${d.key}`} className={`${on ? 'on' : ''} ${d.narrowOnly ? 'narrow-only' : ''} ${d.apart ? 'dock-app' : ''}`}
                style={{ viewTransitionName: `dock-${d.key}` }} aria-current={on ? 'page' : undefined} aria-label={d.label}>
                {on && <span className="dock-pill" />}
                <Icon name={d.icon} size={on ? 19 : 18} />
                {on ? <span className="dock-label">{d.label}</span> : <span className="dock-tip" aria-hidden="true">{d.label}</span>}
              </a>
            </Fragment>
          )
        })}
      </nav>
      {toast && <div className={`toast ${toast.kind}`} role="status">{toast.text}</div>}
    </>
  )
}

// The watchlist rail: tonight's ideas (or, on a quiet evening, the highest trend scores), each with a dot
// for the day's direction, and "How it works" at the foot, as in the Stonks sidebar collapsed.
function Rail({ page, symbol, version }) {
  const { data } = useApi('/stocks', version)
  const stocks = data?.stocks || []
  const ideas = stocks.filter((s) => s.rules.length)
  const list = ideas.length ? ideas : [...stocks].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 10)
  return (
    <aside className="rail" aria-label={ideas.length ? "Tonight's ideas" : 'Strongest trends'}>
      <a className="rail-brand" href="#/" aria-label="Stonks Lite home" title="Stonks Lite">
        <svg viewBox="0 0 32 32" width="22" height="22" aria-hidden="true">
          <path d="M6 21.5l6-6 4.5 3.5L26 9.5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </a>
      <div className="rail-list">
        {list.map((s) => (
          <a key={s.symbol} href={`#/stocks/${encodeURIComponent(s.symbol)}`} title={`${s.symbol} · ${s.name} · ${signedPct(s.change)}`}
            className={page === 'stocks' && symbol === s.symbol ? 'on' : ''} aria-label={`${s.symbol}, ${signedPct(s.change)} today`}>
            <span>{s.symbol.slice(0, 3)}</span>
            <i className={s.change >= 0 ? 'up' : 'down'} />
          </a>
        ))}
      </div>
      <a className={`rail-info ${page === 'about' ? 'on' : ''}`} href="#/about" title="How it works" aria-label="How it works">
        <Icon name="info" size={17} />
      </a>
    </aside>
  )
}
