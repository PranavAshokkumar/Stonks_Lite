import { Columns, UnitChart } from '../components/Charts.jsx'
import { Banner, Card, DriverRow, Drivers, Flow, Headline, Loading, PageHeader } from '../components/Kit.jsx'
import { ResultsLink, howItWorks } from '../components/Parts.jsx'
import { RULE_TEXT, longDate, num, pct, signedPct, tone, useApi } from '../lib.js'

const year = (iso) => iso.slice(0, 4)
const aucShare = (v) => Math.min(Math.max((v - 0.5) / 0.1, 0), 1)     // 0.5 (guessing) to 0.6 fills the bar

// settings.rule_exits, rule -> [target ATRs or null, stop ATRs, days], as one sentence per set of exits.
function exitsText(ruleExits) {
  const groups = {}
  for (const [rule, exit] of Object.entries(ruleExits)) (groups[exit] ||= { exit, rules: [] }).rules.push(RULE_TEXT[rule] || rule)
  return Object.values(groups).map(({ exit: [target, stop, days], rules }) =>
    `${rules.join(' and ')}: stop ${stop}× ATR below, ${target == null ? 'no target' : `target ${target}× above`}, sell after ${days} days.`).join(' ')
}

export default function Model({ version }) {
  const { data: m, error } = useApi('/model', version)
  const { data: backtest } = useApi('/backtest', 0)
  if (error) return <Banner kind="error">{error}</Banner>
  if (!m) return <Loading what="Loading the model report" />

  const d = m.dataset
  const t = m.test
  const s = m.settings
  const q = t.quintiles
  const chosen = m.comparison.find((c) => c.name === m.chosen)
  const best = q[q.length - 1]
  const outcomes = `${(d.outcomes.target || 0).toLocaleString('en-IN')} targets, ${(d.outcomes.stop || 0).toLocaleString('en-IN')} stops, ${(d.outcomes.time || 0).toLocaleString('en-IN')} timed out`

  return (
    <section className="page">
      <PageHeader kicker="How it works" title="Model" subtitle={`${m.chosen}: the chance a rule idea wins, reaching its target before its stop (or, with no target, ending in profit)`}
        capsules={[
          { text: 'Model trained', icon: 'check' },
          { text: `Tested once on ${year(d.test.from)}–${year(d.test.to)}`, icon: 'flask', tint: 'orange' },
          { text: 'Paper only', icon: 'moon' },
        ]} />

      {backtest && (
        <div className="intro-row">
          <Card title="How a trade gets made" icon="layers">
            <Flow steps={howItWorks(backtest.levers, s.min_expected_return)} />
          </Card>
          <ResultsLink backtest={backtest} />
        </div>
      )}

      <div className="tiles">
        <Card title="Ranking" icon="target">
          <Headline value={`AUC ${num(t.roc_auc, 3)}`} caption={`on ${d.test.count.toLocaleString('en-IN')} test ideas it never saw · 0.5 is guessing`} />
          <Drivers>
            <DriverRow name={`Walk-forward, 2014–21 (± ${num(chosen.cv_std, 3)})`} value={num(chosen.cv_auc, 3)} share={aucShare(chosen.cv_auc)} />
            <DriverRow name="Check year, 2022" value={num(chosen.valid_auc, 3)} share={aucShare(chosen.valid_auc)} />
            <DriverRow name={`Test, ${year(d.test.from)}–${year(d.test.to)}`} value={num(chosen.test_auc, 3)} share={aucShare(chosen.test_auc)} />
          </Drivers>
        </Card>
        <Card title="Picks" icon="star">
          <Headline value={signedPct(t.picks.avg_return, 2)} tone={tone(t.picks.avg_return)}
            caption={`average model pick after costs, against ${signedPct(t.skipped.avg_return, 2)} for the ideas it skipped`} />
          <Drivers title="Won">
            <DriverRow name={`Model picks (${t.picks.count.toLocaleString('en-IN')})`} value={pct(t.picks.win_rate)} share={t.picks.win_rate / 0.4} />
            <DriverRow name={`Skipped (${t.skipped.count.toLocaleString('en-IN')})`} value={pct(t.skipped.win_rate)} share={t.skipped.win_rate / 0.4} />
            <DriverRow name="Most confident fifth" value={pct(best.win_rate)} share={best.win_rate / 0.4} />
          </Drivers>
        </Card>
        <Card title="Calibration" icon="check">
          <Headline value={`Brier ${num(t.brier, 4)}`} caption={`against ${num(t.brier_base_rate, 4)} for always guessing the average`} />
          <Drivers>
            <DriverRow name="Average win rate, test years" value={pct(t.base_rate)} share={t.base_rate / 0.4} />
            <DriverRow name="Out-of-sample predictions used" value={m.calibration_set.toLocaleString('en-IN')} />
            <DriverRow name="Model pick needs, after costs" value={`${signedPct(s.min_expected_return)} expected`} />
          </Drivers>
        </Card>
      </div>

      <div className="tiles two">
        <Card title="Do higher chances mean more wins?" icon="pulse">
          <p className="card-text">Test ideas in five equal groups by the model's chance; below each bar, the average return per trade after costs.</p>
          <Columns format={(v) => pct(v)} reference={t.base_rate} referenceLabel={`Average ${pct(t.base_rate)}`}
            items={q.map((g, k) => ({ label: g.group, value: g.win_rate, note: `${signedPct(g.avg_return, 2)} avg`,
              color: `color-mix(in oklab, var(--label) ${30 + (55 * k) / (q.length - 1)}%, transparent)` }))} />
        </Card>
        <Card title="Does 25% really mean 25%?" icon="target">
          <p className="card-text">Each dot is a group of test ideas: the chance the model gave against how often they won.</p>
          <UnitChart max={0.4} xLabel="Chance the model gave" yLabel="How often they won" diagonalLabel="Perfectly honest" height={280}
            series={[{ label: 'Test ideas', color: 'var(--yellow)', dots: true,
              points: t.calibration.map((c) => ({ x: c.predicted, y: c.actual, title: `Promised ${pct(c.predicted)}, won ${pct(c.actual)} (${c.count} ideas)` })) }]} />
        </Card>
      </div>

      <Card title="Three models, compared" icon="cpu" aside="The choice uses the walk-forward column only">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr><th>Model</th><th className="num">Walk-forward AUC (2014–21)</th><th className="num">2022 AUC</th><th className="num">Test AUC</th><th /></tr>
            </thead>
            <tbody>
              {m.comparison.map((c) => (
                <tr key={c.name} className={c.name === m.chosen ? 'chosen' : ''}>
                  <td>{c.name}</td>
                  <td className="num">{num(c.cv_auc, 3)} <span className="faint">± {num(c.cv_std, 3)}</span></td>
                  <td className="num">{num(c.valid_auc, 3)}</td>
                  <td className="num">{num(c.test_auc, 3)}</td>
                  <td>{c.name === m.chosen && <span className="chosen-mark">Chosen</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="footnote">The test column is shown for transparency and played no part in the choice. The ± is the spread across years.</p>
      </Card>

      <div className="tiles two">
        <Card title="What the model looks at" icon="layers">
          <Drivers title="Drop in test AUC when one input is shuffled">
            {m.importance.slice(0, 10).map((f) => (
              <DriverRow key={f.label} name={f.label} value={f.value.toFixed(3)} share={Math.max(0, f.value) / Math.max(m.importance[0].value, 1e-9)} />
            ))}
          </Drivers>
        </Card>
        <Card title="ROC curve" icon="trend">
          <UnitChart xLabel="False positive rate" yLabel="True positive rate" diagonalLabel="Guessing" height={300}
            series={[{ label: m.chosen, color: 'var(--label)', points: t.roc_curve.map((p) => ({ x: p.fpr, y: p.tpr })) }]} />
        </Card>
      </div>

      <Card title="How it was built" icon="list">
        <ol className="steps">
          <li><b>Collect ideas.</b> The three rules ran every evening from {year(d.first_idea)} to {year(d.last_idea)} across {d.stocks} stocks: {d.ideas.toLocaleString('en-IN')} trades.</li>
          <li><b>Label each one.</b> {s.rule_exits
            ? <>Buy at the next open. {exitsText(s.rule_exits)} A trade wins if it reaches its target first or, with no target, ends in profit after costs. In all: {outcomes}.</>
            : <>Buy at the next open, stop {s.stop_atr}× ATR below, target {s.target_atr}× above, sell after {s.hold_days} days: {outcomes}.</>}</li>
          <li><b>Split by time.</b> Train {year(d.train.from)}–{year(d.train.to)} ({d.train.count.toLocaleString('en-IN')}), check {year(d.valid.from)} ({d.valid.count.toLocaleString('en-IN')}), test {year(d.test.from)}–{year(d.test.to)} ({d.test.count.toLocaleString('en-IN')}). Never random: that would learn from the future.</li>
          <li><b>Pick a model.</b> Three compared by walk-forward cross-validation over 2014–2021; {m.chosen} scored best.</li>
          <li><b>Calibrate.</b> Platt scaling on {m.calibration_set.toLocaleString('en-IN')} out-of-sample predictions, so 25% means about a quarter win.</li>
          <li><b>Test once.</b> Only then the {year(d.test.from)}–{year(d.test.to)} data: ROC-AUC {num(t.roc_auc, 3)}.</li>
        </ol>
      </Card>

      <div className="notes">
        <Banner label="What to make of it">
          A test ROC-AUC of {num(t.roc_auc, 2)} is a small edge, typical for daily stock data. The probabilities are
          honest and the picks beat the ideas skipped, but it is a research result, not trading advice. Trained {m.trained_at ? `on ${m.trained_at}` : ''} with
          data up to {longDate(m.data_until)}.
        </Banner>
      </div>
    </section>
  )
}
