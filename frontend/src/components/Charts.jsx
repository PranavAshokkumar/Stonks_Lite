// Small SVG chart components, written by hand so there is no chart library to install or explain.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { shortDate } from '../lib.js'

// The width of a container, kept up to date as the window resizes.
function useWidth(fallback = 640) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    setWidth(el.clientWidth || fallback)
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(260, entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [fallback])
  return [ref, width]
}

// Round, readable tick values between lo and hi.
function niceTicks(lo, hi, count = 4) {
  if (!(hi > lo)) return [lo]
  const raw = (hi - lo) / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= raw) || raw
  const ticks = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toFixed(10))
  return ticks
}

const finite = (v) => typeof v === 'number' && Number.isFinite(v)

// A line chart over dates. `series` = [{key, label, values, color, width, dash, area}], one value per date.
// `area` shades the space under that line. `candles` ([{open, high, low, close}]) draws price bars instead of
// a close line, `volume` adds a strip of volume bars underneath, and `readout(index)` replaces the floating
// tooltip with a fixed strip above the chart describing the hovered (or the last) day.
// `bands` ([{from, to, label, tone}], indexes into `dates`) shade stretches of time, down through the strip; `strip`
// ({label, values in 0..1, ticks}) draws a share (say, how much of an account was invested) under the chart, with
// `ticks[i]` small red marks for events on that date (say, positions sold at their stop).
export function LineChart({ dates, series, height = 280, yFormat = (v) => v.toFixed(0), markers = [], guides = [],
  yDomain, legend = false, compact = false, candles, volume, readout, bands = [], strip }) {
  const [ref, width] = useWidth()
  const gradient = useId()
  const [hidden, setHidden] = useState(() => new Set())
  const [hover, setHover] = useState(null)
  const shown = series.filter((s) => !hidden.has(s.key))
  const volH = volume ? 48 : strip ? 78 : 0
  const m = { top: 10, right: compact ? 44 : 64, bottom: (compact ? 6 : 26) + volH, left: 4 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom

  const [lo, hi] = useMemo(() => {
    if (yDomain) return yDomain
    const all = shown.flatMap((s) => s.values.filter(finite)).concat(guides.map((g) => g.y))
      .concat(candles ? candles.flatMap((c) => [c.high, c.low]).filter(finite) : [])
    if (!all.length) return [0, 1]
    let a = Math.min(...all)
    let b = Math.max(...all)
    const pad = (b - a || Math.abs(b) || 1) * 0.06
    return [a - pad, b + pad]
  }, [shown, guides, yDomain, candles])

  const n = dates.length
  const x = (i) => m.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v) => m.top + (1 - (v - lo) / (hi - lo || 1)) * innerH

  // Unbroken runs of finite values, as "x,y" points.
  const runs = (values) => {
    const out = []
    let run = null
    values.forEach((v, i) => {
      if (!finite(v)) {
        run = null
        return
      }
      if (!run) out.push((run = []))
      run.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    })
    return out
  }
  const path = (values) => runs(values).map((r) => `M${r.join('L')}`).join('')
  const bottom = (m.top + innerH).toFixed(1)
  const area = (values) => runs(values).map((r) => `M${r[0].split(',')[0]},${bottom}L${r.join('L')}L${r[r.length - 1].split(',')[0]},${bottom}Z`).join('')

  const barW = Math.max(1, Math.min(9, (innerW / Math.max(n, 1)) * 0.62))
  const volMax = volume ? Math.max(...volume.filter(finite), 1) : 1
  const volBase = m.top + innerH + volH - 4
  const stripTop = m.top + innerH + 26
  const stripY = (v) => volBase - v * (volBase - stripTop)
  const stripPath = strip && `M${x(0)},${volBase}L${strip.values.map((v, i) => `${x(i).toFixed(1)},${stripY(v ?? 0).toFixed(1)}`).join('L')}L${x(n - 1)},${volBase}Z`

  const yTicks = niceTicks(lo, hi, compact ? 2 : 4)
  const xTicks = n > 1 ? [...new Set(Array.from({ length: 5 }, (_, k) => Math.round((k / 4) * (n - 1))))] : [0]

  const onMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const i = Math.round(((event.clientX - box.left - m.left) / innerW) * (n - 1))
    setHover(Math.min(n - 1, Math.max(0, i)))
  }

  const toggle = (key) =>
    setHidden((h) => {
      const next = new Set(h)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  return (
    <div className="chart" ref={ref}>
      {readout && <div className="readout">{readout(hover ?? n - 1)}</div>}
      {legend && (
        <div className="legend" role="group" aria-label="Show or hide lines">
          {series.map((s) => (
            <button key={s.key} type="button" className={hidden.has(s.key) ? 'off' : ''} aria-pressed={!hidden.has(s.key)}
              onClick={() => toggle(s.key)}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label}
            </button>
          ))}
        </div>
      )}
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img"
        aria-label={series.map((s) => s.label).join(', ')}>
        <defs>
          {shown.filter((s) => s.area).map((s) => (
            <linearGradient key={s.key} id={`${gradient}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: s.color, stopOpacity: 0.14 }} />
              <stop offset="1" style={{ stopColor: s.color, stopOpacity: 0 }} />
            </linearGradient>
          ))}
        </defs>
        {bands.map((b) => (
          <g key={`${b.from}-${b.to}`} className={`band ${b.tone || ''}`}>
            <rect x={x(b.from)} width={Math.max(2, x(b.to) - x(b.from))} y={m.top} height={innerH + volH} />
            {b.label && <text x={x(b.from) + 6} y={m.top + 14}>{b.label}</text>}
          </g>
        ))}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + innerW} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={width - m.right + 8} y={y(t) + 4} className="tick">{yFormat(t)}</text>
          </g>
        ))}
        {!compact && xTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 6} className="tick" textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>
            {shortDate(dates[i])}
          </text>
        ))}
        {guides.map((g) => (
          <g key={g.label}>
            <line x1={m.left} x2={m.left + innerW} y1={y(g.y)} y2={y(g.y)} className="guide" style={{ stroke: g.color }} />
            <text x={m.left + 4} y={y(g.y) - 4} className="tick">{g.label}</text>
          </g>
        ))}
        {strip && (
          <g className="strip">
            <text x={m.left} y={stripTop - 8} className="strip-label">{strip.label}</text>
            <line x1={m.left} x2={m.left + innerW} y1={stripTop} y2={stripTop} className="guide" />
            <text x={width - m.right + 8} y={stripTop + 4} className="tick">100%</text>
            <path d={stripPath} className="strip-area" />
            {strip.ticks?.map((count, i) => count > 0 && (
              <rect key={i} x={x(i) - barW / 2} width={barW} y={volBase - Math.min(14, 4 + 3 * count)} height={Math.min(14, 4 + 3 * count)} className="strip-tick" />
            ))}
          </g>
        )}
        {volume && volume.map((v, i) => finite(v) && (
          <rect key={i} x={x(i) - barW / 2} width={barW} y={volBase - (v / volMax) * (volH - 10)} height={(v / volMax) * (volH - 10)}
            className={`volume ${i === hover ? 'on' : ''}`} />
        ))}
        {candles && candles.map((c, i) => finite(c.open) && finite(c.close) && (
          <g key={i} className={c.close >= c.open ? 'candle up' : 'candle down'}>
            <line x1={x(i)} x2={x(i)} y1={y(c.high)} y2={y(c.low)} />
            <rect x={x(i) - barW / 2} width={barW} y={y(Math.max(c.open, c.close))}
              height={Math.max(1, Math.abs(y(c.open) - y(c.close)))} />
          </g>
        ))}
        {shown.filter((s) => s.area).map((s) => (
          <path key={`${s.key}-area`} d={area(s.values)} fill={`url(#${gradient}-${s.key})`} />
        ))}
        {shown.map((s) => (
          <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.width || 1.6}
            strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {markers.map((mk, k) => {
          if (!finite(mk.value) || mk.index < 0) return null
          const cx = x(mk.index)
          const cy = y(mk.value)
          if (mk.kind === 'up') return <path key={k} d={`M${cx},${cy + 7} l-6,10 h12 z`} className="marker up"><title>{mk.label}</title></path>
          if (mk.kind === 'down') return <path key={k} d={`M${cx},${cy - 7} l-6,-10 h12 z`} className="marker down"><title>{mk.label}</title></path>
          return <circle key={k} cx={cx} cy={cy} r={3} className="marker dot"><title>{mk.label}</title></circle>
        })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={m.top} y2={m.top + innerH + (strip ? volH : 0)} className="crosshair" />
            {shown.map((s) => finite(s.values[hover]) && (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r={4} style={{ fill: s.color, stroke: 'var(--bg)' }} strokeWidth="2" />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && !readout && (
        <div className="tooltip" style={{ left: Math.min(x(hover) + 12, width - 190) }}>
          <strong>{shortDate(dates[hover])}</strong>
          {shown.map((s) => (
            <div key={s.key}>
              <span className="swatch" style={{ background: s.color }} />
              {s.label} <b>{finite(s.values[hover]) ? yFormat(s.values[hover]) : '–'}</b>
            </div>
          ))}
          {strip && <div>{strip.label} <b>{Math.round(100 * (strip.values[hover] ?? 0))}%</b></div>}
          {strip?.ticks?.[hover] > 0 && <div className="loss">{strip.tickLabel?.(strip.ticks[hover])}</div>}
        </div>
      )}
    </div>
  )
}

// A square chart of points from 0 to 1 on both axes, with the diagonal for reference (calibration, ROC).
export function UnitChart({ series, xLabel, yLabel, max = 1, diagonalLabel, height = 300, format = (v) => `${Math.round(v * 100)}%` }) {
  const [ref, width] = useWidth(320)
  const size = Math.min(width, height)
  const m = { top: 10, right: 12, bottom: 40, left: 48 }
  const inner = size - m.left - m.right
  const innerH = size - m.top - m.bottom
  const x = (v) => m.left + (v / max) * inner
  const y = (v) => m.top + (1 - v / max) * innerH
  const ticks = niceTicks(0, max, 4)
  return (
    <div className="chart" ref={ref}>
      <svg width={size} height={size} role="img" aria-label={`${yLabel} against ${xLabel}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={m.left + inner} y1={y(t)} y2={y(t)} className="gridline" />
            <text x={m.left - 6} y={y(t) + 4} textAnchor="end" className="tick">{format(t)}</text>
            <text x={x(t)} y={m.top + innerH + 16} textAnchor="middle" className="tick">{format(t)}</text>
          </g>
        ))}
        <line x1={x(0)} y1={y(0)} x2={x(max)} y2={y(max)} className="guide" />
        {diagonalLabel && <text x={x(max * 0.62)} y={y(max * 0.62) - 8} className="tick" transform={`rotate(-45 ${x(max * 0.62)} ${y(max * 0.62) - 8})`}>{diagonalLabel}</text>}
        {series.map((s) => (
          <g key={s.label}>
            <path d={s.points.map((p, i) => `${i ? 'L' : 'M'}${x(Math.min(p.x, max))},${y(Math.min(p.y, max))}`).join('')}
              fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />
            {s.dots && s.points.map((p, i) => (
              <circle key={i} cx={x(Math.min(p.x, max))} cy={y(Math.min(p.y, max))} r="4.5" style={{ fill: s.color, stroke: 'var(--card)' }} strokeWidth="2">
                <title>{p.title}</title>
              </circle>
            ))}
          </g>
        ))}
        <text x={m.left + inner / 2} y={size - 4} textAnchor="middle" className="axis-label">{xLabel}</text>
        <text x={12} y={m.top + innerH / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90 12 ${m.top + innerH / 2})`}>{yLabel}</text>
      </svg>
    </div>
  )
}

// Vertical bars with an optional reference line, e.g. win rate by confidence group.
export function Columns({ items, format, reference, referenceLabel, height = 240, color = 'var(--yellow)' }) {
  const [ref, width] = useWidth(480)
  const m = { top: 16, right: 8, bottom: 40, left: 8 }
  const innerW = width - m.left - m.right
  const innerH = height - m.top - m.bottom
  const top = Math.max(...items.map((i) => i.value), reference || 0) * 1.15 || 1
  const slot = innerW / items.length
  const y = (v) => m.top + (1 - v / top) * innerH
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={items.map((i) => `${i.label}: ${format(i.value)}`).join(', ')}>
        {items.map((item, k) => (
          <g key={item.label}>
            <rect x={m.left + k * slot + slot * 0.18} width={slot * 0.64} y={y(item.value)} height={y(0) - y(item.value)}
              style={{ fill: item.color || color }} rx="4" />
            <text x={m.left + k * slot + slot / 2} y={y(item.value) - 6} textAnchor="middle" className="bar-value">{format(item.value)}</text>
            <text x={m.left + k * slot + slot / 2} y={height - 20} textAnchor="middle" className="tick">{item.label}</text>
            {item.note && <text x={m.left + k * slot + slot / 2} y={height - 6} textAnchor="middle" className="tick faint">{item.note}</text>}
          </g>
        ))}
        {reference !== undefined && (
          <g>
            <line x1={m.left} x2={m.left + innerW} y1={y(reference)} y2={y(reference)} className="guide strong" />
            <text x={m.left + 2} y={y(reference) - 5} textAnchor="start" className="tick">{referenceLabel}</text>
          </g>
        )}
      </svg>
    </div>
  )
}
