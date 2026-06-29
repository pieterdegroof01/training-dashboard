import { useRef, useEffect } from 'react'
import s from './AdRunChart.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function downsample(pts, maxPts) {
  if (!pts || pts.length <= maxPts) return pts || []
  const step = Math.ceil(pts.length / maxPts)
  return pts.filter((_, i) => i % step === 0)
}

function nearest(pts, key, t) {
  if (!pts?.length) return null
  let best = pts[0], bestDist = Math.abs(pts[0].t - t)
  for (const p of pts) {
    const d = Math.abs(p.t - t)
    if (d < bestDist) { best = p; bestDist = d }
    if (p.t > t + 10) break
  }
  return best?.[key] ?? null
}

function fmtTime(sec, range) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const ss = Math.round(sec % 60)
  if (h > 0) return `${h}u${String(m).padStart(2, '0')}`
  if (range > 300) return `${m}min`
  return `${m}m${String(ss).padStart(2, '0')}s`
}

function secToPace(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '–'
  const m = Math.floor(sec / 60)
  const ss = Math.round(sec % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

function avg(pts, key) {
  if (!pts?.length) return null
  return Math.round(pts.reduce((a, p) => a + p[key], 0) / pts.length)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdRunChart({
  speed, gap, hr, durationMin,
  hoverT, selection, onHover, onSelect,
  w = 640, h = 200,
}) {
  const svgRef      = useRef(null)
  const overlayRef  = useRef(null)
  const crosshairRef = useRef(null)
  const tooltipRef  = useRef(null)
  const paramsRef   = useRef({})

  const tMin   = selection ? selection.tStart : 0
  const tMax   = selection ? selection.tEnd   : (durationMin * 60 || 1)
  const tRange = tMax - tMin || 1
  const pad    = { left: 48, top: 18, right: 48, bottom: 26 }
  const drawW  = w - pad.left - pad.right
  const drawH  = h - pad.top  - pad.bottom

  paramsRef.current = { tMin, tMax, tRange, drawW, drawH, pad, w, h, speed, gap, hr, onHover, onSelect }

  // ── Data in window ──────────────────────────────────────────────────────────

  const speedIn = speed ? speed.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const gapIn   = gap   ? gap.filter(p   => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const hrIn    = hr    ? hr.filter(p    => p.t >= tMin - 1 && p.t <= tMax + 1) : []

  // Convert gap (sec/km) to km/u for same scale as speed
  const gapAsSpeed = gapIn.map(p => ({ t: p.t, v: p.pace > 0 ? 3600 / p.pace : 0 }))

  const speedDisp = downsample(speedIn,    Math.max(drawW, 300))
  const gapDisp   = downsample(gapAsSpeed, Math.max(drawW, 300))
  const hrDisp    = downsample(hrIn,       Math.max(drawW, 300))

  const allSpeeds = [...speedIn.map(p => p.v), ...gapAsSpeed.map(p => p.v)].filter(v => v > 0)
  const maxV  = allSpeeds.length ? Math.max(...allSpeeds) * 1.10 : 25
  const minV  = 0
  const maxHr = hrIn.length ? Math.max(...hrIn.map(p => p.hr)) * 1.05 : 200
  const minHr = hrIn.length ? Math.min(...hrIn.map(p => p.hr)) * 0.95 : 100

  const xS  = t  => pad.left + ((t - tMin) / tRange) * drawW
  const yV  = v  => pad.top + (1 - (v - minV) / (maxV - minV)) * drawH
  const yH  = hv => pad.top + (1 - (hv - minHr) / (maxHr - minHr)) * drawH

  const speedPath = speedDisp.length >= 2
    ? speedDisp.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yV(p.v)}`).join(' ') : null
  const speedFill = speedPath
    ? `${speedPath} L${xS(speedDisp[speedDisp.length - 1].t)},${pad.top + drawH} L${xS(speedDisp[0].t)},${pad.top + drawH} Z`
    : null
  const gapPath = gapDisp.length >= 2
    ? gapDisp.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yV(p.v)}`).join(' ') : null
  const hrPath = hrDisp.length >= 2
    ? hrDisp.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yH(p.hr)}`).join(' ') : null

  const avgSpd = avg(speedIn, 'v')
  const avgHrV = avg(hrIn,    'hr')

  // Time grid
  const interval = tRange > 7200 ? 1800 : tRange > 3600 ? 900 : tRange > 1800 ? 600 : tRange > 600 ? 300 : tRange > 300 ? 60 : 30
  const timeTicks = []
  for (let t = Math.ceil(tMin / interval) * interval; t <= tMax; t += interval) {
    timeTicks.push({ t, label: fmtTime(t, tRange), x: xS(t) })
  }

  // Y-axis labels
  const vLabels  = maxV > 0 ? [0, maxV / 2, maxV].map(v => ({ v: Math.round(v),  y: yV(v) })) : []
  const hrLabels = hrIn.length ? [minHr, (minHr + maxHr) / 2, maxHr].map(v => ({ v: Math.round(v), y: yH(v) })) : []

  // ── Tooltip ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const tip = document.createElement('div')
    tip.style.cssText = [
      'position:fixed', 'display:none', 'z-index:9999', 'pointer-events:none',
      'background:rgba(6,17,46,0.93)', 'color:#f6f2e6', 'border-radius:10px',
      'padding:7px 11px', 'font-size:11px', 'min-width:150px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.4)', 'line-height:1.6',
    ].join(';')
    document.body.appendChild(tip)
    tooltipRef.current = tip
    return () => { document.body.removeChild(tip) }
  }, [])

  // ── Touch handlers ──────────────────────────────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    function onTouchMove(e) {
      e.preventDefault()
      const touch = e.touches[0]
      const svg = svgRef.current
      if (!svg) return
      const { tMin, tRange, drawW, pad, w, onHover } = paramsRef.current
      const svgRect = svg.getBoundingClientRect()
      const mouseX = (touch.clientX - svgRect.left) * (w / svgRect.width)
      if (mouseX < pad.left || mouseX > pad.left + drawW) return
      onHover?.(tMin + ((mouseX - pad.left) / drawW) * tRange)
      const ch = crosshairRef.current
      if (ch) { ch.setAttribute('x1', mouseX); ch.setAttribute('x2', mouseX); ch.style.display = '' }
    }

    function onTouchEnd() {
      if (crosshairRef.current) crosshairRef.current.style.display = 'none'
      if (tooltipRef.current)  tooltipRef.current.style.display  = 'none'
      paramsRef.current.onHover?.(null)
    }

    overlay.addEventListener('touchmove',  onTouchMove, { passive: false })
    overlay.addEventListener('touchend',   onTouchEnd)
    overlay.addEventListener('touchcancel', onTouchEnd)
    return () => {
      overlay.removeEventListener('touchmove',  onTouchMove)
      overlay.removeEventListener('touchend',   onTouchEnd)
      overlay.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  function handleMouseMove(e) {
    const { tMin, tRange, drawW, pad, w, speed, gap, hr, onHover } = paramsRef.current
    const svg = svgRef.current
    if (!svg) return
    const svgRect = svg.getBoundingClientRect()
    const mouseX  = (e.clientX - svgRect.left) * (w / svgRect.width)
    if (mouseX < pad.left || mouseX > pad.left + drawW) {
      if (crosshairRef.current) crosshairRef.current.style.display = 'none'
      if (tooltipRef.current)  tooltipRef.current.style.display  = 'none'
      return
    }
    const tCurrent = tMin + ((mouseX - pad.left) / drawW) * tRange
    onHover?.(tCurrent)
    const ch = crosshairRef.current
    if (ch) { ch.setAttribute('x1', mouseX); ch.setAttribute('x2', mouseX); ch.style.display = '' }

    const spdVal = nearest(speed, 'v',   tCurrent)
    const gapVal = nearest(gap,   'pace', tCurrent)
    const hrVal  = nearest(hr,    'hr',  tCurrent)
    const tip = tooltipRef.current
    if (tip) {
      let html = `<div style="font-weight:700;font-size:10px;color:#aab3d0;margin-bottom:3px">${fmtTime(tCurrent, tRange)}</div>`
      if (spdVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:5px"></span>Tempo: <strong>${secToPace(3600 / spdVal)} /km</strong></div>`
      if (gapVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:2px;border:1px solid var(--accent2);margin-right:5px"></span>GAP: <strong>${secToPace(gapVal)} /km</strong></div>`
      if (hrVal  != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-right:5px"></span>Hartslag: <strong>${Math.round(hrVal)} bpm</strong></div>`
      tip.innerHTML = html
      tip.style.display = 'block'
      const tipW = 170
      let tipX = e.clientX + 14
      if (tipX + tipW > window.innerWidth) tipX = e.clientX - tipW - 14
      tip.style.left = tipX + 'px'
      tip.style.top  = (e.clientY - 60) + 'px'
    }
  }

  function handleMouseLeave() {
    if (crosshairRef.current) crosshairRef.current.style.display = 'none'
    if (tooltipRef.current)  tooltipRef.current.style.display  = 'none'
    paramsRef.current.onHover?.(null)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={s.wrap}>
      <div className={s.legend}>
        {avgSpd != null && <LegendPill color="var(--accent)"  label={`Snelheid · gem ${avgSpd} km/u`} />}
        {gapPath          && <LegendPill color="var(--accent2)" label="GAP (grade-adj.)" thin />}
        {avgHrV != null  && <LegendPill color="var(--red)"    label={`Hartslag · gem ${avgHrV} bpm`} dashed />}
      </div>

      <svg ref={svgRef} width="100%" viewBox={`0 0 ${w} ${h}`} className={s.svg}>
        {/* Time grid */}
        {timeTicks.map(({ t, label, x }) => (
          <g key={t}>
            <line x1={x} y1={pad.top} x2={x} y2={pad.top + drawH} stroke="var(--divider)" strokeWidth="0.5" opacity="0.5" />
            <text x={x} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{label}</text>
          </g>
        ))}

        {/* Left Y-axis (speed, km/u) */}
        {vLabels.map(({ v, y }) => (
          <text key={`sv${v}`} x={pad.left - 5} y={y + 3} textAnchor="end" fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">{v}</text>
        ))}

        {/* Right Y-axis (HR) */}
        {hrLabels.map(({ v, y }) => (
          <text key={`hv${v}`} x={pad.left + drawW + 5} y={y + 3} textAnchor="start" fontSize="8" fill="var(--red)" opacity="0.7" fontFamily="var(--font-mono)">{v}</text>
        ))}

        {/* Speed fill */}
        {speedFill && <path d={speedFill} fill="var(--accent)" opacity="var(--fill-opacity)" />}

        {/* GAP line (thin, accent2) */}
        {gapPath && <path d={gapPath} fill="none" stroke="var(--accent2)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />}

        {/* HR line */}
        {hrPath && <path d={hrPath} fill="none" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="4,4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />}

        {/* Speed line */}
        {speedPath && <path d={speedPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Crosshair */}
        <line
          ref={crosshairRef}
          y1={pad.top} y2={pad.top + drawH}
          stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3,3"
          style={{ display: 'none', pointerEvents: 'none' }}
        />

        {/* Interactive overlay */}
        <rect
          ref={overlayRef}
          x={pad.left} y={pad.top} width={drawW} height={drawH}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </svg>
    </div>
  )
}

function LegendPill({ color, label, dashed, thin }) {
  return (
    <span className={s.legendPill}>
      <span
        className={s.legendLine}
        style={{
          borderTopStyle: dashed ? 'dashed' : 'solid',
          borderTopColor: color,
          borderTopWidth: thin ? 1 : 3,
        }}
        aria-hidden="true"
      />
      <span style={{ color }}>{label}</span>
    </span>
  )
}
