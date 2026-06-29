// Dev-only synthetic run API payload. Loaded only in dev via ?demo-run — not in prod bundle.

const N = 900
const vel = Array.from({ length: N }, (_, i) => ({ t: i * 4, v: 11 + Math.sin(i / 40) * 1.5 + Math.sin(i / 15) * 0.5 }))
const hr  = Array.from({ length: N }, (_, i) => ({ t: i * 4, hr: 145 + Math.round((i / N) * 20 + Math.sin(i / 25) * 5) }))
const cad = Array.from({ length: N }, (_, i) => ({ t: i * 4, c: 175 + Math.round(Math.sin(i / 20) * 5) }))
const gap = Array.from({ length: N }, (_, i) => ({ t: i * 4, pace: 320 - Math.round(Math.sin(i / 40) * 20) }))
const gps = Array.from({ length: N }, (_, i) => {
  const a = (i / N) * Math.PI * 2
  return { t: i * 4, lat: 51.22 + Math.sin(a) * 0.025, lng: 4.42 + Math.cos(a) * 0.035 }
})

export const demoRunApi = {
  activity: {
    id: 99999999, name: 'Ochtendloop', date: '2026-06-29', type: 'Run',
    distance_km: 10.2, duration_min: 56, duration_str: '56m', elevation_m: 48,
  },
  ngp: { ngpSpeed: 11.5, ngpPaceSecPerKm: 313 },
  gapTimeline: gap,
  runLoad: { load: 62, source: 'rtss', IF: 0.78 },
  runningEF: 2.41,
  runningDecoupling: { ef1: 2.45, ef2: 2.37, decoupling: 0.034, status: 'goed' },
  runHrZones: { z1Min: 8.2, z2Min: 22.4, z3Min: 18.1, z4Min: 5.8, z5Min: 1.5, basis: 'Friel %LTHR' },
  eccentric: { descentM: 182, eccentricFlag: false, reason: 'Beperkt dalend profiel' },
  runCadence: { avgSpm: 175, max: 185, timelineSpm: cad },
  velocityTimeline: vel,
  hrTimeline: hr,
  gpsTrack: gps,
  hrSummary: { avgHR: 152, maxHR: 181 },
  sessionClassification: { sessionType: 'Duurloop' },
}
