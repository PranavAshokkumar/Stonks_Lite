// The Stonks app's dashboard kit (Target20App/Views/Components/DashboardKit.swift), for the web.
// Colour follows the system hierarchy: neutral labels by default, green and red only for signed money and
// price change, orange only for states that need attention, yellow only for what the model picks.
import { useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icons.jsx'

// ---------------------------------------------------------------- page chrome
export function PageHeader({ kicker, title, subtitle, capsules = [], children }) {
  return (
    <header className="page-header">
      <div>
        {kicker && <p className="kicker">{kicker}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
        {capsules.length > 0 && (
          <div className="capsules">
            {capsules.map((c) => <Capsule key={c.text} icon={c.icon} tint={c.tint}>{c.text}</Capsule>)}
          </div>
        )}
      </div>
      {children && <div className="page-accessory">{children}</div>}
    </header>
  )
}

export function Capsule({ icon, tint, children }) {
  return (
    <span className="capsule">
      {icon && <Icon name={icon} size={13} className={tint ? `tint-${tint}` : 'tint-muted'} />}
      {children}
    </span>
  )
}

// ---------------------------------------------------------------- cards
// A glass card with a small icon and title; with `href` the header becomes a link with a chevron.
export function Card({ title, icon, href, aside, className = '', style, children }) {
  const head = (
    <>
      {icon && <Icon name={icon} size={14} />}
      <span>{title}</span>
      {aside && <span className="card-aside">{aside}</span>}
      {href && <Icon name="chevronRight" size={13} className="card-chevron" />}
    </>
  )
  return (
    <section className={`card ${className}`} style={style}>
      {title && (href ? <a className="card-head" href={href}>{head}</a> : <h2 className="card-head">{head}</h2>)}
      {children}
    </section>
  )
}

export function KeyFigure({ label, value, caption, tone = '' }) {
  return (
    <div className="card key-figure">
      <span className="key-label">{label}</span>
      <span className={`key-value ${tone}`}>{value}</span>
      {caption && <span className="key-caption">{caption}</span>}
    </div>
  )
}

export function Headline({ value, caption, tone = '' }) {
  return (
    <div className="headline">
      <span className={`headline-value ${tone}`}>{value}</span>
      {caption && <span className="headline-caption">{caption}</span>}
    </div>
  )
}

// Two (or more) outcomes side by side in big numbers: the first is the one being highlighted.
export function Versus({ items }) {
  return (
    <div className="versus">
      {items.map((it, i) => (
        <div key={it.label} className={i === 0 ? 'lead' : ''}>
          <span className="versus-label">{it.label}</span>
          <span className="versus-value">{it.value}</span>
          {it.caption && <span className="versus-caption">{it.caption}</span>}
        </div>
      ))}
    </div>
  )
}

// Numbered steps in a row: how something works, one short paragraph each.
export function Flow({ steps }) {
  return (
    <ol className="flow">
      {steps.map(([title, text]) => <li key={title}><h3>{title}</h3><p>{text}</p></li>)}
    </ol>
  )
}

// A label over a value, as on the Scout cards.
export function Stat({ label, value, tone = '' }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className={`stat-value ${tone}`}>{value}</span>
    </div>
  )
}

// ---------------------------------------------------------------- bars and driver rows
export function ShareBar({ share, tint }) {
  const f = Math.min(Math.max(share || 0, 0), 1)
  return (
    <span className="bar" aria-hidden="true">
      <span className="bar-fill" style={{ width: f > 0 ? `max(2px, ${f * 100}%)` : 0, background: tint }} />
    </span>
  )
}

// A centred bar for values in [-1, 1]: neutral colour, the sign shows as direction.
export function DivergingBar({ value }) {
  const v = Math.min(Math.max(value || 0, -1), 1)
  return (
    <span className="bar diverging" aria-hidden="true">
      <span className="bar-fill" style={{ left: v >= 0 ? '50%' : `${50 + v * 50}%`, width: `max(2px, ${Math.abs(v) * 50}%)` }} />
    </span>
  )
}

export function Drivers({ title = 'Drivers', children }) {
  return (
    <div className="drivers">
      <span className="drivers-title">{title}</span>
      {children}
    </div>
  )
}

// One named contribution: label, value, and an optional bar (`share` in [0, 1] or `signed` in [-1, 1]).
export function DriverRow({ name, value, share, signed, tone = '', tint }) {
  return (
    <div className="driver">
      <div className="driver-line">
        <span className="driver-name">{name}</span>
        <span className={`driver-value ${tone}`}>{value}</span>
      </div>
      {share !== undefined && <ShareBar share={share} tint={tint} />}
      {signed !== undefined && <DivergingBar value={signed} />}
    </div>
  )
}

// ---------------------------------------------------------------- chips, banners, controls
// The micro-chip: a 5px tinted dot and neutral text.
export function Chip({ tint = 'blue', icon, children }) {
  return (
    <span className={`chip tint-${tint}`}>
      {icon ? <Icon name={icon} size={11} filled={icon === 'star'} /> : <i className="chip-dot" />}
      <span>{children}</span>
    </span>
  )
}

const BANNER_ICON = { info: 'info', warn: 'warning', error: 'warning' }

// Tinted notice: orange for states that need attention, blue for plain information. An error stays a full
// banner; the others fold into a small pill (icon and `label`, inside a .notes row) whose text opens below it
// on hover, keyboard focus or a tap, and closes on Escape or a tap elsewhere.
export function Banner({ kind = 'info', label, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const id = useId()
  useEffect(() => {
    if (!open) return undefined
    const outside = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const escape = (e) => e.key === 'Escape' && (setOpen(false), ref.current?.querySelector('button')?.focus())
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  const icon = <Icon name={BANNER_ICON[kind]} size={14} />
  if (kind === 'error') {
    return <div className="banner error" role="alert">{icon}<div>{children}</div></div>
  }
  const title = label || (kind === 'warn' ? 'Note' : 'Info')
  return (
    <div ref={ref} className={`note ${kind} ${open ? 'open' : ''}`}>
      <button type="button" className="note-pill" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        {icon}{title}
      </button>
      <div id={id} className="note-panel">{children}</div>
    </div>
  )
}

export function Segmented({ options, value, onChange, label, small = false }) {
  return (
    <div className={`segmented ${small ? 'small' : ''}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.key} type="button" className={value === o.key ? 'on' : ''} aria-pressed={value === o.key} onClick={() => onChange(o.key)}>
          {o.icon && <Icon name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- load states
export function Loading({ what = 'Loading' }) {
  return (
    <div className="load-state" role="status" aria-busy="true">
      <span className="spinner" aria-hidden="true" />
      <span>{what}…</span>
    </div>
  )
}

export function Empty({ title, icon = 'layers', children }) {
  return (
    <div className="empty">
      <Icon name={icon} size={20} />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  )
}
