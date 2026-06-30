import { useRef, useEffect, useState } from 'react'
import s from './AdDualChart.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

function downsample(pts, maxPts) {
  if (!pts || pts.length <= maxPts) return pts || []
  const step = Math.ceil(pts.length / maxPts)
  return pts.filter((_, i) => i % step === 0)
}

function smoothPower(pts, windowSize = 15) {
  if (!pts.length) return pts
  const half = Math.floor(windowSize / 2)
  return pts.map((p, i) => {
    const from = Math.max(0, i - half)
    const to = Math.min(pts.length - 1, i + half)
    let sum = 0
    for (let j = from; j <= to; j++) sum += pts[j].w
    return { ...p, w: sum / (to - from + 1) }
  })
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

function fmtDur(sec) {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return m ? `${h}u${String(m).padStart(2, '0')}` : `${h}u`
}

function avg(pts, key) {
  if (!pts?.length) return null
  return Math.round(pts.reduce((a, p) => a + p[key], 0) / pts.length)
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdDualChart({ power, hr, speed, cadence, altitude, gradient, ftp, durationMin, hoverT, selection, onHover, onSelect, w = 640, h = 200 }) {
  const svgRef = useRef(null)
  const overlayRef = useRef(null)
  const crosshairRef = useRef(null)
  const selRectRef = useRef(null)
  const tooltipRef = useRef(null)
  const dragRef = useRef({ startX: null, isDragging: false })

  // paramsRef holds latest render state; handlers read from it to avoid stale closures
  const paramsRef = useRef({})

  // Toggles voor secundaire overlays (snelheid, cadans); hoogte is altijd zichtbaar als achtergrond
  const [showSpeed, setShowSpeed] = useState(false)
  const [showCadence, setShowCadence] = useState(false)

  // Kijkvenster (x-as) kan breder zijn dan het piekvenster voor leesbaarheid bij korte selecties.
  const peakStart = selection ? selection.tStart : 0
  const peakEnd = selection ? selection.tEnd : (durationMin * 60 || 1)
  const tMin = selection ? (selection.viewStart ?? selection.tStart) : 0
  const tMax = selection ? (selection.viewEnd ?? selection.tEnd) : (durationMin * 60 || 1)
  const tRange = tMax - tMin || 1
  const peakRange = (peakEnd - peakStart) || 1
  const pad = { left: 50, top: 18, right: 54, bottom: 26 }
  const drawW = w - pad.left - pad.right
  const drawH = h - pad.top - pad.bottom

  paramsRef.current = { tMin, tMax, tRange, drawW, drawH, pad, w, h, power, hr, ftp, onHover, onSelect, speed, cadence, gradient, showSpeed, showCadence }

  // ── Derived display data ────────────────────────────────────────────────────

  const powerInWindow = power ? power.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const hrInWindow = hr ? hr.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  // Gemiddelden worden over het exacte piekvenster berekend, niet over het bredere kijkvenster.
  const powerInPeak = power ? power.filter(p => p.t >= peakStart - 1 && p.t <= peakEnd + 1) : []
  const hrInPeak = hr ? hr.filter(p => p.t >= peakStart - 1 && p.t <= peakEnd + 1) : []

  const powerDisplay = powerInWindow.length ? smoothPower(downsample(powerInWindow, Math.max(drawW, 300))) : []
  const hrDisplay = hrInWindow.length ? downsample(hrInWindow, Math.max(drawW, 300)) : []

  const maxP = powerInWindow.length ? Math.max(...powerInWindow.map(p => p.w), (ftp || 200) * 1.1) : (ftp || 400) * 1.1
  const maxHr = hrInWindow.length ? Math.max(...hrInWindow.map(p => p.hr)) * 1.05 : 200
  const minHr = hrInWindow.length ? Math.min(...hrInWindow.map(p => p.hr)) * 0.95 : 100

  const xS = t => pad.left + ((t - tMin) / tRange) * drawW
  const yP = wv => pad.top + (1 - wv / maxP) * drawH
  const yH = hv => pad.top + (1 - (hv - minHr) / (maxHr - minHr)) * drawH

  const powerPath = powerDisplay.length >= 2
    ? powerDisplay.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yP(p.w)}`).join(' ') : null
  const hrPath = hrDisplay.length >= 2
    ? hrDisplay.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yH(p.hr)}`).join(' ') : null
  const powerFill = powerPath
    ? `${powerPath} L${xS(powerDisplay[powerDisplay.length - 1].t)},${pad.top + drawH} L${xS(powerDisplay[0].t)},${pad.top + drawH} Z`
    : null

  // ── Hoogte (achtergrond), snelheid en cadans (toggles) ──────────────────────
  const altInWindow = altitude ? altitude.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const speedInWindow = speed ? speed.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const cadInWindow = cadence ? cadence.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []

  const altDisplay = altInWindow.length ? downsample(altInWindow, Math.max(drawW, 300)) : []
  const speedDisplay = (showSpeed && speedInWindow.length) ? downsample(speedInWindow, Math.max(drawW, 300)) : []
  const cadDisplay = (showCadence && cadInWindow.length) ? downsample(cadInWindow, Math.max(drawW, 300)) : []

  const minAlt = altInWindow.length ? Math.min(...altInWindow.map(p => p.alt)) : 0
  const maxAlt = altInWindow.length ? Math.max(...altInWindow.map(p => p.alt)) : 1
  const altSpan = (maxAlt - minAlt) || 1
  const yAlt = av => pad.top + (1 - (av - minAlt) / altSpan) * drawH

  const minSpd = speedInWindow.length ? Math.min(...speedInWindow.map(p => p.v)) : 0
  const maxSpd = speedInWindow.length ? Math.max(...speedInWindow.map(p => p.v)) : 1
  const spdSpan = (maxSpd - minSpd) || 1
  const ySpd = sv => pad.top + (1 - (sv - minSpd) / spdSpan) * drawH

  const minCad = cadInWindow.length ? Math.min(...cadInWindow.map(p => p.c)) : 0
  const maxCad = cadInWindow.length ? Math.max(...cadInWindow.map(p => p.c)) : 1
  const cadSpan = (maxCad - minCad) || 1
  const yCad = cv => pad.top + (1 - (cv - minCad) / cadSpan) * drawH

  const altPath = altDisplay.length >= 2
    ? altDisplay.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yAlt(p.alt)}`).join(' ') : null
  const altFill = altPath
    ? `${altPath} L${xS(altDisplay[altDisplay.length - 1].t)},${pad.top + drawH} L${xS(altDisplay[0].t)},${pad.top + drawH} Z`
    : null
  const speedPath = speedDisplay.length >= 2
    ? speedDisplay.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${ySpd(p.v)}`).join(' ') : null
  const cadPath = cadDisplay.length >= 2
    ? cadDisplay.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yCad(p.c)}`).join(' ') : null

  // Averages from raw data (not smoothed), over het exacte piekvenster
  const avgP = avg(powerInPeak, 'w')
  const avgHr = avg(hrInPeak, 'hr')

  // FTP line
  const ftpY = ftp ? yP(ftp) : null

  // Time grid
  const rawDur = tRange
  const interval = rawDur > 7200 ? 1800 : rawDur > 3600 ? 900 : rawDur > 1800 ? 600 : rawDur > 600 ? 300 : rawDur > 300 ? 60 : 30
  const firstTick = Math.ceil(tMin / interval) * interval
  const timeTicks = []
  for (let t = firstTick; t <= tMax; t += interval) {
    timeTicks.push({ t, label: fmtTime(t, tRange), x: xS(t) })
  }

  // Y-axis labels
  const powerYLabels = powerInWindow.length
    ? [0, maxP / 2, maxP].map(v => ({ v: Math.round(v), y: yP(v) })) : []
  const hrYLabels = hrInWindow.length
    ? [minHr, (minHr + maxHr) / 2, maxHr].map(v => ({ v: Math.round(v), y: yH(v) })) : []

  // ── Tooltip (body-level portal) ─────────────────────────────────────────────

  useEffect(() => {
    const tip = document.createElement('div')
    tip.style.cssText = [
      'position:fixed', 'display:none', 'z-index:9999', 'pointer-events:none',
      'background:rgba(6,17,46,0.93)', 'color:#f6f2e6', 'border-radius:10px',
      'padding:7px 11px', 'font-size:11px', 'min-width:140px',
      'box-shadow:0 2px 8px rgba(0,0,0,0.4)', 'line-height:1.6',
    ].join(';')
    document.body.appendChild(tip)
    tooltipRef.current = tip
    return () => { document.body.removeChild(tip) }
  }, [])

  // ── Touch handlers (non-passive) ────────────────────────────────────────────

  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    function onTouchStart(e) {
      e.preventDefault()
      const touch = e.touches[0]
      const svg = svgRef.current
      if (!svg) return
      const { w } = paramsRef.current
      const svgRect = svg.getBoundingClientRect()
      const scaleX = w / svgRect.width
      dragRef.current.startX = (touch.clientX - svgRect.left) * scaleX
      dragRef.current.isDragging = false
    }

    function onTouchMove(e) {
      e.preventDefault()
      const touch = e.touches[0]
      const svg = svgRef.current
      if (!svg) return
      const { tMin, tRange, drawW, pad, w, onHover } = paramsRef.current
      const svgRect = svg.getBoundingClientRect()
      const scaleX = w / svgRect.width
      const mouseX = (touch.clientX - svgRect.left) * scaleX
      const drag = dragRef.current

      if (drag.startX !== null && Math.abs(mouseX - drag.startX) > 4) {
        drag.isDragging = true
        const selRect = selRectRef.current
        if (selRect) {
          const x1 = Math.min(drag.startX, mouseX)
          const x2 = Math.max(drag.startX, mouseX)
          selRect.setAttribute('x', x1)
          selRect.setAttribute('width', x2 - x1)
          selRect.style.display = ''
        }
        return
      }

      if (mouseX < pad.left || mouseX > pad.left + drawW) return
      const tCurrent = tMin + ((mouseX - pad.left) / drawW) * tRange
      onHover?.(tCurrent)
      const crosshair = crosshairRef.current
      if (crosshair) {
        crosshair.setAttribute('x1', mouseX)
        crosshair.setAttribute('x2', mouseX)
        crosshair.style.display = ''
      }
    }

    function onTouchEnd(e) {
      const selRect = selRectRef.current
      if (selRect) selRect.style.display = 'none'
      const drag = dragRef.current
      if (drag.isDragging && drag.startX !== null) {
        const touch = e.changedTouches[0]
        const svg = svgRef.current
        if (svg) {
          const { tMin, tRange, drawW, pad, w, onSelect } = paramsRef.current
          const svgRect = svg.getBoundingClientRect()
          const scaleX = w / svgRect.width
          const mouseX = (touch.clientX - svgRect.left) * scaleX
          const x1 = Math.min(drag.startX, mouseX)
          const x2 = Math.max(drag.startX, mouseX)
          if (x2 - x1 >= 8) {
            const newTStart = tMin + Math.max(0, (x1 - pad.left) / drawW) * tRange
            const newTEnd = tMin + Math.min(1, (x2 - pad.left) / drawW) * tRange
            onSelect?.({ tStart: newTStart, tEnd: newTEnd })
          }
        }
      }
      drag.startX = null
      drag.isDragging = false
      if (crosshairRef.current) crosshairRef.current.style.display = 'none'
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      paramsRef.current.onHover?.(null)
    }

    overlay.addEventListener('touchstart', onTouchStart, { passive: false })
    overlay.addEventListener('touchmove', onTouchMove, { passive: false })
    overlay.addEventListener('touchend', onTouchEnd)
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart)
      overlay.removeEventListener('touchmove', onTouchMove)
      overlay.removeEventListener('touchend', onTouchEnd)
    }
  }, []) // reads from paramsRef.current at call time

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  function handleMouseMove(e) {
    const { tMin, tRange, drawW, pad, w, power, hr, gradient, speed, cadence, showSpeed, showCadence, onHover } = paramsRef.current
    const drag = dragRef.current
    const svg = svgRef.current
    if (!svg) return

    const svgRect = svg.getBoundingClientRect()
    const scaleX = w / svgRect.width
    const mouseX = (e.clientX - svgRect.left) * scaleX

    if (drag.startX !== null) {
      const dx = Math.abs(mouseX - drag.startX)
      if (dx > 4) {
        drag.isDragging = true
        if (crosshairRef.current) crosshairRef.current.style.display = 'none'
        if (tooltipRef.current) tooltipRef.current.style.display = 'none'
        const selRect = selRectRef.current
        if (selRect) {
          const x1 = Math.min(drag.startX, mouseX)
          const x2 = Math.max(drag.startX, mouseX)
          selRect.setAttribute('x', x1)
          selRect.setAttribute('width', x2 - x1)
          selRect.style.display = ''
        }
      }
      return
    }

    if (mouseX < pad.left || mouseX > pad.left + drawW) {
      if (crosshairRef.current) crosshairRef.current.style.display = 'none'
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      return
    }

    const tCurrent = tMin + ((mouseX - pad.left) / drawW) * tRange
    onHover?.(tCurrent)

    if (crosshairRef.current) {
      crosshairRef.current.setAttribute('x1', mouseX)
      crosshairRef.current.setAttribute('x2', mouseX)
      crosshairRef.current.style.display = ''
    }

    const pVal = nearest(power, 'w', tCurrent)
    const hrVal = nearest(hr, 'hr', tCurrent)
    const gradeVal = gradient ? nearest(gradient, 'g', tCurrent) : null
    const spdVal = (showSpeed && speed) ? nearest(speed, 'v', tCurrent) : null
    const cadVal = (showCadence && cadence) ? nearest(cadence, 'c', tCurrent) : null
    const timeStr = fmtTime(tCurrent, tRange)
    const tip = tooltipRef.current
    if (tip) {
      let html = `<div style="font-weight:700;font-size:10px;color:#aab3d0;margin-bottom:3px">${timeStr}</div>`
      if (pVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-right:5px"></span>Vermogen: <strong>${Math.round(pVal)} W</strong></div>`
      if (hrVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-right:5px"></span>Hartslag: <strong>${Math.round(hrVal)} bpm</strong></div>`
      if (gradeVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--muted);margin-right:5px"></span>Stijging: <strong>${gradeVal.toFixed(1)}%</strong></div>`
      if (spdVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#10B981;margin-right:5px"></span>Snelheid: <strong>${spdVal.toFixed(1)} km/u</strong></div>`
      if (cadVal != null) html += `<div><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#F59E0B;margin-right:5px"></span>Cadans: <strong>${Math.round(cadVal)} rpm</strong></div>`
      tip.innerHTML = html
      tip.style.display = 'block'
      const tipW = 160
      let tipX = e.clientX + 14
      if (tipX + tipW > window.innerWidth) tipX = e.clientX - tipW - 14
      tip.style.left = tipX + 'px'
      tip.style.top = (e.clientY - 60) + 'px'
    }
  }

  function handleMouseDown(e) {
    const svg = svgRef.current
    if (!svg) return
    const { w } = paramsRef.current
    const svgRect = svg.getBoundingClientRect()
    const scaleX = w / svgRect.width
    dragRef.current.startX = (e.clientX - svgRect.left) * scaleX
    dragRef.current.isDragging = false
    e.preventDefault()
  }

  function handleMouseUp(e) {
    if (selRectRef.current) selRectRef.current.style.display = 'none'
    const drag = dragRef.current
    if (!drag.isDragging || drag.startX === null) { drag.startX = null; drag.isDragging = false; return }
    const { tMin, tRange, drawW, pad, w, onSelect } = paramsRef.current
    const svg = svgRef.current
    if (!svg) return
    const svgRect = svg.getBoundingClientRect()
    const scaleX = w / svgRect.width
    const mouseX = (e.clientX - svgRect.left) * scaleX
    const x1 = Math.min(drag.startX, mouseX)
    const x2 = Math.max(drag.startX, mouseX)
    drag.startX = null; drag.isDragging = false
    if (x2 - x1 < 8) return
    const newTStart = tMin + Math.max(0, (x1 - pad.left) / drawW) * tRange
    const newTEnd = tMin + Math.min(1, (x2 - pad.left) / drawW) * tRange
    onSelect?.({ tStart: newTStart, tEnd: newTEnd })
  }

  function handleMouseLeave() {
    if (!dragRef.current.isDragging) {
      if (crosshairRef.current) crosshairRef.current.style.display = 'none'
      if (tooltipRef.current) tooltipRef.current.style.display = 'none'
      paramsRef.current.onHover?.(null)
    }
  }

  function handleDblClick() {
    paramsRef.current.onSelect?.(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={s.wrap}>
      <div className={s.legend}>
        {avgP != null && <LegendPill color="var(--accent)" label={`Vermogen · gem ${avgP} W`} />}
        {avgHr != null && <LegendPill color="var(--red)" label={`Hartslag · gem ${avgHr} bpm`} dashed />}
        {altInWindow.length > 0 && <LegendPill color="var(--muted)" label="Hoogte" />}
        {speed?.length > 1 && (
          <button
            type="button"
            className={`${s.legendToggle} ${showSpeed ? s.on : ''}`}
            onClick={() => setShowSpeed(v => !v)}
            aria-pressed={showSpeed}
          >
            <span className={s.toggleLine} style={{ borderTopColor: '#10B981' }} aria-hidden="true" />
            Snelheid
          </button>
        )}
        {cadence?.length > 1 && (
          <button
            type="button"
            className={`${s.legendToggle} ${showCadence ? s.on : ''}`}
            onClick={() => setShowCadence(v => !v)}
            aria-pressed={showCadence}
          >
            <span className={s.toggleLine} style={{ borderTopColor: '#F59E0B' }} aria-hidden="true" />
            Cadans
          </button>
        )}
      </div>

      {selection && (
        <div className={s.selectionInfo}>
          <strong>{fmtDur(peakRange)}</strong>
          {avgP != null && <span> · <span style={{ color: 'var(--accent)' }}>{avgP} W gem.</span></span>}
          {avgHr != null && <span> · <span style={{ color: 'var(--red)' }}>{avgHr} bpm gem.</span></span>}
          <span className={s.resetHint}> — dubbelklik om te resetten</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
      >
        {/* Time grid */}
        {timeTicks.map(({ t, label, x }) => (
          <g key={t}>
            <line x1={x} y1={pad.top} x2={x} y2={pad.top + drawH} stroke="var(--divider)" strokeWidth="0.5" opacity="0.5" />
            <text x={x} y={h - 4} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{label}</text>
          </g>
        ))}

        {/* Hoogteprofiel als lichtgrijze achtergrond */}
        {altFill && <path d={altFill} fill="var(--muted)" opacity="0.12" />}
        {altPath && <path d={altPath} fill="none" stroke="var(--muted)" strokeWidth="1" opacity="0.26" />}

        {/* Piekvenster-markering binnen breder kijkvenster */}
        {selection && (selection.viewStart != null || selection.viewEnd != null) && (
          <rect
            x={xS(peakStart)} y={pad.top}
            width={Math.max(0, xS(peakEnd) - xS(peakStart))} height={drawH}
            fill="var(--accent)" opacity="0.10"
          />
        )}

        {/* Left Y-axis (power) */}
        {powerYLabels.map(({ v, y }) => (
          <text key={`py${v}`} x={pad.left - 5} y={y + 3} textAnchor="end" fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">{v}</text>
        ))}

        {/* Right Y-axis (HR) */}
        {hrYLabels.map(({ v, y }) => (
          <text key={`hy${v}`} x={pad.left + drawW + 5} y={y + 3} textAnchor="start" fontSize="8" fill="var(--red)" opacity="0.7" fontFamily="var(--font-mono)">{v}</text>
        ))}

        {/* FTP reference line */}
        {ftpY != null && powerInWindow.length > 0 && (
          <g>
            <line x1={pad.left} y1={ftpY} x2={pad.left + drawW} y2={ftpY} stroke="var(--red)" strokeWidth="1" strokeDasharray="3,3" opacity="0.55" />
            <text x={pad.left + 4} y={ftpY - 3} fontSize="9" fill="var(--red)" opacity="0.7">FTP {ftp}W</text>
          </g>
        )}

        {/* Fill under power */}
        {powerFill && <path d={powerFill} fill="var(--accent)" opacity="var(--fill-opacity)" />}

        {/* HR line */}
        {hrPath && <path d={hrPath} fill="none" stroke="var(--red)" strokeWidth="1.5" strokeDasharray="4,4" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />}

        {/* Power line */}
        {powerPath && <path d={powerPath} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}

        {/* Snelheid (toggle) */}
        {speedPath && <path d={speedPath} fill="none" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}

        {/* Cadans (toggle) */}
        {cadPath && <path d={cadPath} fill="none" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="2,3" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />}

        {/* Crosshair */}
        <line
          ref={crosshairRef}
          y1={pad.top} y2={pad.top + drawH}
          stroke="rgba(255,255,255,0.4)" strokeWidth="1" strokeDasharray="3,3"
          style={{ display: 'none', pointerEvents: 'none' }}
        />

        {/* Drag-selection rect */}
        <rect
          ref={selRectRef}
          y={pad.top} height={drawH}
          fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.45)" strokeWidth="1"
          style={{ display: 'none', pointerEvents: 'none' }}
        />

        {/* Interactive overlay (mouse + double-click) */}
        <rect
          ref={overlayRef}
          x={pad.left} y={pad.top} width={drawW} height={drawH}
          fill="transparent"
          style={{ cursor: 'crosshair' }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onDoubleClick={handleDblClick}
        />
      </svg>
    </div>
  )
}

function LegendPill({ color, label, dashed }) {
  return (
    <span className={s.legendPill}>
      <span className={s.legendLine} style={{ borderTopStyle: dashed ? 'dashed' : 'solid', borderTopColor: color }} aria-hidden="true" />
      <span style={{ color }}>{label}</span>
    </span>
  )
}
