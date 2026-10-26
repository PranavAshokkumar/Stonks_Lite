import { LineChart } from '../components/Charts.jsx'
import { Icon } from '../components/Icons.jsx'
import { Banner, Card, Empty, KeyFigure, Loading, PageHeader } from '../components/Kit.jsx'
import { AppHint } from '../components/Parts.jsx'
import { OUTCOME_TEXT, compactRupees, longDate, pct, post, price, rupees, shortDate, signedPct, tone, useApi } from '../lib.js'

export default function Portfolio({ status, version, notify, refresh }) {
  const { data: p, error } = useApi('/portfolio', version)
  if (error) return <Banner kind="error">{error}</Banner>
  if (!p) return <Loading what="Loading your paper account" />

  const act = async (path, message) => {
    try {
      await post(path)
      notify(message, 'ok')
      refresh()
    } catch (e) {
      notify(e.message, 'error')
    }
  }
  const atLatest = status && status.as_of === status.latest
  const pending = p.positions.some((x) => x.status === 'pending')

  return (
    <section className="page">
      <PageHeader kicker="Paper trading · never a real order" title="Paper account" subtitle={`Pretend money, real prices. Started with ${rupees(p.starting_cash)}${p.started_on ? ` on ${longDate(p.started_on)}` : ''}`}
        capsules={[
          { text: 'Paper only · never reaches an exchange', icon: 'check' },
          { text: 'Fills at the next open', icon: 'moon' },
        ]} />

      <div className="figures six">
        <KeyFigure label="Account value" value={compactRupees(p.value)} caption={rupees(p.value)} />
        <KeyFigure label="Profit or loss" value={compactRupees(p.pnl)} caption={`${signedPct(p.return, 2)} since the start`} tone={tone(p.pnl)} />
        <KeyFigure label="Available cash" value={compactRupees(p.cash)} caption={rupees(p.cash)} />
        <KeyFigure label="In stocks" value={compactRupees(p.invested)} caption={`${p.positions.filter((x) => x.status === 'open').length} holdings`} />
        <KeyFigure label="Closed trades" value={p.stats.closed} caption={`${p.stats.wins} profitable · ${rupees(p.stats.realised_pnl)}`} />
        <KeyFigure label="Idle cash earned" value={compactRupees(p.cash_earned)}
          caption={p.cash_sweep ? `${p.cash_sweep === 'nifty' ? 'NIFTY' : 'liquid fund'} sweep, not trade profit` : 'Sweep off: idle cash earns nothing'} />
      </div>

      {pending && (
        <div className="notes">
          <Banner label="Orders waiting">
            {atLatest
              ? 'Orders waiting for the next open will fill once newer prices are loaded (python -m backend.update_data, then restart the server).'
              : 'Orders waiting for the next open fill when you move the clock forward.'}
          </Banner>
        </div>
      )}

      {p.equity.length > 1 && (
        <Card title="Account value" icon="trend">
          <LineChart dates={p.equity.map((e) => e.date)} height={220} yFormat={(v) => compactRupees(v)}
            guides={[{ y: p.starting_cash, label: 'Start', color: 'var(--label-3)' }]}
            series={[{ key: 'value', label: 'Account value', values: p.equity.map((e) => e.value), color: p.pnl >= 0 ? 'var(--green)' : 'var(--red)', width: 2, area: true }]} />
        </Card>
      )}

      <Card title="Holdings and orders" icon="pie">
        {p.positions.length === 0 ? (
          <Empty title="Nothing held" icon="pie">
            Buy an idea on the <a href="#/ideas">Ideas</a> page, then move the clock forward to watch it fill at the next open and run
            until its target, its stop or its time limit.
          </Empty>
        ) : (
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr><th>Stock</th><th>Status</th><th className="num">Shares</th><th className="num">Bought at</th><th className="num">Now</th>
                  <th className="num">Stop</th><th className="num">Target</th><th className="num">Profit or loss</th><th className="num">Days left</th><th /></tr>
              </thead>
              <tbody>
                {p.positions.map((x) => (
                  <tr key={x.id}>
                    <td><a className="row-symbol" href={`#/stocks/${encodeURIComponent(x.symbol)}`}>{x.symbol}</a><span className="row-name">{x.name}</span></td>
                    <td>{x.status === 'pending' ? `Buys at next open (ordered ${shortDate(x.placed_on)})` : `Bought ${shortDate(x.entry_date)}`}</td>
                    <td className="num">{x.qty}</td>
                    <td className="num">{x.entry_price ? price(x.entry_price) : '–'}</td>
                    <td className="num">{price(x.last_price)}</td>
                    <td className="num loss">{x.stop_price ? price(x.stop_price) : signedPct(-x.stop_pct)}</td>
                    <td className="num gain">{x.target_price ? price(x.target_price) : x.target_pct == null ? 'None' : signedPct(x.target_pct)}</td>
                    <td className={`num ${tone(x.unrealised_pnl)}`}>
                      {x.status === 'open' ? <>{rupees(x.unrealised_pnl)} <small>{signedPct(x.unrealised_return)}</small></> : '–'}
                    </td>
                    <td className="num">{x.status === 'open' ? x.days_left : '–'}</td>
                    <td>
                      {x.status === 'pending'
                        ? <button type="button" className="button small" onClick={() => act(`/portfolio/${x.id}/close`, `Order for ${x.symbol} cancelled.`)}>Cancel order</button>
                        : <button type="button" className="button small" onClick={() => act(`/portfolio/${x.id}/close`, `Sold ${x.symbol} at today's close.`)}>Sell at close</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <AppHint from="autopilot">In the app, an optimiser sets target weights and a paper autopilot rebalances when holdings drift.</AppHint>

      {p.closed.length > 0 && (
        <Card title="Closed trades" icon="list">
          <div className="table-scroll">
            <table className="data">
              <thead>
                <tr><th>Stock</th><th>Bought</th><th>Sold</th><th>How it ended</th><th className="num">Shares</th>
                  <th className="num">Bought at</th><th className="num">Sold at</th><th className="num">Profit or loss</th><th className="num">Model's chance</th></tr>
              </thead>
              <tbody>
                {p.closed.map((x) => (
                  <tr key={x.id}>
                    <td><span className="row-symbol">{x.symbol}</span></td>
                    {x.status === 'cancelled' ? (
                      <><td colSpan="3" className="faint">Cancelled{x.note ? `: ${x.note}` : ''}</td><td /><td /><td /><td /><td /></>
                    ) : (
                      <>
                        <td>{shortDate(x.entry_date)}</td>
                        <td>{shortDate(x.exit_date)} <span className="faint">({x.days_held} days)</span></td>
                        <td className={`outcome ${x.exit_reason}`}>{OUTCOME_TEXT[x.exit_reason] || x.exit_reason}</td>
                        <td className="num">{x.qty}</td>
                        <td className="num">{price(x.entry_price)}</td>
                        <td className="num">{price(x.exit_price)}</td>
                        <td className={`num ${tone(x.pnl)}`}>{rupees(x.pnl)} <small>{signedPct(x.net_return)}</small></td>
                        <td className="num">{x.p_win ? pct(x.p_win, 0) : '–'}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="reset-row">
        <button type="button" className="button danger" onClick={() => act('/portfolio/reset', 'Paper account reset to its starting cash.')}>
          <Icon name="reset" size={14} /> Reset the paper account
        </button>
        <span className="muted">Clears every trade and order and restores {rupees(p.starting_cash)} in cash.</span>
      </div>
    </section>
  )
}
