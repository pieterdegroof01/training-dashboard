// Mapt de /api/activity/:id/detail respons naar exact de datavorm die de
// componenten verwachten (zie src/data.js voor het contract).

const CONV = {
  if:  'IF-zones zijn coaching-conventies (Coggan/TrainingPeaks), niet peer-reviewed gevalideerd. NP, IF en TSS zijn eigendomsalgoritmes van TrainingPeaks.',
  vi:  'VI-banden zijn coaching-conventies (TrainingPeaks), niet peer-reviewed gevalideerd.',
  dec: 'De 5%-grens voor aerobe decoupling is een coaching-conventie (TrainingPeaks), niet peer-reviewed gevalideerd. Minder valide bij VI > 1.10 of duur < 20 min.',
}

const TYPE_NL = {
  Ride: 'Buitenrit', VirtualRide: 'Virtuele rit', GravelRide: 'Gravelrit',
  MountainBikeRide: 'MTB-rit', Run: 'Hardloop', Walk: 'Wandeling',
}

function classifyVI(vi) {
  if (vi == null) return ''
  return vi <= 1.05 ? 'Stabiel tempo' : vi <= 1.10 ? 'Licht variabel' : 'Variabel'
}

function formatDate(iso) {
  if (!iso) return ''
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${months[m - 1]} ${y}`
}

function formatDur(sec) {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.round(sec / 60)}m`
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return m ? `${h}u${String(m).padStart(2, '0')}` : `${h}u`
}

function timeLabels(durationMin) {
  // 5 gelijkmatig verdeelde tijd-labels: 0 … totaal
  return [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const min = Math.round(durationMin * f)
    if (min === 0) return '0'
    if (min < 60) return `${min}m`
    const h = Math.floor(min / 60), m = min % 60
    return m ? `${h}u${String(m).padStart(2, '0')}` : `${h}u`
  })
}

function zoneIdx(z) {
  if (typeof z === 'number') return Math.max(0, Math.min(4, z - 1))
  const n = parseInt(String(z).replace(/[^\d]/g, ''), 10)
  return isNaN(n) ? 0 : Math.max(0, Math.min(4, n - 1))
}

// Projecteer GPS-spoor naar het 400×200 viewBox van AdRouteMap
function projectGps(gpsTrack) {
  if (!gpsTrack || gpsTrack.length < 2) return null
  const lats = gpsTrack.map((p) => p.lat)
  const lngs = gpsTrack.map((p) => p.lng)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs)
  const latMid = (latMin + latMax) / 2
  const cosLat = Math.cos((latMid * Math.PI) / 180) || 1

  const spanLat = (latMax - latMin) || 1e-6
  const spanLng = ((lngMax - lngMin) * cosLat) || 1e-6
  const M = 16, W = 400 - 2 * M, H = 200 - 2 * M
  const scale = Math.min(W / spanLng, H / spanLat)
  const drawW = spanLng * scale, drawH = spanLat * scale
  const offX = M + (W - drawW) / 2, offY = M + (H - drawH) / 2

  return gpsTrack.map((p) => {
    const x = offX + ((p.lng - lngMin) * cosLat) * scale
    const y = offY + (latMax - p.lat) * scale // noord boven
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  })
}

function bucketize(values, edges, labels) {
  const counts = new Array(labels.length).fill(0)
  for (const v of values) {
    let placed = false
    for (let i = 0; i < edges.length; i++) {
      if (v < edges[i]) { counts[i]++; placed = true; break }
    }
    if (!placed) counts[counts.length - 1]++
  }
  const total = values.length || 1
  return labels.map((l, i) => ({ l, c: Math.round((counts[i] / total) * 100) }))
}

export function transformApiResponse(api) {
  const {
    activity: a, ftp: FTP = 280,
    zoneBreakdown, powerTimeline, hrTimeline,
    cadenceTimeline, velocityTimeline, gpsTrack,
    hrSummary, avgCadence, aerobicDecoupling, vi, ef,
    plannedSession, sessionClassification, activityMmpCurve, bestMmpCurve,
  } = api

  const sessionType = sessionClassification?.sessionType || TYPE_NL[a.type] || 'Rit'
  const durationMin = a.duration_min || 1
  const durationSec = durationMin * 60

  // ── Metrics (labels exact zoals componenten ze opzoeken) ──────────────────
  const avgSpeed = a.distance_km && durationMin
    ? Math.round((a.distance_km / durationMin) * 60 * 10) / 10
    : null

  const metrics = [
    a.distance_km != null && { l: 'AFSTAND', v: a.distance_km.toFixed(1), u: 'km' },
    { l: 'TIJD', v: a.duration_str, u: '' },
    a.tss != null && { l: 'TSS', v: String(a.tss), u: '', accent: true },
    a.np != null && { l: 'NP', v: String(a.np), u: 'W' },
    a.avg_watts != null && { l: 'GEM. W', v: String(a.avg_watts), u: 'W' },
    hrSummary?.avgHR && { l: 'GEM. HR', v: String(hrSummary.avgHR), u: 'bpm' },
    a.elevation_m != null && { l: 'STIJGING', v: String(a.elevation_m), u: 'm' },
    avgSpeed && { l: 'SNELHEID', v: avgSpeed.toFixed(1), u: 'km/u' },
  ].filter(Boolean)

  // ── Derived rij ───────────────────────────────────────────────────────────
  const derived = []
  if (a.IF != null) {
    derived.push({
      v: a.IF.toFixed(2), l: 'IF', sub: sessionType,
      convention: true, conventionNote: CONV.if,
    })
  }
  if (vi != null) {
    derived.push({
      v: Number(vi).toFixed(2), l: 'VI', sub: classifyVI(vi),
      convention: true, conventionNote: CONV.vi,
    })
  }
  if (ef != null) {
    derived.push({ v: Number(ef).toFixed(2), l: 'EF', sub: 'NP / gem. HR' })
  }
  if (aerobicDecoupling) {
    const ok = aerobicDecoupling.status === 'goed'
    const pct = Math.round(Math.abs(aerobicDecoupling.decoupling) * 1000) / 10
    derived.push({
      v: `${pct}%`, l: 'KOPPELING',
      sub: ok ? '✓ Goed (<5%)' : '⚠ Drift (>5%)',
      good: ok, convention: true, conventionNote: CONV.dec,
    })
  }

  // ── Route (geprojecteerd GPS-spoor) ───────────────────────────────────────
  const route = projectGps(gpsTrack)

  // ── Series (vermogen + hartslag) ──────────────────────────────────────────
  const powerValues = powerTimeline ? powerTimeline.map((p) => p.w) : []
  const hrValues = hrTimeline ? hrTimeline.map((p) => p.hr) : []
  let series = null
  if (powerValues.length) {
    series = {
      primary: { label: 'Vermogen', unit: 'W', colorKey: 'accent', values: powerValues, fill: true },
      secondary: hrValues.length
        ? { label: 'Hartslag', unit: 'bpm', colorKey: 'red', values: hrValues }
        : null,
      xLabels: timeLabels(durationMin),
    }
  } else if (hrValues.length) {
    series = {
      primary: { label: 'Hartslag', unit: 'bpm', colorKey: 'red', values: hrValues, fill: true },
      secondary: null,
      xLabels: timeLabels(durationMin),
    }
  }

  // ── Zones ─────────────────────────────────────────────────────────────────
  const zones = zoneBreakdown && !zoneBreakdown.estimated ? [
    { z: 'Z1', name: 'Herstel',   min: Math.round(zoneBreakdown.z1Min || 0), cssVar: '--z1' },
    { z: 'Z2', name: 'Endurance', min: Math.round(zoneBreakdown.z2Min || 0), cssVar: '--z2' },
    { z: 'Z3', name: 'Tempo',     min: Math.round(zoneBreakdown.z3Min || 0), cssVar: '--z3' },
    { z: 'Z4', name: 'Threshold', min: Math.round(zoneBreakdown.z4Min || 0), cssVar: '--z4' },
    { z: 'Z5', name: 'VO2max',    min: Math.round(zoneBreakdown.z5Min || 0), cssVar: '--z5' },
  ] : null

  // ── Aerobe koppeling ──────────────────────────────────────────────────────
  const decoupling = aerobicDecoupling ? {
    ef1: aerobicDecoupling.ef1,
    ef2: aerobicDecoupling.ef2,
    pct: Math.round(Math.abs(aerobicDecoupling.decoupling) * 1000) / 10,
    status: aerobicDecoupling.status,
  } : null

  // ── MMP (6 representatieve duren) ─────────────────────────────────────────
  let mmp = null
  if (activityMmpCurve?.length && bestMmpCurve?.length) {
    const maxDur = activityMmpCurve[activityMmpCurve.length - 1].dur
    const targets = [5, 30, 60, 300, 1200, 3600].filter((d) => d <= maxDur)
    const at = (curve, dur) => {
      let best = curve[0], dist = Infinity
      for (const p of curve) {
        const dd = Math.abs(p.dur - dur)
        if (dd < dist && p.watts != null) { dist = dd; best = p }
      }
      return best?.watts ?? null
    }
    mmp = targets.map((dur) => {
      const ride = at(activityMmpCurve, dur)
      const best = at(bestMmpCurve, dur)
      const bestVal = best != null ? Math.max(best, ride ?? 0) : ride
      return { t: formatDur(dur), ride, best: bestVal, isPr: ride != null && bestVal != null && ride >= bestVal * 0.999 }
    }).filter((p) => p.ride != null && p.best != null)
    if (mmp.length < 2) mmp = null
  }

  // ── Distributies (alle 4 sleutels gegarandeerd) ───────────────────────────
  let dist = null
  if (powerTimeline?.length || hrTimeline?.length || cadenceTimeline?.length || velocityTimeline?.length) {
    dist = {
      power: powerTimeline?.length
        ? bucketize(powerTimeline.map((p) => p.w),
            [100, 150, 200, 250, 300],
            ['<100', '100–150', '150–200', '200–250', '250–300', '>300'])
        : [],
      hr: hrTimeline?.length
        ? bucketize(hrTimeline.map((p) => p.hr),
            [120, 140, 150, 160, 170],
            ['<120', '120–140', '140–150', '150–160', '160–170', '>170'])
        : [],
      cad: cadenceTimeline?.length
        ? bucketize(cadenceTimeline.map((p) => p.c).filter((c) => c > 0),
            [70, 80, 90, 100],
            ['<70', '70–80', '80–90', '90–100', '>100'])
        : [],
      speed: velocityTimeline?.length
        ? bucketize(velocityTimeline.map((p) => p.v),
            [15, 25, 35, 45],
            ['<15', '15–25', '25–35', '35–45', '>45'])
        : [],
    }
  }

  // ── Scatter (vermogen–HR), drift (EF/segment), quadrant (cadans–vermogen) ──
  let scatter = null, drift = null, quadrant = null
  if (powerTimeline?.length && hrTimeline?.length) {
    const hrMap = new Map(hrTimeline.map((p) => [p.t, p.hr]))
    const aligned = powerTimeline
      .map((p) => ({ t: p.t, w: p.w, hr: hrMap.get(p.t) ?? nearestHr(hrTimeline, p.t) }))
      .filter((p) => p.hr != null && p.w > 0)

    if (aligned.length > 10) {
      const step = Math.ceil(aligned.length / 300)
      scatter = aligned.filter((_, i) => i % step === 0).map((p) => ({ x: p.w, y: p.hr }))

      const segs = 16
      const segLen = Math.floor(aligned.length / segs)
      if (segLen > 3) {
        drift = []
        for (let sgi = 0; sgi < segs; sgi++) {
          const slice = aligned.slice(sgi * segLen, (sgi + 1) * segLen)
          let sw = 0, sh = 0
          for (const p of slice) { sw += p.w; sh += p.hr }
          drift.push(Math.round((sw / slice.length) / (sh / slice.length) * 1000) / 1000)
        }
      }
    }
  }
  if (powerTimeline?.length && cadenceTimeline?.length) {
    const cadMap = new Map(cadenceTimeline.map((p) => [p.t, p.c]))
    const aligned = powerTimeline
      .map((p) => ({ w: p.w, c: cadMap.get(p.t) ?? nearestC(cadenceTimeline, p.t) }))
      .filter((p) => p.c != null && p.c > 0 && p.w > 0)
    if (aligned.length > 10) {
      const step = Math.ceil(aligned.length / 300)
      quadrant = aligned.filter((_, i) => i % step === 0).map((p) => ({ x: p.c, y: p.w }))
    }
  }

  // ── Cadans ────────────────────────────────────────────────────────────────
  let cadence = null
  if (avgCadence) {
    const maxCad = cadenceTimeline?.length
      ? Math.max(...cadenceTimeline.map((p) => p.c))
      : null
    cadence = { avg: avgCadence, max: maxCad ?? avgCadence }
  }

  // ── W'bal ─────────────────────────────────────────────────────────────────
  const wbal = series && powerValues.length ? { cp: FTP, wPrime: 21000 } : null

  // ── Gepland ───────────────────────────────────────────────────────────────
  let planned = null
  if (plannedSession && Array.isArray(plannedSession.blokken)) {
    const zoneMin = [0, 0, 0, 0, 0]
    const blocks = plannedSession.blokken.map((b) => {
      const zi = zoneIdx(b.zone)
      const reps = b.herhalingen > 1 ? b.herhalingen : 1
      const dur = b.duration || b.duur || 0
      zoneMin[zi] += dur * reps
      if (b.herstelBlok) {
        zoneMin[zoneIdx(b.herstelBlok.zone)] += (b.herstelBlok.duration || 0) * Math.max(0, reps - 1)
      }
      const label = b.type === 'warmup' ? 'Warm-up'
        : b.type === 'cooldown' ? 'Cooldown'
        : b.wattMin && b.wattMax ? `${b.wattMin}–${b.wattMax} W`
        : `Blok ${b.zone || ''}`.trim()
      return { t: label, d: dur, z: zi, rep: reps }
    })
    planned = {
      title: plannedSession.title || 'Geplande sessie',
      tss: plannedSession.targetTSS ?? null,
      zoneMin: zoneMin.map((m) => Math.round(m)),
      blocks,
    }
  }

  return {
    id: a.id,
    name: a.name,
    kind: a.type === 'Run' ? 'run' : 'ride',
    when: formatDate(a.date),
    where: TYPE_NL[a.type] || a.type,
    source: 'Strava',
    sessionType,
    ftp: FTP,
    maxHr: hrSummary?.maxHR ?? null,
    durationMin,
    metrics, derived, route, series, zones, decoupling,
    mmp, dist, scatter, drift, quadrant, cadence, wbal, planned,
    ai: null,
  }
}

function nearestHr(hrTimeline, t) {
  let best = null, dist = Infinity
  for (const p of hrTimeline) {
    const d = Math.abs(p.t - t)
    if (d < dist) { dist = d; best = p.hr }
    if (p.t > t + 10) break
  }
  return dist <= 10 ? best : null
}

function nearestC(cadTimeline, t) {
  let best = null, dist = Infinity
  for (const p of cadTimeline) {
    const d = Math.abs(p.t - t)
    if (d < dist) { dist = d; best = p.c }
    if (p.t > t + 10) break
  }
  return dist <= 10 ? best : null
}
