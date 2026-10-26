import { useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { Banner, Card, Chip, DriverRow, Drivers, Empty, Flow, Headline, KeyFigure, Loading, PageHeader, Segmented, Stat } from '../components/Kit.jsx'
import { Ladder, OrderForm, PickChip, ResultsLink, RuleTags, howItWorks } from '../components/Parts.jsx'
import { longDate, num, pct, signedPct, tone, useApi } from '../lib.js'

const FILTERS = [
  { key: 'all', label: 'All ideas' },
  { key: 'picks', label: 'Model picks' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'breakout', label: 'Breakout' },
  { key: 'pullback', label: 'Pullback' },
]

export default function Ideas({ status, version, notify }) {
  const { data, error } = useApi('/ideas', version)
  const { data: backtest } = useApi('/backtest', 0)
  const [filter, setFilter] = useState('all')
  if (error) return <Banner kind="error">{error}</Banner>
  if (!data || !status) return <Loading what="Loading tonight's ideas" />

  const minEv = status.settings.min_expected_return
  const ideas = data.ideas.filter((i) => filter === 'all' || (filter === 'picks' ? i.pick : i.rules.includes(filter)))
  const picks = data.ideas.filter((i) => i.pick).length
  const atLatest = status.as_of === status.latest
  const nifty = status.nifty
  const regime = backtest?.levers?.regime

  return (
    <section className="page">
      <PageHeader kicker="Evening scan" title="Ideas" subtitle={`${data.ideas.length} ideas from the close on ${longDate(status.as_of)}`}
        capsules={[
          { text: 'Rule setups, scored by the model', icon: 'binoculars' },
          { text: 'Buys fill at the next open', icon: 'moon' },
        ]} />

      <div className="figures">
        <KeyFigure label="Ideas tonight" value={data.ideas.length} caption="from three rules" />
        <KeyFigure label="Model picks" value={picks} caption={`${signedPct(minEv)} or more expected`} />
        <KeyFigure label="NIFTY 50" value={nifty.close.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          caption={`${signedPct(nifty.change, 2)} today`} />
        <KeyFigure label="Breadth" value={pct(status.breadth, 0)} caption="above their 200-day average" />
      </div>

      {backtest && (
        <div className="intro-row">
          <Card title="How it works" icon="layers" href="#/about">
            <Flow steps={howItWorks(backtest.levers, minEv)} />
          </Card>
          <ResultsLink backtest={backtest} />
        </div>
      )}

      <div className="notes">
        {regime && !nifty.above_sma200 && (
          <Banner kind="warn" label="Market filter on">
            The NIFTY 50 closed under its 200-day average, so new buys are
            {regime === 'skip' ? ' skipped until it recovers.' : ' half size; the suggested shares below already allow for it.'}
          </Banner>
        )}
        {status.period !== 'test' && (
          <Banner kind="warn" label={status.period === 'train' ? 'A training-year date' : 'A calibration-year date'}>
            This date is inside the years the model {status.period === 'train' ? 'was trained on' : 'was checked and calibrated on'} (up to{' '}
            {status.period === 'train' ? status.model.train_end.slice(0, 4) : status.model.valid_end.slice(0, 4)}), so its
            chances here have already seen how these trades ended. Replay a date from 2023 onwards for an honest test.
          </Banner>
        )}
        <Banner label="How to read these">
          Setups the rules found at the close, each with the model's chance of winning: reaching its target before its stop, or, for an idea with no target, ending in profit by its time limit. A paper
          order placed now buys at the next trading day's open.
          {atLatest && ' This is the newest day in the data, so orders wait until newer prices are loaded (or replay an earlier date with the clock above).'}
        </Banner>
      </div>

      <Segmented label="Filter ideas" options={FILTERS} value={filter} onChange={setFilter} />

      {ideas.length === 0 ? (
        <Empty title="Nothing for this filter" icon="binoculars">
          Move the clock forward to see another evening, or browse all 50 stocks on the <a href="#/stocks">Stocks</a> page.
        </Empty>
      ) : (
        <div className="stack">
          {ideas.map((idea, i) => <IdeaCard key={idea.symbol} idea={idea} index={i} notify={notify} />)}
        </div>
      )}
    </section>
  )
}

function IdeaCard({ idea, index, notify }) {
  return (
    <Card className={`idea ${idea.pick ? 'pick' : ''}`} style={{ '--i': index }}>
      <div className="idea-head">
        <a className="idea-symbol" href={`#/stocks/${encodeURIComponent(idea.symbol)}`}>{idea.symbol}</a>
        <Chip tint="gray">{idea.sector}</Chip>
        <RuleTags rules={idea.rules} />
        {idea.pick && <PickChip />}
      </div>
      <p className="idea-reason"><span>{idea.name}.</span> {idea.reason}</p>

      <div className="idea-body">
        <div className="idea-odds">
          <Headline value={pct(idea.p_win, 0)} caption={idea.target_pct == null ? 'chance of ending in profit after costs' : 'chance of reaching the target first'} />
          <Drivers>
            <DriverRow name="Expected return" value={signedPct(idea.expected_return)} tone={tone(idea.expected_return)} />
            <DriverRow name="Trend score" value={`${num(idea.score)} of 10`} share={(idea.score ?? 0) / 10} />
          </Drivers>
        </div>
        <div className="idea-plan">
          <Ladder close={idea.close} stopPct={idea.stop_pct} targetPct={idea.target_pct} holdDays={idea.hold_days} />
          <div className="stats">
            <Stat label="Hold up to" value={`${idea.hold_days} days`} />
            <Stat label="RSI (14)" value={num(idea.rsi_14, 0)} />
            <Stat label="Volume vs usual" value={`${num(idea.relative_volume, 1)}×`} />
            <Stat label="Daily range" value={pct(idea.atr_pct)} />
          </div>
        </div>
      </div>

      <div className="idea-foot">
        <a className="app-lock" href="#/app/analyst">
          <Icon name="cpu" size={14} />Ask the AI analyst about {idea.symbol}<span className="app-tag">App</span>
        </a>
        <OrderForm symbol={idea.symbol} suggested={idea.suggested_qty} close={idea.close} onDone={notify} />
      </div>
    </Card>
  )
}
