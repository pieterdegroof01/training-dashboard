import { IconSpark } from './Icon.jsx'
import s from './AdAiCard.module.css'

export function AdAiCard({ text }) {
  return (
    <div className={s.card} role="region" aria-label="Coach-analyse">
      <div className={s.header}>
        <IconSpark size={16} color="var(--accent)" />
        <span className={s.eyebrow}>COACH-ANALYSE</span>
      </div>
      <p className={s.text}>{text}</p>
    </div>
  )
}
