import s from './AdDualChart.module.css'

const COLOR_MAP = {
  accent: 'var(--accent)',
  red:    'var(--red)',
  green:  'var(--green)',
  blue:   'var(--accent2)',
  yellow: 'var(--yellow)',
}

const resolveColor = (key) => COLOR_MAP[key] || key

export function AdDualChart({ series, w = 640, h = 168 }) {
  const { primary, secondary, xLabels } = series
  const pad = { l: 6, r: 6, t: 14, b: 18 }
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b

  const makeLine = (vals) => {
    const min = Math.min(...vals), max = Math.max(...vals)
    const range = (max - min) || 1
    return vals.map((v, i) => [
      pad.l + (i / (vals.length - 1)) * cw,
      pad.t + (1 - (v - min) / range) * ch,
    ])
  }

  const toPath = (pts) =>
    pts.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')

  const pPts = makeLine(primary.values)
  const sPts = secondary ? makeLine(secondary.values) : null

  const pColor = resolveColor(primary.colorKey)
  const sColor = secondary ? resolveColor(secondary.colorKey) : null

  const avg = (vals) =>
    Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)

  const fillPath = `${toPath(pPts)} L${pad.l + cw},${pad.t + ch} L${pad.l},${pad.t + ch} Z`

  return (
    <div>
      <div className={s.legend}>
        <LegendPill color={pColor} label={`${primary.label} · gem ${avg(primary.values)} ${primary.unit}`} />
        {secondary && (
          <LegendPill color={sColor} label={secondary.label} dashed />
        )}
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
        role="img"
        aria-label="Grafiek vermogen en hartslag over de rit"
      >
        {/* Gridlijnen */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={pad.l} x2={w - pad.r}
            y1={pad.t + g * ch} y2={pad.t + g * ch}
            stroke="var(--divider)" strokeWidth="1"
          />
        ))}

        {/* Fill onder primaire lijn */}
        {primary.fill && (
          <path
            d={fillPath}
            style={{ fill: pColor, opacity: 'var(--fill-opacity)' }}
          />
        )}

        {/* Secundaire lijn (gestippeld) */}
        {sPts && (
          <path
            d={toPath(sPts)}
            fill="none"
            stroke={sColor}
            strokeWidth="1.8"
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}

        {/* Primaire lijn */}
        <path
          d={toPath(pPts)}
          fill="none"
          stroke={pColor}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X-as labels */}
        {xLabels.map((l, i) => (
          <text
            key={l + i}
            x={pad.l + (i / (xLabels.length - 1)) * cw}
            y={h - 4}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}

function LegendPill({ color, label, dashed }) {
  return (
    <span className={s.legendPill}>
      <span
        className={s.legendLine}
        style={{ borderTopStyle: dashed ? 'dashed' : 'solid', borderTopColor: color }}
        aria-hidden="true"
      />
      <span style={{ color }}>{label}</span>
    </span>
  )
}
