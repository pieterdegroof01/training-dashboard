import { useState } from 'react'

export function ConventionDot({ note }) {
  const [show, setShow] = useState(false)
  return (
    <span
      className="tooltip-anchor"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span
        className="info-dot"
        role="img"
        aria-label="Conventie-indicator"
        tabIndex={0}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
      >
        i
      </span>
      {show && (
        <span className="tooltip-bubble" role="tooltip">
          {note}
        </span>
      )}
    </span>
  )
}
