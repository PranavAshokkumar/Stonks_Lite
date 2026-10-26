// Line icons drawn after the SF Symbols the Stonks app uses (binoculars, chart.xyaxis.line, cpu, ...).
const PATHS = {
  binoculars: <><circle cx="6.5" cy="16" r="3.5" /><circle cx="17.5" cy="16" r="3.5" /><path d="M10 15h4M3.6 14 6 6.5Q6.5 5 8 5h2v9.5M20.4 14 18 6.5Q17.5 5 16 5h-2v9.5" /></>,
  chart: <path d="M4 4v16h16M7.5 15l3.5-4 3 2.5L19 7" />,
  pie: <><path d="M11 4a8 8 0 1 0 9 9h-9Z" /><path d="M14 3.2A8 8 0 0 1 20.8 10H14Z" /></>,
  cpu: <><rect x="6" y="6" width="12" height="12" rx="2.5" /><rect x="9.5" y="9.5" width="5" height="5" rx="1" /><path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" /></>,
  trend: <path d="M3 17.5 9 11.5l4 4 8-8M15.5 7.5H21v5.5" />,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.6v.01" /></>,
  moon: <path d="M20 14.6A8 8 0 0 1 9.4 4a8 8 0 1 0 10.6 10.6Z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  flask: <path d="M9 3h6M10 3v6.2L5 18a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-8.8V3M7.4 14.5h9.2" />,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12.3 2.7 2.7L16 9.6" /></>,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  toEnd: <path d="m6.5 6 6 6-6 6M17.5 6v12" />,
  back: <path d="M19 12H5m6-6-6 6 6 6" />,
  send: <path d="M20.5 3.5 10 14M20.5 3.5l-6.6 17-3.9-6.5-6.5-3.9 17-6.6Z" />,
  warning: <path d="M12 4 2.8 19.5h18.4L12 4ZM12 10v4.2M12 17v.01" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></>,
  star: <path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8L12 3.5Z" />,
  candles: <path d="M7 3.5v3M7 16v4.5M5 6.5h4V16H5ZM17 3.5v5M17 15v5.5M15 8.5h4V15h-4Z" />,
  line: <path d="m3 16.5 5-5 4 3.2 9-8.7" />,
  pulse: <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />,
  list: <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />,
  reset: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v4h4" />,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2.5" /></>,
  layers: <path d="m12 4 9 4.5-9 4.5-9-4.5L12 4ZM3 12.5 12 17l9-4.5M3 16.5 12 21l9-4.5" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3Z" /></>,
  laptop: <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5V16H5ZM2.5 16h19l-1 2.5h-17Z" />,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  arrowUpRight: <path d="M7 17 17 7M8.5 7H17v8.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  tick: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  sidebar: <><rect x="3" y="4.5" width="18" height="15" rx="3" /><path d="M9 4.5v15M5.6 8.5h1.2M5.6 11.5h1.2" /></>,
  tag: <><path d="M3.5 12.4V5A1.5 1.5 0 0 1 5 3.5h7.4l8.1 8.1a1.5 1.5 0 0 1 0 2.1l-6.4 6.4a1.5 1.5 0 0 1-2.1 0Z" /><circle cx="8" cy="8" r="1.3" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17v.01" /></>,
}

export function Icon({ name, size = 16, className = '', filled = false }) {
  return (
    <svg className={`icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  )
}
