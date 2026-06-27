// Maps the /api/activity/:id/detail response to the shape the React components expect

export function transformApiResponse(api) {
  const {
    activity: a, ftp: FTP = 280,
    zoneBreakdown, powerTimeline, hrTimeline,
    altitudeTimeline, cadenceTimeline, velocityTimeline, gpsTrack,
    hrSummary, avgCadence, aerobicDecoupling, vi, ef,
    plannedSession, sessionClassification, activityMmpCurve, bestMmpCurve,
  } = api

  const sessionType = sessionClassification?.sessionType || 'Rit'

  // ── Metrics strip ────────────────────────────────────────────────────────
  const avgSpeed = a.distance_km && a.duration_min
    ? Math.round(a.distance_km / a.duration_min * 60 * 10) / 10
    : null

  const metrics = [
    a.distance_km != null && { l: 'Afstand', v: a.distance_km, u: 'km' },
    { l: 'Tijd', v: a.duration_str, u: '' },
    a.tss != null && { l: 'TSS', v: a.tss, u: '', accent: true, info: 'Training Stress Score — gecombineerde maat van duur en intensiteit.' },
    a.np != null && { l: 'Norm. vermogen', v: a.np, u: 'W', info: 'Genormaliseerd vermogen (NP) — gewogen gemiddelde dat zwaardere inspanningen zwaarder weegt.' },
    a.avg_watts != null && { l: 'Gem. vermogen', v: a.avg_watts, u: 'W' },
    hrSummary?.avgHR && { l: 'Gem. HR', v: hrSummary.avgHR, u: '' },
    a.elevation_m != null && { l: 'Stijging', v: a.elevation_m, u: 'm' },
    avgSpeed && { l: 'km/u', v: avgSpeed, u: '' },
  ].filter(Boolean)

  // ── Derived row ──────────────────────────────────────────────────────────
  const derived = []
  if (a.IF != null) {
    derived.push({
      l: 'IF', v: a.IF.toFixed(2), u: '',
      ref: `${Math.round(a.IF * 100)}% van FTP`,
      convention: true,
      conventionNote: 'IF is een coaching-conventie (Coggan/Allen). Sweetspot-band 0.85–0.95 is geen peer-reviewed norm.',
    })
  }
  if (vi != null) {
    derived.push({
      l: 'VI', v: Number(vi).toFixed(2), u: '',
      ref: vi < 1.05 ? '1.00–1.05 band' : 'licht variabel',
      convention: true,
      conventionNote: 'Variability Index (NP ÷ gem. vermogen). Grens van 1.05 is een coaching-conventie.',
    })
  }
  if (ef != null) {
    derived.push({ l: 'EF', v: Number(ef).toFixed(2), u: 'NP/gem.HR' })
  }
  if (aerobicDecoupling) {
    const dcPct = Math.round(Math.abs(aerobicDecoupling.decoupling) * 1000) / 10
    const ok = aerobicDecoupling.status === 'goed'
    derived.push({
      l: 'Koppeling',
      v: ok ? `✓ Goed (<5%)` : `⚠ Drift (${dcPct}%)`,
      u: '',
      convention: true,
      conventionNote: 'Drempel van 5% is een coaching-conventie (Friel). Alleen geldig bij VI ≤ 1.10 en duur ≥ 20 min.',
    })
  }

  // ── Route ────────────────────────────────────────────────────────────────
  const route = gpsTrack?.length
    ? { gpsTrack: gpsTrack.map(p => ({ lat: p.lat, lng: p.lng })) }
    : null

  // ── Series (power + HR chart) ────────────────────────────────────────────
  const powerValues = powerTimeline ? powerTimeline.map(p => p.w) : []
  const hrValues = hrTimeline ? hrTimeline.map(p => p.hr) : []
  const series = powerValues.length || hrValues.length ? {
    primary: { label: 'Vermogen', values: powerValues, color: '--accent', unit: 'W' },
    secondary: hrValues.length
      ? { label: 'Hartslag', values: hrValues, color: '--red', unit: 'bpm' }
      : null,
  } : null

  // ── Zones ────────────────────────────────────────────────────────────────
  const zones = zoneBreakdown ? [
    { name: 'Z1 Herstel',      min: zoneBreakdown.z1Min || 0, cssVar: '--z1' },
    { name: 'Z2 Duurzaamheid', min: zoneBreakdown.z2Min || 0, cssVar: '--z2' },
    { name: 'Z3 Tempo',        min: zoneBreakdown.z3Min || 0, cssVar: '--z3' },
    { name: 'Z4 Drempel',      min: zoneBreakdown.z4Min || 0, cssVar: '--z4' },
    { name: 'Z5 VO2max+',      min: zoneBreakdown.z5Min || 0, cssVar: '--z5' },
  ] : null

  // ── Decoupling ───────────────────────────────────────────────────────────
  const decoupling = aerobicDecoupling ? {
    ef1: aerobicDecoupling.ef1,
    ef2: aerobicDecoupling.ef2,
    pct: Math.round(Math.abs(aerobicDecoupling.decoupling) * 1000) / 10,
    status: aerobicDecoupling.status,
  } : null

  // ── MMP ──────────────────────────────────────────────────────────────────
  let mmp = null
  if (activityMmpCurve?.length && bestMmpCurve?.length) {
    const bestMap = {}
    for (const b of bestMmpCurve) if (b.watts) bestMap[b.dur] = b.watts

    // Find closest best90 for each activity point
    const bestDurs = Object.keys(bestMap).map(Number).sort((a, b) => a - b)
    function closestBest(dur) {
      if (bestMap[dur] != null) return bestMap[dur]
      let closest = null, minDist = Infinity
      for (const d of bestDurs) {
        const dist = Math.abs(d - dur)
        if (dist < minDist) { minDist = dist; closest = bestMap[d] }
      }
      return closest
    }

    mmp = activityMmpCurve.map(p => {
      const best90 = closestBest(p.dur)
      const isPr = best90 != null && p.watts != null && p.watts >= best90 * 0.999
      return { dur: p.dur, watts: p.watts, best90, isPr }
    })
  }

  // ── Distributions ────────────────────────────────────────────────────────
  let dist = null
  if (powerTimeline || hrTimeline || cadenceTimeline || velocityTimeline) {
    dist = {}
    if (powerTimeline?.length) {
      const bins = {}
      for (const { w } of powerTimeline) {
        const b = Math.floor(w / 25) * 25
        bins[b] = (bins[b] || 0) + 1
      }
      dist.power = Object.entries(bins).sort((a, b) => +a[0] - +b[0])
        .map(([label, count]) => ({ label: `${label}W`, count }))
    }
    if (hrTimeline?.length) {
      const bins = {}
      for (const { hr } of hrTimeline) {
        const b = Math.floor(hr / 5) * 5
        bins[b] = (bins[b] || 0) + 1
      }
      dist.hr = Object.entries(bins).sort((a, b) => +a[0] - +b[0])
        .map(([label, count]) => ({ label: `${label}bpm`, count }))
    }
    if (cadenceTimeline?.length) {
      const bins = {}
      for (const { c } of cadenceTimeline) {
        if (c > 0) {
          const b = Math.floor(c / 5) * 5
          bins[b] = (bins[b] || 0) + 1
        }
      }
      dist.cadence = Object.entries(bins).sort((a, b) => +a[0] - +b[0])
        .map(([label, count]) => ({ label: `${label}rpm`, count }))
    }
    if (velocityTimeline?.length) {
      const bins = {}
      for (const { v } of velocityTimeline) {
        const b = Math.floor(v / 2) * 2
        bins[b] = (bins[b] || 0) + 1
      }
      dist.speed = Object.entries(bins).sort((a, b) => +a[0] - +b[0])
        .map(([label, count]) => ({ label: `${label}km/u`, count }))
    }
  }

  // ── Scatter (power vs HR, max 300 punten) ────────────────────────────────
  let scatter = null
  if (powerTimeline?.length && hrTimeline?.length) {
    const hrMap = {}
    for (const { t, hr } of hrTimeline) hrMap[t] = hr
    const step = Math.ceil(powerTimeline.length / 300)
    scatter = powerTimeline
      .filter((_, i) => i % step === 0)
      .map(({ t, w }) => ({ x: w, y: hrMap[t] ?? null }))
      .filter(p => p.y != null && p.x > 0)
  }

  // ── Quadrant ─────────────────────────────────────────────────────────────
  let quadrant = null
  if (scatter?.length) {
    const hrThresh = hrSummary?.avgHR || 150
    quadrant = {
      q1: scatter.filter(p => p.x >= FTP && p.y >= hrThresh).length,
      q2: scatter.filter(p => p.x < FTP  && p.y >= hrThresh).length,
      q3: scatter.filter(p => p.x >= FTP && p.y < hrThresh).length,
      q4: scatter.filter(p => p.x < FTP  && p.y < hrThresh).length,
      hrThresh, ftpLine: FTP,
    }
  }

  // ── EF-drift (6 segmenten) ───────────────────────────────────────────────
  let drift = null
  if (powerTimeline?.length && hrTimeline?.length) {
    const hrMap = {}
    for (const { t, hr } of hrTimeline) hrMap[t] = hr
    const segs = 6
    const segLen = Math.floor(powerTimeline.length / segs)
    if (segLen > 10) {
      drift = []
      for (let s = 0; s < segs; s++) {
        const slice = powerTimeline.slice(s * segLen, (s + 1) * segLen)
        let sumW = 0, sumHR = 0, cnt = 0
        for (const { t, w } of slice) {
          const hr = hrMap[t]
          if (hr && w > 0) { sumW += w; sumHR += hr; cnt++ }
        }
        const efVal = cnt > 0 ? Math.round((sumW / cnt) / (sumHR / cnt) * 100) / 100 : 0
        drift.push({ seg: s + 1, ef: efVal })
      }
    }
  }

  // ── Cadence ──────────────────────────────────────────────────────────────
  const cadence = avgCadence ? {
    avg: avgCadence,
    series: cadenceTimeline?.map(p => p.c) || [],
  } : null

  // ── W'bal ────────────────────────────────────────────────────────────────
  const wbal = series ? { cp: FTP, wPrime: 21000 } : null

  // ── Planned ──────────────────────────────────────────────────────────────
  let planned = null
  if (plannedSession) {
    planned = {
      targetTSS: plannedSession.targetTSS,
      duration:  plannedSession.duration,
      title:     plannedSession.title,
      blocks:    (plannedSession.blokken || []).map(b => ({
        label:     b.title || b.label || b.name || 'Blok',
        targetPct: b.targetPct || (b.intensityPct ? [b.intensityPct / 100] : [0.75]),
        reps:      b.reps || 1,
        restMin:   b.restMin || (b.restSeconds ? b.restSeconds / 60 : 3),
        color:     '--z3',
      })),
    }
  }

  return {
    id: a.id,
    name: a.name,
    date: a.date,
    type: a.type,
    sessionType,
    ftp: FTP,
    metrics,
    derived,
    route,
    series,
    zones,
    decoupling,
    mmp,
    dist,
    scatter,
    quadrant,
    drift,
    cadence,
    wbal,
    planned,
    ai: null, // wordt apart gefetcht
  }
}
