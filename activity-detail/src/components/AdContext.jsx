import s from './AdContext.module.css'

export function AdContext({ context }) {
  const { hoursSinceStrength, lastStrengthWasLegs, tsbRide, sessionOrder } = context

  // Flag: beendag binnen 48u vóór deze rit
  const legDayFlag = lastStrengthWasLegs && hoursSinceStrength < 48
  const hasFlag = legDayFlag

  return (
    <div className={`${s.card} ${hasFlag ? s.flagged : s.clear}`}>
      {hasFlag && (
        <div className={s.banner}>
          <span className={s.bannerIcon}>⚠</span>
          <span className={s.bannerText}>
            Beendag {hoursSinceStrength}u geleden — mogelijk effect op vermogen en aerobe koppeling
          </span>
        </div>
      )}

      <div className={s.rows}>
        {/* Uren sinds krachtsessie */}
        <ContextRow
          icon="🏋️"
          label="Laatste krachtsessie (benen)"
          value={`${hoursSinceStrength}u geleden`}
          note={
            legDayFlag
              ? 'Binnen 48u: geeft acuut risico op vermogensverlies en verhoogde decoupling (Doma et al.)'
              : 'Meer dan 48u: interferentie-effect geminimaliseerd'
          }
          status={legDayFlag ? 'warn' : 'ok'}
        />

        {/* Modaliteit-interferentie */}
        <ContextRow
          icon="🚴"
          label="Interferentie-richting"
          value="Laag"
          note="Fietsen geeft lage interferentie op een volgende krachtsessie (geen excentrische spierschade). Optimale volgorde bij gecombineerde dag: kracht vóór endurance."
          status="ok"
        />

        {/* Fiets-TSB gescheiden */}
        <ContextRow
          icon="📊"
          label="Fiets-TSB (modaliteit-specifiek)"
          value={tsbRide > 0 ? `+${tsbRide}` : String(tsbRide)}
          note="Fiets-TSB apart gehouden — niet gecombineerd met kracht-readiness of loop-belasting (fysiologisch incommensurabel)."
          status={tsbRide >= 0 ? 'ok' : 'warn'}
        />

        {/* Sessievolgorde */}
        {sessionOrder && (
          <ContextRow
            icon="📋"
            label="Sessievolgorde vandaag"
            value={sessionOrder}
            note="Aanbevolen volgorde: kracht vóór endurance (beschermt mTORC1-signalering)."
            status="info"
          />
        )}
      </div>

      {hasFlag && (
        <p className={s.summary}>
          Deze rit viel <strong>{hoursSinceStrength}u</strong> na een beendag. Vermogen en decoupling
          kunnen licht gedrukt zijn door residuele spierschade en glycogeentekort (Doma et al. —
          resistance training–induced suboptimization of endurance performance). De werkelijk behaalde
          waarden in deze context zijn dus sterk — de koppeling van 3,4% en IF van 0,89 zijn
          vermoedelijk iets beter dan ze bij volledig herstel zouden zijn.
        </p>
      )}
    </div>
  )
}

function ContextRow({ icon, label, value, note, status }) {
  const statusColor = {
    ok:   'var(--green)',
    warn: 'var(--yellow)',
    info: 'var(--muted)',
  }[status] || 'var(--muted)'

  return (
    <div className={s.row}>
      <span className={s.rowIcon} aria-hidden="true">{icon}</span>
      <div className={s.rowBody}>
        <div className={s.rowTop}>
          <span className={s.rowLabel}>{label}</span>
          <span className={s.rowValue} style={{ color: statusColor }}>{value}</span>
        </div>
        <div className={s.rowNote}>{note}</div>
      </div>
    </div>
  )
}
