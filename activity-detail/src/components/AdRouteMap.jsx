import s from './AdRouteMap.module.css'

// `route` kan zijn:
//  - een array van [x,y]-punten (geprojecteerd GPS-spoor, viewBox 400×200)
//  - een SVG-padstring (legacy mock)
function parseRoute(route) {
  if (Array.isArray(route)) {
    if (route.length < 2) return null
    const d = route.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
    return { d, start: route[0], finish: route[route.length - 1] }
  }
  if (typeof route === 'string') {
    const pairs = route.match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g) || []
    if (pairs.length < 2) return null
    const toXY = (p) => p.split(',').map(Number)
    return { d: route, start: toXY(pairs[0]), finish: toXY(pairs[pairs.length - 1]) }
  }
  return null
}

export function AdRouteMap({ route, h = 196 }) {
  const parsed = parseRoute(route)
  if (!parsed) return null
  const [sx, sy] = parsed.start
  const [fx, fy] = parsed.finish

  return (
    <div className={s.wrap} aria-label="Kaart van de route">
      <svg
        width="100%"
        height={h}
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid meet"
        className={s.svg}
        role="img"
        aria-label="Gestileerd GPS-spoor"
      >
        <defs>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--accent2)" />
            <stop offset="1" stopColor="var(--accent)" />
          </linearGradient>
        </defs>

        {/* Fijn raster */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line key={`v${i}`} x1={i * 50} y1="0" x2={i * 50} y2="200" stroke="var(--divider)" strokeWidth="1" />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <line key={`h${i}`} x1="0" y1={i * 50} x2="400" y2={i * 50} stroke="var(--divider)" strokeWidth="1" />
        ))}

        {/* Route-spoor */}
        <path
          d={parsed.d}
          fill="none"
          stroke="url(#routeGrad)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start (groen) */}
        <circle cx={sx} cy={sy} r="6" style={{ fill: 'var(--green)' }} stroke="var(--surface)" strokeWidth="2.5" />
        {/* Finish (rood) */}
        <circle cx={fx} cy={fy} r="6" style={{ fill: 'var(--red)' }} stroke="var(--surface)" strokeWidth="2.5" />
      </svg>

      <div className={s.legend} aria-label="Legenda">
        {[['Start', 'var(--green)'], ['Finish', 'var(--red)']].map(([label, color]) => (
          <span key={label} className={s.pill}>
            <span className={s.dot} style={{ background: color }} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
