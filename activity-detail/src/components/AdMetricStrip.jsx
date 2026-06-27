import s from './AdMetricStrip.module.css'

export function AdMetricStrip({ metrics, cols = 8 }) {
  return (
    <div
      className={s.grid}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      role="list"
      aria-label="Kerncijfers"
    >
      {metrics.map((m) => (
        <div
          key={m.l}
          className={s.cell}
          role="listitem"
        >
          <div className={s.label}>{m.l}</div>
          <div
            className={s.value}
            style={{ color: m.accent ? 'var(--accent)' : 'var(--text)' }}
          >
            {m.v}
            {m.u && <span className={s.unit}>{m.u}</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
