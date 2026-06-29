import s from './AdRunImpact.module.css'

export function AdRunImpact({ impact }) {
  const { descentM, eccentricFlag, reason, hasThresholdPace } = impact

  return (
    <div className={s.wrap}>
      <div
        className={s.banner}
        style={{ borderColor: eccentricFlag ? 'var(--yellow)' : 'var(--border)' }}
        role="region"
        aria-label="Eccentrische belasting"
      >
        <div className={s.bannerRow}>
          <span className={s.descentLabel}>Dalingshoogte</span>
          <span
            className={s.descentValue}
            style={{ color: eccentricFlag ? 'var(--yellow)' : 'var(--text)' }}
          >
            {descentM} m
          </span>
        </div>
        {reason && (
          <div
            className={s.reason}
            style={{ color: eccentricFlag ? 'var(--yellow)' : 'var(--muted)' }}
          >
            {eccentricFlag ? '⚠ ' : ''}{reason}
          </div>
        )}
      </div>

      <p className={s.note}>
        Hardlopen is de modaliteit die lower-body interferentie drijft. Krachttraining concurrent met
        hardlopen — niet met fietsen — gaf significante afname in spierhypertrofie en kracht (Wilson
        et al. 2012). Eccentrische en impact-belasting worden als waarschijnlijk mechanisme gezien.
        Loopbelasting wordt daarom apart gehouden en nooit opgeteld bij krachtvermoeidheid.
      </p>

      {!hasThresholdPace && (
        <div className={s.hint}>
          Stel een drempeltempo in (30-minutentijdrit) om rTSS en IF te activeren. Momenteel wordt
          hrTSS getoond.
        </div>
      )}
    </div>
  )
}
