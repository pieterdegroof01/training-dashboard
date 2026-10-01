// Gedeelde statistiek over een sleep-selectie op de activiteitgrafieken (fiets en loop).
// Pure functies: geen React, geen DOM.

// Lookup op een oplopend gesorteerde reeks: geeft toKey terug voor een gegeven fromKey-waarde (lineair geïnterpoleerd, geclampt aan de randen).
export function lerpLookup(arr, fromKey, toKey, x) {
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

// ── Formattering ──────────────────────────────────────────────────────────────

export function secToPace(sec) {
  if (sec == null || !isFinite(sec) || sec <= 0) return '–'
  const total = Math.round(sec)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function fmtClock(sec) {
  if (sec == null || !isFinite(sec)) return '–'
  const total = Math.max(0, Math.round(sec))
  const ss = String(total % 60).padStart(2, '0')
  if (total < 3600) return `${Math.floor(total / 60)}:${ss}`
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  return `${Math.floor(total / 3600)}:${m}:${ss}`
}

export function fmtKm(km) {
  if (km == null || !isFinite(km)) return '–'
  // Grens op de afgeronde waarde, zodat 9.996 niet als '10.00 km' verschijnt.
  return `${Math.round(km * 100) / 100 < 10 ? km.toFixed(2) : km.toFixed(1)} km`
}

// ── Berekening ────────────────────────────────────────────────────────────────

function inWindow(pts, tStart, tEnd) {
  if (!Array.isArray(pts)) return []
  return pts.filter(p => p.t >= tStart && p.t <= tEnd)
}

// Rekenkundig gemiddelde van key over de vensterpunten die door keep komen.
// Minder dan 2 punten in het venster, of geen enkel bruikbaar punt: null.
function windowMean(pts, key, keep) {
  if (pts.length < 2) return null
  let sum = 0, n = 0
  for (const p of pts) {
    const v = p[key]
    if (!Number.isFinite(v) || (keep && !keep(v))) continue
    sum += v
    n++
  }
  return n ? sum / n : null
}

const positive = v => v > 0

export function computeSelectionStats({ tStart, tEnd, distance, speed, gap, hr, power, cadence, gradient }) {
  const durationSec = tEnd - tStart
  const win = pts => inWindow(pts, tStart, tEnd)

  // Gemiddelde snelheid inclusief stilstand: de noemer is de verstreken tijd, niet de bewegende tijd.
  const meanV = windowMean(win(speed), 'v')

  const hasDistance = Array.isArray(distance) && distance.length >= 2
    && distance[distance.length - 1].d > distance[0].d
  let distanceKm = null
  if (hasDistance) {
    distanceKm = Math.max(0, lerpLookup(distance, 't', 'd', tEnd) - lerpLookup(distance, 't', 'd', tStart))
  } else if (meanV != null) {
    distanceKm = meanV * durationSec / 3600
  }

  const speedKmh = (distanceKm > 0 && durationSec > 0)
    ? distanceKm / durationSec * 3600
    : meanV

  // Tempo volgt uit afstand en tijd; pace-waarden worden nooit gemiddeld.
  const paceSecPerKm = distanceKm > 0 ? durationSec / distanceKm : null

  // GAP: middel in het snelheidsdomein (harmonisch gemiddelde van de pace-waarden).
  const gapSpeeds = win(gap).map(p => ({ v: p.pace > 0 ? 3600 / p.pace : null }))
  const meanGapV = windowMean(gapSpeeds, 'v', positive)
  const gapSecPerKm = meanGapV != null ? 3600 / meanGapV : null

  return {
    durationSec,
    distanceKm,
    speedKmh,
    paceSecPerKm,
    gapSecPerKm,
    hr: windowMean(win(hr), 'hr', positive),
    power: windowMean(win(power), 'w'),
    cadence: windowMean(win(cadence), 'c', positive),
    gradient: windowMean(win(gradient), 'g'),
  }
}

// ── Weergaveregels ────────────────────────────────────────────────────────────

export function buildSelectionLines(stats, { kind, show = {}, colors = {} } = {}) {
  const isRun = kind === 'run'
  const lines = []
  const add = (key, label, value) => lines.push({ key, label, value, color: colors[key] ?? null })
  const on = (key, v) => !!show[key] && v != null && Number.isFinite(v)

  add('time', 'Tijd', fmtClock(stats.durationSec))
  if (stats.distanceKm != null) add('distance', 'Afstand', fmtKm(stats.distanceKm))

  if (isRun) {
    if (on('tempo', stats.paceSecPerKm)) add('tempo', 'Gem. tempo', `${secToPace(stats.paceSecPerKm)} /km`)
    if (on('gap', stats.gapSecPerKm)) add('gap', 'Gem. GAP', `${secToPace(stats.gapSecPerKm)} /km`)
  } else {
    if (on('speed', stats.speedKmh)) add('speed', 'Gem. snelheid', `${stats.speedKmh.toFixed(1)} km/u`)
    if (on('power', stats.power)) add('power', 'Gem. vermogen', `${Math.round(stats.power)} W`)
  }

  if (on('hr', stats.hr)) add('hr', 'Gem. hartslag', `${Math.round(stats.hr)} bpm`)
  if (on('cadence', stats.cadence)) add('cadence', 'Gem. cadans', `${Math.round(stats.cadence)} ${isRun ? 'spm' : 'rpm'}`)
  if (!isRun && on('gradient', stats.gradient)) add('gradient', 'Gem. helling', `${stats.gradient.toFixed(1)}%`)

  return lines
}
