import { useMemo, useState } from 'react'
import { Icon } from '../components/Icons.jsx'
import { Banner, Empty, Loading, PageHeader } from '../components/Kit.jsx'
import { AppHint, Band, RuleTags, ScoreMeter } from '../components/Parts.jsx'
import { longDate, num, price, signedPct, tone, useApi } from '../lib.js'

const COLUMNS = [
  { key: 'symbol', label: 'Stock', text: true },
  { key: 'close', label: 'Price' },
  { key: 'change', label: 'Day' },
  { key: 'ret_21', label: '1 month' },
  { key: 'ret_252', label: '1 year' },
  { key: 'rsi_14', label: 'RSI' },
  { key: 'score', label: 'Trend score' },
]

export default function Stocks({ status, version }) {
  const { data, error } = useApi('/stocks', version)
  const [query, setQuery] = useState('')
  const [sector, setSector] = useState('')
  const [sort, setSort] = useState({ key: 'score', down: true })

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    const out = data.stocks.filter((s) => (!sector || s.sector === sector)
      && (!q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)))
    const value = (s) => s[sort.key] ?? -Infinity
    return out.sort((a, b) => {
      const order = typeof value(a) === 'string' ? value(a).localeCompare(value(b)) : value(a) - value(b)
      return sort.down ? -order : order
    })
  }, [data, query, sector, sort])

  if (error) return <Banner kind="error">{error}</Banner>
  if (!data) return <Loading what="Loading the 50 stocks" />
  const sectors = [...new Set(data.stocks.map((s) => s.sector))].sort()
  const bands = { bullish: 0, neutral: 0, bearish: 0 }
  data.stocks.forEach((s) => s.band && (bands[s.band] += 1))

  const head = (column) => {
    const active = sort.key === column.key
    return (
      <th key={column.key} className={column.text ? '' : 'num'} aria-sort={active ? (sort.down ? 'descending' : 'ascending') : 'none'}>
        <button type="button" onClick={() => setSort({ key: column.key, down: active ? !sort.down : !column.text })}>
          {column.label}{active ? (sort.down ? ' ↓' : ' ↑') : ''}
        </button>
      </th>
    )
  }

  return (
    <section className="page">
      <PageHeader kicker="The universe" title="Stocks" subtitle={`50 NSE large caps after the close on ${longDate(status?.as_of)}`}
        capsules={[
          { text: `${bands.bullish} bullish`, icon: 'pulse', tint: 'green' },
          { text: `${bands.neutral} neutral`, icon: 'pulse' },
          { text: `${bands.bearish} bearish`, icon: 'pulse', tint: 'red' },
        ]} />

      <div className="filter-bar">
        <label className="search">
          <Icon name="search" size={14} />
          <input type="search" placeholder="Search by name or symbol" value={query} onChange={(e) => setQuery(e.target.value)}
            aria-label="Search stocks" />
        </label>
        <select className="select" value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector">
          <option value="">All sectors</option>
          {sectors.map((s) => <option key={s}>{s}</option>)}
        </select>
        <span className="muted">{rows.length} shown · the trend score adds five plain measures, no training (hover a bar)</span>
      </div>

      {rows.length === 0 ? (
        <div className="card search-miss">
          <Empty title={query.trim() ? `“${query.trim()}” isn't one of the 50` : 'No stocks match'} icon="search">
            Lite follows 50 large NSE companies.
          </Empty>
          <AppHint from="search">Stonks for Mac and Android covers every NSE stock, with live quotes.</AppHint>
        </div>
      ) : (
        <div className="card table-card">
          <table className="data stocks-table">
            <thead>
              <tr>
                {COLUMNS.map(head)}
                <th>Band</th>
                <th>Rule today</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.symbol} onClick={() => { window.location.hash = `#/stocks/${encodeURIComponent(s.symbol)}` }}>
                  <td>
                    <a className="row-symbol" href={`#/stocks/${encodeURIComponent(s.symbol)}`}>{s.symbol}</a>
                    <span className="row-name">{s.name}</span>
                  </td>
                  <td className="num">{price(s.close)}</td>
                  <td className={`num ${tone(s.change)}`}>{signedPct(s.change)}</td>
                  <td className={`num ${tone(s.ret_21)}`}>{signedPct(s.ret_21)}</td>
                  <td className={`num ${tone(s.ret_252)}`}>{signedPct(s.ret_252, 0)}</td>
                  <td className="num">{num(s.rsi_14, 0)}</td>
                  <td className="num"><ScoreMeter score={s.score} parts={s.parts} band={s.band} /></td>
                  <td><Band band={s.band} /></td>
                  <td>{s.rules.length ? <RuleTags rules={s.rules} /> : <span className="faint">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
