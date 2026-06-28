import s from './AdPlanCompare.module.css'

export function AdPlanCompare({ activity }) {
  const { planned, zones, metrics } = activity
  if (!planned) return null

  const actual = zones.map((z) => z.min)
  const tot = (arr) => arr.reduce((a, b) => a + b, 0) || 1

  const planTotal  = tot(planned.zoneMin)
  const actTotal   = tot(actual)
  const sharedMax  = Math.max(planTotal, actTotal) || 1

  const tssActual = metrics.find((m) => m.l === 'TSS')?.v || '–'

  const rows = [
    { label: 'Gepland',   vals: planned.zoneMin, total: planTotal },
    { label: 'Werkelijk', vals: actual,           total: actTotal  },
  ]

  return (
    <div>
      <div className={s.planTitle}>{planned.title}</div>

      {rows.map(({ label, vals, total }) => (
        <div key={label} className={s.barRow} aria-label={`${label} zoneverdeling`}>
          <span className={s.barLabel}>{label}</span>
          <div className={s.barTrack}>
            <div
              className={s.bar}
              style={{ width: `${(total / sharedMax) * 100}%` }}
              role="img"
              aria-label={vals.map((m, i) => `Z${i + 1}: ${m}min`).join(', ')}
            >
              {vals.map((m, i) => (
                <div
                  key={i}
                  className={s.segment}
                  style={{
                    width: `${(m / tot(vals)) * 100}%`,
                    background: `var(${zones[i].cssVar})`,
                    minWidth: m > 0 ? 2 : 0,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      <div className={s.totals}>
        <MiniStat label="Doel-TSS"     value={planned.tss ?? '–'} />
        <MiniStat label="TSS"          value={tssActual} good />
        <MiniStat label="Plan-tijd"    value={`${planTotal}m`} />
        <MiniStat label="Rit-tijd"     value={`${actTotal}m`} good={actTotal >= planTotal * 0.9} />
      </div>
    </div>
  )
}

function MiniStat({ label, value, good }) {
  return (
    <div>
      <div className={s.miniLabel}>{label}</div>
      <div
        className={s.miniValue}
        style={{ color: good ? 'var(--green)' : 'var(--text)' }}
      >
        {value}
      </div>
    </div>
  )
}
