import s from './AdRouteMap.module.css'

export function AdRouteMap({ route, h = 196 }) {
  // Start- en eindpunt uit het SVG path halen
  const parts = route.replace(/[MC]/g, ' ').trim().split(/\s+/)
  const sx = parseFloat(parts[0])
  const sy = parseFloat(parts[1])

  return (
    <div className={s.wrap} aria-label="Kaart van de route">
      <svg
        width="100%"
        height={h}
        viewBox="0 0 400 200"
        preserveAspectRatio="xMidYMid slice"
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
          d={route}
          fill="none"
          stroke="url(#routeGrad)"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Start (groen) */}
        <circle cx={sx} cy={sy} r="6" style={{ fill: 'var(--green)' }} stroke="var(--surface)" strokeWidth="2.5" />
        {/* Finish (rood) */}
        <circle cx="360" cy="70" r="6" style={{ fill: 'var(--red)' }} stroke="var(--surface)" strokeWidth="2.5" />
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
