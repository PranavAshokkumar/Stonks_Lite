import { Columns, LineChart } from '../components/Charts.jsx'
import { Banner, Card, Chip, Loading, PageHeader, Versus } from '../components/Kit.jsx'
import { RULE_TEXT, compactRupees, grown, lakhs, longDate, monthYear, num, onCapital, pct, race, rupees, signedPct, tone, useApi } from '../lib.js'

const COLORS = {
  'Model picks': 'var(--yellow)',
  'Model ranked': 'var(--orange)',
  'All rule ideas': 'var(--label-2)',
  'Momentum only': 'var(--blue)',
  'Breakout only': 'var(--purple)',
  'Pullback only': 'var(--pink)',
  'NIFTY 50': 'var(--green)',
}
const PERIODS = { train: 'Training years', valid: '2022 (check)', test: 'Test years' }
const year = (iso) => iso.slice(0, 4)
const REGIME = { half: 'half-size new buys', skip: 'no new buys' }
const RANK_BY = { expected_return: 'expected return', p_win: 'chance' }
const SWEEP = { liquid: (rate) => `in a liquid fund at ${pct(rate, 0)} a year`, nifty: () => 'in the NIFTY 50' }

// backtest.json's `levers`: the settings these results were run with (null means off).
function leversText(l) {
  const exits = l.rule_exits
    ? Object.entries(l.rule_exits).map(([rule, [target, stop, days]]) =>
      `${RULE_TEXT[rule] || rule} ${target == null ? 'no target' : `${target}× target`}, ${stop}× stop, ${days} days`).join(' · ')
    : 'one set of exits for every rule'
  return [
    `Exits: ${exits}.`,
    l.model_ranked ? `Model ranked takes every idea, best ${RANK_BY[l.model_ranked] || l.model_ranked} first.` : null,
    l.regime ? `When the NIFTY 50 closes under its 200-day average: ${REGIME[l.regime] || l.regime}.` : null,
    `Idle cash ${l.cash_sweep ? SWEEP[l.cash_sweep]?.(l.cash_rate) || l.cash_sweep : 'earns nothing'}.`,
  ].filter(Boolean).join(' ')
}

export default function Backtest({ version }) {
  const { data: b, error } = useApi('/backtest', version)
  if (error) return <Banner kind="error">{error}</Banner>
  if (!b) return <Loading what="Loading the backtest" />

  const nifty = b.results.find((r) => r.name === 'NIFTY 50')
  const strategies = b.results.filter((r) => r.name !== 'NIFTY 50')
  const picks = strategies.find((r) => r.name === 'Model picks')
  const beat = strategies.filter((r) => r.total_return > nifty.total_return)
  const swept = strategies.some((r) => r.cash_earned > 0)
  const capital = b.capital ?? 1e6
  const series = b.results.map((r) => [r.name, onCapital(b.curves.series[r.name], capital)]).filter(([, values]) => values).map(([name, values]) => ({
    key: name, label: name, values, color: COLORS[name] || 'var(--label-3)', width: name === 'Model picks' || name === 'NIFTY 50' ? 2.2 : 1.3,
  }))
  const original = b.before?.curves.dates.length === b.curves.dates.length && onCapital(b.before.curves.series['Model picks'], capital)
  if (original) series.push({ key: 'original', label: 'Model picks, original settings', values: original, color: 'var(--yellow)', width: 1.3, dash: '4 4' })
  const r = race(b)

  return (
    <section className="page">
      <PageHeader kicker={`Results · test years ${year(b.period.from)}–${year(b.period.to)}`}
        title={r?.ahead ? 'How we beat the NIFTY 50' : 'Backtest'}
        subtitle={`${longDate(b.period.from)} to ${longDate(b.period.to)}, on years the model never trained on, costs paid both ways`}
        capsules={[
          { text: `${b.slots} equal slots per account`, icon: 'layers' },
          { text: `${pct(b.cost, 2)} costs each way`, icon: 'list' },
          beat.length
            ? { text: `${beat.length} of ${strategies.length} strategies beat the index`, icon: r?.ahead ? 'tick' : 'warning', tint: r?.ahead ? 'green' : 'orange' }
            : { text: 'No strategy beat the index', icon: 'warning', tint: 'orange' },
        ]} />

      {r && <Story b={b} r={r} />}
      {b.legs && r && <FallsAndExits b={b} original={original} capital={capital} />}
      {picks?.charges && <Charges c={picks.charges} capital={capital} />}
      {b.trials && b.levers && <HowWeGotHere trials={b.trials} levers={b.levers} />}

      <Card title={`${lakhs(capital)} in every strategy`} icon="trend" aside="After brokerage, taxes and slippage">
        <LineChart dates={b.curves.dates} series={series} legend height={340} yFormat={compactRupees}
          guides={[{ y: capital, label: 'Start', color: 'var(--label-3)' }]} />
      </Card>

      <Card title="Results" icon="list" aside="Sharpe above 1 is good · worst fall is the largest drop from a peak">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Strategy</th><th className="num">Total</th><th className="num">Per year</th><th className="num">Worst fall</th>
                <th className="num">Sharpe</th><th className="num">Trades</th><th className="num">Profitable</th><th className="num">Avg trade</th>
                <th className="num">Time invested</th><th className="num">Charges paid</th>{swept && <th className="num">Idle cash earned</th>}
              </tr>
            </thead>
            <tbody>
              {b.results.map((r) => (
                <tr key={r.name} className={r.name === 'NIFTY 50' ? 'benchmark' : ''}>
                  <td><span className="swatch" style={{ background: COLORS[r.name] }} />{r.name}</td>
                  <td className={`num ${tone(r.total_return)}`}>{signedPct(r.total_return)}</td>
                  <td className={`num ${tone(r.cagr)}`}>{signedPct(r.cagr)}</td>
                  <td className="num loss">{signedPct(r.max_drawdown)}</td>
                  <td className="num">{num(r.sharpe, 2)}</td>
                  <td className="num">{r.trades ?? '–'}</td>
                  <td className="num">{r.win_rate === undefined ? '–' : pct(r.win_rate, 0)}</td>
                  <td className={`num ${tone(r.avg_trade)}`}>{r.avg_trade === undefined ? '–' : signedPct(r.avg_trade, 2)}</td>
                  <td className="num">{r.avg_exposure === undefined ? '100%' : pct(r.avg_exposure, 0)}</td>
                  <td className="num">{r.charges ? compactRupees(r.charges.charged) : '–'}</td>
                  {swept && <td className="num">{r.cash_earned === undefined ? '–' : `₹${num(r.cash_earned, 1)}`}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {b.levers && <p className="footnote">{leversText(b.levers)}</p>}
      </Card>

      {b.before && <BeforeAfter before={b.before} after={b.results} />}
      {b.trials && <Trials trials={b.trials} />}

      <Card title="Every idea, by rule and period" icon="layers" aside="No account and no slots: every finished idea counts once">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>Period</th><th>Rule</th><th className="num">Ideas</th><th className="num">Hit target</th><th className="num">Hit stop</th>
                <th className="num">Ran out of time</th><th className="num">Avg return</th></tr>
            </thead>
            <tbody>
              {b.rules.map((r) => (
                <tr key={r.period + r.rule} className={r.rule === 'all' ? 'group-row' : ''}>
                  <td>{r.rule === 'all' ? PERIODS[r.period] : ''}</td>
                  <td>{r.rule === 'all' ? 'All rules' : RULE_TEXT[r.rule]}</td>
                  <td className="num">{r.count.toLocaleString('en-IN')}</td>
                  <td className="num">{pct(r.target)}</td>
                  <td className="num">{pct(r.stop)}</td>
                  <td className="num">{pct(r.time)}</td>
                  <td className={`num ${tone(r.avg_return)}`}>{signedPct(r.avg_return, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="notes">
        <Banner kind="warn" label="The honest reading">
          {beat.length ? (
            <>
              {beat.map((r) => r.name).join(', ')} beat simply holding the NIFTY 50 from {year(b.period.from)} to {year(b.period.to)}
              {picks && ` (model picks ${signedPct(picks.total_return, 0)} against ${signedPct(nifty.total_return, 0)}, worst fall ${signedPct(picks.max_drawdown, 0)} against ${signedPct(nifty.max_drawdown, 0)})`}.
              Read that with care: the exits, the ranking and the market filter were tuned on 2006–2021, these test years had been looked at
              before, and the 50 stocks are today's survivors, which flatters wide stops and long holds most. That is why it only trades on paper.
            </>
          ) : (
            <>
              None of the swing strategies beat simply holding the NIFTY 50 from {year(b.period.from)} to {year(b.period.to)}, and most fell
              further at their worst. The model helps a little: its picks did better than taking every idea. The full Stonks app reached the
              same verdict, which is why it only trades on paper.
            </>
          )}
        </Banner>
      </div>
    </section>
  )
}

const span = (leg) => `${monthYear(leg.from)} – ${monthYear(leg.to)}`
const mean = (xs) => xs.reduce((a, v) => a + v, 0) / xs.length

// The headline: what ₹10 lakh became, and where the lead came from, read off the legs (rises and falls of the NIFTY).
function Story({ b, r }) {
  const legs = b.legs || []
  const best = legs.reduce((a, l) => (!a || l.picks - l.nifty > a.picks - a.nifty ? l : a), null)
  const falls = legs.filter((l) => l.kind === 'fall')
  const gap = falls.length ? mean(falls.map((l) => l.picks)) - mean(falls.map((l) => l.nifty)) : 0
  const asMuch = gap > 0.02 ? 'less than' : gap < -0.04 ? 'more than' : 'about as much as'
  const cashed = falls.filter((l) => l.invested_end < 0.5)
  return (
    <div className="hero-card">
      <div className="hero-core">
        <Versus items={[
          { label: 'Model picks', value: grown(r.picks, r.capital), caption: `${signedPct(r.picks.cagr)} a year · Sharpe ${num(r.picks.sharpe, 2)} · worst fall ${signedPct(r.picks.max_drawdown)}` },
          { label: 'NIFTY 50', value: grown(r.nifty, r.capital), caption: `${signedPct(r.nifty.cagr)} a year · Sharpe ${num(r.nifty.sharpe, 2)} · worst fall ${signedPct(r.nifty.max_drawdown)}` },
          ...(r.before ? [{ label: 'Original settings', value: grown(r.before, r.capital), caption: `${signedPct(r.before.cagr)} a year` }] : []),
        ]} />
        {best && (
          <p className="hero-story">
            {lakhs(r.capital)} in the model's picks became {grown(r.picks, r.capital)} after
            {r.picks.charges ? ` ${compactRupees(r.picks.charges.charged)} of` : ''} brokerage, taxes and slippage; in the NIFTY 50 it became {grown(r.nifty, r.capital)}. Most of the lead came
            in the {span(best)} {best.kind}, when the picks made <b className={tone(best.picks)}>{signedPct(best.picks, 0)}</b> against
            the NIFTY's {signedPct(best.nifty, 0)}: winners were left to run.
            {falls.length > 0 && <>{' '}
              {cashed.length
                ? `In ${cashed.length} of the NIFTY's ${falls.length} falls the stops took the account mostly to cash (down to ${pct(Math.min(...cashed.map((l) => l.invested_end)), 0)} invested), but it still fell`
                : `In the NIFTY's ${falls.length} falls the account stayed mostly invested and fell`}
              {' '}{asMuch} the index ({signedPct(mean(falls.map((l) => l.picks)), 0)} on average, against {signedPct(mean(falls.map((l) => l.nifty)), 0)}).</>}
          </p>
        )}
      </div>
    </div>
  )
}

// The model's account against the NIFTY 50, with the NIFTY's falls shaded, how much of the account was invested
// underneath, and red marks where positions were sold at their stop.
function FallsAndExits({ b, original, capital }) {
  const dates = b.curves.dates
  const first = (iso) => Math.max(0, dates.findIndex((d) => d >= iso))
  const last = (iso) => { const i = dates.findIndex((d) => d > iso); return i < 0 ? dates.length - 1 : Math.max(0, i - 1) }
  const falls = b.legs.filter((l) => l.kind === 'fall')
  const best = b.legs.reduce((a, l) => (!a || l.picks - l.nifty > a.picks - a.nifty ? l : a), null)
  const stops = new Array(dates.length).fill(0)
  b.picks_exits.filter((e) => e.outcome === 'stop').forEach((e) => { stops[Math.min(dates.length - 1, first(e.date))] += 1 })
  const series = [
    { key: 'picks', label: 'Model picks', values: onCapital(b.curves.series['Model picks'], capital), color: 'var(--yellow)', width: 2.4, area: true },
    { key: 'nifty', label: 'NIFTY 50', values: onCapital(b.curves.series['NIFTY 50'], capital), color: 'var(--label-2)', width: 1.6 },
    ...(original ? [{ key: 'original', label: 'Model picks, original settings', values: original, color: 'var(--label-3)', width: 1.2, dash: '4 4' }] : []),
  ]
  return (
    <Card title="Where the NIFTY fell, and where we got out" icon="trend"
      aside="Shaded: the NIFTY's falls of 7% or more · strip: share of the account invested · red: sold at the stop">
      <LineChart dates={dates} series={series} legend height={430} yFormat={compactRupees}
        guides={[{ y: capital, label: `Start, ${lakhs(capital)}`, color: 'var(--label-3)' }]}
        bands={falls.map((l) => ({ from: first(l.from), to: last(l.to), tone: 'fall', label: `NIFTY ${signedPct(l.nifty, 0)}` }))}
        strip={b.curves.picks_invested && { label: 'Model picks invested', values: b.curves.picks_invested, ticks: stops,
          tickLabel: (n) => `${n} sold at the stop that week` }} />
      <ol className="legs">
        {b.legs.map((l) => (
          <li key={l.from} className={`${l.kind} ${l === best ? 'best' : ''}`}>
            <Chip tint={l.kind === 'fall' ? 'red' : 'green'}>{l.kind === 'fall' ? 'NIFTY fell' : 'NIFTY rose'}</Chip>
            {l === best && <span className="leg-best">Where the lead was won</span>}
            <span className="leg-span">{span(l)}</span>
            <span className="leg-row"><span>NIFTY 50</span><b className={tone(l.nifty)}>{signedPct(l.nifty)}</b></span>
            <span className="leg-row"><span>Model picks</span><b className={tone(l.picks)}>{signedPct(l.picks)}</b></span>
            <span className="leg-note">
              {l.kind === 'fall'
                ? `Invested ${pct(l.invested_start, 0)} → ${pct(l.invested_end, 0)}. ${l.sold} sold, ${l.stopped} at the stop.`
                : `Invested ${pct(l.invested_avg, 0)} on average; ${l.sold} sold, ${l.stopped} at the stop.`}
              {REGIME[b.levers?.regime] && l.under_200 > 0.25 && ` NIFTY under its 200-day average ${pct(l.under_200, 0)} of the time: ${REGIME[b.levers.regime]}.`}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

// What the model's account paid, itemised at NSE's delivery rates on each trade's date (backend/charges.py), against
// the flat cost the backtest charged: the difference is the allowance left for slippage.
function Charges({ c, capital }) {
  const itemised = c.brokerage + c.stt + c.exchange + c.sebi + c.stamp + c.gst
  const turnover = c.bought + c.sold
  const rows = [
    ['Securities transaction tax', '0.1% on every buy and sell', c.stt],
    ['NSE transaction charge', '0.00297% since Oct 2024, 0.00322–0.00345% before', c.exchange],
    ['SEBI turnover fee', '₹10 a crore', c.sebi],
    ['Stamp duty', '0.015% on buys', c.stamp],
    ['GST', '18% of brokerage and the fees above', c.gst],
    ['Brokerage', c.brokerage ? 'per order' : '₹0 an order: a discount broker\'s delivery trades', c.brokerage],
  ]
  return (
    <Card title="Brokerage and taxes" icon="list" aside={`Model picks on ${lakhs(capital)} · NSE delivery rates on each trade's date`}>
      <div className="tiles two charges">
        <div className="charges-lead">
          <span className="versus-label">Charged over the test years</span>
          <span className="charges-total">{rupees(c.charged)}</span>
          <p className="card-text">On {c.orders} orders: {compactRupees(c.bought)} bought and {compactRupees(c.sold)} sold, so the costs came
            to {pct(c.charged / capital, 1)} of the starting account. The backtest charges a flat 0.15% each way; at NSE's
            rates, brokerage and taxes were {pct(itemised / turnover, 3)} of what was traded, and the rest is room for slippage.</p>
          <p className="footnote">Check a broker's contract note before relying on these for real money.</p>
        </div>
        <table className="data charges-table">
          <tbody>
            {rows.map(([name, note, amount]) => (
              <tr key={name}><td>{name}<span className="row-name">{note}</span></td><td className="num">{rupees(amount)}</td></tr>
            ))}
            <tr className="group-row"><td>Brokerage and taxes</td><td className="num">{rupees(itemised)}</td></tr>
            <tr><td>Slippage allowance<span className="row-name">the rest of the flat 0.15% each way</span></td><td className="num">{rupees(c.allowance)}</td></tr>
            <tr className="group-row chosen"><td>Charged in the backtest</td><td className="num">{rupees(c.charged)}</td></tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// The same table for the original settings (artifacts/backtest_before.json) and the levers chosen on 2006-2021.
function BeforeAfter({ before, after }) {
  const old = Object.fromEntries(before.results.map((r) => [r.name, r]))
  const cells = (r) => [
    <td key="t" className={`num ${tone(r?.total_return)}`}>{signedPct(r?.total_return)}</td>,
    <td key="c" className={`num ${tone(r?.cagr)}`}>{signedPct(r?.cagr)}</td>,
    <td key="d" className="num loss">{signedPct(r?.max_drawdown)}</td>,
    <td key="s" className="num">{num(r?.sharpe, 2)}</td>,
  ]
  return (
    <Card title="Before and after the profit levers" icon="layers" aside="Same test years, costs and 10 slots; only the settings changed">
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr>
              <th>Strategy</th><th className="num">Before: total</th><th className="num">Per year</th><th className="num">Worst fall</th>
              <th className="num">Sharpe</th><th className="num">After: total</th><th className="num">Per year</th><th className="num">Worst fall</th>
              <th className="num">Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {after.map((r) => (
              <tr key={r.name} className={r.name === 'NIFTY 50' ? 'benchmark' : r.name === 'Model picks' ? 'chosen' : ''}>
                <td><span className="swatch" style={{ background: COLORS[r.name] }} />{r.name}</td>
                {old[r.name] ? cells(old[r.name]) : <td colSpan={4} className="num faint">new</td>}
                {cells(r)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

const STAGES = { ref: 'Benchmark', 0: 'Original', 1: 'Exits', 2: 'Model', 3: 'Market filter', 4: 'Idle cash' }
const variant = (name) => name.replace("today's settings", 'original settings').replace('cash_sweep liquid', 'idle cash in a liquid fund').replace('cash_sweep nifty', 'idle cash tracks the NIFTY 50')
  .replace('regime half', 'half size under the 200-day').replace('regime skip', 'no buys under the 200-day')
  .replace('by p_win', 'by chance').replace('expected_return', 'expected return')
const sharpe = (r) => num(r?.sharpe, 2)

// How the levers were chosen, from the tuning record (artifacts/trials.csv, 2014-2021 only).
function HowWeGotHere({ trials, levers }) {
  const find = (stage, start) => trials.find((r) => r.stage === stage && r.name.startsWith(start))
  const kept = (stage, start = '') => trials.find((r) => r.stage === stage && r.chosen && r.name.startsWith(start))
  const index = trials.find((r) => r.stage === 'ref')
  const filtered = kept('2')
  const regime = kept('3')
  const path = [[find('0', 'Model picks'), 'Original'], [filtered, 'New exits'], [regime, 'Market filter'], [kept('4'), 'Cash sweep']]
    .filter(([r]) => r).map(([r, label]) => ({ label, value: r.sharpe, note: `${signedPct(r.cagr)} a year` }))
  const exits = Object.entries(levers.rule_exits || {}).map(([rule, [target, stop, days]]) =>
    `${RULE_TEXT[rule] || rule}: ${target == null ? 'no target' : `${target}× ATR target`}, ${stop}× ATR stop, ${days} days`).join('; ')
  const pullback5 = find('1', 'Pullback only, exits 2/2/5')
  const liquid = find('4', 'Model picks, cash_sweep liquid')
  const indexCash = find('4', 'Model picks, cash_sweep nifty')
  return (
    <Card title="How we got here" icon="flask" aside="Chosen on 2006–2021 only, then run once on the test years">
      <div className="tiles two">
        <div>
          <p className="card-text">Model picks' Sharpe ratio on 2014–2021 as each change was kept (the line is the NIFTY 50 over the same years):</p>
          <Columns items={path} format={(v) => num(v, 2)} reference={index?.sharpe} referenceLabel={`NIFTY 50 · ${sharpe(index)}`} height={250} />
        </div>
        <ol className="steps">
          <li><b>Let winners run.</b> Each rule got its own exits ({exits}). On its own account, momentum's Sharpe went
            from {sharpe(find('1', 'Momentum only, exits 4/2/20'))} to {sharpe(kept('1', 'Momentum'))} and
            breakout's from {sharpe(find('1', 'Breakout only, exits 4/2/20'))} to {sharpe(kept('1', 'Breakout'))}.
            {pullback5 && ` A 5-day pullback exit made ${signedPct(pullback5.cagr)} a year once costs were paid, so pullback kept its old exits.`}</li>
          <li><b>Let the model choose.</b> Taking only ideas the model expects to make +0.5% or more (Sharpe {sharpe(filtered)}) beat
            ranking every idea by expected return ({sharpe(find('2', 'Model ranked by expected'))}) or by chance
            ({sharpe(find('2', 'Model ranked by p_win'))}), and taking every idea ({sharpe(find('2', 'All rule ideas'))}).</li>
          <li><b>Step back in falling markets.</b> New buys are half size while the NIFTY 50 is under its 200-day average: Sharpe
            {' '}{sharpe(filtered)} to {sharpe(regime)}, worst fall {signedPct(filtered?.max_drawdown)} to {signedPct(regime?.max_drawdown)}.</li>
          <li><b>Idle cash stays idle.</b> A liquid fund added {num(liquid && regime ? liquid.sharpe - regime.sharpe : null, 3)} to the
            Sharpe ratio, under the 0.05 bar set in advance; tracking the NIFTY 50 deepened the worst fall
            to {signedPct(indexCash?.max_drawdown)}.</li>
        </ol>
      </div>
      <p className="footnote">
        Each year from 2014 to 2021 was scored by a model trained only on earlier years, and a 10-slot account traded it. The rule was
        written down before the first run: keep the best Sharpe, but keep the original setting unless something beats it by 0.05.
        The {trials.filter((r) => r.stage !== 'ref').length} settings below are everything that was tried.
      </p>
    </Card>
  )
}

function Trials({ trials }) {
  let n = 0
  return (
    <Card title="Every setting we tried" icon="list" aside="Training years 2014–2021 · exits are target ATRs / stop ATRs / days">
      <div className="table-scroll">
        <table className="data">
          <thead>
            <tr><th className="num">#</th><th>Step</th><th>Setting</th><th className="num">Per year</th><th className="num">Sharpe</th>
              <th className="num">Worst fall</th><th className="num">Trades</th></tr>
          </thead>
          <tbody>
            {trials.map((r) => (
              <tr key={r.name + r.stage} className={r.stage === 'ref' ? 'benchmark' : r.chosen ? 'chosen' : ''}>
                <td className="num">{r.stage === 'ref' ? '' : (n += 1)}</td>
                <td>{STAGES[r.stage]}</td>
                <td>{variant(r.name)} {r.chosen && <span className="chosen-mark">kept</span>}</td>
                <td className={`num ${tone(r.cagr)}`}>{signedPct(r.cagr)}</td>
                <td className="num">{sharpe(r)}</td>
                <td className="num loss">{signedPct(r.max_drawdown)}</td>
                <td className="num">{r.trades ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
