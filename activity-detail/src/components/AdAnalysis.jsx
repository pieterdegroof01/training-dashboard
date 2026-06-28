import s from './AdAnalysis.module.css'

/* Vermogen–HR scatter */
function Scatter({ points, color, quad, w = 280, h = 200, ariaLabel }) {
  const pad = { l: 32, r: 10, t: 12, b: 32 }
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys), ymax = Math.max(...ys)
  const xr = (xmax - xmin) || 1
  const yr = (ymax - ymin) || 1
  const px = (x) => pad.l + ((x - xmin) / xr) * cw
  const py = (y) => pad.t + (1 - (y - ymin) / yr) * ch

  const xUnit = quad ? quad.xLabel : 'W'
  const xMid  = Math.round((xmin + xmax) / 2)

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      className={s.svg}
      role="img"
      aria-label={ariaLabel}
    >
      {/* Assen */}
      <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ch} stroke="var(--divider)" strokeWidth="1" />
      <line x1={pad.l} y1={pad.t + ch} x2={pad.l + cw} y2={pad.t + ch} stroke="var(--divider)" strokeWidth="1" />

      {/* Kwadrant-lijnen + labels */}
      {quad && (
        <g>
          <line
            x1={px(quad.xMid)} y1={pad.t}
            x2={px(quad.xMid)} y2={pad.t + ch}
            stroke="var(--subtle)" strokeDasharray="3 3" strokeWidth="1"
          />
          <line
            x1={pad.l} y1={py(quad.yMid)}
            x2={pad.l + cw} y2={py(quad.yMid)}
            stroke="var(--subtle)" strokeDasharray="3 3" strokeWidth="1"
          />
          {quad.labels.map((lbl, i) => {
            const positions = [
              [pad.l + 4, pad.t + 11],
              [pad.l + cw - 4, pad.t + 11],
              [pad.l + 4, pad.t + ch - 5],
              [pad.l + cw - 4, pad.t + ch - 5],
            ]
            return (
              <text
                key={i}
                x={positions[i][0]}
                y={positions[i][1]}
                textAnchor={i % 2 ? 'end' : 'start'}
                fontSize="8.5"
                fontWeight="700"
                fill="var(--subtle)"
                fontFamily="var(--font-mono)"
              >
                {lbl}
              </text>
            )
          })}
        </g>
      )}

      {/* Punten */}
      {points.map((p, i) => (
        <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.6" fill={color} opacity="0.55" />
      ))}

      {/* Y-as labels */}
      <text x={pad.l - 5} y={pad.t + 5}      textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{Math.round(ymax)}</text>
      <text x={pad.l - 5} y={pad.t + ch}     textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{Math.round(ymin)}</text>

      {/* X-as labels: min, mid, max met eenheid */}
      <text x={pad.l}           y={h - 4} textAnchor="start" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{Math.round(xmin)}</text>
      <text x={pad.l + cw / 2} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{xMid}</text>
      <text x={pad.l + cw}     y={h - 4} textAnchor="end"   fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{Math.round(xmax)} {xUnit}</text>
    </svg>
  )
}

/* HR-drift (EF over de rit) */
function Drift({ series, w = 280, h = 130 }) {
  const pad = { l: 30, r: 8, t: 12, b: 22 }
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b
  const min = Math.min(...series), max = Math.max(...series)
  const range = (max - min) || 1
  const pts = series.map((v, i) => [
    pad.l + (i / (series.length - 1)) * cw,
    pad.t + (1 - (v - min) / range) * ch,
  ])
  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const half = Math.floor(series.length / 2)
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length
  const a1 = avg(series.slice(0, half))
  const a2 = avg(series.slice(half))
  const driftPct = Math.round(Math.abs((a2 - a1) / a1) * 100 * 10) / 10
  const driftGood = driftPct < 5

  return (
    <div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
        role="img"
        aria-label={`HR-drift: EF 1e helft ${a1.toFixed(2)}, EF 2e helft ${a2.toFixed(2)}`}
      >
        {/* Y-as */}
        <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + ch} stroke="var(--divider)" strokeWidth="1" />

        {/* Y-as labels: max boven, min onder */}
        <text x={pad.l - 4} y={pad.t + 4}  textAnchor="end" fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)">{max.toFixed(2)}</text>
        <text x={pad.l - 4} y={pad.t + ch} textAnchor="end" fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)">{min.toFixed(2)}</text>

        {/* Halveer-lijn */}
        <line
          x1={pad.l + cw / 2} y1={pad.t}
          x2={pad.l + cw / 2} y2={pad.t + ch}
          stroke="var(--divider)" strokeWidth="1" strokeDasharray="3 3"
        />

        {/* Fill */}
        <path
          d={`${path} L${pad.l + cw},${pad.t + ch} L${pad.l},${pad.t + ch} Z`}
          fill="var(--accent)"
          style={{ opacity: 'var(--fill-opacity)' }}
        />

        {/* EF-lijn */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Labels onder: 1e/2e helft */}
        <text x={pad.l + 2} y={h - 5} fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
          1e helft EF {a1.toFixed(2)}
        </text>
        <text x={w - pad.r} y={h - 5} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">
          2e helft EF {a2.toFixed(2)}
        </text>
      </svg>
      <div className={s.driftNote} style={{ color: driftGood ? 'var(--green)' : 'var(--yellow)' }}>
        {driftGood ? '✓' : '⚠'} EF-drift {driftPct}% — {driftGood ? 'stabiele aerobe efficiëntie' : 'let op mogelijke vermoeidheid'}
      </div>
    </div>
  )
}

export function AdAnalysis({ scatter, quadrant, drift, cadence, ftp, layout = 'desktop' }) {
  const isDesktop = layout === 'desktop'

  return (
    <div className={`${s.grid} ${isDesktop ? s.desktop : s.phone}`}>
      {/* Vermogen–HR scatter */}
      <div className={s.section}>
        <div className={s.subTitle}>Vermogen–hartslag relatie</div>
        <Scatter
          points={scatter}
          color="var(--accent)"
          ariaLabel="Scatter: vermogen versus hartslag"
        />
      </div>

      <div>
        {/* HR-drift */}
        <div className={s.section}>
          <div className={s.subTitle}>EF-drift over de rit</div>
          <Drift series={drift} />
        </div>

        {/* Vermogenskwadranten */}
        <div className={s.section}>
          <div className={s.subTitle}>Vermogenskwadranten</div>
          <Scatter
            points={quadrant}
            color="var(--accent2)"
            quad={{
              xMid: cadence || 88,
              yMid: ftp || 268,
              labels: ['Kracht', 'Sprint', 'Herstel', 'Soepel'],
              xLabel: 'rpm',
            }}
            ariaLabel="Vermogenskwadranten: cadans versus vermogen"
          />
          <div className={s.quadNote}>
            Kwadrantgrenzen: FTP {ftp}W · gem. cadans {cadence} rpm
          </div>
        </div>
      </div>
    </div>
  )
}
