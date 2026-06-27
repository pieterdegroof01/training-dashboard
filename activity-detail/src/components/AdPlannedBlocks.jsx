import s from './AdPlannedBlocks.module.css'

export function AdPlannedBlocks({ planned, zones }) {
  if (!planned?.blocks) return null

  return (
    <div>
      <div className={s.planMeta}>
        {planned.title} · doel {planned.tss} TSS
      </div>
      <div className={s.blocks} role="list" aria-label="Sessie-blokken">
        {planned.blocks.map((b, i) => {
          const zone = zones[b.z] || zones[0]
          const zColor = `var(${zone.cssVar})`
          const rep = b.rep > 1 ? `${b.rep}× ` : ''
          const zoneLabel = `Z${b.z + 1}`

          return (
            <div
              key={i}
              className={s.block}
              style={{ borderLeftColor: zColor }}
              role="listitem"
              aria-label={`${rep}${b.t}, ${b.d} minuten, ${zoneLabel}`}
            >
              <span className={s.blockTitle}>{rep}{b.t}</span>
              <span className={s.blockMeta}>
                {b.d}min
                <span className={s.zoneTag} style={{ color: zColor }}>{zoneLabel}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
