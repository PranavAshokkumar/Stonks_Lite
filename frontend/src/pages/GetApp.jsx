// Stonks for Mac and Android: what the apps add to Lite, and the Pro waitlist until sign-up opens.
import { useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { Card, PageHeader, Segmented } from '../components/Kit.jsx'
import { post } from '../lib.js'

const ADDS = [
  ['Stocks', '50 large NSE companies', 'Every NSE stock'],
  ['Prices', 'Daily closes', 'Live quotes and minute bars'],
  ['Research', 'One model on three rules', 'Swing v4 with fundamentals, MARL agents and an F&O paper desk'],
  ['News', 'None', 'Headlines scored for sentiment, on every stock'],
  ['Help', 'The guide', 'An AI analyst you can point at any part of the screen'],
  ['Paper account', 'You place every order', 'Optimiser target weights, and an autopilot that rebalances when holdings drift'],
  ['Where', 'Any browser', 'Your Mac and your Android phone'],
]
const PLATFORMS = [
  { key: 'mac', label: 'Mac', icon: 'laptop' },
  { key: 'android', label: 'Android', icon: 'phone' },
  { key: 'both', label: 'Both' },
]
const PLATFORM_TEXT = { mac: 'Mac', android: 'Android', both: 'Mac and Android' }
const guessPlatform = () => (/Android/i.test(navigator.userAgent) ? 'android' : /Mac/i.test(navigator.userAgent) ? 'mac' : 'both')

export default function GetApp({ from }) {
  return (
    <section className="page">
      <PageHeader kicker="Stonks for Mac and Android" title="Get the app"
        subtitle="Lite is the small edition of Stonks. The apps run the full engine on every NSE stock, live. Pro is ₹1,000 a month." />

      <Card className="app-hero">
        <img src="/landing/mac-stock.webp" width="2000" height="1301"
          alt="Stonks for Mac: Tata Steel on 5-minute candles, with the day's headlines scored for sentiment" />
        <Waitlist from={from} />
      </Card>

      <Card title="What the apps add" icon="layers" className="table-card">
        <table className="data compare">
          <thead><tr><th /><th>Lite, here</th><th>Stonks for Mac and Android</th></tr></thead>
          <tbody>
            {ADDS.map(([what, lite, app]) => <tr key={what}><td>{what}</td><td>{lite}</td><td>{app}</td></tr>)}
          </tbody>
        </table>
      </Card>

      <div className="tiles two app-shots">
        <figure className="card">
          <img src="/landing/mac-signal.webp" width="2000" height="1301" loading="lazy"
            alt="Stonks for Mac: the signal model on Tata Steel, with the drivers behind its call" />
          <figcaption>The signal model shows the drivers behind every call.</figcaption>
        </figure>
        <figure className="card">
          <img src="/landing/mac-execution.webp" width="2000" height="1301" loading="lazy"
            alt="Stonks for Mac: the paper order ticket with live quotes and itemised charges" />
          <figcaption>Paper orders at live prices, with every charge itemised.</figcaption>
        </figure>
      </div>
    </section>
  )
}

function Waitlist({ from }) {
  const [email, setEmail] = useState('')
  const [platform, setPlatform] = useState(guessPlatform)
  const [state, setState] = useState({ busy: false, done: false, error: null })

  const submit = async (event) => {
    event.preventDefault()
    setState({ busy: true, done: false, error: null })
    try {
      await post('/waitlist', { email, platform, source: from || 'dock' })
      setState({ busy: false, done: true, error: null })
    } catch (error) {
      setState({ busy: false, done: false, error: error.message })
    }
  }

  if (state.done) {
    return (
      <div className="waitlist done" role="status">
        <span className="waitlist-tick"><Icon name="tick" size={20} /></span>
        <h2>You're on the list</h2>
        <p className="muted">We'll email {email} when Pro opens for {PLATFORM_TEXT[platform]}.</p>
        <a className="button" href="#/ideas">Back to tonight's ideas</a>
      </div>
    )
  }
  return (
    <form className="waitlist" onSubmit={submit}>
      <h2>Join the Pro waitlist</h2>
      <p className="muted">Sign-up isn't open yet. Leave your email and we'll tell you when it is, and nothing else.</p>
      <label className="field">
        <span className="stat-label">Email</span>
        <input type="email" required autoComplete="email" maxLength={254} placeholder="you@example.com"
          value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? 'waitlist-error' : undefined} />
      </label>
      <div className="field">
        <span className="stat-label">Which app</span>
        <Segmented label="Which app" options={PLATFORMS} value={platform} onChange={setPlatform} />
      </div>
      <button type="submit" className="button buy" disabled={state.busy}>{state.busy ? 'Joining…' : 'Join the waitlist'}</button>
      {state.error && <p id="waitlist-error" className="form-error" role="alert">{state.error}</p>}
    </form>
  )
}
