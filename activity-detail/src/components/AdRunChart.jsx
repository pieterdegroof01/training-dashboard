import { useRef, useEffect, useState } from 'react'
import s from './AdRunChart.module.css'
import { computeSelectionStats, buildSelectionLines, lerpLookup, secToPace } from './selectionStats.js'

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

function fmtDist(km) {
  if (km >= 10) return `${Math.round(km)}km`
  return `${km % 1 === 0 ? km : km.toFixed(1)}km`
}

// Lane-model gelijk aan AdDualChart: gestapelde lanes, gedeelde x-as en één crosshair.
// De tempo-lane draagt twee reeksen (tempo en GAP) op één snelheidsschaal en staat daarom los van deze lijst.
const TEMPO_LANE = { key: 'tempo', label: 'Tempo', color: 'var(--accent)', h: 92 }
const LANE_DEFS = [
  { key: 'hr',      label: 'Hartslag', unit: 'bpm', color: 'var(--red)',    vKey: 'hr', h: 66 },
  { key: 'cadence', label: 'Cadans',   unit: 'spm', color: 'var(--yellow)', vKey: 'c',  h: 62, positiveOnly: true },
]

// Kandidaat-labels voor de tempo-as in s/km, van snel naar langzaam.
const PACE_TICKS = [150, 180, 210, 240, 270, 300, 330, 360, 420, 480, 600, 720]
const PACE_TICK_MIN_PX = 12
const PACE_TICK_MAX = 4

const GAP = 24
const PAD = { top: 20, right: 42, bottom: 24, left: 44 }

const SELECTION_COLORS = { tempo: 'var(--accent)', gap: 'var(--accent2)', hr: 'var(--red)', cadence: 'var(--yellow)' }

// ── Component ─────────────────────────────────────────────────────────────────

export function AdRunChart({ speed, gap, hr, cadence, distance, durationMin, hoverT, selection, onHover, onSelect, w = 640 }) {
  const svgRef = useRef(null)
  const overlayRef = useRef(null)
  const crosshairRef = useRef(null)
  const selRectRef = useRef(null)
  const tooltipRef = useRef(null)
  const dragRef = useRef({ startX: null, isDragging: false })

  // paramsRef holds latest render state; handlers read from it to avoid stale closures
  const paramsRef = useRef({})

  // Toggles; tempo, GAP en hartslag zijn standaard zichtbaar, cadans is een secundaire lane.
  const [showTempo, setShowTempo] = useState(true)
  const [showGap, setShowGap] = useState(true)
  const [showHr, setShowHr] = useState(true)
  const [showCadence, setShowCadence] = useState(false)

  // Kijkvenster (x-as) kan breder zijn dan het piekvenster voor leesbaarheid bij korte selecties.
  const peakStart = selection ? selection.tStart : 0
  const peakEnd = selection ? selection.tEnd : (durationMin * 60 || 1)
  const tMin = selection ? (selection.viewStart ?? selection.tStart) : 0
  const tMax = selection ? (selection.viewEnd ?? selection.tEnd) : (durationMin * 60 || 1)
  const tRange = tMax - tMin || 1

  const drawW = w - PAD.left - PAD.right

  // Afstand-as met automatische terugval naar tijd wanneer er geen bruikbare afstand-stream is (loopband, geen GPS).
  const useDistance = Array.isArray(distance) && distance.length > 1
    && distance[distance.length - 1].d > distance[0].d
  const dAt = t => useDistance ? lerpLookup(distance, 't', 'd', t) : t
  const tAt = a => useDistance ? lerpLookup(distance, 'd', 't', a) : a
  const axisMin = dAt(tMin)
  const axisMax = dAt(tMax)
  const axisRange = (axisMax - axisMin) || 1
  const xS = t => PAD.left + ((dAt(t) - axisMin) / axisRange) * drawW

  const inView = pts => pts ? pts.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1) : []
  const pathOf = (pts, yOf) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${xS(p.t)},${yOf(p)}`).join(' ')

  // Gemiddelden over het kijkvenster voor de lane-labels; zelfde berekening als tooltip en infobalk.
  const viewStats = computeSelectionStats({ tStart: tMin, tEnd: tMax, distance, speed, hr, cadence })

  // ── Lane-stapel opbouwen ────────────────────────────────────────────────────

  // Tempo-lane: lineair in snelheid (hoger = sneller), gelabeld in tempo. GAP wordt omgerekend naar snelheid voor dezelfde schaal.
  function buildTempoLane(top) {
    const speedPts = (showTempo && speed) ? inView(speed) : []
    const gapPts = (showGap && gap) ? inView(gap).map(p => ({ t: p.t, v: p.pace > 0 ? 3600 / p.pace : 0 })) : []
    if (speedPts.length < 2 && gapPts.length < 2) return null

    const visible = [...speedPts, ...gapPts].map(p => p.v).filter(v => v > 0)
    const vMin = 0
    const vMax = (visible.length ? Math.max(...visible) * 1.08 : 0) || 1
    const h = TEMPO_LANE.h
    const bottom = top + h
    const yFn = v => top + (1 - (v - vMin) / (vMax - vMin)) * h

    const maxPts = Math.max(drawW, 300)
    const speedDisp = downsample(speedPts, maxPts)
    const gapDisp = downsample(gapPts, maxPts)
    const line = speedDisp.length >= 2 ? pathOf(speedDisp, p => yFn(p.v)) : null
    const fill = line
      ? `${line} L${xS(speedDisp[speedDisp.length - 1].t)},${bottom} L${xS(speedDisp[0].t)},${bottom} Z`
      : null
    const gapLine = gapDisp.length >= 2 ? pathOf(gapDisp, p => yFn(p.v)) : null

    // As-labels in tempo: van snel (boven) naar langzaam, met minimale tussenruimte.
    const ticks = []
    let lastY = -Infinity
    for (const pace of PACE_TICKS) {
      if (ticks.length >= PACE_TICK_MAX) break
      const v = 3600 / pace
      if (!(v > vMin && v <= vMax)) continue
      const y = yFn(v)
      if (y - lastY < PACE_TICK_MIN_PX) continue
      ticks.push({ pace, y, label: secToPace(pace) })
      lastY = y
    }

    const gemStr = viewStats.paceSecPerKm != null ? `${secToPace(viewStats.paceSecPerKm)} /km` : '–'
    return { ...TEMPO_LANE, kind: 'tempo', top, bottom, line, fill, gapLine, ticks, gemStr }
  }

  function buildLane(def, raw, top) {
    if (!raw) return null
    const windowed = inView(raw)
    if (windowed.length < 2) return null
    const scalePts = def.positiveOnly ? windowed.filter(p => p[def.vKey] > 0) : windowed
    if (!scalePts.length) return null

    let vMin = Math.min(...scalePts.map(p => p[def.vKey]))
    let vMax = Math.max(...scalePts.map(p => p[def.vKey]))
    const m = (vMax - vMin) * 0.14 || 1
    vMin -= m; vMax += m
    const span = (vMax - vMin) || 1
    const bottom = top + def.h
    // Waarden buiten de schaal (cadans 0 bij stilstand) vallen op de basislijn in plaats van buiten de lane.
    const yFn = v => top + (1 - (Math.max(vMin, Math.min(vMax, v)) - vMin) / span) * def.h

    const display = downsample(windowed, Math.max(drawW, 300))
    const line = pathOf(display, p => yFn(p[def.vKey]))
    const fill = `${line} L${xS(display[display.length - 1].t)},${bottom} L${xS(display[0].t)},${bottom} Z`

    const mv = viewStats[def.key]
    const gemStr = mv != null ? `${Math.round(mv)} ${def.unit}` : '–'
    return { ...def, top, bottom, vMin, vMax, line, fill, gemStr }
  }

  const dataOf = { hr, cadence }
  const visibleOf = { hr: showHr && !!hr, cadence: showCadence && !!cadence }

  const lanes = []
  let cursor = PAD.top
  if ((showTempo && speed) || (showGap && gap)) {
    const L = buildTempoLane(cursor)
    if (L) { lanes.push(L); cursor += L.h + GAP }
  }
  for (const def of LANE_DEFS) {
    if (!visibleOf[def.key]) continue
    const L = buildLane(def, dataOf[def.key], cursor)
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

  paramsRef.current = { tMin, tMax, tRange, drawW, pad: PAD, w, speed, gap, hr, cadence, distance, showTempo, showGap, showHr, showCadence, onHover, onSelect, useDistance, axisMin, axisRange, tAt }

  // ── Statistiek over een selectie (gedeelde berekening, zie selectionStats.js) ──
  // Leest props en toggles uit paramsRef, zodat ook de eenmalig gebonden touch-handlers actuele waarden zien.
  function selectionLinesFor(tStart, tEnd) {
    const { distance, speed, gap, hr, cadence, showTempo, showGap, showHr, showCadence } = paramsRef.current
    const stats = computeSelectionStats({ tStart, tEnd, distance, speed, gap, hr, cadence })
    return buildSelectionLines(stats, {
      kind: 'run',
      show: { tempo: showTempo, gap: showGap, hr: showHr, cadence: showCadence },
      colors: SELECTION_COLORS,
    })
  }

  // Live tooltip tijdens het slepen: zelfde venster als de selectie die bij loslaten ontstaat.
  function showSelectionTip(x1, x2, clientX, clientY, offsetY) {
    const tip = tooltipRef.current
    if (!tip) return
    const { drawW, pad, axisMin, axisRange, tAt } = paramsRef.current
    const tStart = tAt(axisMin + Math.max(0, (x1 - pad.left) / drawW) * axisRange)
    const tEnd = tAt(axisMin + Math.min(1, (x2 - pad.left) / drawW) * axisRange)
    const marker = c => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;${c ? `background:${c};` : ''}margin-right:5px"></span>`
    let html = `<div style="font-weight:700;font-size:10px;color:#aab3d0;margin-bottom:3px">Selectie</div>`
    for (const line of selectionLinesFor(tStart, tEnd)) {
      const plain = line.key === 'time' || line.key === 'distance'
      html += `<div style="white-space:nowrap">${marker(plain ? null : line.color)}${line.label}: <strong>${line.value}</strong></div>`
    }
    tip.innerHTML = html
    tip.style.display = 'block'
    const tipW = Math.max(160, tip.offsetWidth)
    let tipX = clientX + 14
    if (tipX + tipW > window.innerWidth) tipX = clientX - tipW - 14
    tip.style.left = tipX + 'px'
    tip.style.top = (clientY - offsetY) + 'px'
  }

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
      const { drawW, pad, w, onHover, axisMin, axisRange, tAt } = paramsRef.current
      const svgRect = svg.getBoundingClientRect()
      const scaleX = w / svgRect.width
      const mouseX = (touch.clientX - svgRect.left) * scaleX
      const drag = dragRef.current

      if (drag.startX !== null && Math.abs(mouseX - drag.startX) > 4) {
        drag.isDragging = true
        const x1 = Math.min(drag.startX, mouseX)
        const x2 = Math.max(drag.startX, mouseX)
        const selRect = selRectRef.current
        if (selRect) {
          selRect.setAttribute('x', x1)
          selRect.setAttribute('width', x2 - x1)
          selRect.style.display = ''
        }
        if (crosshairRef.current) crosshairRef.current.style.display = 'none'
        showSelectionTip(x1, x2, touch.clientX, touch.clientY, 90)
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
          const { drawW, pad, w, onSelect, axisMin, axisRange, tAt } = paramsRef.current
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
    overlay.addEventListener('touchcancel', onTouchEnd)
    return () => {
      overlay.removeEventListener('touchstart', onTouchStart)
      overlay.removeEventListener('touchmove', onTouchMove)
      overlay.removeEventListener('touchend', onTouchEnd)
      overlay.removeEventListener('touchcancel', onTouchEnd)
    }
  }, []) // reads from paramsRef.current at call time

  // ── Mouse handlers ─────────────────────────────────────────────────────────
  function handleMouseMove(e) {
    const { tRange, drawW, pad, w, speed, gap, hr, cadence, showTempo, showGap, showHr, showCadence, onHover, useDistance, axisMin, axisRange, tAt } = paramsRef.current
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
        const x1 = Math.min(drag.startX, mouseX)
        const x2 = Math.max(drag.startX, mouseX)
        const selRect = selRectRef.current
        if (selRect) {
          selRect.setAttribute('x', x1)
          selRect.setAttribute('width', x2 - x1)
          selRect.style.display = ''
        }
        showSelectionTip(x1, x2, e.clientX, e.clientY, 60)
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

    const spdVal = (showTempo && speed) ? nearest(speed, 'v', tCurrent) : null
    const gapVal = (showGap && gap) ? nearest(gap, 'pace', tCurrent) : null
    const hrVal = (showHr && hr) ? nearest(hr, 'hr', tCurrent) : null
    const cadVal = (showCadence && cadence) ? nearest(cadence, 'c', tCurrent) : null
    const timeStr = useDistance ? `${fmtDist(axisCur)} · ${fmtTime(tCurrent, tRange)}` : fmtTime(tCurrent, tRange)
    const tip = tooltipRef.current
    if (tip) {
      const dot = c => `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${c};margin-right:5px"></span>`
      let html = `<div style="font-weight:700;font-size:10px;color:#aab3d0;margin-bottom:3px">${timeStr}</div>`
      if (spdVal != null) html += `<div>${dot('var(--accent)')}Tempo: <strong>${spdVal > 0 ? `${secToPace(3600 / spdVal)} /km` : '–'}</strong></div>`
      if (gapVal != null) html += `<div>${dot('var(--accent2)')}GAP: <strong>${secToPace(gapVal)} /km</strong></div>`
      if (hrVal != null) html += `<div>${dot('var(--red)')}Hartslag: <strong>${Math.round(hrVal)} bpm</strong></div>`
      if (cadVal != null) html += `<div>${dot('var(--yellow)')}Cadans: <strong>${Math.round(cadVal)} spm</strong></div>`
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
    if (drag.isDragging && tooltipRef.current) tooltipRef.current.style.display = 'none'
    if (!drag.isDragging || drag.startX === null) { drag.startX = null; drag.isDragging = false; return }
    const { drawW, pad, w, onSelect, axisMin, axisRange, tAt } = paramsRef.current
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
          { key: 'tempo',   label: 'Tempo',    color: 'var(--accent)',  data: speed,   show: showTempo,   set: setShowTempo },
          { key: 'gap',     label: 'GAP',      color: 'var(--accent2)', data: gap,     show: showGap,     set: setShowGap },
          { key: 'hr',      label: 'Hartslag', color: 'var(--red)',     data: hr,      show: showHr,      set: setShowHr },
          { key: 'cadence', label: 'Cadans',   color: 'var(--yellow)',  data: cadence, show: showCadence, set: setShowCadence },
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
      </div>

      {selection && (
        <div className={s.selectionInfo}>
          {selectionLinesFor(peakStart, peakEnd).map(line => {
            if (line.key === 'time') return <strong key={line.key}>{line.value}</strong>
            if (line.key === 'distance') return <span key={line.key}> · <span className={s.selectionDistance}>{line.value}</span></span>
            return <span key={line.key}> · <span style={{ color: line.color }}>{line.value} gem.</span></span>
          })}
          <span className={s.resetHint}> · dubbelklik om te resetten</span>
        </div>
      )}

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${H}`}
        className={s.svg}
      >
        {/* Gedeelde gridlijnen over de volledige stapel */}
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
              <tspan fontWeight="500" fill="var(--muted)">{` · gem ${L.gemStr}`}</tspan>
            </text>

            {/* As-cijfers: tempo-labels in de tempo-lane, anders max boven en min onder */}
            {L.kind === 'tempo' ? L.ticks.map(tk => (
              <text key={tk.pace} x={PAD.left - 5} y={tk.y + 3} textAnchor="end" fontSize="8" opacity="0.75" fontFamily="var(--font-mono)" fill="var(--muted)">{tk.label}</text>
            )) : (
              <>
                <text x={PAD.left - 5} y={L.top + 8} textAnchor="end" fontSize="8" opacity="0.75" fontFamily="var(--font-mono)" fill="var(--muted)">{Math.round(L.vMax)}</text>
                <text x={PAD.left - 5} y={L.bottom - 1} textAnchor="end" fontSize="8" opacity="0.75" fontFamily="var(--font-mono)" fill="var(--muted)">{Math.round(L.vMin)}</text>
              </>
            )}

            {/* Basislijn onder de lane */}
            <line x1={PAD.left} y1={L.bottom} x2={PAD.left + drawW} y2={L.bottom} stroke="var(--border)" strokeWidth="1" />

            {/* Vlakvulling + lijn */}
            {L.fill && <path d={L.fill} fill={L.color} opacity="var(--fill-opacity)" />}
            {L.gapLine && <path d={L.gapLine} fill="none" stroke="var(--accent2)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.75" />}
            {L.line && <path d={L.line} fill="none" stroke={L.color} strokeWidth={L.kind === 'tempo' ? 1.8 : 1.7} strokeLinecap="round" strokeLinejoin="round" />}
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
