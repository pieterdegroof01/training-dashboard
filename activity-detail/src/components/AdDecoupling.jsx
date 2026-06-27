import { ConventionDot } from './ConventionDot.jsx'
import s from './AdDecoupling.module.css'

const CONVENTION_NOTE =
  'De 5%-grens voor aerobe decoupling is een coaching-conventie (TrainingPeaks), niet peer-reviewed gevalideerd. Minder valide bij VI > 1.10 of inspanningsduur < 20 min.'

export function AdDecoupling({ dc, vi }) {
  const good = dc.status === 'goed'
  // Validiteitscheck: VI hoog of rit kort → caveat tonen
  const viVal = parseFloat(vi || 1.03)
  const lowValidity = viVal > 1.10

  return (
    <div>
      <div className={s.tiles} role="list" aria-label="Aerobe koppeling">
        {[
          { label: 'EF 1e helft', value: dc.ef1, color: 'var(--text)', id: 'ef1' },
          { label: 'EF 2e helft', value: dc.ef2, color: 'var(--text)', id: 'ef2' },
          {
            label: 'Koppeling',
            value: `${dc.pct}%`,
            color: good ? 'var(--green)' : 'var(--yellow)',
            statusLabel: good ? '✓ Goed' : '⚠ Let op',
            id: 'pct',
          },
        ].map((tile) => (
          <div
            key={tile.id}
            className={s.tile}
            role="listitem"
            aria-label={`${tile.label}: ${tile.value}${tile.statusLabel ? `, status: ${tile.statusLabel}` : ''}`}
          >
            <div className={s.tileValue} style={{ color: tile.color }}>
              {tile.value}
            </div>
            <div className={s.tileLabel}>
              {tile.label}
              {tile.id === 'pct' && (
                <ConventionDot note={CONVENTION_NOTE} />
              )}
            </div>
            {tile.statusLabel && (
              <div className={s.status} style={{ color: tile.color }}>
                {tile.statusLabel}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className={s.description}>
        {good
          ? 'Goede aerobe koppeling — het cardiovasculaire systeem bleef stabiel gedurende de rit, geen drift door uitputting.'
          : 'HR-drift gedetecteerd — mogelijk door glycogeenuitputting, dehydratie of intensiteit boven de aerobe drempel.'}
        {lowValidity && (
          <span className={s.caveat}>
            {' '}(Kanttekening: hoge VI maakt decoupling minder valide bij deze rit.)
          </span>
        )}
      </p>
    </div>
  )
}
