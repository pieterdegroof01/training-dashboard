import { Card } from './Card.jsx'
import s from './AdSection.module.css'

export function AdSection({ title, sub, children, style = {} }) {
  return (
    <Card radius={18} padding={16} style={style}>
      <div className={s.heading}>
        <span className={s.title}>{title}</span>
        {sub && <span className={s.sub}>{sub}</span>}
      </div>
      {children}
    </Card>
  )
}
