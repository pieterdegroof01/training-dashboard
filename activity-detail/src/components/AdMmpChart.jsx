import { useState, useRef } from 'react'
import s from './AdMmpChart.module.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

const STANDARD_DURS = [5, 30, 60, 300, 1200, 3600]
const DUR_LABEL = { 5: '5s', 30: '30s', 60: '1m', 300: '5m', 1200: '20m', 3600: '1u' }

function fmtDur(sec) {
  if (sec < 60) return `${Math.round(sec)}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return m ? `${h}u${String(m).padStart(2, '0')}` : `${h}u`
}

function nearestInCurve(curve, dur) {
  let best = null, dist = Infinity
  for (const p of curve) {
    const d = Math.abs(p.dur - dur)
    if (d < dist) { dist = d; best = p }
  }
  return best
}

// Find contiguous window of ~durSec with highest average power (O(n) prefix-sum)
function findPeakWindow(power, durSec) {
  if (!power?.length || durSec <= 0) return null
  const n = power.length
  const avgInterval = n > 1 ? (power[n - 1].t - power[0].t) / (n - 1) : 5
  const windowPts = Math.max(1, Math.round(durSec / avgInterval))
  if (windowPts >= n) return { tStart: power[0].t, tEnd: power[n - 1].t }

  const prefix = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + power[i].w

  let bestAvg = -Infinity, bestStart = 0
  for (let i = 0; i <= n - windowPts; i++) {
    const a = (prefix[i + windowPts] - prefix[i]) / windowPts
    if (a > bestAvg) { bestAvg = a; bestStart = i }
  }
  return { tStart: power[bestStart].t, tEnd: power[bestStart + windowPts - 1].t }
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AdMmpChart({ mmpCurveFull, mmpBestFull, power, onSelect, w = 620, h = 190 }) {
  const [clickInfo, setClickInfo] = useState(null)
  const svgRef = useRef(null)

  if (!mmpCurveFull?.length) return null

  const pad = { left: 38, right: 14, top: 20, bottom: 26 }
  const cw = w - pad.left - pad.right
  const ch = h - pad.top - pad.bottom

  const durMin = mmpCurveFull[0].dur
  const durMax = mmpCurveFull[mmpCurveFull.length - 1].dur
  const logMin = Math.log(durMin)
  const logMax = Math.log(durMax)
  const logRange = logMax - logMin || 1

  const allWatts = [
    ...mmpCurveFull.map(p => p.watts),
    ...(mmpBestFull ? mmpBestFull.map(p => p.watts) : []),
  ].filter(w => w != null)
  const maxVal = allWatts.length ? Math.max(...allWatts) * 1.08 : 500

  const xLog = dur => pad.left + ((Math.log(dur) - logMin) / logRange) * cw
  const yV = wv => pad.top + (1 - wv / maxVal) * ch
  const xToLogDur = x => Math.exp(logMin + ((x - pad.left) / cw) * logRange)

  // Curve paths
  const ridePath = mmpCurveFull.map((p, i) => `${i === 0 ? 'M' : 'L'}${xLog(p.dur)},${yV(p.watts)}`).join(' ')
  const bestPath = mmpBestFull?.length
    ? mmpBestFull.map((p, i) => `${i === 0 ? 'M' : 'L'}${xLog(p.dur)},${yV(p.watts)}`).join(' ')
    : null

  const rideFill = `${ridePath} L${xLog(durMax)},${pad.top + ch} L${xLog(durMin)},${pad.top + ch} Z`

  // Gap fill between ride and best curves
  const gapFill = bestPath && mmpBestFull?.length ? (
    ridePath +
    ` L${xLog(mmpBestFull[mmpBestFull.length - 1].dur)},${yV(mmpBestFull[mmpBestFull.length - 1].watts)}` +
    ' ' + [...mmpBestFull].reverse().map(p => `L${xLog(p.dur)},${yV(p.watts)}`).join(' ') +
    ' Z'
  ) : null

  // PR markers at standard durations
  const prMarkers = STANDARD_DURS
    .filter(dur => dur >= durMin && dur <= durMax)
    .map(dur => {
      const ride = nearestInCurve(mmpCurveFull, dur)
      if (!ride || ride.watts == null) return null
      const best = mmpBestFull ? nearestInCurve(mmpBestFull, dur) : null
      const isPr = best?.watts != null ? ride.watts >= best.watts * 0.999 : false
      return { dur, watts: ride.watts, isPr, x: xLog(dur), y: yV(ride.watts) }
    })
    .filter(Boolean)

  // X-axis tick labels
  const xTicks = STANDARD_DURS
    .filter(dur => dur >= durMin && dur <= durMax)
    .map(dur => ({ dur, label: DUR_LABEL[dur] || fmtDur(dur), x: xLog(dur) }))

  // Y-axis grid
  const step = Math.ceil(maxVal / 4 / 50) * 50
  const yGridVals = Array.from({ length: 4 }, (_, i) => (i + 1) * step).filter(v => v <= maxVal)

  // Note text
  const prDurations = prMarkers.filter(p => p.isPr).map(p => DUR_LABEL[p.dur] || fmtDur(p.dur))
  const biggestGap = mmpBestFull
    ? prMarkers.reduce((acc, p) => {
        const bp = nearestInCurve(mmpBestFull, p.dur)
        if (!bp?.watts) return acc
        const pct = (bp.watts - p.watts) / bp.watts
        return pct > acc.pct ? { pct, dur: p.dur } : acc
      }, { pct: 0, dur: null })
    : { pct: 0, dur: null }
  const gapPct = Math.round(biggestGap.pct * 100)

  // Click handler: derive dur from x, find peak window, call onSelect
  function handleClick(e) {
    const svg = svgRef.current
    if (!svg) return
    const svgRect = svg.getBoundingClientRect()
    const scaleX = w / svgRect.width
    const mouseX = (e.clientX - svgRect.left) * scaleX
    if (mouseX < pad.left || mouseX > pad.left + cw) return

    const clickedDur = xToLogDur(mouseX)
    const point = nearestInCurve(mmpCurveFull, clickedDur)
    if (!point) return

    setClickInfo({ dur: point.dur, watts: point.watts, x: xLog(point.dur), y: yV(point.watts) })

    if (power?.length) {
      const win = findPeakWindow(power, point.dur)
      if (win) {
        // Korte piekvensters (5s/30s/1m) zijn te smal voor een leesbare tijdgrafiek.
        // Geef een breder kijkvenster mee als context; het exacte piekvenster blijft win.tStart/win.tEnd.
        const tFirst = power[0].t
        const tLast = power[power.length - 1].t
        const peakDur = win.tEnd - win.tStart
        const minView = 90 // s context-breedte
        if (peakDur < minView) {
          const center = (win.tStart + win.tEnd) / 2
          const half = minView / 2
          let vStart = center - half
          let vEnd = center + half
          if (vStart < tFirst) { vEnd += tFirst - vStart; vStart = tFirst }
          if (vEnd > tLast) { vStart = Math.max(tFirst, vStart - (vEnd - tLast)); vEnd = tLast }
          onSelect?.({ ...win, viewStart: vStart, viewEnd: vEnd })
        } else {
          onSelect?.(win)
        }
      }
    }
  }

  return (
    <div>
      <div className={s.legend}>
        <LegendPill color="var(--accent)" label="Deze rit" />
        {mmpBestFull && <LegendPill color="var(--subtle)" label="90-dagen best" dashed />}
        <LegendPill color="var(--yellow)" label="PR" dot />
      </div>

      <svg
        ref={svgRef}
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        className={s.svg}
        style={{ cursor: 'crosshair' }}
        onClick={handleClick}
      >
        {/* Y-axis grid */}
        {yGridVals.map(v => {
          const y = yV(v)
          return (
            <g key={v}>
              <line x1={pad.left} x2={w - pad.right} y1={y} y2={y} stroke="var(--divider)" strokeWidth="1" />
              <text x={pad.left - 5} y={y + 3.5} textAnchor="end" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{v}</text>
            </g>
          )
        })}

        {/* Gap fill */}
        {gapFill && <path d={gapFill} fill="var(--subtle)" opacity="0.08" />}

        {/* Fill under ride */}
        <path d={rideFill} fill="var(--accent)" opacity="var(--fill-opacity)" />

        {/* 90-day best line */}
        {bestPath && (
          <path d={bestPath} fill="none" stroke="var(--subtle)" strokeWidth="1.8" strokeDasharray="4 4" strokeLinecap="round" strokeLinejoin="round" />
        )}

        {/* Ride line */}
        <path d={ridePath} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />

        {/* PR / standard-duration markers */}
        {prMarkers.map(pt => (
          <g key={pt.dur}>
            {pt.isPr ? (
              <>
                <circle cx={pt.x} cy={pt.y} r="7" fill="var(--yellow)" opacity="0.18" />
                <circle cx={pt.x} cy={pt.y} r="4" fill="var(--yellow)" stroke="var(--surface)" strokeWidth="1.5" />
                <text x={pt.x} y={pt.y - 11} textAnchor="middle" fontSize="8" fontWeight="800" fill="var(--yellow)" fontFamily="var(--font-mono)">PR</text>
              </>
            ) : (
              <circle cx={pt.x} cy={pt.y} r="3" fill="var(--accent)" opacity="0.7" />
            )}
          </g>
        ))}

        {/* Gap labels (only where gap ≥ 3%) */}
        {mmpBestFull && prMarkers.map(pt => {
          const bp = nearestInCurve(mmpBestFull, pt.dur)
          if (!bp?.watts) return null
          const gpct = Math.round(((bp.watts - pt.watts) / bp.watts) * 100)
          if (gpct < 3) return null
          const by = yV(bp.watts)
          const midY = (pt.y + by) / 2
          return (
            <text key={`gap-${pt.dur}`} x={pt.x + 8} y={midY + 3} fontSize="8" fill="var(--muted)" fontFamily="var(--font-mono)">
              −{gpct}%
            </text>
          )
        })}

        {/* Click indicator */}
        {clickInfo && (
          <g>
            <line x1={clickInfo.x} y1={pad.top} x2={clickInfo.x} y2={pad.top + ch} stroke="var(--yellow)" strokeWidth="1.5" strokeDasharray="4,3" opacity="0.8" />
            <circle cx={clickInfo.x} cy={clickInfo.y} r="5" fill="var(--yellow)" stroke="var(--surface)" strokeWidth="1.5" />
            <text x={clickInfo.x} y={clickInfo.y - 10} textAnchor="middle" fontSize="9" fill="var(--yellow)" fontFamily="var(--font-mono)" fontWeight="700">{Math.round(clickInfo.watts)}W</text>
          </g>
        )}

        {/* X-axis labels */}
        {xTicks.map(({ dur, label, x }) => (
          <text key={dur} x={x} y={h - 5} textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="var(--font-mono)">{label}</text>
        ))}
      </svg>

      {clickInfo && (
        <div className={s.clickHint}>
          Geselecteerd: <strong>{fmtDur(clickInfo.dur)}</strong> — <strong style={{ color: 'var(--accent)' }}>{Math.round(clickInfo.watts)} W</strong>
          {' '}<span className={s.clickHintSub}>· klik elders op de curve om te wisselen</span>
        </div>
      )}

      <div className={s.note}>
        {prDurations.length > 0
          ? `Nieuwe 90-dagen best op ${prDurations.join(', ')} — klik op de curve om het piekvenster te markeren.`
          : 'Geen nieuwe 90-dagen best in deze rit. Klik op de curve om het overeenkomstige piekvenster te selecteren.'}
        {gapPct >= 5 && biggestGap.dur != null &&
          ` Grootste tekort op ${DUR_LABEL[biggestGap.dur] || fmtDur(biggestGap.dur)} (−${gapPct}% t.o.v. best).`}
      </div>
    </div>
  )
}

function LegendPill({ color, label, dashed, dot }) {
  return (
    <span className={s.legendPill}>
      {dot ? (
        <span className={s.legendDot} style={{ background: color }} aria-hidden="true" />
      ) : (
        <span className={s.legendLine} style={{ borderTopStyle: dashed ? 'dashed' : 'solid', borderTopColor: color }} aria-hidden="true" />
      )}
      <span style={{ color }}>{label}</span>
    </span>
  )
}
