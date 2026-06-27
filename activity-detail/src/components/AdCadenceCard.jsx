import s from './AdCadenceCard.module.css'

export function AdCadenceCard({ activity }) {
  const { cadence, maxHr, metrics } = activity
  const avgHr = metrics.find((m) => m.l === 'GEM. HR')?.v || '–'

  const tiles = [
    { label: 'Gem. HR',    value: avgHr,      unit: 'bpm' },
    { label: 'Max HR',     value: maxHr,       unit: 'bpm' },
    { label: 'Gem. cadans', value: cadence.avg, unit: 'rpm' },
    { label: 'Max cadans', value: cadence.max, unit: 'rpm' },
  ]

  return (
    <div className={s.tiles} role="list" aria-label="Hartslag en cadans">
      {tiles.map((t) => (
        <div key={t.label} className={s.tile} role="listitem">
          <div className={s.value}>
            {t.value}
            <span className={s.unit}>{t.unit}</span>
          </div>
          <div className={s.label}>{t.label}</div>
        </div>
      ))}
    </div>
  )
}
