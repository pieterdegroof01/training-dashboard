import { ConventionDot } from './ConventionDot.jsx'
import { IconArrowUp, IconArrowDown } from './Icon.jsx'
import s from './AdDerivedRow.module.css'

export function AdDerivedRow({ derived }) {
  return (
    <div className={s.row} role="list" aria-label="Afgeleide metrics">
      {derived.map((d) => (
        <DerivedCell key={d.l} d={d} />
      ))}
    </div>
  )
}

function DerivedCell({ d }) {
  const hasRef = !!d.ref
  const isGood = d.good
  const isTrend = d.ref?.direction === 'up' || d.ref?.direction === 'down'
  const trendUp = d.ref?.direction === 'up'

  return (
    <div className={s.cell} role="listitem">
      <div
        className={s.value}
        style={{ color: isGood ? 'var(--green)' : 'var(--text)' }}
      >
        {d.v}
      </div>

      <div className={s.labelRow}>
        <span className={s.label}>{d.l}</span>
        {d.convention && (
          <ConventionDot note={d.conventionNote} />
        )}
      </div>

      <div className={s.sub}>{d.sub}</div>

      {hasRef && (
        <div className={s.ref}>
          {isTrend ? (
            <span
              className={s.trend}
              style={{ color: trendUp ? 'var(--green)' : 'var(--red)' }}
              aria-label={`30-daagse trend: ${d.ref.delta}`}
            >
              {trendUp
                ? <IconArrowUp size={10} color="var(--green)" />
                : <IconArrowDown size={10} color="var(--red)" />
              }
              {d.ref.delta} vs {d.ref.label}
            </span>
          ) : d.ref.value ? (
            <span className={s.refVal}>
              {d.ref.label} <strong>{d.ref.value}</strong>
            </span>
          ) : (
            <span className={s.refBand}>{d.ref.label}</span>
          )}
        </div>
      )}
    </div>
  )
}
