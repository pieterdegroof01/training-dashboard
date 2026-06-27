import s from './AdZoneBar.module.css'

export function AdZoneBar({ zones }) {
  const tot = zones.reduce((sum, z) => sum + z.min, 0) || 1

  return (
    <div>
      <div
        className={s.bar}
        role="img"
        aria-label={`Zoneverdeling: ${zones.map(z => `${z.z} ${z.min} minuten`).join(', ')}`}
      >
        {zones.map((z) => (
          <div
            key={z.z}
            className={s.segment}
            title={`${z.z} ${z.name} · ${z.min} min`}
            style={{
              width: `${(z.min / tot) * 100}%`,
              background: `var(${z.cssVar})`,
              minWidth: z.min > 0 ? 2 : 0,
            }}
          />
        ))}
      </div>

      <div className={s.legend} role="list" aria-label="Zone-legenda">
        {zones.map((z) => (
          <div key={z.z} className={s.item} role="listitem">
            <span
              className={s.dot}
              style={{ background: `var(${z.cssVar})` }}
              aria-hidden="true"
            />
            <div>
              <div className={s.zLabel}>
                <span>{z.z}</span>
                <span className={s.zMin}> · {z.min}<span className={s.zUnit}>min</span></span>
              </div>
              <div className={s.zName}>{z.name}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
