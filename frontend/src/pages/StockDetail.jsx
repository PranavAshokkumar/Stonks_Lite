import { useState } from 'react'
import { LineChart } from '../components/Charts.jsx'
import { Icon } from '../components/Icons.jsx'
import { Banner, Card, Chip, DriverRow, Drivers, Headline, Loading, Segmented } from '../components/Kit.jsx'
import { AppHint, Band, Ladder, OrderForm, RuleTags, SCORE_PARTS } from '../components/Parts.jsx'
import { OUTCOME_TEXT, RULE_TEXT, compactNumber, longDate, num, pct, price, shortDate, signedPct, tone, useApi } from '../lib.js'

const RANGES = [
  { key: 126, label: '6M' },
  { key: 252, label: '1Y' },
  { key: 756, label: '3Y' },
  { key: 1260, label: '5Y' },
]
const KINDS = [
  { key: 'line', label: 'Line', icon: 'line' },
  { key: 'candles', label: 'Candles', icon: 'candles' },
]

export default function StockDetail({ symbol, version, notify }) {
  const [days, setDays] = useState(126)
  const [kind, setKind] = useState('candles')
  const { data, error } = useApi(`/stocks/${encodeURIComponent(symbol)}?days=${days}`, version)
  if (error) return <Banner kind="error">{error}</Banner>
  if (!data) return <Loading what={`Loading ${symbol}`} />

  const s = data.series
  const dates = s.map((r) => r.date)
  const index = Object.fromEntries(dates.map((d, i) => [d, i]))
  const latest = data.latest
  const last = s[s.length - 1]
  const change = s.length > 1 ? last.close / s[s.length - 2].close - 1 : null
  const markers = data.events.map((e) => ({
    index: index[e.date] ?? -1,
    value: s[index[e.date]]?.close,
    kind: e.event === 'start' ? 'up' : 'down',
    label: `Trend ${e.event === 'start' ? 'start' : 'end'} on ${shortDate(e.date)} (score ${e.score})`,
  }))
  const idea = data.idea_today
  const barriers = idea ? { stop: idea.stop_pct, target: idea.target_pct } : { stop: data.default_barriers.stop_pct, target: data.default_barriers.target_pct }
  const record = data.track_record
  const candles = kind === 'candles'

  const readout = (i) => {
    const r = s[i]
    const move = i > 0 ? r.close / s[i - 1].close - 1 : null
    return (
      <>
        <span className="readout-date">{shortDate(r.date)}</span>
        {[['O', r.open], ['H', r.high], ['L', r.low]].map(([k, v]) => <span key={k}><i>{k}:</i> {num(v, 2)}</span>)}
        <span><i>C:</i> <b className={tone(move)}>{num(r.close, 2)}</b></span>
        <b className={tone(move)}>{signedPct(move, 2)}</b>
        <span><i>VOL</i> {compactNumber(r.volume)}</span>
        <span><i>RSI</i> {num(r.rsi_14, 1)}</span>
      </>
    )
  }

  return (
    <section className="page">
      <a className="back" href="#/stocks"><Icon name="back" size={13} /> All stocks</a>
      <header className="quote-head">
        <div>
          <h1 className="ticker">{data.symbol} <span>{data.name}</span></h1>
          <p className="muted">NSE · INR · {data.sector}</p>
        </div>
        <div className="quote">
          <div className="quote-line">
            <span className="quote-price">{price(latest.close)}</span>
            <span className={`quote-change ${tone(change)}`}>{signedPct(change, 2)}</span>
          </div>
          <div className="chips">
            <Chip tint="orange">Closing price · {longDate(data.as_of)}</Chip>
            <Band band={latest.band} />
          </div>
        </div>
      </header>

      <div className="chart-controls">
        <Segmented label="Chart range" options={RANGES} value={days} onChange={setDays} />
        <Segmented label="Chart type" options={KINDS} value={kind} onChange={setKind} />
      </div>
      <LineChart dates={dates} height={400} markers={markers} readout={readout} volume={s.map((r) => r.volume)}
        candles={candles ? s : undefined} yFormat={(v) => `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`}
        series={[
          ...(candles ? [] : [{ key: 'close', label: 'Close', values: s.map((r) => r.close), color: 'var(--label)', width: 1.6, area: true }]),
          { key: 'sma50', label: '50-day average', values: s.map((r) => r.sma50), color: 'var(--blue)', width: 1.2, dash: '4 3' },
          { key: 'sma200', label: '200-day average', values: s.map((r) => r.sma200), color: 'var(--orange)', width: 1.2 },
        ]} />
      <p className="chart-key">
        Daily bars · {s.length} sessions
        <span><i className="key-line blue" /> 50-day average</span>
        <span><i className="key-line orange" /> 200-day average</span>
        <span><i className="key-tri up" /> Trend start (score reached 7)</span>
        <span><i className="key-tri down" /> Trend end (score fell under 5)</span>
      </p>
      <AppHint from="chart">Lite shows daily closes. The app has live quotes and minute bars for {data.symbol}.</AppHint>

      <dl className="quote-stats">
        {[
          ['Open', num(last.open, 2)], ['High', num(last.high, 2)], ['Low', num(last.low, 2)], ['Volume', compactNumber(last.volume)],
          ['1M return', signedPct(latest.ret_21), tone(latest.ret_21)], ['1Y return', signedPct(latest.ret_252), tone(latest.ret_252)],
          ['From 200D avg', signedPct(latest.dist_sma200), tone(latest.dist_sma200)], ['From 52W high', signedPct(latest.dist_52w_high)],
          ['RSI (14)', num(latest.rsi_14, 0)], ['ATR', pct(latest.atr_pct)], ['Vol vs usual', `${num(latest.relative_volume, 1)}×`],
          ['Trend score', `${num(latest.score)} / 10`],
        ].map(([label, value, t = '']) => (
          <div key={label}><dt>{label}</dt><dd className={t}>{value}</dd></div>
        ))}
      </dl>

      <div className="tiles">
        <Card title={idea ? 'Tonight’s idea' : 'Order ticket'} icon="send">
          {idea ? (
            <>
              <Headline value={pct(idea.p_win, 0)} caption={`${idea.target_pct == null ? 'chance of ending in profit' : 'chance of reaching the target first'}; expected ${signedPct(idea.expected_return)} per trade`} />
              <RuleTags rules={idea.rules} />
              <p className="card-text">{idea.reason}</p>
            </>
          ) : (
            <p className="card-text">No rule fired on this stock tonight. You can still buy it on paper with the standard stop and target.</p>
          )}
          <Ladder close={latest.close} stopPct={barriers.stop} targetPct={barriers.target} holdDays={idea?.hold_days} />
          <OrderForm symbol={data.symbol} close={latest.close} onDone={notify}
            suggested={idea?.suggested_qty || Math.max(1, Math.floor(100000 / latest.close))} />
        </Card>

        <Card title="Trend score" icon="pulse">
          <Headline value={num(latest.score)} caption="of 10: five plain measures, fixed weights, no training"
            tone={{ bullish: 'gain', bearish: 'loss' }[latest.band] || ''} />
          <Drivers>
            {SCORE_PARTS.map((p) => (
              <DriverRow key={p.key} name={`${p.label} (${p.weight * 100}%)`} value={num((latest.parts[p.key] ?? 0) * 10, 1)}
                share={latest.parts[p.key] ?? 0} />
            ))}
          </Drivers>
        </Card>

        <Card title="Track record" icon="list">
          <Headline value={record.ideas ? pct(record.win_rate) : '–'}
            caption={record.ideas ? `of ${record.ideas} finished ideas since 2006 won` : 'No finished ideas yet'} />
          <Drivers>
            <DriverRow name="Won (target, or a profit with no target)" value={record.ideas ? pct(record.win_rate) : '–'} share={record.win_rate ?? 0} />
            <DriverRow name="Average trade, after costs" value={signedPct(record.avg_return, 2)} tone={tone(record.avg_return)} />
          </Drivers>
        </Card>
      </div>

      <div className="tiles two">
        <Card title="Trend score over time" icon="pulse">
          <LineChart dates={dates} height={150} compact yDomain={[0, 10]} yFormat={(v) => v.toFixed(0)}
            guides={[{ y: 7, label: 'Bullish from 7', color: 'var(--green)' }, { y: 4, label: 'Bearish under 4', color: 'var(--red)' }]}
            series={[{ key: 'score', label: 'Trend score', values: s.map((r) => r.score), color: 'var(--label)', width: 1.5 }]} />
        </Card>
        <Card title="RSI (14 days)" icon="pulse">
          <LineChart dates={dates} height={150} compact yDomain={[0, 100]} yFormat={(v) => v.toFixed(0)}
            guides={[{ y: 70, label: 'Overbought 70', color: 'var(--label-3)' }, { y: 30, label: 'Oversold 30', color: 'var(--label-3)' }]}
            series={[{ key: 'rsi', label: 'RSI', values: s.map((r) => r.rsi_14), color: 'var(--label-2)', width: 1.3 }]} />
        </Card>
      </div>

      {data.past_ideas.length > 0 && (
        <Card title={`Past ideas on ${data.symbol}`} icon="list" aside="Each run of a rule is shown once, from its first day">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr><th>Signal</th><th>Rule</th><th className="num">Chance</th><th className="num">Expected</th><th>Outcome</th><th className="num">Return</th></tr>
              </thead>
              <tbody>
                {data.past_ideas.map((p) => (
                  <tr key={p.date + p.rule}>
                    <td>{shortDate(p.date)}{p.period !== 'test' && <span className="faint" title="The model trained or calibrated on this year"> *</span>}</td>
                    <td>{p.rule.split(' + ').map((r) => RULE_TEXT[r]).join(' + ')}</td>
                    <td className="num">{pct(p.p_win, 0)}</td>
                    <td className={`num ${tone(p.expected_return)}`}>{signedPct(p.expected_return)}</td>
                    <td className={`outcome ${p.outcome}`}>{p.date === data.as_of ? 'New today' : OUTCOME_TEXT[p.outcome] || p.outcome}</td>
                    <td className={`num ${tone(p.net_return)}`}>{p.net_return === null ? '–' : signedPct(p.net_return)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="footnote">* Before 2023: the model learnt from these years, so its chance there is not a fair test.</p>
        </Card>
      )}
    </section>
  )
}
