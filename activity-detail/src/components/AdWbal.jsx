// W'bal — Skiba differentiaalmodel (2014/2015)
// Bron: Skiba et al. 2014 "Modeling the expenditure and reconstitution of work capacity above
// critical power" en Skiba et al. 2015 update van tau_w.
//
// Depletion:        W'(t) = W'(t-1) − [P(t) − CP] · dt        (wanneer P(t) > CP)
// Reconstitution:   W'(t) = W'(t-1) + [W'0 − W'(t-1)] · (1 − e^(−dt/τ_w))
//                   τ_w = 546 · e^(−0.01·(CP−P(t))) + 316     (Skiba 2015)

import s from './AdWbal.module.css'

function computeWbal(powerSeries, cp, wPrime, durationMin) {
  const n = powerSeries.length
  const totalSeconds = durationMin * 60
  const dt = totalSeconds / (n - 1)

  let wbal = wPrime
  return powerSeries.map((p) => {
    if (p > cp) {
      wbal = Math.max(0, wbal - (p - cp) * dt)
    } else {
      const tauW = 546 * Math.exp(-0.01 * (cp - p)) + 316
      wbal = wbal + (wPrime - wbal) * (1 - Math.exp(-dt / tauW))
    }
    return wbal
  })
}

export function AdWbal({ wbalData, powerSeries, w = 620, h = 140 }) {
  const { cp, wPrime } = wbalData
  const pad = { l: 44, r: 12, t: 12, b: 22 }
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b

  // Bereken W'bal met Skiba model
  const durationMin = 124
  const series = computeWbal(powerSeries, cp, wPrime, durationMin)

  const EXHAUSTION_THRESHOLD = 1500 // 1.5 kJ = praktische uitputting

  const minWbal = Math.min(...series)
  const maxY = wPrime * 1.02
  const minY = Math.min(0, minWbal * 0.9)
  const rangeY = maxY - minY

  const pts = series.map((v, i) => [
    pad.l + (i / (series.length - 1)) * cw,
    pad.t + (1 - (v - minY) / rangeY) * ch,
  ])

  const path = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
  const fillPath = `${path} L${pts[pts.length - 1][0]},${pad.t + ch} L${pad.l},${pad.t + ch} Z`

  // Y-as: W'0, halverwege en uitputtingsdrempel
  const yLines = [wPrime, wPrime / 2, EXHAUSTION_THRESHOLD].filter(v => v >= minY && v <= maxY)

  const yPos = (v) => pad.t + (1 - (v - minY) / rangeY) * ch
  const formatKj = (v) => `${(v / 1000).toFixed(0)} kJ`

  // Status: bij sweetspot blijft W'bal bijna vol
  const finalWbal = series[series.length - 1]
  const pctFull = Math.round((finalWbal / wPrime) * 100)
  const statusGood = finalWbal > wPrime * 0.7

  const xLabels = ['0', '30m', '1u', '1u30', '2u']

  return (
    <div>
      <div className={s.header}>
        <div className={s.stats}>
          <Stat label="CP (proxy FTP)" value={`${cp} W`} />
          <Stat label="W'" value={`${(wPrime / 1000).toFixed(0)} kJ`} />
          <Stat label="Eind W'bal" value={`${(finalWbal / 1000).toFixed(1)} kJ`} color={statusGood ? 'var(--green)' : 'var(--yellow)'} />
          <Stat label="% Vol" value={`${pctFull}%`} color={statusGood ? 'var(--green)' : 'var(--yellow)'} />
        </div>
        <div
          className={s.statusPill}
          style={{ color: statusGood ? 'var(--green)' : 'var(--yellow)', borderColor: statusGood ? 'var(--green)' : 'var(--yellow)' }}
        >
          {statusGood ? '✓ Sub-threshold — W\'bal vrijwel vol' : '⚠ W\'bal significant uitgeput'}
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
        role="img"
        aria-label={`W'bal curve: eindstand ${(finalWbal / 1000).toFixed(1)} kJ van ${(wPrime / 1000).toFixed(0)} kJ (${pctFull}% vol)`}
      >
        {/* Horizontale referentielijnen */}
        {yLines.map((v) => {
          const y = yPos(v)
          const isExhaustion = v === EXHAUSTION_THRESHOLD
          return (
            <g key={v}>
              <line
                x1={pad.l} x2={w - pad.r}
                y1={y} y2={y}
                stroke={isExhaustion ? 'var(--red)' : 'var(--divider)'}
                strokeWidth={isExhaustion ? 1.5 : 1}
                strokeDasharray={isExhaustion ? '4 3' : undefined}
              />
              <text
                x={pad.l - 5}
                y={y + 3.5}
                textAnchor="end"
                fontSize="9"
                fill={isExhaustion ? 'var(--red)' : 'var(--muted)'}
                fontFamily="var(--font-mono)"
              >
                {formatKj(v)}
              </text>
              {isExhaustion && (
                <text
                  x={w - pad.r - 2}
                  y={y - 4}
                  textAnchor="end"
                  fontSize="8"
                  fill="var(--red)"
                  fontFamily="var(--font-mono)"
                >
                  uitputting
                </text>
              )}
            </g>
          )
        })}

        {/* Fill */}
        <path
          d={fillPath}
          fill="var(--accent)"
          style={{ opacity: 'var(--fill-opacity)' }}
        />

        {/* W'bal lijn */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* X-as labels */}
        {xLabels.map((l, i) => (
          <text
            key={i}
            x={pad.l + (i / (xLabels.length - 1)) * cw}
            y={h - 5}
            textAnchor={i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {l}
          </text>
        ))}
      </svg>

      <p className={s.note}>
        Skiba 2014/2015 differentiaalmodel · CP = FTP als proxy (CP idealiter apart bepaald) ·
        Drempel 1,5 kJ = praktische uitputting · Bij deze sub-threshold sweetspot lagen
        alle intervallen (<strong>{Math.max(...powerSeries)}W max</strong>) onder CP ({cp}W):
        W'bal bleef vrijwel vol — het bevestigt dat de blokken correct gedoseerd waren.
      </p>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className={s.stat}>
      <div className={s.statLabel}>{label}</div>
      <div className={s.statValue} style={{ color: color || 'var(--text)' }}>{value}</div>
    </div>
  )
}
