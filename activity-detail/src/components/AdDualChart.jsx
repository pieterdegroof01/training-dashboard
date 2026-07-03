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

function mean(pts, key) {
  if (!pts?.length) return null
  return pts.reduce((a, p) => a + p[key], 0) / pts.length
}

// Lookup op een oplopend gesorteerde reeks: geeft toKey terug voor een gegeven fromKey-waarde (lineair geïnterpoleerd, geclampt aan de randen).
function lerpLookup(arr, fromKey, toKey, x) {
  const n = arr.length
  if (!n) return null
  if (x <= arr[0][fromKey]) return arr[0][toKey]
  if (x >= arr[n - 1][fromKey]) return arr[n - 1][toKey]
  let lo = 0, hi = n - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (arr[mid][fromKey] <= x) lo = mid; else hi = mid
  }
  const a = arr[lo], b = arr[hi]
  const span = b[fromKey] - a[fromKey]
  if (span <= 0) return a[toKey]
  return a[toKey] + ((x - a[fromKey]) / span) * (b[toKey] - a[toKey])
}

function fmtDist(km) {
  if (km >= 10) return `${Math.round(km)}km`
  return `${km % 1 === 0 ? km : km.toFixed(1)}km`
}

// Lane-hoogtes en volgorde volgen de PeakForm-designspec (Strava-stijl gestapelde lanes).
// Elke metric krijgt een eigen verticale schaal, gedeelde tijd-as en één crosshair.
const LANE_DEFS = [
  { key: 'power',    label: 'Vermogen', unit: 'W',    color: 'var(--accent)', vKey: 'w',   h: 92, kind: 'power' },
  { key: 'hr',       label: 'Hartslag', unit: 'bpm',  color: 'var(--red)',    vKey: 'hr',  h: 66 },
  { key: 'speed',    label: 'Snelheid', unit: 'km/u', color: 'var(--green)',  vKey: 'v',   h: 62, zeroBase: true },
  { key: 'cadence',  label: 'Cadans',   unit: 'rpm',  color: 'var(--yellow)', vKey: 'c',   h: 62 },
  { key: 'gradient', label: 'Helling',  unit: '%',    color: 'var(--purple)', vKey: 'g',   h: 58, decimals: 1 },
  { key: 'altitude', label: 'Hoogte',   unit: 'm',    color: 'var(--subtle)', vKey: 'alt', h: 52, strongFill: true, noAvgBar: true },
]

const GAP = 24
const PAD = { top: 20, right: 42, bottom: 24, left: 44 }

// ── Component ─────────────────────────────────────────────────────────────────

export function AdDualChart({ power, hr, distance, speed, cadence, altitude, gradient, ftp, durationMin, hoverT, selection, onHover, onSelect, w = 640 }) {
  const svgRef = useRef(null)
  const overlayRef = useRef(null)
  const crosshairRef = useRef(null)
  const selRectRef = useRef(null)
  const tooltipRef = useRef(null)
  const dragRef = useRef({ startX: null, isDragging: false })

  // paramsRef holds latest render state; handlers read from it to avoid stale closures
  const paramsRef = useRef({})

  // Toggles voor secundaire lanes; vermogen + hartslag + hoogte zijn standaard zichtbaar.
  const [showPower, setShowPower] = useState(true)
  const [showHr, setShowHr] = useState(true)
  const [showSpeed, setShowSpeed] = useState(false)
  const [showCadence, setShowCadence] = useState(false)
  const [showGradient, setShowGradient] = useState(false)

  // Kijkvenster (x-as) kan breder zijn dan het piekvenster voor leesbaarheid bij korte selecties.
  const peakStart = selection ? selection.tStart : 0
  const peakEnd = selection ? selection.tEnd : (durationMin * 60 || 1)
  const tMin = selection ? (selection.viewStart ?? selection.tStart) : 0
  const tMax = selection ? (selection.viewEnd ?? selection.tEnd) : (durationMin * 60 || 1)
  const tRange = tMax - tMin || 1
  const peakRange = (peakEnd - peakStart) || 1

  const drawW = w - PAD.left - PAD.right

  // Afstand-as met automatische terugval naar tijd wanneer er geen bruikbare afstand-stream is (indoor, geen GPS).
  const useDistance = Array.isArray(distance) && distance.length > 1
    && distance[distance.length - 1].d > distance[0].d
  const dAt = t => useDistance ? lerpLookup(distance, 't', 'd', t) : t
  const tAt = a => useDistance ? lerpLookup(distance, 'd', 't', a) : a
  const axisMin = dAt(tMin)
  const axisMax = dAt(tMax)
  const axisRange = (axisMax - axisMin) || 1
  const xS = t => PAD.left + ((dAt(t) - axisMin) / axisRange) * drawW

  // ── Lane-stapel opbouwen ────────────────────────────────────────────────────
  const dataOf = { power, hr, speed, cadence, gradient, altitude }
  const visibleOf = {
    power: showPower && !!power, hr: showHr && !!hr,
    speed: showSpeed && !!speed, cadence: showCadence && !!cadence,
    gradient: showGradient && !!gradient, altitude: !!altitude,
  }

  function buildLane(def, top) {
    const raw = dataOf[def.key]
    if (!raw) return null
    const windowed = raw.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1)
    if (windowed.length < 2) return null

    let display = downsample(windowed, Math.max(drawW, 300))
    if (def.kind === 'power') display = smoothPower(display) // huidige smoothing behouden

    let vMin, vMax
    if (def.kind === 'power') {
      vMin = 0
      vMax = Math.max(...windowed.map(p => p[def.vKey]), (ftp || 200) * 1.1)
    } else if (def.zeroBase) {
      vMin = 0
      vMax = (Math.max(...windowed.map(p => p[def.vKey])) * 1.08) || 1
    } else {
      vMin = Math.min(...windowed.map(p => p[def.vKey]))
      vMax = Math.max(...windowed.map(p => p[def.vKey]))
      const m = (vMax - vMin) * 0.14 || 1
      vMin -= m; vMax += m
    }
    const span = (vMax - vMin) || 1
    const bottom = top + def.h
    const yFn = v => top + (1 - (v - vMin) / span) * def.h

    const line = display.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yFn(p[def.vKey])}`).join(' ')
    const fill = `${line} L${xS(display[display.length - 1].t)},${bottom} L${xS(display[0].t)},${bottom} Z`

    const mv = mean(windowed, def.vKey)
    const gemStr = mv == null ? '' : (def.decimals ? mv.toFixed(def.decimals) : String(Math.round(mv)))

    return {
      ...def, top, bottom, vMin, vMax, yFn, line, fill, gemStr,
      ftpY: def.kind === 'power' && ftp ? yFn(ftp) : null,
    }
  }

  const lanes = []
  let cursor = PAD.top
  for (const def of LANE_DEFS) {
    if (!visibleOf[def.key]) continue
    const L = buildLane(def, cursor)
    if (!L) continue
    lanes.push(L)
    cursor += def.h + GAP
  }
  const stackBottom = lanes.length ? cursor - GAP : PAD.top + 40
  const stackH = stackBottom - PAD.top
  const H = stackBottom + PAD.bottom

  // ── Gedeelde as-ticks: afstand indien beschikbaar, anders tijd ───────────────
  const axisTicks = []
  if (useDistance) {
    const span = axisMax - axisMin
    const interval = span > 100 ? 20 : span > 50 ? 10 : span > 20 ? 5 : span > 8 ? 2 : span > 3 ? 1 : 0.5
    const firstTick = Math.ceil(axisMin / interval) * interval
    for (let dk = firstTick; dk <= axisMax + 1e-6; dk += interval) {
      axisTicks.push({ key: dk, label: fmtDist(dk), x: PAD.left + ((dk - axisMin) / axisRange) * drawW })
    }
  } else {
    const interval = tRange > 7200 ? 1800 : tRange > 3600 ? 900 : tRange > 1800 ? 600 : tRange > 600 ? 300 : tRange > 300 ? 60 : 30
    const firstTick = Math.ceil(tMin / interval) * interval
    for (let t = firstTick; t <= tMax; t += interval) {
      axisTicks.push({ key: t, label: fmtTime(t, tRange), x: xS(t) })
    }
  }

  // ── Gemiddelden over de selectie (alle zichtbare metric-lanes, hoogte uitgezonderd) ──
  const peakAverages = lanes.filter(L => !L.noAvgBar).map(L => {
    const inPeak = (dataOf[L.key] || []).filter(p => p.t >= peakStart - 1 && p.t <= peakEnd + 1)
    const mv = mean(inPeak, L.vKey)
    if (mv == null) return null
    const val = L.decimals ? mv.toFixed(L.decimals) : String(Math.round(mv))
    return { key: L.key, color: L.color, text: `${val} ${L.unit}` }
  }).filter(Boolean)

  paramsRef.current = { tMin, tMax, tRange, drawW, pad: PAD, w, power, hr, speed, cadence, gradient, showPower, showHr, showSpeed, showCadence, showGradient, onHover, onSelect, useDistance, axisMin, axisRange, tAt }

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
      const { tMin, tRange, drawW, pad, w, onHover, axisMin, axisRange, tAt } = paramsRef.current
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
      const tCurrent = tAt(axisMin + ((mouseX - pad.left) / drawW) * axisRange)
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
          const { tMin, tRange, drawW, pad, w, onSelect, axisMin, axisRange, tAt } = paramsRef.current
          const svgRect = svg.getBoundingClientRect()
          const scaleX = w / svgRect.width
          const mouseX = (touch.clientX - svgRect.left) * scaleX
          const x1 = Math.min(drag.startX, mouseX)
          const x2 = Math.max(drag.startX, mouseX)
          if (x2 - x1 >= 8) {
            const newTStart = tAt(axisMin + Math.max(0, (x1 - pad.left) / drawW) * axisRange)
            const newTEnd = tAt(axisMin + Math.min(1, (x2 - pad.left) / drawW) * axisRange)
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
    const { tMin, tRange, drawW, pad, w, power, hr, gradient, speed, cadence, showPower, showHr, showSpeed, showCadence, showGradient, onHover, useDistance, axisMin, axisRange, tAt } = paramsRef.current
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

    const axisCur = axisMin + ((mouseX - pad.left) / drawW) * axisRange
    const tCurrent = tAt(axisCur)
    onHover?.(tCurrent)

    if (crosshairRef.current) {
      crosshairRef.current.setAttribute('x1', mouseX)
      crosshairRef.current.setAttribute('x2', mouseX)
      crosshairRef.current.style.display = ''
    }

    const pVal = (showPower && power) ? nearest(power, 'w', tCurrent) : null
    const hrVal = (showHr && hr) ? nearest(hr, 'hr', tCurrent) : null
    const gradeVal = (showGradient && gradient) ? nearest(gradient, 'g', tCurrent) : null
    const spdVal = (showSpeed && speed) ? nearest(speed, 'v', tCurrent) : null
    const cadVal = (showCadence && cadence) ? nearest(cadence, 'c', tCurrent) : null
    const timeStr = useDistance ? `${fmtDist(axisCur)} · ${fmtTime(tCurrent, tRange)}` : fmtTime(tCurrent, tRange)
    const tip = tooltipRef.current
    if (tip) {
      const dot = c => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};margin-right:5px"></span>`
      let html = `<div style="font-weight:700;font-size:10px;color:#aab3d0;margin-bottom:3px">${timeStr}</div>`
      if (pVal != null) html += `<div>${dot('var(--accent)')}Vermogen: <strong>${Math.round(pVal)} W</strong></div>`
      if (hrVal != null) html += `<div>${dot('var(--red)')}Hartslag: <strong>${Math.round(hrVal)} bpm</strong></div>`
      if (spdVal != null) html += `<div>${dot('var(--green)')}Snelheid: <strong>${spdVal.toFixed(1)} km/u</strong></div>`
      if (cadVal != null) html += `<div>${dot('var(--yellow)')}Cadans: <strong>${Math.round(cadVal)} rpm</strong></div>`
      if (gradeVal != null) html += `<div>${dot('var(--purple)')}Helling: <strong>${gradeVal.toFixed(1)}%</strong></div>`
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
    const { tMin, tRange, drawW, pad, w, onSelect, axisMin, axisRange, tAt } = paramsRef.current
    const svg = svgRef.current
    if (!svg) return
    const svgRect = svg.getBoundingClientRect()
    const scaleX = w / svgRect.width
    const mouseX = (e.clientX - svgRect.left) * scaleX
    const x1 = Math.min(drag.startX, mouseX)
    const x2 = Math.max(drag.startX, mouseX)
    drag.startX = null; drag.isDragging = false
    if (x2 - x1 < 8) return
    const newTStart = tAt(axisMin + Math.max(0, (x1 - pad.left) / drawW) * axisRange)
    const newTEnd = tAt(axisMin + Math.min(1, (x2 - pad.left) / drawW) * axisRange)
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
        {[
          { key: 'power',    label: 'Vermogen', color: 'var(--accent)', data: power,    show: showPower,    set: setShowPower },
          { key: 'hr',       label: 'Hartslag', color: 'var(--red)',    data: hr,       show: showHr,       set: setShowHr },
          { key: 'speed',    label: 'Snelheid', color: 'var(--green)',  data: speed,    show: showSpeed,    set: setShowSpeed },
          { key: 'cadence',  label: 'Cadans',   color: 'var(--yellow)', data: cadence,  show: showCadence,  set: setShowCadence },
          { key: 'gradient', label: 'Helling',  color: 'var(--purple)', data: gradient, show: showGradient, set: setShowGradient },
        ].filter(m => m.data?.length > 1).map(m => (
          <button
            key={m.key}
            type="button"
            className={`${s.legendToggle} ${m.show ? s.on : ''}`}
            onClick={() => m.set(v => !v)}
            aria-pressed={m.show}
          >
            <span className={s.toggleLine} style={{ borderTopColor: m.color }} aria-hidden="true" />
            {m.label}
          </button>
        ))}
        {altitude?.length > 1 && (
          <span className={s.legendPill}>
            <span className={s.legendLine} style={{ borderTopStyle: 'solid', borderTopColor: 'var(--subtle)' }} aria-hidden="true" />
            <span style={{ color: 'var(--subtle)' }}>Hoogte</span>
          </span>
        )}
      </div>

      {selection && (
        <div className={s.selectionInfo}>
          <strong>{fmtDur(peakRange)}</strong>
          {peakAverages.map(a => (
            <span key={a.key}> · <span style={{ color: a.color }}>{a.text} gem.</span></span>
          ))}
          <span className={s.resetHint}> · dubbelklik om te resetten</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${H}`}
        className={s.svg}
      >
        {/* Gedeelde tijd-gridlijnen over de volledige stapel */}
        {axisTicks.map(({ key, label, x }) => (
          <g key={key}>
            <line x1={x} y1={PAD.top} x2={x} y2={stackBottom} stroke="var(--divider)" strokeWidth="0.5" opacity="0.6" />
            <text x={x} y={H - 6} textAnchor="middle" fontSize="8.5" fill="var(--muted)" fontFamily="var(--font-mono)">{label}</text>
          </g>
        ))}

        {/* Piekvenster-markering binnen breder kijkvenster */}
        {selection && (selection.viewStart != null || selection.viewEnd != null) && (
          <rect
            x={xS(peakStart)} y={PAD.top}
            width={Math.max(0, xS(peakEnd) - xS(peakStart))} height={stackH}
            fill="var(--accent)" opacity="0.10"
          />
        )}

        {/* Lanes */}
        {lanes.map(L => (
          <g key={L.key}>
            {/* Lane-label: gekleurde stip + NAAM + gemiddelde over het kijkvenster */}
            <circle cx={PAD.left + 3} cy={L.top - 11} r="3" fill={L.color} />
            <text
              x={PAD.left + 12} y={L.top - 8}
              fontSize="10" fontWeight="700" letterSpacing="0.8"
              fontFamily="var(--font-mono)" fill="var(--muted)"
            >
              {L.label.toUpperCase()}
              <tspan fontWeight="500" fill="var(--muted)">{` · gem ${L.gemStr} ${L.unit}`}</tspan>
            </text>

            {/* As-cijfers: max boven, min onder */}
            <text x={PAD.left - 5} y={L.top + 8} textAnchor="end" fontSize="8" opacity="0.75" fontFamily="var(--font-mono)" fill="var(--muted)">{Math.round(L.vMax)}</text>
            <text x={PAD.left - 5} y={L.bottom - 1} textAnchor="end" fontSize="8" opacity="0.75" fontFamily="var(--font-mono)" fill="var(--muted)">{Math.round(L.vMin)}</text>

            {/* Basislijn onder de lane */}
            <line x1={PAD.left} y1={L.bottom} x2={PAD.left + drawW} y2={L.bottom} stroke="var(--border)" strokeWidth="1" />

            {/* Vlakvulling + lijn */}
            <path d={L.fill} fill={L.color} opacity={L.strongFill ? 0.3 : 'var(--fill-opacity)'} />
            <path d={L.line} fill="none" stroke={L.color} strokeWidth={L.kind === 'power' ? 1.8 : 1.7} strokeLinecap="round" strokeLinejoin="round" />

            {/* FTP-referentielijn in de vermogen-lane */}
            {L.ftpY != null && (
              <g>
                <line x1={PAD.left} y1={L.ftpY} x2={PAD.left + drawW} y2={L.ftpY} stroke="var(--accent)" strokeWidth="1" strokeDasharray="2,3" opacity="0.5" />
                <text x={PAD.left + drawW} y={L.ftpY - 3} textAnchor="end" fontSize="8" opacity="0.7" fontFamily="var(--font-mono)" fill="var(--accent)">{`FTP ${ftp}W`}</text>
              </g>
            )}
          </g>
        ))}

        {/* Crosshair over de volledige stapel */}
        <line
          ref={crosshairRef}
          y1={PAD.top} y2={stackBottom}
          stroke="var(--muted)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5"
          style={{ display: 'none', pointerEvents: 'none' }}
        />

        {/* Drag-selectie-rechthoek */}
        <rect
          ref={selRectRef}
          y={PAD.top} height={stackH}
          fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1"
          style={{ display: 'none', pointerEvents: 'none' }}
        />

        {/* Interactieve overlay over de volledige stapel (muis + dubbelklik) */}
        <rect
          ref={overlayRef}
          x={PAD.left} y={PAD.top} width={drawW} height={stackH}
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
