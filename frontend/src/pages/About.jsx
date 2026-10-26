import { Card, PageHeader } from '../components/Kit.jsx'
import { signedPct, useApi } from '../lib.js'

const STEPS = [
  ['Prices', 'Daily open, high, low, close and volume for 50 large companies and the NIFTY 50 index from 2005 to 2026, adjusted for splits and bonus issues so they never show a fake crash.'],
  ['Indicators', 'From the prices: returns over a week to a year, moving averages, RSI, the average daily range (ATR) and volume trends. Each day uses only that day and earlier days.'],
  ['Three rules propose trades', 'Momentum: among the top 10% of stocks by 12-month return. Breakout: a 55-day high on at least 1.5× the usual volume. Pullback: a sharp two-day dip (2-day RSI under 10) in a stock above its 200-day average.'],
  ['Each trade gets its exits', 'Buy at the next open. Pullback trades sell at the target (4× the daily range above), at the stop (2× below), or after 20 trading days, whichever comes first. Momentum and breakout trades have no target: they sell at the stop (3× below) or after 60 trading days.'],
  ['A model scores the chance', 'A classifier learns from past ideas which ones tended to win (reach the target, or end in profit with no target). Its probability is calibrated so it reads at face value, then turned into an expected return after costs.'],
  ['You test it on paper', 'Paper orders follow exactly the same rules. The clock at the top replays any past evening, so you can place trades in 2024 and watch them play out day by day.'],
]

const WORDS = [
  ['Trend score', 'A 0–10 summary of five measures (trend, momentum, relative strength, nearness to the 52-week high, volume). Fixed weights, no training. 7 or more is bullish.'],
  ['Trend start and end', 'A trend starts when the score reaches 7 and ends when it falls under 5. The gap keeps a stock from flipping in and out.'],
  ['Chance', "The model's calibrated probability that a trade wins: reaches its target before its stop, or ends in profit if it has no target."],
  ['Expected return', 'What the trade makes on average if the chance is right, after costs of 0.15% each way. A model pick needs at least +0.5%.'],
  ['RSI', 'Relative Strength Index, 0–100: how much of the recent movement was up. Above 70 is often called overbought, under 30 oversold.'],
  ['ATR', "Average True Range: a stock's typical daily movement. Stops and targets are set in ATRs so calm and jumpy stocks get fair room."],
  ['ROC-AUC', 'How well the model ranks winners above losers: 0.5 is guessing, 1.0 is perfect.'],
]

// The four profit levers, with the test-year numbers before and after them (from /api/backtest).
function Improvements() {
  const { data: b } = useApi('/backtest', 0)
  const result = (rows, name) => rows?.find((r) => r.name === name)
  const before = result(b?.before?.results, 'Model picks')
  const after = result(b?.results, 'Model picks')
  const nifty = result(b?.results, 'NIFTY 50')
  return (
    <Card title="How the results got better" icon="trend" href="#/backtest">
      {before && after && nifty && (
        <p className="card-text">
          With its first settings, the model's picks made {signedPct(before.cagr)} a year on the test years, while simply holding the
          NIFTY 50 made {signedPct(nifty.cagr)}. Four changes, chosen on 2006–2021 only, took that to <b>{signedPct(after.cagr)} a year</b>:
        </p>
      )}
      <ul className="plain-list">
        <li><b>Let winners run.</b> Momentum and breakout trades lost their profit target and got a wider stop and more time, so a
          strong trend is no longer sold early. Pullback trades kept their old exits.</li>
        <li><b>Let the model choose.</b> Only ideas the model expects to make +0.5% or more after costs are taken, best first.</li>
        <li><b>Step back in falling markets.</b> New buys are half size while the NIFTY 50 is under its 200-day average.</li>
        <li><b>Leave idle cash alone.</b> Putting it in a liquid fund or the index was tried and didn't clear the bar set in advance.</li>
      </ul>
      <p className="footnote">
        Every setting was picked on the training years and then run once on 2023–2026. Those test years had been looked at
        before, and the 50 stocks are today's survivors, which flatters long holds most. The Backtest page has every setting tried.
      </p>
    </Card>
  )
}

export default function About() {
  return (
    <section className="page">
      <PageHeader kicker="Guide" title="How it works" subtitle="What happens underneath, in plain words"
        capsules={[{ text: 'A smaller Stonks: 50 stocks, daily bars, one model', icon: 'info' }]} />

      <Card title="From prices to a paper trade" icon="layers">
        <ol className="steps">
          {STEPS.map(([title, text]) => <li key={title}><b>{title}.</b> {text}</li>)}
        </ol>
      </Card>

      <Improvements />

      <div className="tiles two">
        <Card title="Words used in the app" icon="list">
          <dl className="glossary">
            {WORDS.map(([term, text]) => <div key={term}><dt>{term}</dt><dd>{text}</dd></div>)}
          </dl>
        </Card>
        <Card title="What this version leaves out" icon="cpu">
          <p className="card-text">The full Stonks app (TARGET20, for macOS) does much more. To keep the core idea clear, Lite drops:</p>
          <ul className="plain-list">
            <li>The reinforcement-learning agents, the portfolio optimisers and the futures and options desk.</li>
            <li>The live broker connection and minute bars; here everything runs on daily closes.</li>
            <li>News sentiment, company financial statements and market-cap tiers.</li>
            <li>The heavier statistical checks (combinatorial cross-validation, deflated Sharpe); a time split and walk-forward validation stand in for them.</li>
          </ul>
          <p className="footnote">
            One known bias remains: the 50 stocks are today's large companies, so the history leaves out companies that shrank or failed.
            That flatters every backtest a little. Nothing here is investment advice, and no real order is ever placed.
          </p>
        </Card>
      </div>
    </section>
  )
}
