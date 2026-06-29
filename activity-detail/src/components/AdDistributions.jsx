import s from './AdDistributions.module.css'

const COLOR_MAP = {
  accent: 'var(--accent)',
  red:    'var(--red)',
  blue:   'var(--accent2)',
  green:  'var(--green)',
}

function Histogram({ bins, colorKey, w = 320, h = 100 }) {
  const color = COLOR_MAP[colorKey] || colorKey
  const max = Math.max(...bins.map((b) => b.c), 1)
  const bw = (w - 8) / bins.length

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h + 22}`}
      style={{ display: 'block' }}
      role="img"
      aria-label={bins.map((b) => `${b.l}: ${b.c}%`).join(', ')}
    >
      {bins.map((b, i) => {
        const bh = (b.c / max) * h
        const x = 4 + i * bw + bw * 0.16
        const showLabel = bins.length <= 6 || i % 2 === 0
        return (
          <g key={i}>
            <rect
              x={x}
              y={h - bh}
              width={bw * 0.68}
              height={bh}
              fill={color}
              rx={3}
              style={{ opacity: 0.9 }}
            />
            {showLabel && (
              <text
                x={x + bw * 0.34}
                y={h + 14}
                textAnchor="middle"
                fontSize="7.5"
                fill="var(--muted)"
                fontFamily="var(--font-mono)"
              >
                {b.l}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

export function AdDistributions({ dist, kind = 'ride' }) {
  const panels = kind === 'run' ? [
    { label: 'Snelheid (km/u)', key: 'speed', colorKey: 'green' },
    { label: 'Hartslag (bpm)',  key: 'hr',    colorKey: 'red' },
    { label: 'Cadans (spm)',    key: 'cad',   colorKey: 'blue' },
  ] : [
    { label: 'Vermogen (W)',    key: 'power', colorKey: 'accent' },
    { label: 'Hartslag (bpm)', key: 'hr',    colorKey: 'red' },
    { label: 'Cadans (rpm)',   key: 'cad',   colorKey: 'blue' },
    { label: 'Snelheid (km/u)',key: 'speed', colorKey: 'green' },
  ]

  return (
    <div className={s.grid}>
      {panels.map(({ label, key, colorKey }) => (
        <div key={key}>
          <div className={s.panelLabel}>{label}</div>
          <Histogram bins={dist[key]} colorKey={colorKey} />
        </div>
      ))}
    </div>
  )
}
