import s from './Card.module.css'

export function Card({ children, padding = 16, radius = 18, className = '', style = {} }) {
  return (
    <div
      className={`${s.card} ${className}`}
      style={{
        borderRadius: radius,
        padding,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
