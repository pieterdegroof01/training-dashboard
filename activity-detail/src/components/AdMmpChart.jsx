import s from './AdMmpChart.module.css'

export function AdMmpChart({ mmp, w = 620, h = 180 }) {
  const pad = { l: 36, r: 12, t: 20, b: 22 }
  const cw = w - pad.l - pad.r
  const ch = h - pad.t - pad.b

  const maxVal = Math.max(...mmp.map((p) => p.best)) * 1.08
  const xy = (v, i) => [
    pad.l + (i / (mmp.length - 1)) * cw,
    pad.t + (1 - v / maxVal) * ch,
  ]

  const toPath = (key) =>
    mmp.map((p, i) => { const [x, y] = xy(p[key], i); return `${i === 0 ? 'M' : 'L'}${x},${y}` }).join(' ')

  const ridePts = mmp.map((p, i) => ({ ...xy(p.ride, i), val: p.ride, best: p.best, isPr: p.isPr, t: p.t }))

  const yGridVals = (() => {
    const step = Math.ceil(maxVal / 4 / 50) * 50
    return Array.from({ length: 4 }, (_, i) => (i + 1) * step).filter(v => v <= maxVal)
  })()

  // Data-gestuurde notitie: PR's en grootste tekort t.o.v. 90-dagen best
  const prDurations = mmp.filter((p) => p.isPr).map((p) => p.t)
  const biggestGap = mmp.reduce((acc, p) => {
    const pct = p.best > 0 ? (p.best - p.ride) / p.best : 0
    return pct > acc.pct ? { pct, t: p.t } : acc
  }, { pct: 0, t: null })
  const gapPct = Math.round(biggestGap.pct * 100)

  return (
    <div>
      <div className={s.legend}>
        <LegendPill color="var(--accent)" label="Deze rit" />
        <LegendPill color="var(--subtle)" label="90-dagen best" dashed />
        <LegendPill color="var(--yellow)" label="PR" dot />
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
        role="img"
        aria-label="Mean Maximal Power curve: deze rit versus 90-dagen best"
      >
        {/* Horizontale gridlijnen met watt-labels */}
        {yGridVals.map((v) => {
          const y = pad.t + (1 - v / maxVal) * ch
          return (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y} y2={y} stroke="var(--divider)" strokeWidth="1" />
              <text x={pad.l - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{v}</text>
            </g>
          )
        })}

        {/* Gap-fill tussen de twee lijnen */}
        <path
          d={`${toPath('ride')} L${pad.l + cw},${pad.t + (1 - mmp[mmp.length - 1].best / maxVal) * ch} ${[...mmp].reverse().map((p, i) => { const ri = mmp.length - 1 - i; const [x, y] = xy(p.best, ri); return `L${x},${y}` }).join(' ')} Z`}
          fill="var(--subtle)"
          style={{ opacity: 0.08 }}
        />

        {/* Fill onder rit-lijn */}
        <path
          d={`${toPath('ride')} L${pad.l + cw},${pad.t + ch} L${pad.l},${pad.t + ch} Z`}
          fill="var(--accent)"
          style={{ opacity: 'var(--fill-opacity)' }}
        />

        {/* 90-dagen best lijn */}
        <path
          d={toPath('best')}
          fill="none"
          stroke="var(--subtle)"
          strokeWidth="1.8"
          strokeDasharray="4 4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Rit-lijn */}
        <path
          d={toPath('ride')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Datapunten + PR-markers */}
        {ridePts.map((pt, i) => (
          <g key={i}>
            {pt.isPr ? (
              <>
                {/* PR: gouden ring + label */}
                <circle cx={pt[0]} cy={pt[1]} r="7" fill="var(--yellow)" opacity="0.18" />
                <circle cx={pt[0]} cy={pt[1]} r="4" fill="var(--yellow)" stroke="var(--surface)" strokeWidth="1.5" />
                <text
                  x={pt[0]}
                  y={pt[1] - 11}
                  textAnchor="middle"
                  fontSize="8"
                  fontWeight="800"
                  fill="var(--yellow)"
                  fontFamily="var(--font-mono)"
                >
                  PR
                </text>
              </>
            ) : (
              <circle cx={pt[0]} cy={pt[1]} r="3" fill="var(--accent)" />
            )}
          </g>
        ))}

        {/* Gap-labels: verschil rit vs best */}
        {ridePts.map((pt, i) => {
          const gap = pt.best - pt.val
          const gapPct = Math.round((gap / pt.best) * 100)
          if (gapPct < 3) return null // alleen tonen als gap ≥ 3%
          const [bx, by] = xy(pt.best, i)
          const midY = (pt[1] + by) / 2
          return (
            <text
              key={`gap-${i}`}
              x={pt[0] + 8}
              y={midY + 3}
              fontSize="8"
              fill="var(--muted)"
              fontFamily="var(--font-mono)"
            >
              −{gapPct}%
            </text>
          )
        })}

        {/* X-as labels */}
        {mmp.map((p, i) => (
          <text
            key={p.t}
            x={pad.l + (i / (mmp.length - 1)) * cw}
            y={h - 5}
            textAnchor={i === 0 ? 'start' : i === mmp.length - 1 ? 'end' : 'middle'}
            fontSize="10"
            fill="var(--muted)"
            fontFamily="var(--font-mono)"
          >
            {p.t}
          </text>
        ))}
      </svg>

      <div className={s.note}>
        {prDurations.length > 0
          ? `Nieuwe 90-dagen best op ${prDurations.join(', ')} — deze rit zette daar een piek neer.`
          : 'Geen nieuwe 90-dagen best in deze rit — de inspanningen bleven onder de recente pieken.'}
        {gapPct >= 5 && biggestGap.t &&
          ` Grootste tekort op ${biggestGap.t} (−${gapPct}% t.o.v. best): daar ligt de meeste onbenutte capaciteit.`}
      </div>
    </div>
  )
}

function LegendPill({ color, label, dashed, dot }) {
  return (
    <span className={s.legendPill}>
      {dot ? (
        <span className={s.legendDot} style={{ background: color }} aria-hidden="true" />
      ) : (
        <span
          className={s.legendLine}
          style={{ borderTopStyle: dashed ? 'dashed' : 'solid', borderTopColor: color }}
          aria-hidden="true"
        />
      )}
      <span style={{ color }}>{label}</span>
    </span>
  )
}
