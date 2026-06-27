// Dev-only synthetische API-payload (vorm = getActivityDetail()).
// Wordt alleen dynamisch geladen in dev via ?demo=1 — niet in productie-bundle.

const N = 1400
const power = Array.from({ length: N }, (_, i) => ({ t: i * 5, w: 150 + Math.round(Math.sin(i / 30) * 80 + (i % 60 < 40 ? 90 : 0)) }))
const hr = Array.from({ length: N }, (_, i) => ({ t: i * 5, hr: 120 + Math.round((i / N) * 35 + Math.sin(i / 20) * 5) }))
const cad = Array.from({ length: N }, (_, i) => ({ t: i * 5, c: 85 + Math.round(Math.sin(i / 15) * 12) }))
const vel = Array.from({ length: N }, (_, i) => ({ t: i * 5, v: 28 + Math.round(Math.sin(i / 25) * 10) }))
const gps = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2
  return { t: i * 5, lat: 51.84 + Math.sin(a) * 0.04 + Math.sin(a * 3) * 0.01, lng: 5.86 + Math.cos(a) * 0.06 }
})
const mmpAct = [5, 10, 30, 60, 120, 300, 600, 1200, 3600].map((dur) => ({ dur, watts: Math.round(600 - Math.log(dur) * 60) }))
const mmpBest = mmpAct.map((p) => ({ dur: p.dur, watts: Math.round(p.watts * 1.12), activityId: '999', name: 'Beste rit', date: '2026-05-01' }))

export const demoApi = {
  activity: {
    id: 18358107056, name: 'Middagrit', date: '2026-06-20', type: 'Ride',
    distance_km: 48.8, duration_min: 89, duration_str: '1u29', elevation_m: 143,
    avg_watts: 202, np: 217, IF: 0.81, tss: 89, suffer_score: 120,
  },
  zoneBreakdown: { z1Min: 24.3, z2Min: 14.5, z3Min: 31.8, z4Min: 15.5, z5Min: 9.1, estimated: false },
  powerTimeline: power, hrTimeline: hr, cadenceTimeline: cad, velocityTimeline: vel, gpsTrack: gps,
  hrSummary: { avgHR: 152, maxHR: 178 },
  avgCadence: 87,
  aerobicDecoupling: { ef1: 1.45, ef2: 1.36, decoupling: 0.069, status: 'drift' },
  vi: 1.07, ef: 1.43, ftp: 268,
  plannedSession: {
    targetTSS: 95, duration: 90, title: 'Tempo 2×20',
    blokken: [
      { type: 'warmup', zone: 'Z1', duration: 12, wattMin: 120, wattMax: 160 },
      { type: 'work', zone: 'Z3', duration: 20, wattMin: 210, wattMax: 235, herhalingen: 2, herstelBlok: { zone: 'Z1', duration: 6 } },
      { type: 'cooldown', zone: 'Z1', duration: 8, wattMin: 120, wattMax: 160 },
    ],
  },
  sessionClassification: { sessionType: 'Tempo', boutCount: 2 },
  activityMmpCurve: mmpAct, bestMmpCurve: mmpBest,
}
