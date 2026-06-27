import { IconRide } from './Icon.jsx'
import s from './AdHeader.module.css'

export function AdHeader({ activity, onBack, layout = 'desktop' }) {
  const { name, when, where, source, sessionType } = activity
  const isDesktop = layout === 'desktop'

  return (
    <div className={s.header}>
      <button className={s.backBtn} onClick={onBack}>
        ← Activiteiten
      </button>
      <div className={s.heroRow}>
        <div
          className={s.iconWrap}
          style={{ width: isDesktop ? 52 : 46, height: isDesktop ? 52 : 46 }}
          aria-hidden="true"
        >
          <IconRide size={isDesktop ? 26 : 22} color="var(--accent)" />
        </div>
        <div className={s.titleBlock}>
          <div className={s.titleRow}>
            <h1 className={s.title} style={{ fontSize: isDesktop ? 32 : 24 }}>
              {name}
            </h1>
            {sessionType && (
              <span className={s.sessionPill} aria-label={`Sessietype: ${sessionType}`}>
                {sessionType}
              </span>
            )}
          </div>
          <div className={s.meta}>
            <span>{when}</span>
            <span className={s.dot} aria-hidden="true">·</span>
            <span>{where}</span>
            <span className={s.sourcePill}>{source}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
