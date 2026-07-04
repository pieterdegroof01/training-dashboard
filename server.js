require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const bcrypt = require('bcryptjs'); // bcryptjs i.p.v. bcrypt: pure-JS, geen native compilatie nodig op Railway
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const crypto = require('crypto');
const engine = require('./engine');
const { buildPlan } = require('./planner');
const { getAthleteParams } = require('./athleteParams');
const { classifySession, classifySessionFromHR, computeWorkoutMuscleVolume, computeWorkoutStrengthSummary } = require('./engine');
const { initSchema, pool, query, getDefaultUser, saveUserFields, getActivities, getActivitiesLite, upsertActivity, upsertActivityMMP, getHevyWorkouts, upsertHevyWorkout, getWeightMap, getNutrition, getSleep, upsertNutrition, deleteNutrition, upsertSleep, upsertWeight, deleteWeight, getActivityStream, upsertActivityStream, insertPrescription, getActivePrescriptions, upsertSessionOutcome, setPrescriptionStatus, getOutcomeHistory, upsertExerciseTemplate, getExerciseTemplates } = require('./db');

// ── Cache-busted index HTML ───────────────────────────────────────────────────
const _fss = require('fs');
const _styleHash = crypto.createHash('sha1').update(_fss.readFileSync(path.join(__dirname, 'public', 'css', 'style.css'))).digest('hex').slice(0, 10);
const _appHash   = crypto.createHash('sha1').update(_fss.readFileSync(path.join(__dirname, 'public', 'js', 'app.js'))).digest('hex').slice(0, 10);
const INDEX_HTML = _fss.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace(/\/css\/style\.css(\?[^"]*)?/g, `/css/style.css?v=${_styleHash}`)
  .replace(/\/js\/app\.js(\?[^"]*)?/g,     `/js/app.js?v=${_appHash}`);

const SCHEMA_VERSION = 1;
const BYPASS_IPS = process.env.AUTH_BYPASS_IPS
  ? process.env.AUTH_BYPASS_IPS.split(',').map(ip => ip.trim()).filter(Boolean)
  : [];

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_PATH || path.join(__dirname, 'data.json');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(compression());
app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path.endsWith('.html') || req.path === '/') {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ── Sessie-auth (JWT cookie) ──────────────────────────────────────────────────
// Hash genereren (eenmalig, lokaal):
//   node -e "console.log(require('bcryptjs').hashSync('jouwwachtwoord', 12))"
// Zet de output als AUTH_PASSWORD_HASH in je environment variables.

const AUTH_USERNAME     = process.env.AUTH_USERNAME;
const AUTH_PASSWORD_HASH = process.env.AUTH_PASSWORD_HASH;
const JWT_SECRET        = process.env.JWT_SECRET;

const AUTH_EXCLUDED = [
  '/auth/strava', '/auth/strava/callback', '/webhook/strava',
  '/api/login', '/login.html',
];

app.use((req, res, next) => {
  // Alleen HTML-pagina's en API-aanroepen vereisen een sessie; statische
  // assets (CSS, JS, afbeeldingen) mogen altijd door.
  const needsAuth = req.path === '/' || req.path.endsWith('.html') || req.path.startsWith('/api/');
  if (!needsAuth) return next();
  if (AUTH_EXCLUDED.includes(req.path)) return next();
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
  if (BYPASS_IPS.length && BYPASS_IPS.includes(clientIp)) return next();

  const token = req.cookies?.peakform_session;
  if (!token) {
    if (req.path === '/' || req.path.endsWith('.html')) return res.redirect('/login.html');
    return res.status(401).json({ error: 'Niet ingelogd' });
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    if (req.path === '/' || req.path.endsWith('.html')) return res.redirect('/login.html');
    return res.status(401).json({ error: 'Sessie verlopen' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!AUTH_USERNAME || !AUTH_PASSWORD_HASH || !JWT_SECRET) {
      return res.status(500).json({ ok: false, error: 'Auth niet geconfigureerd' });
    }
    const valid = username === AUTH_USERNAME && !!password &&
      await bcrypt.compare(password, AUTH_PASSWORD_HASH);
    if (!valid) return res.status(401).json({ ok: false });
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '30d' });
    res.cookie('peakform_session', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('peakform_session');
  res.json({ ok: true });
});

app.get('/', (req, res) => {
  res.type('html').send(INDEX_HTML);
});
app.use(express.static('public'));
app.use('/activity-ui', express.static(path.join(__dirname, 'activity-detail', 'dist')));

// ── Data persistence ──────────────────────────────────────────────────────────

async function loadData() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {
      goals: { primary: '', weightTarget: '90-92', timeline: '', notes: '' },
      patterns: [{ day: 'Donderdag', type: 'Wielrennen (buiten)', description: 'Wielrenclub — maximale blokken', duration: 90 }],
      nutrition: {},
      weight: {},
      weekPlan: {},
      activityCache: { lastSync: null, activities: [] },
      settings: { unreliablePowerStart: '2020-01-01', unreliablePowerEnd: '2020-12-31', ftp: 280, lthr: null },
      aiInsights: {},
      weekAvailability: {}
    };
  }
}

async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

function migrateData(data) {
  if ((data.schemaVersion ?? -1) < SCHEMA_VERSION) {
    console.info(`Migratie uitgevoerd: schema ${data.schemaVersion ?? 'onbekend'} → ${SCHEMA_VERSION}`);
    data.aiInsights = {};
    data.schemaVersion = SCHEMA_VERSION;
  }
  return data;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = Math.imul(31, h) + str.charCodeAt(i) | 0;
  return Math.abs(h).toString(36);
}

function parseBriefingJSON(raw) {
  if (!raw) return null;
  let s = raw.trim();
  // strip eventuele codeblok-fences
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  // pak het eerste { tot het laatste }
  const first = s.indexOf('{'), last = s.lastIndexOf('}');
  if (first === -1 || last === -1 || last <= first) return null;
  let obj;
  try { obj = JSON.parse(s.slice(first, last + 1)); } catch { return null; }
  if (!obj || typeof obj.kop !== 'string' || typeof obj.kopAccent !== 'string' || typeof obj.body !== 'string') return null;
  const accents = Array.isArray(obj.accents) ? obj.accents.filter(a => typeof a === 'string' && a.length && obj.body.includes(a)).slice(0, 4) : [];
  return { kop: obj.kop.trim(), kopAccent: obj.kopAccent.trim(), body: obj.body.trim(), accents };
}

function assignPowerSource(activity) {
  if (!activity.average_watts) {
    activity.powerSource = null;
  } else if (activity.device_watts === true) {
    activity.powerSource = 'measured';
  } else if (activity.device_watts === false) {
    activity.powerSource = 'estimated';
  } else {
    // device_watts ontbreekt in cache (oudere Strava-export)
    activity.powerSource = 'unknown';
  }
}

function getMealTimings(settings) {
  const mt = settings?.mealTimes || {};
  return {
    weekday: {
      breakfast: mt.weekdayBreakfast || '07:30',
      lunch:     mt.weekdayLunch     || '12:30',
      dinner:    mt.weekdayDinner    || '18:30',
      snack:     mt.weekdaySnack     || '10:00',
    },
    weekend: {
      breakfast: mt.weekendBreakfast || '09:00',
      lunch:     mt.weekendLunch     || '13:00',
      dinner:    mt.weekendDinner    || '19:00',
      snack:     mt.weekendSnack     || '11:00',
    }
  };
}

// ── Strava token management ───────────────────────────────────────────────────

let stravaCache = { accessToken: null, expiresAt: 0 };

async function getStravaToken() {
  const nowSec = Math.floor(Date.now() / 1000);
  if (stravaCache.accessToken && nowSec < stravaCache.expiresAt - 300) return stravaCache.accessToken;
  const resp = await axios.post('https://www.strava.com/oauth/token', {
    client_id: process.env.STRAVA_CLIENT_ID,
    client_secret: process.env.STRAVA_CLIENT_SECRET,
    refresh_token: process.env.STRAVA_REFRESH_TOKEN,
    grant_type: 'refresh_token'
  });
  stravaCache.accessToken = resp.data.access_token;
  stravaCache.expiresAt = resp.data.expires_at;
  if (resp.data.refresh_token) process.env.STRAVA_REFRESH_TOKEN = resp.data.refresh_token;
  return stravaCache.accessToken;
}

// ── Full history fetch with pagination ───────────────────────────────────────

async function fetchActivitiesFromStrava(token, afterTimestamp = null) {
  const all = [];
  let page = 1;
  while (true) {
    const params = { per_page: 200, page };
    if (afterTimestamp) params.after = afterTimestamp;
    const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${token}` }, params
    });
    if (!resp.data?.length) break;
    all.push(...resp.data);
    if (resp.data.length < 200) break;
    page++;
    await new Promise(r => setTimeout(r, 200));
  }
  return all;
}

// ── ATL / CTL / TSB (duurtraining only — voor history-summary en charts) ─────

const ENDURANCE_TYPES = engine.ENDURANCE_TYPES;

// ── In-memory analytics-memo (ephemeral, per container) ──────────────────────
// De trends-endpoints herberekenen zware reeksen: rollingFtp wekelijks over de
// hele historie en CP-fits maandelijks. Die uitkomst verandert alleen als
// activiteiten, gewicht of instellingen wijzigen. We cachen de JSON-respons per
// data-fingerprint in het geheugen: eerste opening na een sync of redeploy rekent
// koud, elke volgende opening is instant. Bewust géén Postgres-cache; dit is
// afgeleide, herbouwbare data en verlies bij redeploy is prima (Volume-Mount-
// blocker speelt hier niet). Met ?force=1 omzeil je de memo, voor het enige geval
// dat de fingerprint niet detecteert: een historische mmp-herberekening zonder
// nieuwe activiteit.
const _analyticsMemo = new Map(); // key: `${fp}::${endpoint}` → value
const _ANALYTICS_MEMO_MAX = 16;
function _settingsHash(s) {
  const str = JSON.stringify(s || {});
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return h >>> 0;
}
function analyticsFingerprint(activities, weightMap, settings) {
  const n = activities.length;
  const last = n ? (activities[n - 1].start_date || '') : '';
  const wCount = weightMap ? Object.keys(weightMap).length : 0;
  return `${n}|${last}|${wCount}|${_settingsHash(settings)}`;
}
function memoGet(fp, endpoint) {
  return _analyticsMemo.get(`${fp}::${endpoint}`);
}
function memoSet(fp, endpoint, value) {
  _analyticsMemo.set(`${fp}::${endpoint}`, value);
  if (_analyticsMemo.size > _ANALYTICS_MEMO_MAX) {
    _analyticsMemo.delete(_analyticsMemo.keys().next().value);
  }
}

function calcMetrics(activities, settings) {
  const dailyLoad = {};
  const _m = {};
  const ftpAsOf = (d) => (_m[d] ??= engine.ftpForDate(activities, settings, d, 60));
  activities.filter(a => ENDURANCE_TYPES.has(a.type)).forEach(a => {
    const d = a.start_date?.split('T')[0];
    if (d) dailyLoad[d] = (dailyLoad[d] || 0) + engine.computeETLForActivity(a, settings, ftpAsOf(d)).etl;
  });

  const dates = Object.keys(dailyLoad).sort();
  if (!dates.length) return { atl: 0, ctl: 0, tsb: 0 };

  const k7 = 1 - Math.exp(-1 / 7);
  const k42 = 1 - Math.exp(-1 / 42);
  let atl = 0, ctl = 0;

  const start = new Date(dates[0]);
  for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
    const key = d.toISOString().split('T')[0];
    const load = dailyLoad[key] || 0;
    atl = atl + k7 * (load - atl);
    ctl = ctl + k42 * (load - ctl);
  }

  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10
  };
}

function buildHistorySummary(activities, settings) {
  const monthly = {};
  activities.forEach(a => {
    const month = a.start_date?.substring(0, 7);
    if (!month) return;
    if (!monthly[month]) monthly[month] = { count: 0, min: 0, km: 0, watts: [], types: {} };
    const m = monthly[month];
    m.count++;
    m.min += Math.round((a.moving_time || 0) / 60);
    m.km += (a.distance || 0) / 1000;
    m.types[a.type] = (m.types[a.type] || 0) + 1;
    const date = a.start_date?.split('T')[0] || '';
    const reliable = !(date >= settings.unreliablePowerStart && date <= settings.unreliablePowerEnd);
    if (a.average_watts && reliable) m.watts.push(a.average_watts);
  });

  const summary = Object.entries(monthly).sort().map(([month, m]) => ({
    month,
    activiteiten: m.count,
    totaal_uur: Math.round(m.min / 60 * 10) / 10,
    totaal_km: Math.round(m.km),
    gem_watt: m.watts.length ? Math.round(m.watts.reduce((a, b) => a + b) / m.watts.length) : null,
    typen: m.types
  }));

  const topWatt = activities
    .filter(a => a.average_watts && a.moving_time > 1800)
    .filter(a => { const d = a.start_date?.split('T')[0] || ''; return !(d >= settings.unreliablePowerStart && d <= settings.unreliablePowerEnd); })
    .sort((a, b) => b.average_watts - a.average_watts)
    .slice(0, 5)
    .map(a => ({ datum: a.start_date?.split('T')[0], naam: a.name, watt: Math.round(a.average_watts), duur_min: Math.round(a.moving_time / 60) }));

  return { maandelijks: summary.slice(-24), topVermogen: topWatt };
}

// ── Session completion matching ───────────────────────────────────────────────

function computeSessionScore(planned, actual, settings) {
  const ftp      = settings?.ftp || 280;
  const hasPower = !!(actual.weighted_average_watts || actual.average_watts);

  // plannedMin
  let plannedMin;
  if (planned.duration) {
    plannedMin = planned.duration;
  } else if (planned.blokken?.length) {
    plannedMin = planned.blokken.reduce((sum, b) => {
      const reps = b.herhalingen || 1;
      return sum + (b.duration || 0) * reps + (b.herstelBlok?.duration || 0) * reps;
    }, 0);
  }
  if (!plannedMin) plannedMin = 60;

  const actualMin = (actual.moving_time || 0) / 60;

  // Component 1 — Duration
  const durRatio = actualMin / plannedMin;
  const durScore = durRatio >= 0.90 ? 10 : durRatio >= 0.75 ? 7 : durRatio >= 0.50 ? 4 : 1;

  // Component 2 — Intensity (power only)
  let intScore = null;
  if (hasPower && planned.targetTSS && plannedMin > 0) {
    const actualIF   = (actual.weighted_average_watts || actual.average_watts) / ftp;
    const plannedIF  = Math.sqrt(planned.targetTSS / ((plannedMin / 60) * 100));
    if (plannedIF > 0) {
      const diff = Math.abs(actualIF / plannedIF - 1);
      intScore = diff < 0.05 ? 10 : diff < 0.10 ? 8 : diff < 0.20 ? 5 : 2;
    }
  }

  // Component 3 — Zone alignment
  let plannedPrimaryZone;
  if (planned.blokken?.length) {
    const zoneMins = {};
    planned.blokken.forEach(b => {
      const reps = b.herhalingen || 1;
      const z    = b.zone || 'Z2';
      zoneMins[z] = (zoneMins[z] || 0) + (b.duration || 0) * reps;
      if (b.herstelBlok) zoneMins['Z1'] = (zoneMins['Z1'] || 0) + (b.herstelBlok.duration || 0) * reps;
    });
    plannedPrimaryZone = Object.entries(zoneMins).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Z3';
  } else {
    plannedPrimaryZone = planned.zone || 'Z3';
  }

  let zoneScore;
  if (!hasPower && !actual.average_heartrate) {
    zoneScore = 5;
  } else {
    const zNum = { Z1:1, Z2:2, Z3:3, Z4:4, Z5:5 };
    const actualZone = engine.activityZoneClassification(actual, ftp, settings?.hrMax || 197, settings).zone;
    const diff = Math.abs((zNum[actualZone] || 3) - (zNum[plannedPrimaryZone] || 3));
    zoneScore = diff === 0 ? 10 : diff === 1 ? 7 : diff === 2 ? 4 : 1;
  }

  const score = (hasPower && intScore !== null)
    ? 0.40 * durScore + 0.35 * intScore + 0.25 * zoneScore
    : 0.55 * durScore + 0.45 * zoneScore;

  return Math.min(10.0, Math.max(1.0, Math.round(score * 10) / 10));
}

function getISOWeekBounds() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  monday.setHours(12, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    monday: monday.toISOString().split('T')[0],
    sunday: sunday.toISOString().split('T')[0],
    today:  now.toISOString().split('T')[0]
  };
}

function calcZoneBreakdown(timeArr, wattsArr, ftp) {
  let z1Sec = 0, z2Sec = 0, z3Sec = 0, z4Sec = 0, z5Sec = 0;
  for (let i = 0; i < timeArr.length - 1; i++) {
    const dur = timeArr[i + 1] - timeArr[i];
    if (dur <= 0) continue;
    const IF = wattsArr[i] / ftp;
    if      (IF < 0.55) z1Sec += dur;
    else if (IF < 0.75) z2Sec += dur;
    else if (IF < 0.90) z3Sec += dur;
    else if (IF < 1.05) z4Sec += dur;
    else                z5Sec += dur;
  }
  const totalSec = z1Sec + z2Sec + z3Sec + z4Sec + z5Sec;
  const toMin = s => Math.round(s / 60 * 10) / 10;
  return {
    z1Min: toMin(z1Sec), z2Min: toMin(z2Sec), z3Min: toMin(z3Sec),
    z4Min: toMin(z4Sec), z5Min: toMin(z5Sec),
    lowPct:  totalSec > 0 ? Math.round((z1Sec + z2Sec) / totalSec * 100) / 100 : 0,
    midPct:  totalSec > 0 ? Math.round(z3Sec             / totalSec * 100) / 100 : 0,
    highPct: totalSec > 0 ? Math.round((z4Sec + z5Sec)  / totalSec * 100) / 100 : 0
  };
}

async function matchPlannedToActual(data) {
  const activities = data.activityCache?.activities || [];
  const settings   = data.settings || {};
  const ftp        = settings.ftp || 280;
  const now        = Date.now();
  const cutoffDate = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const { monday, today } = getISOWeekBounds();

  // Index rides by date
  const ridesByDate = {};
  activities.forEach(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return;
    const d = a.start_date?.split('T')[0];
    if (!d) return;
    if (!ridesByDate[d]) ridesByDate[d] = [];
    ridesByDate[d].push(a);
  });

  let changed = false;

  // ── Match planned to actual ──────────────────────────────────────────────────
  for (const [date, sessions] of Object.entries(data.weekPlan || {})) {
    if (date < cutoffDate) continue;
    for (const session of sessions) {
      if (session.type !== 'cycling') continue;
      if (session.completionScore !== undefined || session.missed) continue;

      const rides = ridesByDate[date] || [];
      if (rides.length > 0) {
        const actual = rides.reduce((best, a) => (a.moving_time || 0) > (best.moving_time || 0) ? a : best);
        session.completionScore   = computeSessionScore(session, actual, settings);
        session.actualTSS         = engine.computeETLForActivity(actual, settings,
          engine.ftpForDate(activities, settings, actual.start_date?.split('T')[0] || '')).etl;
        session.actualDuration    = Math.round((actual.moving_time || 0) / 60);
        session.matchedActivityId = session.matchedActivityId || actual.id;
        changed = true;
      } else {
        // End of day (UTC midnight next day) + 2 h grace period
        const endOfDay = new Date(date).getTime() + 24 * 60 * 60 * 1000;
        if (now - endOfDay > 2 * 60 * 60 * 1000) {
          session.missed = true;
          changed = true;
        }
      }
    }
  }

  // ── Stream fetch & unplanned detection (current ISO week only) ───────────────
  let token = null;
  try { token = await getStravaToken(); } catch(e) {
    console.warn('matchPlannedToActual: geen Strava token:', e.message);
  }

  if (token) {
    // Zone fetch for matched planned sessions in current week
    for (const [date, sessions] of Object.entries(data.weekPlan || {})) {
      if (date < monday || date > today) continue;
      for (const session of sessions) {
        if (session.type !== 'cycling' || session.unplanned) continue;
        if (session.completionScore === undefined || session.missed) continue;
        if (session.actualZoneFetched || session.actualZoneEstimated) continue;

        const actId = session.matchedActivityId;
        if (!actId) continue;
        const inUnreliable = date >= (settings.unreliablePowerStart || '2020-01-01') &&
                             date <= (settings.unreliablePowerEnd   || '2020-12-31');
        try {
          const streamResp = await axios.get(
            `https://www.strava.com/api/v3/activities/${actId}/streams?keys=watts,time&series_type=time`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const wattsStream = streamResp.data.find(s => s.type === 'watts');
          const timeStream  = streamResp.data.find(s => s.type === 'time');
          if (wattsStream && timeStream && !inUnreliable) {
            session.actualZoneBreakdown = calcZoneBreakdown(timeStream.data, wattsStream.data, ftp);
            session.actualZoneFetched   = true;
          } else {
            const act = activities.find(a => a.id === actId);
            const avgW = act ? (act.weighted_average_watts || act.average_watts || 0) : 0;
            const IF   = avgW > 0 ? avgW / ftp : 0;
            session.actualZoneBreakdown = { estimated: true, dominantZone: IF < 0.75 ? 'low' : IF < 0.90 ? 'mid' : 'high' };
            session.actualZoneEstimated = true;
          }
          changed = true;
        } catch(e) {
          console.warn(`Stream fetch mislukt voor activiteit ${actId}:`, e.message);
        }
      }
    }

    // Unplanned session detection
    const weekEnduranceActs = activities.filter(a => {
      if (!ENDURANCE_TYPES.has(a.type)) return false;
      const d = a.start_date?.split('T')[0];
      return d && d >= monday && d <= today;
    });

    for (const act of weekEnduranceActs) {
      const date = act.start_date?.split('T')[0];
      if (!date) continue;
      const daySessions = data.weekPlan[date] || [];
      const hasPlannedCycling = daySessions.some(s => s.type === 'cycling' && !s.unplanned);
      if (hasPlannedCycling) continue;
      const alreadyTracked = daySessions.some(s => s.unplanned && s.stravaId === act.id);
      if (alreadyTracked) continue;

      const unplanned = {
        type: 'cycling', unplanned: true, stravaId: act.id,
        actualTSS: engine.computeETLForActivity(act, settings,
          engine.ftpForDate(activities, settings, act.start_date?.split('T')[0] || '')).etl,
        duration: Math.round((act.moving_time || 0) / 60),
        title: act.name, date
      };
      if (!data.weekPlan[date]) data.weekPlan[date] = [];
      data.weekPlan[date].push(unplanned);
      changed = true;

      const inUnreliable = date >= (settings.unreliablePowerStart || '2020-01-01') &&
                           date <= (settings.unreliablePowerEnd   || '2020-12-31');
      try {
        const streamResp = await axios.get(
          `https://www.strava.com/api/v3/activities/${act.id}/streams?keys=watts,time&series_type=time`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const wattsStream = streamResp.data.find(s => s.type === 'watts');
        const timeStream  = streamResp.data.find(s => s.type === 'time');
        if (wattsStream && timeStream && !inUnreliable) {
          unplanned.actualZoneBreakdown = calcZoneBreakdown(timeStream.data, wattsStream.data, ftp);
          unplanned.actualZoneFetched   = true;
        } else {
          const avgW = act.weighted_average_watts || act.average_watts || 0;
          const IF   = avgW > 0 ? avgW / ftp : 0;
          unplanned.actualZoneBreakdown = { estimated: true, dominantZone: IF < 0.75 ? 'low' : IF < 0.90 ? 'mid' : 'high' };
          unplanned.actualZoneEstimated = true;
        }
      } catch(e) {
        console.warn(`Stream fetch mislukt voor unplanned activiteit ${act.id}:`, e.message);
      }
    }
  }

  return data.weekPlan;
}

function computePlannedHighPct(session) {
  if (!session.blokken?.length) return null;
  let totalMin = 0;
  let highMin  = 0;
  for (const b of session.blokken) {
    const reps = b.herhalingen || 1;
    const dur  = b.duration || 0;
    totalMin += dur * reps;
    if (b.zone === 'Z4' || b.zone === 'Z5') highMin += dur * reps;
    if (b.herstelBlok) totalMin += (b.herstelBlok.duration || 0) * reps;
  }
  return totalMin > 0 ? highMin / totalMin : null;
}

async function reconcilePrescriptions(data, state, userId) {
  try {
    const today    = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const prescriptions = await getActivePrescriptions(userId, fromDate, today);
    if (!prescriptions.length) return;

    const ftp        = (data.settings || {}).ftp || 280;
    const activities = data.activityCache?.activities || [];
    const actById    = {};
    for (const a of activities) actById[a.id] = a;

    // Flat list of cycling sessions in window, indexed by date
    const cyclingByDate = {};
    for (const [date, sessions] of Object.entries(data.weekPlan || {})) {
      if (date < fromDate || date > today) continue;
      for (const session of sessions) {
        if (session.type !== 'cycling') continue;
        if (!cyclingByDate[date]) cyclingByDate[date] = [];
        cyclingByDate[date].push(session);
      }
    }

    // Pre-session state snapshot from engine output
    const em = state.enduranceMetrics || {};
    const preState = {
      ctl:       em.ctl  ?? null,
      atl:       em.atl  ?? null,
      tsb:       em.tsb  ?? null,
      acwr:      em.acwr ?? null,
      readiness: state.readiness?.total ?? null,
    };

    // Group prescriptions by date
    const prescByDate = {};
    for (const p of prescriptions) {
      const d = new Date(p.prescribed_date).toISOString().split('T')[0];
      if (!prescByDate[d]) prescByDate[d] = [];
      prescByDate[d].push(p);
    }

    // Match prescriptions to completed/missed sessions
    for (const [date, datePrescs] of Object.entries(prescByDate)) {
      const dateSessions = cyclingByDate[date] || [];
      const completedSessions = dateSessions.filter(
        s => s.completionScore !== undefined && !s.missed && !s.unplanned
      );

      for (const presc of datePrescs) {
        if (completedSessions.length > 0) {
          // Pick closest actualTSS to target_tss
          const session = completedSessions.reduce((best, s) => {
            const dBest = Math.abs((best.actualTSS || 0) - (presc.target_tss || 0));
            const dS    = Math.abs((s.actualTSS    || 0) - (presc.target_tss || 0));
            return dS < dBest ? s : best;
          });

          const act  = actById[session.matchedActivityId] ?? null;
          const np   = act?.weighted_average_watts;
          const avg  = act?.average_watts;
          const actualIF       = np  > 0 ? Math.round(np  / ftp * 1000) / 1000
                               : avg > 0 ? Math.round(avg / ftp * 1000) / 1000
                               : null;
          const actualAvgPower = (act?.device_watts && avg) ? Math.round(avg) : null;
          const execQuality    = Math.round(session.completionScore / 10 * 1000) / 1000;

          const zb = session.actualZoneBreakdown;
          const deltas = {};
          if (session.actualTSS != null && presc.target_tss != null)
            deltas.tss = Math.round((session.actualTSS - presc.target_tss) * 10) / 10;
          if (actualIF != null && presc.target_if != null)
            deltas.if = Math.round((actualIF - presc.target_if) * 1000) / 1000;
          if (session.actualDuration != null && presc.target_duration_min != null)
            deltas.duration = session.actualDuration - presc.target_duration_min;
          if (zb && !zb.estimated) {
            const plannedHigh = computePlannedHighPct(session);
            if (plannedHigh != null)
              deltas.highPct = Math.round((zb.highPct - plannedHigh) * 1000) / 1000;
          }

          await upsertSessionOutcome(userId, {
            prescription_id:     presc.id,
            strava_id:           session.stravaId ?? null,
            outcome_date:        date,
            match_type:          'completed',
            actual_tss:          session.actualTSS          ?? null,
            actual_duration_min: session.actualDuration      ?? null,
            actual_if:           actualIF,
            actual_avg_power:    actualAvgPower,
            execution_quality:   execQuality,
            match_confidence:    execQuality,
            deltas:              Object.keys(deltas).length ? deltas : null,
            pre_session_state:   preState,
            response_markers:    null,
          });
          await setPrescriptionStatus(presc.id, 'completed');

        } else if (date < today) {
          const deltas = presc.target_tss != null ? { tss: -presc.target_tss } : null;
          await upsertSessionOutcome(userId, {
            prescription_id:     presc.id,
            strava_id:           null,
            outcome_date:        date,
            match_type:          'missed',
            actual_tss:          null,
            actual_duration_min: null,
            actual_if:           null,
            actual_avg_power:    null,
            execution_quality:   0,
            match_confidence:    null,
            deltas,
            pre_session_state:   null,
            response_markers:    null,
          });
          await setPrescriptionStatus(presc.id, 'missed');
        }
      }
    }

    // Unplanned rides
    for (const [date, sessions] of Object.entries(cyclingByDate)) {
      for (const session of sessions) {
        if (!session.unplanned) continue;
        const actId = session.stravaId;
        const act   = actId ? (actById[actId] ?? null) : null;
        const np    = act?.weighted_average_watts;
        const avg   = act?.average_watts;
        const actualIF       = np  > 0 ? Math.round(np  / ftp * 1000) / 1000
                             : avg > 0 ? Math.round(avg / ftp * 1000) / 1000
                             : null;
        const actualAvgPower = (act?.device_watts && avg) ? Math.round(avg) : null;
        const actualDurMin   = session.duration ?? (act ? Math.round((act.moving_time || 0) / 60) : null);

        await upsertSessionOutcome(userId, {
          prescription_id:     null,
          strava_id:           actId ?? null,
          outcome_date:        date,
          match_type:          'unplanned',
          actual_tss:          session.actualTSS ?? null,
          actual_duration_min: actualDurMin,
          actual_if:           actualIF,
          actual_avg_power:    actualAvgPower,
          execution_quality:   null,
          match_confidence:    null,
          deltas:              null,
          pre_session_state:   null,
          response_markers:    null,
        });
      }
    }
  } catch (e) {
    console.error('reconcilePrescriptions fout:', e.message, e.stack);
  }
}

async function adjustCurrentWeek(data, state) {
  if (!process.env.ANTHROPIC_API_KEY) return data.weekPlan;

  const { monday, sunday, today } = getISOWeekBounds();
  const settings         = data.settings || {};
  const ftp              = settings.ftp || 280;
  const weekAvailability = data.weekAvailability || {};

  const weekSessions = Object.entries(data.weekPlan || {})
    .filter(([date]) => date >= monday && date <= sunday)
    .flatMap(([date, sessions]) => (sessions || []).map(s => ({ ...s, date })));

  const completedTSS = weekSessions
    .filter(s => s.type === 'cycling' && !s.unplanned && s.completionScore !== undefined && !s.missed)
    .reduce((sum, s) => sum + (s.actualTSS || 0), 0);
  const unplannedTSS = weekSessions
    .filter(s => s.unplanned)
    .reduce((sum, s) => sum + (s.actualTSS || 0), 0);
  const missedTSS = weekSessions
    .filter(s => s.type === 'cycling' && s.missed)
    .reduce((sum, s) => sum + (s.targetTSS || 0), 0);
  const totalActualTSS = completedTSS + unplannedTSS;

  const em          = state.enduranceMetrics || {};
  const currentCTL  = em.ctl  || 0;
  const currentTSB  = em.tsb  || 0;
  const currentACWR = em.acwr || 0;

  const weeklyTSSTarget = state.trainingPlan?.weeklyTSSTarget || Math.round(currentCTL * 7);
  const tssDeviation    = weeklyTSSTarget > 0 ? (totalActualTSS - weeklyTSSTarget) / weeklyTSSTarget : 0;

  // Remaining days: future cycling-available days this week
  const remainingDays = [];
  const cursor = new Date(today + 'T12:00:00');
  cursor.setDate(cursor.getDate() + 1);
  while (true) {
    const ds = cursor.toISOString().split('T')[0];
    if (ds > sunday) break;
    if (weekAvailability[ds]?.cycling) remainingDays.push(ds);
    cursor.setDate(cursor.getDate() + 1);
  }

  const remainingPlannedTSS = weekSessions
    .filter(s => s.type === 'cycling' && !s.unplanned && !s.missed &&
                 s.completionScore === undefined && s.date > today)
    .reduce((sum, s) => sum + (s.targetTSS || 0), 0);

  const avgDailyRemaining = remainingDays.length > 0 ? remainingPlannedTSS / remainingDays.length : 0;
  const projectedATL      = currentACWR * currentCTL + avgDailyRemaining;
  const projectedACWR     = currentCTL > 0 ? projectedATL / currentCTL : 0;

  // TID deviation — only sessions with exact stream data
  const completedWithZones = weekSessions.filter(s =>
    s.type === 'cycling' && !s.unplanned && s.completionScore !== undefined && !s.missed && s.actualZoneFetched
  );
  let weekHighPct = 0;
  if (completedWithZones.length > 0) {
    let totalHighSec = 0, totalSec = 0;
    for (const s of completedWithZones) {
      const bd = s.actualZoneBreakdown;
      if (!bd) continue;
      const sessTotalSec = (bd.z1Min + bd.z2Min + bd.z3Min + bd.z4Min + bd.z5Min) * 60;
      totalSec     += sessTotalSec;
      totalHighSec += (bd.z4Min + bd.z5Min) * 60;
    }
    weekHighPct = totalSec > 0 ? totalHighSec / totalSec : 0;
  }

  const tid            = state.trainingPlan?.tidMinutes || { low: 0, mid: 0, high: 0 };
  const totalTidMin    = (tid.low || 0) + (tid.mid || 0) + (tid.high || 0);
  const plannedHighPct = totalTidMin > 0 ? (tid.high || 0) / totalTidMin : 0;

  const tssDeficit  = tssDeviation < -0.15;
  const tssSurplus  = tssDeviation > 0.15;
  const acwrRisk    = projectedACWR > 1.30;
  const tsbOverride = currentTSB < -20;
  const tidRisk     = completedWithZones.length >= 2 && weekHighPct > plannedHighPct + 0.10;

  if (!tssDeficit && !tssSurplus && !acwrRisk && !tsbOverride && !tidRisk) return data.weekPlan;
  if (remainingDays.length === 0) return data.weekPlan;

  const tp        = state.trainingPlan;
  const readiness = state.readiness || {};

  const activeSignals = [];
  if (tsbOverride) activeSignals.push(`tsbOverride: "TSB ${currentTSB}: verdere intensieve belasting vertraagt adaptatie (Coggan PMC)"`);
  if (acwrRisk)    activeSignals.push(`acwrRisk: "Geprojecteerde ACWR ${projectedACWR.toFixed(2)}: blessurerisico neemt toe boven 1.3 (Gabbett 2016)"`);
  if (tssDeficit)  activeSignals.push(`tssDeficit: "Weekload ${Math.round(tssDeviation * 100)}% onder target: CTL-opbouw stagneert"`);
  if (tssSurplus)  activeSignals.push(`tssSurplus: "Weekload +${Math.round(tssDeviation * 100)}% boven target: surplus zonder herstel geeft geen extra adaptatie"`);
  if (tidRisk)     activeSignals.push(`tidRisk: "High-zone ${Math.round(weekHighPct * 100)}% vs gepland ${Math.round(plannedHighPct * 100)}%: herstelcapaciteit aangetast"`);

  const remainingDaysInfo = remainingDays.map(date => {
    const avail    = weekAvailability[date] || {};
    const dayIndex = new Date(date + 'T12:00:00').getDay();
    const dayName  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][dayIndex];
    const maxZone  = tp?.cyclingRestrictions?.[dayName]?.maxZone ?? 5;
    return { date, maxDuration: avail.maxDuration || 90, maxZone };
  });

  const userPrompt = `Fase: ${tp?.phase || 'onbekend'}, Mesocycle week: ${tp?.mesocycleWeek || '?'}, weeklyTSSTarget: ${weeklyTSSTarget}, FTP: ${ftp}W

Wattage-zones: Z1 0-${Math.round(0.55*ftp)}W, Z2 ${Math.round(0.56*ftp)}-${Math.round(0.75*ftp)}W, Z3 ${Math.round(0.76*ftp)}-${Math.round(0.90*ftp)}W, Z4 ${Math.round(0.91*ftp)}-${Math.round(1.05*ftp)}W, Z5 >${Math.round(1.05*ftp)}W

Gerealiseerde belasting:
- completedTSS: ${completedTSS}
- unplannedTSS: ${unplannedTSS}
- missedTSS: ${missedTSS}
- totalActualTSS: ${totalActualTSS}
- tssDeviation: ${tssDeviation > 0 ? '+' : ''}${Math.round(tssDeviation * 100)}%

TID: werkelijk ${Math.round(weekHighPct * 100)}% high-zone vs gepland ${Math.round(plannedHighPct * 100)}%
TSB: ${currentTSB}, ACWR huidig: ${currentACWR}, ACWR geprojecteerd: ${projectedACWR.toFixed(2)}

Actieve signalen:
${activeSignals.join('\n')}

Resterende beschikbare dagen:
${JSON.stringify(remainingDaysInfo)}

Readiness: ${readiness.total ?? '?'}/100

Genereer bijgestuurde sessies ALLEEN voor remainingDays. Raak voltooide sessies niet aan.

Prioriteitsregels in volgorde (hogere prioriteit overschrijft lagere):
1. tsbOverride actief: forceer Z1-Z2 voor alle sessies, reduceer duur met 30%. Geen uitzonderingen.
2. acwrRisk actief: reduceer totale resterende TSS totdat projectedACWR onder 1.25 valt.
3. tidRisk actief: verlaag zone van alle resterende sessies één niveau naar beneden.
4. tssDeficit actief (en tsbOverride niet): herverdeel ontbrekende TSS over remainingDays, respecteer maxZone en maxDuration per dag. Voeg alleen TSS toe die fysiologisch zinvol is (niet meer dan 20% van weeklyTSSTarget per dag).
5. tssSurplus actief: verkort werkblokken in resterende sessies proportioneel, behoud wattages.

Retourneer JSON array. Per sessie exact dit formaat:
{"date":"YYYY-MM-DD","type":"cycling","aiGenerated":true,"adjustedAt":"ISO-timestamp","adjustedReason":"string max 100 tekens","title":"string","targetTSS":integer,"duration":integer,"blokken":[{"type":"string","duration":integer,"zone":"Z1"|"Z2"|"Z3"|"Z4"|"Z5","wattMin":integer,"wattMax":integer,"herhalingen":integer(optioneel),"herstelBlok":{"duration":integer,"zone":"Z1"|"Z2"|"Z3"|"Z4"|"Z5","wattMin":integer,"wattMax":integer}(optioneel)}]}`;

  try {
    const aiResp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 1000,
      system: 'Je bent een evidence-based trainingssysteem. Retourneer uitsluitend valide JSON zonder markdown.',
      messages: [{ role: 'user', content: userPrompt }]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });

    let rawText = aiResp.data.content?.[0]?.text || '[]';
    rawText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

    let sessions;
    try { sessions = JSON.parse(rawText); }
    catch(e) { console.error('adjustCurrentWeek parse error:', e.message); return data.weekPlan; }
    if (!Array.isArray(sessions)) return data.weekPlan;

    const remainingSet = new Set(remainingDays);
    const adjustedAt   = new Date().toISOString();

    if (!data.weekPlan) data.weekPlan = {};

    sessions.forEach(s => {
      if (!s.date || !remainingSet.has(s.date)) return;
      // Normalize integer zones to 'Z1'-'Z5' for frontend compatibility
      (s.blokken || []).forEach(b => {
        if (typeof b.zone === 'number') b.zone = `Z${b.zone}`;
        if (b.herstelBlok && typeof b.herstelBlok.zone === 'number') b.herstelBlok.zone = `Z${b.herstelBlok.zone}`;
      });
      const existing = data.weekPlan[s.date] || [];
      const kept     = existing.filter(x =>
        x.type !== 'cycling' || x.unplanned || x.completionScore !== undefined || x.missed
      );
      data.weekPlan[s.date] = [...kept, { ...s, adjustedAt }];
    });

    console.log(`adjustCurrentWeek: ${sessions.length} sessie(s) bijgestuurd`);
    return data.weekPlan;
  } catch(e) {
    console.error('adjustCurrentWeek API error:', e.message);
  }
  return data.weekPlan;
}

// ── Exercise template sync ────────────────────────────────────────────────────

async function syncExerciseTemplates(userId, workouts) {
  const knownIds = new Set(Object.keys(await getExerciseTemplates(userId)));

  const neededIds = new Set();
  for (const w of workouts) {
    for (const ex of (w.exercises || [])) {
      if (ex.exercise_template_id) neededIds.add(ex.exercise_template_id);
    }
  }

  const missingIds = [...neededIds].filter(id => !knownIds.has(id));
  if (!missingIds.length) return;

  for (let i = 0; i < missingIds.length; i++) {
    const id = missingIds[i];
    try {
      const resp = await axios.get(`https://api.hevyapp.com/v1/exercise_templates/${id}`, {
        headers: { 'api-key': process.env.HEVY_API_KEY },
      });
      await upsertExerciseTemplate(userId, resp.data);
    } catch (e) {
      if (e.response?.status === 404) {
        console.warn(`syncExerciseTemplates: template ${id} niet gevonden (404), overgeslagen`);
      } else {
        console.warn(`syncExerciseTemplates: fout bij template ${id}:`, e.message);
      }
    }
    if (i < missingIds.length - 1) await new Promise(r => setTimeout(r, 150));
  }
}

// ── API Routes ────────────────────────────────────────────────────────────────

app.get('/api/strava/athlete', async (req, res) => {
  try {
    const token = await getStravaToken();
    const resp = await axios.get('https://www.strava.com/api/v3/athlete', { headers: { Authorization: `Bearer ${token}` } });
    res.json(resp.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/strava/activities', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;

    const existing = await getActivities(userId);

    // Lichte incrementele sync vanaf de laatste bekende activiteit, identiek aan het Hevy-patroon.
    // De DB is de bron van waarheid (gevuld door sync-all en webhooks). De live listing-endpoint
    // van Strava respecteert scopes anders en mist soms prive of handmatige activiteiten, daarom DB-read.
    // Faalt de Strava-call, dan vallen we terug op wat al in de DB staat.
    try {
      const token = await getStravaToken();
      const lastTs = existing.length > 0
        ? Math.floor(new Date(existing[existing.length - 1].start_date).getTime() / 1000)
        : null;
      const fresh = await fetchActivitiesFromStrava(token, lastTs);
      for (const a of fresh) {
        if (a.powerSource === undefined) assignPowerSource(a);
        await upsertActivity(userId, a);
      }
    } catch (e) {
      console.warn('Strava incrementele sync mislukt, val terug op DB:', e.message);
    }

    // Volledige set uit de DB; het tijdvenster (21d/90d/alles) wordt client-side gekozen en
    // symmetrisch over Strava en Hevy toegepast. Streams gaan niet mee: de feed gebruikt ze niet
    // en het houdt de payload klein. De detailpagina laadt streams apart via /api/activity/:id/detail.
    const all = await getActivities(userId);
    const light = all.map(({ streams, ...rest }) => rest);
    res.json(light);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/strava/sync-all', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const token = await getStravaToken();
    const force = req.body?.force === true;

    const existingActivities = await getActivities(userId);
    const lastSync = user.settings?.lastSync || null;

    let newActs;
    if (!force && lastSync && existingActivities.length > 0) {
      const afterTs = Math.floor(new Date(lastSync).getTime() / 1000);
      newActs = await fetchActivitiesFromStrava(token, afterTs);
    } else {
      newActs = await fetchActivitiesFromStrava(token);
    }

    for (const a of newActs) {
      if (a.powerSource === undefined) assignPowerSource(a);
      await upsertActivity(userId, a);
    }

    const allActivities = await getActivities(userId);
    const calibration = engine.computeCalibrationFactor(allActivities, user.settings || {});
    const newSettings = { ...(user.settings || {}), sufferToTSSFactor: calibration.factor, lastSync: new Date().toISOString() };
    await saveUserFields(userId, { settings: newSettings, calibration });

    // Naweeën — verse user na cache-invalidatie door saveUserFields
    const freshUser = await getDefaultUser();
    const [hevyWorkouts, weight, nutrition, sleep] = await Promise.all([
      getHevyWorkouts(userId),
      getWeightMap(userId),
      getNutrition(userId),
      getSleep(userId),
    ]);
    const data = {
      activityCache: { lastSync: newSettings.lastSync, activities: allActivities },
      hevyWorkouts,
      weight,
      nutrition,
      sleep,
      weekPlan:         freshUser.week_plan         || {},
      settings:         freshUser.settings          || {},
      calibration:      freshUser.calibration        || { factor: 1.0, count: 0, reliable: false },
      goals:            freshUser.goals              || {},
      patterns:         freshUser.patterns           || [],
      aiInsights:       freshUser.ai_insights        || {},
      weekAvailability: freshUser.week_availability  || {},
    };

    const wp1 = await matchPlannedToActual(data);
    data.weekPlan = wp1;

    let syncState = {};
    let finalWeekPlan = wp1;
    try {
      syncState = engine.computeFullState(allActivities, data.hevyWorkouts, data.weight, data.nutrition, data.weekPlan, data.settings, data);
      finalWeekPlan = await adjustCurrentWeek(data, syncState);
    } catch(e) { console.warn('adjustCurrentWeek (sync):', e.message); }

    await saveUserFields(userId, { week_plan: finalWeekPlan });
    try { await reconcilePrescriptions(data, syncState, userId); } catch(e) { console.warn('reconcile (sync):', e.message); }

    res.json({ total: allActivities.length, new: newActs?.length || 0, lastSync: newSettings.lastSync, calibration });
  } catch (err) {
    console.error('Sync-all fout:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/strava/history-summary', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const activities = await getActivities(user.id);
    const settings = user.settings || {};
    const metrics = calcMetrics(activities, settings);
    const summary = buildHistorySummary(activities, settings);
    res.json({ total: activities.length, lastSync: user.settings?.lastSync || null, metrics, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── MMP helper + endpoints ────────────────────────────────────────────────────

async function computeMMPForActivity(userId, activityObj, token) {
  const id = String(activityObj.id);
  const ps = activityObj.powerSource;
  if (ps !== 'measured' && ps !== 'unknown') return false;
  if (!activityObj.average_watts) return false;
  try {
    const resp = await axios.get(
      `https://www.strava.com/api/v3/activities/${id}/streams?keys=watts&key_by_type=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const wattsData = resp.data?.watts?.data;
    if (!wattsData?.length) return false;
    const powerTimeline = wattsData.map(w => ({ w: Math.max(0, w || 0) }));
    const mmpFull = engine.computeMMPFull(powerTimeline);
    if (!mmpFull) return false;
    const date = activityObj.start_date?.split('T')[0] || '';
    const name = activityObj.name || '';
    const mmpEntry = { date, powerSource: ps, name, dur: powerTimeline.length, mmpArray: Array.from(mmpFull), v: 2 };
    await upsertActivityMMP(userId, id, mmpEntry);
    return true;
  } catch(e) {
    if (e.response?.status === 429) {
      const rl = new Error('Strava rate limit bereikt');
      rl.rateLimited = true;
      throw rl;
    }
    console.warn(`MMP stream mislukt (${id}):`, e.message);
    return false;
  }
}

async function recomputeCpModel(userId) {
  try {
    const user = await getDefaultUser();
    const allActivities = await getActivities(userId);
    const mmpEntries = allActivities.map(a => a.mmp).filter(Boolean);
    const ftp = (user.settings || {}).ftp || 280;
    const cpModel = engine.computeCriticalPower(mmpEntries, ftp, {
      now: Date.now(), windowDays: 90,
    });
    if (cpModel) await saveUserFields(userId, { cp_model: cpModel });
    return cpModel;
  } catch (e) {
    console.warn('recomputeCpModel:', e.message);
    return null;
  }
}

app.post('/api/strava/mmp-batch', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.body?.limit) || 25, 50);
    const days  = parseInt(req.body?.days) || 3650;
    const user  = await getDefaultUser();
    const userId = user.id;
    const token = await getStravaToken();
    const activities = await getActivities(userId);
    const settings = user.settings || {};
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);

    const candidates = activities.filter(a => {
      if (a.type !== 'Ride' && a.type !== 'VirtualRide') return false;
      if (a.powerSource !== 'measured' && a.powerSource !== 'unknown') return false;
      if (!a.average_watts) return false;
      const date = a.start_date?.split('T')[0] || '';
      if (engine.isUnreliablePower(date, settings)) return false;
      if (new Date(date) < cutoff) return false;
      return !(a.mmp && a.mmp.v === 2);
    });

    let processed = 0;
    let rateLimited = false;
    const batch = candidates.slice(0, limit);

    for (let i = 0; i < batch.length; i++) {
      try {
        const ok = await computeMMPForActivity(userId, batch[i], token);
        if (ok) processed++;
      } catch(e) {
        if (e.rateLimited) { rateLimited = true; break; }
      }
      if (i < batch.length - 1) await new Promise(r => setTimeout(r, 150));
    }

    const remaining = candidates.length - processed;

    await recomputeCpModel(userId);

    res.json({ processed, remaining, total: candidates.length, rateLimited });
  } catch(err) {
    console.error('MMP batch fout:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const MMP_DURATIONS = [5,10,30,60,120,300,600,1200,1800,3600];

app.get('/api/charts/power-trends', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const settings = user.settings || {};
    const ftp = settings.ftp || 280;
    const activities = await getActivitiesLite(user.id);
    const weightMap = await getWeightMap(user.id);
    const _fp = analyticsFingerprint(activities, weightMap, settings);
    if (req.query.force !== '1') { const hit = memoGet(_fp, 'power-trends'); if (hit) return res.json(hit); }

    const DAY = 86400000;
    const now = Date.now();

    // Vroegste activiteitsdatum bepaalt de start van de reeks.
    let minMs = null;
    for (const a of activities) {
      const d = a.start_date ? new Date(a.start_date).getTime() : null;
      if (d && (minMs === null || d < minMs)) minMs = d;
    }

    // FTP-verloop: wekelijks sampelen van de rolling FTP over een 90-daags venster
    // (bewust breder dan de systeembrede default van 60 die de PMC/ETL voedt; hier
    // enkel voor een gladdere trendlijn). rollingFtp levert naast de FTP ook de
    // bepalende rit (best), zodat de grafiek naar die activiteit kan navigeren.
    // W/kg = FTP gedeeld door het gewicht op (of dichtst bij) de sampledatum,
    // pure lookup met 120-daagse tolerantie, identiek aan het power-profiel-endpoint.
    const wEntries = Object.entries(weightMap)
      .sort((a, b) => a[0].localeCompare(b[0]));
    const WEIGHT_TOL = 120 * DAY;
    const weightAt = (dateStr) => {
      if (!wEntries.length || !dateStr) return null;
      const t = new Date(dateStr).getTime();
      let best = null, bestDiff = Infinity;
      for (const [d, kg] of wEntries) {
        const diff = Math.abs(new Date(d).getTime() - t);
        if (diff < bestDiff) { bestDiff = diff; best = kg; }
      }
      return bestDiff <= WEIGHT_TOL ? best : null;
    };

    const ftpSeries = [];
    const pushFtp = (dateStr) => {
      const r = engine.rollingFtp(activities, settings, dateStr, 90);
      const w = weightAt(dateStr);
      const ftpVal = r?.ftp || ftp;
      ftpSeries.push({
        date: dateStr,
        ftp: ftpVal,
        wkg: w ? +(ftpVal / w).toFixed(2) : null,
        activityId: r?.best?.id || null,
        activityName: r?.best?.name || null,
      });
    };
    if (minMs !== null) {
      for (let t = minMs; t <= now; t += 7 * DAY) {
        pushFtp(new Date(t).toISOString().split('T')[0]);
      }
      const lastDate = new Date(now).toISOString().split('T')[0];
      if (!ftpSeries.length || ftpSeries[ftpSeries.length - 1].date !== lastDate) {
        pushFtp(lastDate);
      }
    }

    // CP/W'-evolutie: maandelijks een 90-daags venster verschuiven. Prior-only
    // punten (geen echte fit) worden als null verstuurd zodat de lijn een gat
    // toont in plaats van de constante 0.94*ftp / 21000J prior te suggereren.
    const mmpEntries = activities.map(a => a.mmp).filter(Boolean);
    const cpSeries = [];
    if (minMs !== null && mmpEntries.length) {
      for (let t = minMs; t <= now; t += 30 * DAY) {
        const model = engine.computeCriticalPower(mmpEntries, ftp, { now: t, windowDays: 90 });
        const real = model && model.source !== 'prior';
        cpSeries.push({
          date: new Date(t).toISOString().split('T')[0],
          cp: real ? model.cp : null,
          wPrime: real ? model.wPrime : null,
          source: model ? model.source : 'none',
          nPoints: model ? model.nPoints : 0,
        });
      }
    }

    const _payload = { ftpSeries, cpSeries };
    memoSet(_fp, 'power-trends', _payload);
    res.json(_payload);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/state/mmp-curve', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const settings = user.settings || {};
    const activities = await getActivitiesLite(user.id);
    const weightMap = await getWeightMap(user.id);
    const _fp = analyticsFingerprint(activities, weightMap, settings);
    if (req.query.force !== '1') { const hit = memoGet(_fp, 'mmp-curve'); if (hit) return res.json(hit); }
    const cache = {};
    for (const a of activities) {
      if (a.mmp) cache[String(a.id)] = a.mmp;
    }
    const now = new Date();
    const cut30 = new Date(now); cut30.setDate(now.getDate() - 30);
    const cut90 = new Date(now); cut90.setDate(now.getDate() - 90);

    const recentEntries = [], prevEntries = [];
    for (const [id, entry] of Object.entries(cache)) {
      if (entry.v !== 2) continue;
      const d = new Date(entry.date);
      if (d >= cut30)      recentEntries.push([id, entry]);
      else if (d >= cut90) prevEntries.push([id, entry]);
    }
    const recentCount = recentEntries.length;
    const previousCount = prevEntries.length;

    function buildCurve(entries) {
      if (!entries.length) return { maxDur: 0, maxCurve: [], attribution: [] };
      const maxDur = Math.max(...entries.map(([, e]) => e.dur));
      const maxCurve = new Array(maxDur).fill(0);
      const attribution = new Array(maxDur).fill(null);
      for (const [id, entry] of entries) {
        const arr = entry.mmpArray, len = Math.min(arr.length, maxDur);
        for (let i = 0; i < len; i++) {
          if (arr[i] > maxCurve[i]) { maxCurve[i] = arr[i]; attribution[i] = id; }
        }
      }
      return { maxDur, maxCurve, attribution };
    }

    const { maxDur: rDur, maxCurve: rCurve, attribution: rAttr } = buildCurve(recentEntries);
    const { maxDur: pDur, maxCurve: pCurve, attribution: pAttr } = buildCurve(prevEntries);
    const basisDur = rDur || pDur;

    let sampledIndices = [0];
    if (basisDur > 1) {
      const sampledSet = new Set([0, basisDur - 1]);
      const lnDur = Math.log(basisDur);
      for (let j = 0; j <= 400; j++) {
        const idx = Math.min(Math.round(Math.exp(j * lnDur / 400)) - 1, basisDur - 1);
        if (idx >= 0) sampledSet.add(idx);
      }
      sampledIndices = [...sampledSet].sort((a, b) => a - b);
    }

    function buildSampled(maxCurve, attribution, maxDur) {
      return sampledIndices.map(i => {
        if (i >= maxDur) return { dur: i + 1, watts: null, activityId: null, name: null, date: null };
        const actId = attribution[i];
        const entry = actId ? cache[actId] : null;
        return { dur: i + 1, watts: maxCurve[i] || null, activityId: actId || null, name: entry?.name || null, date: entry?.date || null };
      });
    }

    // All-time PR-lijst: beste gemeten vermogen per standaardduur over de volledige historie.
    const _DAY = 86400000, _WTOL = 120 * _DAY;
    const _wEntries = Object.entries(weightMap).sort((a, b) => a[0].localeCompare(b[0]));
    const weightAt = (dateStr) => {
      if (!_wEntries.length || !dateStr) return null;
      const t = new Date(dateStr).getTime();
      let best = null, bestDiff = Infinity;
      for (const [d, kg] of _wEntries) {
        const diff = Math.abs(new Date(d).getTime() - t);
        if (diff < bestDiff) { bestDiff = diff; best = kg; }
      }
      return bestDiff <= _WTOL ? best : null;
    };
    const PR_DURATIONS = [
      { key: '5s', idx: 4 }, { key: '15s', idx: 14 }, { key: '30s', idx: 29 },
      { key: '1min', idx: 59 }, { key: '5min', idx: 299 }, { key: '20min', idx: 1199 },
      { key: '60min', idx: 3599 },
    ];
    const allTimePRs = PR_DURATIONS.map(({ key, idx }) => {
      let best = null;
      for (const [id, entry] of Object.entries(cache)) {
        if (entry.v !== 2 || entry.powerSource !== 'measured' || !Array.isArray(entry.mmpArray)) continue;
        if (entry.mmpArray.length <= idx) continue;
        const w = entry.mmpArray[idx];
        if (!(w > 0)) continue;
        if (best === null || w > best.watts) {
          best = { watts: Math.round(w), activityId: id, name: entry.name || null, date: entry.date || null };
        }
      }
      if (best) {
        const kg = weightAt(best.date);
        best.wkg = kg ? +(best.watts / kg).toFixed(2) : null;
      }
      return { key, best };
    });

    const _payload = {
      recent:   buildSampled(rCurve, rAttr, rDur),
      previous: buildSampled(pCurve, pAttr, pDur),
      recentCount, previousCount,
      allTimePRs,
      totalActivities: Object.keys(cache).length
    };
    memoSet(_fp, 'mmp-curve', _payload);
    res.json(_payload);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/state/power-profile', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const settings = user.settings || {};
    const acts = await getActivitiesLite(user.id);
    const weightMap = await getWeightMap(user.id);
    const _fp = analyticsFingerprint(acts, weightMap, settings);
    if (req.query.force !== '1') { const hit = memoGet(_fp, 'power-profile'); if (hit) return res.json(hit); }

    // Gewichtsinvoer gesorteerd op datum; nodig voor gewicht-op-datum lookup.
    const wEntries = Object.entries(weightMap)
      .map(([d, kg]) => [d, kg])
      .sort((a, b) => a[0].localeCompare(b[0]));
    const weightDataFrom = wEntries.length ? wEntries[0][0] : null;
    const DAY = 86400000;
    const WEIGHT_TOLERANCE_DAYS = 120;

    // Gewicht op (of dichtst bij) een datum. null als geen invoer binnen tolerantie ligt.
    function weightAt(dateStr) {
      if (!wEntries.length || !dateStr) return null;
      const t = new Date(dateStr).getTime();
      let best = null, bestDiff = Infinity;
      for (const [d, kg] of wEntries) {
        const diff = Math.abs(new Date(d).getTime() - t);
        if (diff < bestDiff) { bestDiff = diff; best = kg; }
      }
      return bestDiff <= WEIGHT_TOLERANCE_DAYS * DAY ? best : null;
    }

    const measured = acts.filter(a =>
      a.mmp && a.mmp.powerSource === 'measured' && a.mmp.v === 2 && Array.isArray(a.mmp.mmpArray));

    const DURATIONS = [
      { key: '5s',    idx: 4,    factor: 1    },
      { key: '1min',  idx: 59,   factor: 1    },
      { key: '5min',  idx: 299,  factor: 1    },
      { key: '20min', idx: 1199, factor: 0.95 },
    ];

    const now = Date.now();
    const cut90  = now - 90 * DAY;
    const cut365 = now - 365 * DAY;

    // Beste W/kg-inspanning in een venster, met gewicht-op-datum. Rangschikt op W/kg,
    // niet op watts: een lichtere dag met iets minder watt kan een hoger W/kg geven.
    function bestInWindow(idx, factor, key, lo, hi) {
      let best = null;
      for (const a of measured) {
        const d = a.mmp.date;
        if (!d) continue;
        const t = new Date(d).getTime();
        if (t < lo || t >= hi) continue;
        const arr = a.mmp.mmpArray;
        if (arr.length <= idx) continue;
        const raw = arr[idx];
        if (!(raw > 0)) continue;
        const w = weightAt(d);
        if (!w) continue;
        const wkg = +((raw * factor) / w).toFixed(2);
        if (best === null || wkg > best.wkg) {
          best = {
            wkg,
            watts: raw,
            ftpWatts: factor < 1 ? Math.round(raw * factor) : null,
            date: d,
            name: a.mmp.name || null,
            weight: w,
          };
        }
      }
      if (best) {
        const lvl = engine.powerProfileLevel(best.wkg, key);
        best.level = lvl.level;
        best.category = lvl.category;
      }
      return best;
    }

    const durations = DURATIONS.map(({ key, idx, factor }) => {
      const recent   = bestInWindow(idx, factor, key, cut90, now);
      const previous = bestInWindow(idx, factor, key, cut365, cut90);
      return { key, recent, previous };
    });

    // Envelope (beste van beide vensters per duur) voor de typebepaling.
    const envelopeLevels = {};
    for (const dur of durations) {
      const r = dur.recent?.level, p = dur.previous?.level;
      envelopeLevels[dur.key] = (r != null || p != null)
        ? Math.max(r ?? -Infinity, p ?? -Infinity)
        : null;
    }
    const riderType = engine.classifyRiderType(envelopeLevels);

    const _payload = {
      durations,
      riderType,
      weightDataFrom,
      measuredCount: measured.length,
    };
    memoSet(_fp, 'power-profile', _payload);
    res.json(_payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Activity detail helper ────────────────────────────────────────────────────

async function getActivityDetail(stravaId, userId, activities, weekPlan, settings, cpModel) {
  const sid  = String(stravaId);
  const acts = activities || [];
  const activity = acts.find(a => String(a.id) === sid);
  const actDate  = activity?.start_date?.split('T')[0] || '';
  const FTP  = actDate
    ? engine.ftpForDate(acts, settings, actDate)
    : (settings.ftp || 280);
  const isRun    = activity?.type === 'Run' || activity?.type === 'TrailRun';

  function buildMeta(act) {
    const duration_min = Math.round((act.moving_time || 0) / 60);
    const _h = Math.floor(duration_min / 60);
    const _m = duration_min % 60;
    return {
      id: act.id, name: act.name, date: actDate, type: act.type,
      distance_km:  act.distance ? +(act.distance / 1000).toFixed(1) : null,
      duration_min,
      duration_str: _h > 0 ? _h + 'u' + (_m > 0 ? String(_m).padStart(2,'0') : '') : _m + 'min',
      elevation_m:  Math.round(act.total_elevation_gain || 0),
      avg_watts:    act.average_watts          ? Math.round(act.average_watts)          : null,
      np:           act.weighted_average_watts ? Math.round(act.weighted_average_watts) : null,
      IF:           act.weighted_average_watts ? +((act.weighted_average_watts / FTP).toFixed(2)) : null,
      tss:          Math.round(engine.computeETLForActivity(act, settings, FTP).etl),
      suffer_score: act.suffer_score || null
    };
  }

  function findPlanned(date) {
    const dayPlan = weekPlan?.[date] || [];
    const planType = isRun ? 'running' : 'cycling';
    const s = dayPlan.find(s =>
      s.type === planType && (
        String(s.matchedActivityId) === sid ||
        (s.completionScore !== undefined && !s.missed)
      )
    );
    return s ? { targetTSS: s.targetTSS, duration: s.duration, blokken: s.blokken, title: s.title } : null;
  }

  function buildActivityMmpCurves(powerTl, actPs) {
    try {
      if ((actPs !== 'measured' && actPs !== 'unknown') || !powerTl) return { activityMmpCurve: null, bestMmpCurve: null };
      const rawForMmp = powerTl.map(p => ({ w: p.w }));
      const mmpFull = engine.computeMMPFull(rawForMmp);
      if (!mmpFull) return { activityMmpCurve: null, bestMmpCurve: null };
      const actDur = mmpFull.length;
      const lnDur = Math.log(actDur);
      const sampledSet = new Set([0, actDur - 1]);
      for (let j = 0; j <= 300; j++) {
        const idx = Math.min(Math.round(Math.exp(j * lnDur / 300)) - 1, actDur - 1);
        if (idx >= 0) sampledSet.add(idx);
      }
      const sampledIndices = [...sampledSet].sort((a, b) => a - b);
      const actCurve = sampledIndices.map(i => ({ dur: i + 1, watts: mmpFull[i] || null }));
      const cut90 = new Date(); cut90.setDate(cut90.getDate() - 90);
      const best90 = new Array(actDur).fill(0);
      const bestAttr90 = new Array(actDur).fill(null);
      const mmpById = {};
      for (const act of acts) {
        const entry = act.mmp;
        if (!entry || entry.v !== 2 || new Date(entry.date) < cut90) continue;
        const entryId = String(act.id);
        mmpById[entryId] = entry;
        const arr = entry.mmpArray, len = Math.min(arr.length, actDur);
        for (let i = 0; i < len; i++) {
          if (arr[i] > best90[i]) { best90[i] = arr[i]; bestAttr90[i] = entryId; }
        }
      }
      const bestCurve = sampledIndices.map(i => {
        const actId = bestAttr90[i];
        const entry = actId ? mmpById[actId] : null;
        return { dur: i + 1, watts: best90[i] || null, activityId: actId || null, name: entry?.name || null, date: entry?.date || null };
      });
      return { activityMmpCurve: actCurve, bestMmpCurve: bestCurve };
    } catch(e) { console.warn('buildActivityMmpCurves:', e.message); return { activityMmpCurve: null, bestMmpCurve: null }; }
  }

  const cached = await getActivityStream(userId, sid);
  // Voor runs met schema < 2 ontbreken de NGP-velden; forceer een herberekening.
  if (cached && cached.schemaV != null && cached.schemaV >= 3) {
    // Lazy W'bal-backfill: caches die vóór de W'bal-feature zijn weggeschreven bevatten
    // wel een powerTimeline maar geen wbalModel. De schemaV >= 3 gate herberekent nooit,
    // waardoor die null permanent blijft hangen. Herbereken hier eenmalig zonder Strava-
    // refetch (de powerTimeline zit al in cache) en persisteer terug.
    if (!isRun && !cached.wbalModel && Array.isArray(cached.powerTimeline) && cached.powerTimeline.length) {
      try {
        const inUnrel = actDate >= (settings.unreliablePowerStart || '2020-01-01') &&
                        actDate <= (settings.unreliablePowerEnd   || '2020-12-31');
        const actDateMs = activity?.start_date ? new Date(activity.start_date).getTime() : null;
        if (!inUnrel && actDateMs) {
          const mmpEntriesForFit = acts.map(a => a.mmp).filter(Boolean);
          const cpFit = engine.computeCriticalPower(mmpEntriesForFit, FTP, { now: actDateMs, windowDays: 90 });
          if (cpFit && Number.isFinite(cpFit.cp) && Number.isFinite(cpFit.wPrime)) {
            const wbalFull = engine.computeWbal(cached.powerTimeline, cpFit.cp, cpFit.wPrime);
            if (wbalFull) {
              cached.wbalTimeline = wbalFull;
              cached.wbalModel = {
                cp: cpFit.cp, wPrime: cpFit.wPrime,
                wPrimeSE: cpFit.wPrimeSE ?? null,
                source: cpFit.source ?? null,
                fitQuality: cpFit.fitQuality ?? null,
                ftpAsOf: FTP, fitAsOf: activity.start_date,
              };
              await upsertActivityStream(userId, sid, { ...cached, wbalTimeline: cached.wbalTimeline, wbalModel: cached.wbalModel, cachedAt: new Date().toISOString() });
            }
          }
        }
      } catch (e) { console.warn('W\'bal-backfill:', e.message); }
    }
    const { activityMmpCurve, bestMmpCurve } = buildActivityMmpCurves(cached.powerTimeline, activity?.powerSource);
    return {
      activity:          activity ? buildMeta(activity) : null,
      zoneBreakdown:     cached.zoneBreakdown,
      powerTimeline:     cached.powerTimeline,
      hrSummary:         cached.hrSummary,
      avgCadence:        cached.avgCadence || null,
      hrTimeline:        cached.hrTimeline,
      altitudeTimeline:  cached.altitudeTimeline,
      mmpCurve:          cached.mmpCurve,
      aerobicDecoupling: cached.aerobicDecoupling,
      vi:                cached.vi,
      ef:                cached.ef,
      velocityTimeline:  cached.velocityTimeline,
      cadenceTimeline:   cached.cadenceTimeline,
      gradientTimeline:  cached.gradientTimeline,
      distanceTimeline:  cached.distanceTimeline,
      gpsTrack:          cached.gpsTrack,
      ftp:               FTP,
      plannedSession:    activity ? findPlanned(actDate) : null,
      sessionClassification: cached.sessionClassification,
      activityMmpCurve, bestMmpCurve,
      wbalTimeline:      cached.wbalTimeline || null,
      wbalModel:         cached.wbalModel    || null,
      ngp:               cached.ngp               ?? null,
      gapTimeline:       cached.gapTimeline        ?? null,
      runLoad:           cached.runLoad            ?? null,
      runningEF:         cached.runningEF          ?? null,
      runningDecoupling: cached.runningDecoupling  ?? null,
      runHrZones:        cached.runHrZones         ?? null,
      eccentric:         cached.eccentric          ?? null,
      runCadence:        cached.runCadence         ?? null,
    };
  }

  const inUnreliable = actDate >= (settings.unreliablePowerStart || '2020-01-01') &&
                       actDate <= (settings.unreliablePowerEnd   || '2020-12-31');

  let streams = [];
  try {
    const token = await getStravaToken();
    const resp  = await axios.get(
      `https://www.strava.com/api/v3/activities/${sid}/streams?keys=watts,time,heartrate,cadence,altitude,distance,velocity_smooth,grade_smooth,latlng&series_type=time`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    streams = resp.data || [];
  } catch(e) { console.warn(`Stream ophalen mislukt (${sid}):`, e.message); }

  const wattsS   = streams.find(s => s.type === 'watts');
  const timeS    = streams.find(s => s.type === 'time');
  const hrS      = streams.find(s => s.type === 'heartrate');
  const cadS     = streams.find(s => s.type === 'cadence');
  const altS     = streams.find(s => s.type === 'altitude');
  const velS     = streams.find(s => s.type === 'velocity_smooth');
  const distS    = streams.find(s => s.type === 'distance');
  const gradeS   = streams.find(s => s.type === 'grade_smooth');
  const latlngS  = streams.find(s => s.type === 'latlng');

  let zoneBreakdown = null;
  try {
    if (wattsS && timeS && !inUnreliable)
      zoneBreakdown = calcZoneBreakdown(timeS.data, wattsS.data, FTP);
  } catch(e) { console.warn('Zone breakdown:', e.message); }

  const MAX_POINTS = 7200;
  function adaptiveSample(arr) {
    if (arr.length <= MAX_POINTS) return arr;
    const step = Math.ceil(arr.length / MAX_POINTS);
    return arr.filter((_, i) => i % step === 0);
  }

  let powerTimeline = null;
  let wbalTimeline = null, wbalModel = null;
  try {
    if (wattsS && timeS && !inUnreliable) {
      const wattsArr = wattsS.data;
      const raw = timeS.data.map((t, i) => ({ t, w: Math.max(0, wattsArr[i] || 0) }));
      powerTimeline = adaptiveSample(raw);
      const mmpEntriesForFit = acts.map(a => a.mmp).filter(Boolean);
      const actDateMs = activity?.start_date ? new Date(activity.start_date).getTime() : null;
      const cpFit = actDateMs
        ? engine.computeCriticalPower(mmpEntriesForFit, FTP, { now: actDateMs, windowDays: 90 })
        : null;
      if (cpFit && Number.isFinite(cpFit.cp) && Number.isFinite(cpFit.wPrime)) {
        const wbalFull = engine.computeWbal(raw, cpFit.cp, cpFit.wPrime);
        if (wbalFull) {
          wbalTimeline = adaptiveSample(wbalFull);
          wbalModel = {
            cp: cpFit.cp, wPrime: cpFit.wPrime,
            wPrimeSE: cpFit.wPrimeSE ?? null,
            source: cpFit.source ?? null,
            fitQuality: cpFit.fitQuality ?? null,
            ftpAsOf: FTP, fitAsOf: activity.start_date,
          };
        }
      }
    }
  } catch(e) { console.warn('Power timeline:', e.message); }

  // MMP vergelijkingscurve: deze rit vs 90-dagen-best
  const { activityMmpCurve, bestMmpCurve } = buildActivityMmpCurves(powerTimeline, activity?.powerSource);

  let hrSummary = null;
  try {
    if (hrS?.data?.length) {
      const hrArr = hrS.data;
      hrSummary = {
        avgHR: Math.round(hrArr.reduce((a, b) => a + b, 0) / hrArr.length),
        maxHR: Math.max(...hrArr)
      };
    }
  } catch(e) { console.warn('HR summary:', e.message); }

  let avgCadence = null;
  try {
    if (cadS?.data?.length) {
      const nz = cadS.data.filter(c => c > 0);
      if (nz.length) avgCadence = Math.round(nz.reduce((a, b) => a + b, 0) / nz.length);
    }
  } catch(e) { console.warn('Cadence:', e.message); }

  let hrTimeline = null;
  try {
    if (hrS && timeS) {
      const tArr = timeS.data, hrArr = hrS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        const we = ws + 5;
        let sum = 0, cnt = 0;
        while (j < tArr.length && tArr[j] < ws) j++;
        let k = j;
        while (k < tArr.length && tArr[k] < we) { if (hrArr[k] > 0) { sum += hrArr[k]; cnt++; } k++; }
        if (cnt > 0) raw.push({ t: ws, hr: Math.round(sum / cnt) });
      }
      if (raw.length > 1) hrTimeline = raw;
    }
  } catch(e) { console.warn('HR timeline:', e.message); }

  // Sessie-classificatie: alleen power-based voor measured ritten, anders HR-based
  const isMeasured = activity?.powerSource === 'measured';
  const sessionClassification = (isMeasured && powerTimeline)
    ? classifySession(powerTimeline, FTP)
    : classifySessionFromHR(hrTimeline, settings);

  let altitudeTimeline = null;
  try {
    if (altS && timeS) {
      const tArr = timeS.data, altArr = altS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        const we = ws + 5;
        let sum = 0, cnt = 0;
        while (j < tArr.length && tArr[j] < ws) j++;
        let k = j;
        while (k < tArr.length && tArr[k] < we) { sum += altArr[k]; cnt++; k++; }
        if (cnt > 0) raw.push({ t: ws, alt: Math.round(sum / cnt) });
      }
      if (raw.length > 1) altitudeTimeline = raw;
    }
  } catch(e) { console.warn('Altitude timeline:', e.message); }

  let mmpCurve = null;
  try {
    if (wattsS && timeS && !inUnreliable) {
      const watts = wattsS.data, time = timeS.data;
      const n = watts.length;
      const maxTime = time[n - 1];
      const durations = [5, 10, 30, 60, 120, 300, 600, 1200];
      const prefixSum = new Array(n + 1);
      prefixSum[0] = 0;
      for (let i = 0; i < n; i++) prefixSum[i + 1] = prefixSum[i] + watts[i];
      const curve = [];
      for (const d of durations) {
        if (d > maxTime) break;
        let maxAvg = 0;
        for (let i = 0; i + d <= n; i++) {
          const avg = (prefixSum[i + d] - prefixSum[i]) / d;
          if (avg > maxAvg) maxAvg = avg;
        }
        if (maxAvg > 0) curve.push({ duration: d, power: Math.round(maxAvg) });
      }
      if (curve.length > 1) mmpCurve = curve;
    }
  } catch(e) { console.warn('MMP curve:', e.message); }

  let distanceTimeline = null;
  try {
    if (distS && timeS) {
      const tArr = timeS.data, dArr = distS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        while (j + 1 < tArr.length &&
               Math.abs(tArr[j+1] - ws) <= Math.abs(tArr[j] - ws)) j++;
        raw.push({ t: ws, d: Math.round(dArr[j] / 10) / 100 });
      }
      if (raw.length > 1) distanceTimeline = raw;
    }
  } catch(e) { console.warn('Distance timeline:', e.message); }

  let gpsTrack = null;
  try {
    if (latlngS && timeS) {
      const tArr = timeS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        while (j + 1 < tArr.length &&
               Math.abs(tArr[j+1] - ws) <= Math.abs(tArr[j] - ws)) j++;
        raw.push({ t: ws, lat: latlngS.data[j][0], lng: latlngS.data[j][1] });
      }
      if (raw.length > 1) gpsTrack = raw;
    }
  } catch(e) { console.warn('GPS track:', e.message); }

  let aerobicDecoupling = null;
  try {
    if (wattsS && hrS && timeS) {
      const time = timeS.data, watts = wattsS.data, hr = hrS.data;
      const totalTime = time[time.length - 1];
      if (totalTime >= 1800) {
        const halfTime = totalTime / 2;
        let sumW1 = 0, sumHR1 = 0, cnt1 = 0;
        let sumW2 = 0, sumHR2 = 0, cnt2 = 0;
        for (let i = 0; i < time.length; i++) {
          if (time[i] < halfTime) { sumW1 += watts[i]; sumHR1 += hr[i]; cnt1++; }
          else                    { sumW2 += watts[i]; sumHR2 += hr[i]; cnt2++; }
        }
        if (cnt1 > 0 && cnt2 > 0 && sumHR1 > 0 && sumHR2 > 0) {
          const ef1 = (sumW1 / cnt1) / (sumHR1 / cnt1);
          const ef2 = (sumW2 / cnt2) / (sumHR2 / cnt2);
          const decoupling = (ef1 - ef2) / ef1;
          aerobicDecoupling = {
            ef1: Math.round(ef1 * 100) / 100,
            ef2: Math.round(ef2 * 100) / 100,
            decoupling: Math.round(decoupling * 10000) / 10000,
            status: Math.abs(decoupling) < 0.05 ? 'goed' : 'drift'
          };
        }
      }
    }
  } catch(e) { console.warn('Aerobic decoupling:', e.message); }

  let vi = null;
  try {
    if (activity?.weighted_average_watts && activity?.average_watts) {
      const np   = Math.round(activity.weighted_average_watts);
      const avgW = Math.round(activity.average_watts);
      if (avgW > 0) vi = Math.round((np / avgW) * 100) / 100;
    }
  } catch(e) { console.warn('VI:', e.message); }

  let ef = null;
  try {
    if (activity?.weighted_average_watts && hrSummary?.avgHR) {
      const np = Math.round(activity.weighted_average_watts);
      ef = Math.round((np / hrSummary.avgHR) * 100) / 100;
    }
  } catch(e) { console.warn('EF:', e.message); }

  let velocityTimeline = null;
  try {
    if (velS && timeS) {
      const raw = timeS.data.map((t, i) => ({ t, v: Math.round(velS.data[i] * 3.6 * 10) / 10 }));
      velocityTimeline = adaptiveSample(raw);
    } else if (distS && timeS) {
      const result = [];
      for (let i = 1; i < timeS.data.length; i++) {
        const dt = timeS.data[i] - timeS.data[i - 1];
        const dd = distS.data[i] - distS.data[i - 1];
        result.push({ t: timeS.data[i], v: dt > 0 ? Math.round(dd / dt * 3.6 * 10) / 10 : 0 });
      }
      if (result.length > 1) velocityTimeline = adaptiveSample(result);
    }
  } catch(e) { console.warn('Velocity timeline:', e.message); }

  let cadenceTimeline = null;
  try {
    if (cadS && timeS) {
      const tArr = timeS.data, cArr = cadS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        const we = ws + 5;
        let sum = 0, cnt = 0;
        while (j < tArr.length && tArr[j] < ws) j++;
        let k = j;
        while (k < tArr.length && tArr[k] < we) {
          if (cArr[k] > 0) { sum += cArr[k]; cnt++; }
          k++;
        }
        if (cnt > 0) raw.push({ t: ws, c: Math.round(sum / cnt) });
      }
      if (raw.length > 1) cadenceTimeline = raw;
    }
  } catch(e) { console.warn('Cadence timeline:', e.message); }

  let gradientTimeline = null;
  try {
    if (gradeS && timeS) {
      const tArr = timeS.data, gArr = gradeS.data;
      const maxT = tArr[tArr.length - 1];
      const raw = [];
      let j = 0;
      for (let ws = 0; ws < maxT; ws += 5) {
        const we = ws + 5;
        let sum = 0, cnt = 0;
        while (j < tArr.length && tArr[j] < ws) j++;
        let k = j;
        while (k < tArr.length && tArr[k] < we) { sum += gArr[k]; cnt++; k++; }
        if (cnt > 0) raw.push({ t: ws, g: Math.round(sum / cnt * 10) / 10 });
      }
      if (raw.length > 1) gradientTimeline = raw;
    }
  } catch(e) { console.warn('Gradient timeline:', e.message); }

  // ── Hardloop-specifieke berekeningen ─────────────────────────────────────
  let ngp = null, gapTimeline = null, runLoad = null, runningEF = null;
  let runningDecoupling = null, runHrZones = null, eccentric = null, runCadence = null;

  if (isRun) {
    try {
      if (timeS && velS && gradeS) {
        const samples = timeS.data.map((t, i) => ({
          t,
          v: velS.data[i] || 0,
          g: (gradeS.data[i] || 0) / 100
        }));
        const hrRaw = hrS ? hrS.data : null;

        ngp = engine.computeNGP(samples);
        gapTimeline = ngp?.gapTimeline ?? null;

        if (hrRaw) {
          runningDecoupling = engine.computeRunningDecoupling(samples, hrRaw);
        }
      }

      if (ngp?.ngpSpeed && ngp.ngpSpeed > 0) {
        runLoad    = engine.computeRunningLoad(activity.moving_time || 0, ngp.ngpSpeed, activity, settings);
        runningEF  = engine.computeRunningEF(ngp.ngpSpeed, hrSummary?.avgHR);
      } else {
        runLoad = engine.computeRunningLoad(activity.moving_time || 0, 0, activity, settings);
      }

      runHrZones = hrTimeline ? engine.computeRunHrZones(hrTimeline, settings) : null;
      eccentric  = engine.computeEccentricLoad(altitudeTimeline, runHrZones);

      runCadence = {
        avgSpm: avgCadence ? avgCadence * 2 : null,
        max: cadenceTimeline && cadenceTimeline.length > 0
          ? Math.max(...cadenceTimeline.map(p => p.c)) * 2
          : null,
        timelineSpm: cadenceTimeline ? cadenceTimeline.map(p => ({ t: p.t, c: p.c * 2 })) : null
      };
    } catch(e) { console.warn('Running metrics:', e.message); }
  }

  // Persist cache
  try {
    await upsertActivityStream(userId, sid, {
      schemaV: 3,
      cachedAt: new Date().toISOString(),
      zoneBreakdown, powerTimeline, hrSummary, avgCadence: avgCadence || null,
      hrTimeline, altitudeTimeline, mmpCurve,
      aerobicDecoupling, vi, ef,
      velocityTimeline, cadenceTimeline, gradientTimeline,
      distanceTimeline, gpsTrack, sessionClassification,
      ngp, gapTimeline, runLoad, runningEF, runningDecoupling,
      runHrZones, eccentric, runCadence,
      wbalTimeline, wbalModel,
    });
  } catch(e) { console.warn('Cache opslaan mislukt:', e.message); }

  return {
    activity:          activity ? buildMeta(activity) : null,
    zoneBreakdown,     powerTimeline, hrSummary,
    avgCadence:        avgCadence || null,
    hrTimeline,        altitudeTimeline, mmpCurve,
    aerobicDecoupling, vi, ef,
    velocityTimeline,  cadenceTimeline, gradientTimeline,
    distanceTimeline,  gpsTrack,
    ftp:               FTP,
    plannedSession:    activity ? findPlanned(actDate) : null,
    sessionClassification,
    activityMmpCurve, bestMmpCurve,
    wbalTimeline, wbalModel,
    ngp, gapTimeline, runLoad, runningEF, runningDecoupling,
    runHrZones, eccentric, runCadence
  };
}

app.get('/api/activity/:stravaId/detail', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const activities = await getActivities(user.id);
    const settings = user.settings || {};
    const result = await getActivityDetail(req.params.stravaId, user.id, activities, user.week_plan || {}, settings, user.cp_model || null);
    if (!result.activity) return res.status(404).json({ error: 'Activiteit niet gevonden in cache' });
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/activity/:stravaId/analyse', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });
    const { stravaId } = req.params;
    const computed  = req.body?.computed || {};
    const user      = await getDefaultUser();
    const settings  = user.settings || {};

    // 7-day cache
    const cacheKey = 'activity_v7_' + stravaId;
    const cached   = user.ai_insights?.[cacheKey];
    if (cached?.ts && (Date.now() - cached.ts) < 7 * 24 * 60 * 60 * 1000) {
      return res.json({ text: cached.text });
    }

    const [activities, hevyWkts, weight, nutrition] = await Promise.all([
      getActivities(user.id),
      getHevyWorkouts(user.id),
      getWeightMap(user.id),
      getNutrition(user.id),
    ]);

    const detail = await getActivityDetail(stravaId, user.id, activities, user.week_plan || {}, settings, user.cp_model || null);
    if (!detail.activity) return res.status(404).json({ error: 'Activiteit niet gevonden in cache' });

    const state = engine.computeFullState(
      activities,
      hevyWkts,
      weight,
      nutrition,
      user.week_plan || {},
      settings
    );

    const a  = detail.activity;
    const zb = detail.zoneBreakdown;
    const ps = detail.plannedSession;
    const isRunActivity = (a.type === 'Run' || a.type === 'TrailRun');

    let lines, systemPrompt;

    if (isRunActivity) {
      const runNgp    = detail.ngp;
      const runLoad   = detail.runLoad;
      const runZones  = detail.runHrZones;
      const runDec    = detail.runningDecoupling;
      const eccentric = detail.eccentric;

      const ngpPaceMinKm = runNgp?.ngpPaceSecPerKm
        ? +(runNgp.ngpPaceSecPerKm / 60).toFixed(2) : null;
      const actualPaceMinKm = (a.distance_km && a.duration_min)
        ? +(a.duration_min / a.distance_km).toFixed(2) : null;

      lines = [
        `Activiteit: ${a.name}, ${a.date}, ${a.duration_min} min, ${a.distance_km || '–'} km, ${a.elevation_m} hm`,
        actualPaceMinKm ? `Werkelijk tempo: ${actualPaceMinKm} min/km` : null,
        ngpPaceMinKm    ? `NGP (grade-gecorrigeerd): ${ngpPaceMinKm} min/km` : null,
        runLoad ? `Hardloopbelasting: ${runLoad.load} (bron: ${runLoad.source}${runLoad.IF ? ', IF: ' + runLoad.IF : ''})` : null,
        runZones ? `Hartslagzones: Z1 ${runZones.z1Min}min | Z2 ${runZones.z2Min}min | Z3 ${runZones.z3Min}min | Z4 ${runZones.z4Min}min | Z5 ${runZones.z5Min}min (basis: ${runZones.basis})` : null,
        runDec ? `Aerobe koppeling: EF1=${runDec.ef1}, EF2=${runDec.ef2}, drift=${(runDec.decoupling * 100).toFixed(1)}%, status: ${runDec.status}` : null,
        eccentric ? `Eccentrische belasting: ${eccentric.descentM}m daling, flag: ${eccentric.eccentricFlag} — ${eccentric.reason}` : null,
        `Huidige TSB: ${state.enduranceMetrics?.tsb ?? '–'}`,
        `Fase: ${state.trainingPlan?.phase || 'onbekend'}`
      ].filter(l => l !== null);

      systemPrompt = 'Je bent een persoonlijke hardloopcoach. Schrijf exact 3 zinnen, niet meer. Zin 1: beoordeel of de run aeroob bleef op basis van de aerobe koppeling en de hartslagzoneverdeling. Zin 2: geef aan of de eccentrische belasting (dalingsmeters of hoge intensiteit) de komende krachttraining kan verstoren. Zin 3: één concrete aanbeveling voor de komende 48 uur. Gebruik uitsluitend platte tekst: geen markdown, geen sterretjes, geen nummers, geen vet, geen bullets.';
    } else {
      const sc = detail.sessionClassification ||
        classifySession(detail.powerTimeline, detail.ftp);

      lines = [
        `Activiteit: ${a.name}, ${a.date}, ${a.duration_min} min, ${a.distance_km || '–'} km, ${a.elevation_m} hm`,
        a.avg_watts
          ? `Vermogen: gem. ${a.avg_watts}W, NP ${a.np || '–'}W, IF ${a.IF || '–'}, TSS ${a.tss}`
          : 'Geen vermogensdata beschikbaar',
        a.suffer_score ? `Suffer score: ${a.suffer_score}` : null,
        zb && !zb.estimated
          ? `Zone-verdeling: Z1 ${zb.z1Min}min | Z2 ${zb.z2Min}min | Z3 ${zb.z3Min}min | Z4 ${zb.z4Min}min | Z5 ${zb.z5Min}min — Low ${Math.round(zb.lowPct*100)}% Mid ${Math.round(zb.midPct*100)}% High ${Math.round(zb.highPct*100)}%`
          : null,
        `Sessieclassificatie: ${sc.sessionType} (bouts: ${sc.boutCount}, CV: ${sc.boutDurationCV ?? '–'}, polarisatie: ${sc.polarizationIndex ?? '–'}, dominanteBin: ${sc.dominantBinFraction ?? '–'})`,
        ps ? `Gepland: ${ps.title || '–'}, target TSS ${ps.targetTSS}, ${ps.duration} min` : null,
        ps ? `Geplande blokken: ${JSON.stringify(ps.blokken)}` : null,
        ps ? `Werkelijke TSS: ${a.tss} (afwijking: ${a.tss - (ps.targetTSS || 0)})` : null,
        computed.maxRolling30 ? `Max 30s gem. vermogen: ${computed.maxRolling30}W`    : null,
        computed.maxPower     ? `Max momentaan vermogen: ${computed.maxPower}W`        : null,
        computed.maxHR        ? `Max hartslag: ${computed.maxHR} bpm`                 : null,
        `Huidige TSB: ${state.enduranceMetrics?.tsb ?? '–'}`,
        `Fase: ${state.trainingPlan?.phase || 'onbekend'}`
      ].filter(l => l !== null);

      systemPrompt = 'Je bent een persoonlijke wielrencoach. Schrijf exact 3 zinnen, niet meer. Het sessionType veld vertelt je wat voor rit dit was op basis van vermogensanalyse — gebruik dit als vertrekpunt, niet VI. Zin 1: wat valt op aan de cijfers (watt, TSS, zones, IF) en wat voor type rit was dit. Zin 2: wat verklaart dit in context van de belastingsstatus. Zin 3: één concrete aanbeveling voor de komende 48 uur. Gebruik uitsluitend platte tekst: geen markdown, geen sterretjes, geen nummers, geen vet, geen bullets.';
    }

    const aiResp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 250,
      system: systemPrompt,
      messages: [{ role: 'user', content: lines.join('\n') }]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });

    const responseText = aiResp.data.content?.[0]?.text || '';

    const freshUser = await getDefaultUser();
    const updatedInsights = { ...(freshUser.ai_insights || {}) };
    updatedInsights[cacheKey] = { text: responseText, ts: Date.now() };
    await saveUserFields(freshUser.id, { ai_insights: updatedInsights });

    res.json({ text: responseText });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/calibration', async (req, res) => {
  try {
    const user = await getDefaultUser();
    res.json(user.calibration || { factor: 1.0, count: 0, reliable: false });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/calibration/recompute', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const activities = await getActivities(user.id);
    const calibration = engine.computeCalibrationFactor(activities, user.settings || {});
    await saveUserFields(user.id, {
      settings:    { ...(user.settings || {}), sufferToTSSFactor: calibration.factor },
      calibration: calibration,
    });
    res.json(calibration);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/cp-model/recompute', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const cpModel = await recomputeCpModel(userId);
    res.json(cpModel || { source: 'none' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/charts/data', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 365;
    const user = await getDefaultUser();
    const userId = user.id;
    const [activities, weightMap, nutrition] = await Promise.all([
      getActivitiesLite(userId),
      getWeightMap(userId),
      getNutrition(userId),
    ]);
    const settings = user.settings || {};
    const cfg = { ftp: settings.ftp || 280, unreliablePowerStart: settings.unreliablePowerStart || '2020-01-01', unreliablePowerEnd: settings.unreliablePowerEnd || '2020-12-31', sufferToTSSFactor: settings.sufferToTSSFactor || 1.0 };

    const weightSeries = Object.entries(weightMap || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, kg]) => ({ date, kg: parseFloat(kg) }));

    // ATL/CTL/TSB — alleen duurtraining
    const dailyLoad = {};
    const _mt = {};
    const ftpAsOf = (d) => (_mt[d] ??= engine.ftpForDate(activities, settings, d, 60));
    activities.filter(a => ENDURANCE_TYPES.has(a.type)).forEach(a => {
      const d = a.start_date?.split('T')[0];
      if (d) dailyLoad[d] = (dailyLoad[d] || 0) + engine.computeETLForActivity(a, settings, ftpAsOf(d)).etl;
    });

    const k7 = 1 - Math.exp(-1 / 7);
    const k42 = 1 - Math.exp(-1 / 42);
    const allDates = Object.keys(dailyLoad).sort();
    if (allDates.length) {
      let atl = 0, ctl = 0;
      const start = new Date(allDates[0]);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
      const loadSeries = [];
      for (let d = new Date(start); d <= new Date(); d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().split('T')[0];
        const load = dailyLoad[key] || 0;
        atl = atl + k7 * (load - atl);
        ctl = ctl + k42 * (load - ctl);
        if (d >= cutoff) {
          loadSeries.push({ date: key, atl: Math.round(atl * 10) / 10, ctl: Math.round(ctl * 10) / 10, tsb: Math.round((ctl - atl) * 10) / 10 });
        }
      }
      res.locals.loadSeries = loadSeries;
    }

    const DISCIPLINE_OF = (t) =>
      (t === 'Ride' || t === 'VirtualRide')          ? 'cycling'
      : (t === 'Run' || t === 'TrailRun')            ? 'running'
      : (t === 'WeightTraining' || t === 'Workout')  ? 'strength'
      : 'other';
    const weeklyMap = {};
    activities.forEach(a => {
      const d = new Date(a.start_date);
      const dow = (d.getDay() + 6) % 7;
      const mon = new Date(d); mon.setDate(d.getDate() - dow);
      const wk = mon.toISOString().split('T')[0];
      if (!weeklyMap[wk]) weeklyMap[wk] = { sessions: 0, hours: 0, km: 0, gym: 0, cycling: 0, running: 0, strength: 0, other: 0 };
      weeklyMap[wk].sessions++;
      weeklyMap[wk].hours += (a.moving_time || 0) / 3600;
      weeklyMap[wk].km += (a.distance || 0) / 1000;
      if (a.type === 'WeightTraining') weeklyMap[wk].gym++;
      weeklyMap[wk][DISCIPLINE_OF(a.type)] += (a.moving_time || 0) / 3600;
    });
    const weekCutoff = new Date(); weekCutoff.setDate(weekCutoff.getDate() - 52 * 7);
    const weeklyVolume = Object.entries(weeklyMap)
      .filter(([wk]) => new Date(wk) >= weekCutoff)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([wk, v]) => ({ week: wk, sessions: v.sessions, hours: Math.round(v.hours * 10) / 10, km: Math.round(v.km), gym: v.gym,
        cycling: Math.round(v.cycling * 10) / 10, running: Math.round(v.running * 10) / 10, strength: Math.round(v.strength * 10) / 10, other: Math.round(v.other * 10) / 10 }));

    const nutrCutoff = new Date(); nutrCutoff.setDate(nutrCutoff.getDate() - 60);
    const nutritionSeries = Object.entries(nutrition || {})
      .filter(([d]) => new Date(d) >= nutrCutoff)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, kcal: parseInt(v.kcal) || 0, protein: parseInt(v.protein) || 0, carbs: parseInt(v.carbs) || 0, fat: parseInt(v.fat) || 0 }))
      .filter(v => v.kcal > 0);

    const monthlyPower = {};
    activities
      .filter(a => a.average_watts && a.moving_time > 1800 && (a.type === 'Ride' || a.type === 'VirtualRide'))
      .forEach(a => {
        const date = a.start_date?.split('T')[0] || '';
        if (date >= cfg.unreliablePowerStart && date <= cfg.unreliablePowerEnd) return;
        const month = date.substring(0, 7);
        if (!monthlyPower[month]) monthlyPower[month] = [];
        monthlyPower[month].push(a.average_watts);
      });
    const powerTrend = Object.entries(monthlyPower)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, watts]) => ({ month, avgWatt: Math.round(watts.reduce((a, b) => a + b) / watts.length), rides: watts.length }));

    const monthlyWeight = {};
    weightSeries.forEach(({ date, kg }) => {
      const month = date.substring(0, 7);
      if (!monthlyWeight[month]) monthlyWeight[month] = [];
      monthlyWeight[month].push(kg);
    });
    const weightMonthly = Object.entries(monthlyWeight)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, vals]) => ({ month, avg: Math.round(vals.reduce((a, b) => a + b) / vals.length * 10) / 10 }));

    res.json({
      weightSeries: weightSeries.slice(-365),
      weightMonthly,
      loadSeries: res.locals.loadSeries || [],
      weeklyVolume,
      nutritionSeries,
      powerTrend,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/charts/strength-trends', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const hevyWorkouts = await getHevyWorkouts(user.id);
    const fp = `strength|${hevyWorkouts.length}|${hevyWorkouts.reduce((mx, w) => (w.start_time > mx ? w.start_time : mx), '')}`;
    if (req.query.force !== '1') { const hit = memoGet(fp, 'strength-trends'); if (hit) return res.json(hit); }
    const payload = engine.computeStrengthTrends(hevyWorkouts, { weeks: 26, minSessions: 3 });
    memoSet(fp, 'strength-trends', payload);
    res.json(payload);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hevy/workouts', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const existing = await getHevyWorkouts(userId);

    if (!process.env.HEVY_API_KEY) {
      return res.json(existing);
    }

    const cutoff = existing.length > 0
      ? existing.reduce((max, w) => (w.start_time > max ? w.start_time : max), existing[0].start_time)
      : null;

    const fetched = [];
    let page = 1;
    let done = false;
    while (!done) {
      let resp;
      try {
        resp = await axios.get('https://api.hevyapp.com/v1/workouts', {
          headers: { 'api-key': process.env.HEVY_API_KEY },
          params: { page, pageSize: 10 }
        });
      } catch (e) {
        if (e.response?.status === 404) break;
        throw e;
      }
      const batch = resp.data.workouts || [];
      if (batch.length === 0) break;
      for (const w of batch) {
        if (cutoff && w.start_time <= cutoff) { done = true; break; }
        fetched.push(w);
      }
      page++;
    }

    for (const w of fetched) {
      await upsertHevyWorkout(userId, w);
    }

    const merged = await getHevyWorkouts(userId);
    merged.sort((a, b) => b.start_time.localeCompare(a.start_time));

    if (process.env.HEVY_API_KEY) {
      try { await syncExerciseTemplates(userId, merged); }
      catch (e) { console.warn('syncExerciseTemplates fout:', e.message); }
    }

    res.json(merged);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hevy/workout/:hevyId/muscles', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const { rows } = await query(
      'SELECT raw FROM hevy_workouts WHERE user_id = $1 AND hevy_id = $2',
      [userId, req.params.hevyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Workout niet gevonden' });
    const workout = rows[0].raw;
    const templatesById = await getExerciseTemplates(userId);
    const result = computeWorkoutMuscleVolume(workout, templatesById);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/hevy/workout/:hevyId/summary', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const { rows } = await query(
      'SELECT raw FROM hevy_workouts WHERE user_id = $1 AND hevy_id = $2',
      [user.id, req.params.hevyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Workout niet gevonden' });
    const workout = rows[0].raw;
    const summary = computeWorkoutStrengthSummary(workout);
    res.json({
      ...summary,
      workoutName: workout.name || 'Workout',
      workoutDate: workout.start_time || null,
      workoutDescription: workout.description || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/hevy/workout/:hevyId/analyse', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });
    const { hevyId } = req.params;
    const user = await getDefaultUser();

    const cacheKey = 'workout_v1_' + hevyId;
    const cached   = user.ai_insights?.[cacheKey];
    if (cached?.ts && (Date.now() - cached.ts) < 7 * 24 * 60 * 60 * 1000) {
      return res.json({ text: cached.text });
    }

    const { rows } = await query(
      'SELECT raw FROM hevy_workouts WHERE user_id = $1 AND hevy_id = $2',
      [user.id, hevyId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Workout niet gevonden' });
    const workout = rows[0].raw;

    const summary        = computeWorkoutStrengthSummary(workout);
    const templatesById  = await getExerciseTemplates(user.id);
    const muscles        = computeWorkoutMuscleVolume(workout, templatesById);

    const topE = summary.topE1rm;
    const lines = [
      `Workout: ${workout.name || 'Onbekend'}, ${workout.start_time?.split('T')[0] || '–'}`,
      `Werksets: ${summary.workingSets}, tonnage: ${summary.tonnage} kg, duur: ${summary.durationMin ? summary.durationMin + ' min' : 'onbekend'}`,
      summary.avgRPE != null ? `Gem. RPE: ${summary.avgRPE} (${summary.loggedRpeSets} sets gelogd)` : null,
      topE ? `Top e1RM: ${topE.exercise} — ${topE.e1rm} kg (${topE.weight}×${topE.reps} reps)` : null,
      `Oefeningen: ${summary.perExercise.map(e => e.name + ' (' + e.sets.length + ' sets)').join(', ')}`,
      (muscles.distribution || []).length
        ? `Spierverdeling: ${muscles.distribution.slice(0, 6).map(d => d.muscle + ' ' + d.pct + '%').join(', ')}`
        : null,
    ].filter(Boolean);

    const aiResp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 250,
      system: 'Je bent een persoonlijke krachttrainingscoach. Schrijf exact 3 zinnen, niet meer. Zin 1: wat valt op aan de sessie (volume, tonnage, RPE, top e1RM, gestimuuleerde spiergroepen). Zin 2: wat zegt dit over de trainingstoestand en voortgang. Zin 3: één concrete aanbeveling voor de komende 48 uur. Gebruik uitsluitend platte tekst: geen markdown, geen sterretjes, geen nummers, geen vet, geen bullets.',
      messages: [{ role: 'user', content: lines.join('\n') }]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });

    const responseText = aiResp.data.content?.[0]?.text || '';
    const freshUser = await getDefaultUser();
    const updatedInsights = { ...(freshUser.ai_insights || {}) };
    updatedInsights[cacheKey] = { text: responseText, ts: Date.now() };
    await saveUserFields(freshUser.id, { ai_insights: updatedInsights });

    res.json({ text: responseText });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Slaap ─────────────────────────────────────────────────────────────────────

app.post('/api/sleep', async (req, res) => {
  try {
    const { date, hours, quality } = req.body || {};
    if (!date || typeof hours !== 'number' || isNaN(hours)) return res.status(400).json({ error: 'date en hours vereist' });
    const user = await getDefaultUser();
    await upsertSleep(user.id, date, { hours, quality, source: 'manual' });
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/sleep/today', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const sleep = await getSleep(user.id);
    const today = new Date().toISOString().split('T')[0];
    res.json(sleep[today] || null);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/nutrition', async (req, res) => {
  try {
    const { date, nutr } = req.body || {};
    if (!date || typeof nutr !== 'object' || nutr === null) return res.status(400).json({ error: 'date en nutr (object) vereist' });
    const user = await getDefaultUser();
    await upsertNutrition(user.id, date, nutr);
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/nutrition/parse-screenshot', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen afbeelding ontvangen' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });
    const base64 = req.file.buffer.toString('base64');
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: base64 } },
        { type: 'text', text: 'Screenshot van voedingsapp. Extraheer totale dagwaarden. Antwoord ALLEEN met JSON: {"kcal": 2100, "protein": 165, "carbs": 220, "fat": 65}' }
      ]}]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    const text = resp.data.content[0].text.trim().replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (err) { res.status(500).json({ error: 'Verwerking mislukt: ' + err.message }); }
});

// ── Gedeelde gewicht CSV-parser (Garmin Connect NL + platte formaten) ─────────

const _NL_EN_MONTHS = {
  januari:1, jan:1, january:1,
  februari:2, feb:2, february:2,
  maart:3, mrt:3, march:3, mar:3,
  april:4, apr:4,
  mei:5, may:5,
  juni:6, jun:6, june:6,
  juli:7, jul:7, july:7,
  augustus:8, aug:8, august:8,
  september:9, sep:9,
  oktober:10, okt:10, october:10, oct:10,
  november:11, nov:11,
  december:12, dec:12
};

function parseWeightCsv(buffer) {
  const raw = buffer.toString('utf8').replace(/^﻿/, ''); // strip UTF-8 BOM
  const allLines = raw.split(/\r?\n/);
  const nonEmpty = allLines.filter(l => l.trim());
  if (nonEmpty.length < 2) return { error: 'Bestand is leeg of bevat te weinig regels' };

  const firstLine = nonEmpty[0];
  const delim = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
  const headerCols = firstLine.split(delim).map(h => h.replace(/"/g, '').trim().toLowerCase());

  const weightIdx = headerCols.findIndex(h =>
    h === 'weight' || h === 'gewicht' || h === 'weight (kg)' || h === 'weight (lbs)' || h === 'gewicht (kg)' ||
    (h.includes('weight') && !h.includes('body') && !h.includes('bone') && !h.includes('muscle'))
  );
  if (weightIdx === -1) return { error: `Gewichtskolom niet gevonden. Kolommen: ${headerCols.join(', ')}` };

  // Date column for flat-format support (may be absent in Garmin multi-row format)
  const dateIdx = headerCols.findIndex(h =>
    h.includes('date') || h === 'datum' || h.includes('time') || h.includes('tijd')
  );

  function parseMonthName(str) {
    const m = str.trim().match(/^(\d{1,2})\s+([a-zA-ZÀ-ÿ]+)\.?\s+(\d{4})$/);
    if (!m) return null;
    const monthNum = _NL_EN_MONTHS[m[2].toLowerCase()];
    if (!monthNum) return null;
    return `${m[3]}-${String(monthNum).padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }

  function parseDateStr(raw) {
    const s = raw.replace(/"/g, '').trim();
    const byMonth = parseMonthName(s);
    if (byMonth) return byMonth;
    const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const eu = s.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (eu) return `${eu[3]}-${eu[2]}-${eu[1]}`;
    const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (us) return `${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
    const p = new Date(s);
    if (!isNaN(p.getTime()) && s.length >= 8) return p.toISOString().split('T')[0];
    return null;
  }

  function parseWeightVal(raw) {
    if (!raw || raw.trim() === '' || raw.trim() === '--') return null;
    const cleaned = raw.trim().replace(/\s*(kg|lbs)\s*$/i, '').replace(',', '.').trim();
    const w = parseFloat(cleaned);
    return (isNaN(w) || w <= 0) ? null : w;
  }

  function isTimeCell(cell) {
    return /^\d{1,2}:\d{2}(:\d{2})?$/.test(cell.trim());
  }

  const entries = [];
  const weightSamples = [];
  let currentDate = null;
  let dateRowsFound = 0, measureRowsFound = 0, invalidMeasures = 0;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    if (!line.trim()) continue;
    // Skip header row
    if (i === 0 || line.split(delim).map(c => c.replace(/"/g,'').trim().toLowerCase()).join(',') === headerCols.join(',')) continue;

    const cols = line.split(delim).map(c => c.replace(/"/g, '').trim());
    const firstCell = cols[0];

    // 1. Date row: first cell matches Dutch/English month name or numeric date
    const byMonthDate = parseMonthName(firstCell);
    const isNumericDateRow = !byMonthDate && (
      /^\d{4}-\d{2}-\d{2}$/.test(firstCell) ||
      /^\d{2}-\d{2}-\d{4}$/.test(firstCell) ||
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(firstCell)
    );

    if (byMonthDate || isNumericDateRow) {
      const parsed = byMonthDate || parseDateStr(firstCell);
      if (parsed) {
        currentDate = parsed;
        dateRowsFound++;
        // Flat row: same line also has a weight (e.g. standard flat CSV)
        if (weightIdx < cols.length) {
          const w = parseWeightVal(cols[weightIdx]);
          if (w !== null && w > 1 && w < 700) {
            entries.push({ date: currentDate, weight: w });
            weightSamples.push(w);
            measureRowsFound++;
          }
        }
      }
      continue;
    }

    // 2. Timestamp row: first cell is HH:MM — use currentDate context
    if (isTimeCell(firstCell)) {
      if (!currentDate) continue;
      measureRowsFound++;
      if (weightIdx < cols.length) {
        const w = parseWeightVal(cols[weightIdx]);
        if (w !== null && w > 1 && w < 700) {
          entries.push({ date: currentDate, weight: w });
          weightSamples.push(w);
        } else { invalidMeasures++; }
      } else { invalidMeasures++; }
      continue;
    }

    // 3. Flat format: row with date in dedicated dateIdx column
    if (dateIdx !== -1 && dateIdx < cols.length) {
      const parsed = parseDateStr(cols[dateIdx]);
      if (parsed && weightIdx < cols.length) {
        const w = parseWeightVal(cols[weightIdx]);
        if (w !== null && w > 1 && w < 700) {
          entries.push({ date: parsed, weight: w });
          weightSamples.push(w);
          measureRowsFound++;
        }
      }
    }
  }

  let isLbs = false;
  if (weightSamples.length > 0) {
    const sorted = [...weightSamples].sort((a, b) => a - b);
    isLbs = sorted[Math.floor(sorted.length / 2)] > 150;
  }

  return { entries, isLbs, dateRowsFound, measureRowsFound, invalidMeasures, weightColName: headerCols[weightIdx] };
}

function weightImportErrorMsg(parsed) {
  const { dateRowsFound, measureRowsFound, invalidMeasures, weightColName } = parsed;
  if (dateRowsFound > 0 && measureRowsFound === 0)
    return `Wel ${dateRowsFound} datumregel(s) gevonden maar geen geldige gewichtswaarden in kolom '${weightColName}'.`;
  if (dateRowsFound === 0 && measureRowsFound === 0)
    return `Geen datum- of meetrijen herkend — controleer het bestandsformaat.`;
  return `${measureRowsFound} meetregel(s) verwerkt maar alle waarden ongeldig (${invalidMeasures} ontbrekend/onleesbaar).`;
}

app.post('/api/weight/import', upload.single('csvfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen' });

    const parsed = parseWeightCsv(req.file.buffer);
    if (parsed.error) return res.status(400).json({ error: parsed.error });

    const { entries, isLbs } = parsed;
    const imported = {};
    for (const { date, weight } of entries) {
      const w = isLbs ? Math.round(weight * 0.453592 * 10) / 10 : Math.round(weight * 10) / 10;
      if (!imported[date]) imported[date] = String(w);
    }

    const count = Object.keys(imported).length;
    if (count === 0) return res.status(400).json({ error: `Geen geldige metingen gevonden. ${weightImportErrorMsg(parsed)}` });

    const user = await getDefaultUser();
    const existing = await getWeightMap(user.id);
    for (const [date, wStr] of Object.entries(imported)) {
      if (existing[date] != null) continue; // bestaande invoer wint, niet overschrijven
      await upsertWeight(user.id, date, parseFloat(wStr), 'import');
    }

    const sorted = Object.keys(imported).sort();
    const skipped = parsed.measureRowsFound - count;
    const totalAfter = Object.keys({ ...existing, ...imported }).length;
    res.json({ imported: count, skipped: Math.max(0, skipped), total: totalAfter, oldest: sorted[0], newest: sorted[sorted.length - 1], unit: isLbs ? 'lbs omgezet naar kg' : 'kg' });
  } catch (err) { res.status(500).json({ error: 'Import mislukt: ' + err.message }); }
});

app.post('/api/analyse', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });

    const { hevyWorkouts, goals, patterns, nutrition, weight, weekPlan, todayNote, athlete } = req.body;
    const user = await getDefaultUser();
    const allActivities = await getActivities(user.id);
    const settings = user.settings || {};
    const calibration = user.calibration || { factor: 1.0, count: 0, reliable: false };
    const literature = user.literature || [];

    const state = engine.computeFullState(allActivities, hevyWorkouts || [], weight || {}, nutrition || {}, weekPlan || {}, settings);

    const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
    const recent90 = allActivities
      .filter(a => new Date(a.start_date) >= ninetyAgo)
      .map(a => {
        const date = a.start_date?.split('T')[0] || '';
        const inUnreliable = engine.isUnreliablePower(date, settings);
        const ftp = engine.ftpForDate(allActivities, settings, date);
        const hrMax = settings.hrMax || 197;
        const zone = engine.activityZoneClassification({ ...a, _unreliablePower: inUnreliable }, ftp, hrMax, settings);
        const actEtl = engine.computeETLForActivity({ ...a, _unreliablePower: inUnreliable }, settings).etl;
        return {
          datum: date, type: a.type, naam: a.name,
          afstand_km: a.distance ? +(a.distance / 1000).toFixed(1) : null,
          duur_min: a.moving_time ? Math.round(a.moving_time / 60) : null,
          hoogtemeters: a.total_elevation_gain || null,
          watt: a.average_watts ? (inUnreliable ? 'ONBETROUWBAAR' : Math.round(a.average_watts)) : null,
          NP: a.weighted_average_watts && !inUnreliable ? Math.round(a.weighted_average_watts) : null,
          hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          zone: zone.zone, IF: zone.IF || null,
          etl: actEtl ? Math.round(actEtl) : null
        };
      });

    const weekPlanFormatted = Object.entries(weekPlan || {}).sort()
      .map(([datum, sessies]) => ({
        datum,
        dag: new Date(datum + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long' }),
        sessies,
        adaptive: state.adaptivePlan[datum] || sessies
      }));

    const nutrLast14 = Object.entries(nutrition || {}).sort().reverse().slice(0, 14).map(([d, v]) => ({ datum: d, ...v }));
    const wLast14 = Object.entries(weight || {}).sort().reverse().slice(0, 14).map(([d, v]) => ({ datum: d, gewicht: v }));
    const wLast90 = Object.entries(weight || {}).sort().reverse().slice(0, 90).map(([d, v]) => ({ datum: d, gewicht: parseFloat(v) }));

    let weightTrend4w = null;
    if (wLast90.length >= 28) {
      const recent = wLast90.slice(0, 7).reduce((s, w) => s + w.gewicht, 0) / 7;
      const old = wLast90.slice(21, 28).reduce((s, w) => s + w.gewicht, 0) / 7;
      weightTrend4w = +((recent - old) / 4).toFixed(2);
    }

    const last7 = nutrLast14.slice(0, 7);
    const avgProtein7 = last7.length ? last7.reduce((s, n) => s + (parseInt(n.protein) || 0), 0) / last7.length : 0;
    const avgKcal7 = last7.length ? last7.reduce((s, n) => s + (parseInt(n.kcal) || 0), 0) / last7.length : 0;
    const proteinPerKg = state.currentWeight && avgProtein7 ? (avgProtein7 / state.currentWeight).toFixed(2) : null;

    const recentZones = state.zoneBreakdown.slice(-8);
    const em = state.enduranceMetrics;
    const sm = state.strengthMetrics;
    const targetWtLoss = settings.targetWeightLossPerWeek || 0.7;

    const literatureContext = literature.length
      ? literature.map(l => `--- ${l.title} ---\n${l.content}`).join('\n\n')
      : 'Geen literatuur toegevoegd door gebruiker.';

    const prompt = `Je bent een sport- en voedingswetenschappelijk onderlegde coach. Je werkt met een geïntegreerd datasysteem. Een deterministische rekenmodule heeft alle metrics reeds berekend. Schat deze waarden NIET zelf opnieuw — gebruik ze direct als feiten.

Redeneer altijd: OBSERVATIE → MECHANISME → IMPACT → ACTIE.

═══════════════════════════════════════════════════════════
WETENSCHAPPELIJK KADER
═══════════════════════════════════════════════════════════

TRAININGSBELASTING & ADAPTATIE
Banister-impulsresponsmodel: TSB = CTL − ATL. Optimum −10 tot +10. ACWR optimaal 0,8–1,3 (Gabbett 2016); >1,5 verhoogt blessurerisico significant. Monotony >2,0 = onvoldoende variatie (Foster, MSSE 1998). Periodisering: Issurin (blokmodel) en Seiler (polarized).

INTENSITEITSVERDELING
Polarized model (Seiler 2010): ~80% laag (Z1-Z2), <5% mid (Z3), 15-20% hoog (Z4-Z5). Z2: mitochondriale biogenese via PGC-1α, vetoxidatie. Z4-Z5: VO2max, lactaatmetabolisme. Grey zone (Z3): hoge vermoeidheid zonder proportionele adaptatie.

CONCURRENT TRAINING
AMPK (duur) remt mTORC1 → reduceert MPS. Krachttraining activeert mTOR via mechanotransductie. Volume duurtraining is sterkere moderator dan intensiteit (Wilson 2012, JSCR). Moderatie: kracht vóór duur, ≥6u herstelwindow.

VOEDING TIJDENS CUT
Helms 2014: eiwit 2,3–3,1 g/kg/dag bij cut. Caloriedeficit max ${targetWtLoss} kg/week (ingesteld doel) voor spierbehoud. Energy availability >30 kcal/kg LBM/dag essentieel.

═══════════════════════════════════════════════════════════
DOOR GEBRUIKER AANGELEVERDE LITERATUUR
═══════════════════════════════════════════════════════════
${literatureContext}

═══════════════════════════════════════════════════════════
ATLETENPROFIEL
═══════════════════════════════════════════════════════════
${athlete?.firstname || 'Pieter'} ${athlete?.lastname || ''} | 23 jaar | 188cm | huidig: ${state.currentWeight}kg | doel: ${goals?.weightTarget || '90-92'}kg
Achtergrond: ex-competitief wielrenner (FTP-piek 373W/70kg = 5,33 W/kg). PPL gym ~1 jaar. PR: bench 110kg, RDL 120kg×10, incline DB 40kg×10. Actieve cut.
Gewichtsverlies doel: ${targetWtLoss} kg/week.
DOELEN: ${JSON.stringify(goals || {})}
VASTE PATRONEN: ${JSON.stringify(patterns || [])}

═══════════════════════════════════════════════════════════
BEREKENDE METRICS — DUURTRAINING (ATL/CTL/TSB exclusief kracht)
═══════════════════════════════════════════════════════════

DUURBELASTING
• ETL duurtraining afgelopen 7 dagen: ${em.weeklyLoad}
• ATL (duur): ${em.atl} | CTL (duur): ${em.ctl} | TSB (duur): ${em.tsb}
• ACWR: ${em.acwr} ${em.acwr > 1.5 ? '⚠️ SPIKE-ZONE' : em.acwr > 1.3 ? '⚠️ verhoogd' : 'normaal'}
• Monotony: ${em.monotony} | Strain: ${em.strain}

READINESS SCORE: ${state.readiness.total}/100 (${state.readiness.interpretation})
Verdeling: TSB ${state.readiness.breakdown.tsb}/35 · ACWR ${state.readiness.breakdown.acwr}/20 · Monotony ${state.readiness.breakdown.monotony}/15 · Load slope ${state.readiness.breakdown.loadSlope}/10 · Voeding ${state.readiness.breakdown.nutrition}/10 · Krachtherstel ${state.readiness.breakdown.strengthFatigue}/10

ETL KALIBRATIE (suffer_score → TSS)
• Factor: ${calibration.factor} | Gebaseerd op: ${calibration.count} ritten | Betrouwbaarheid: ${calibration.count >= 20 ? 'hoog' : calibration.count >= 5 ? 'matig' : 'laag (<5 ritten)'}

OVERREACHING DETECTIE: ${state.overreaching.level}
${state.overreaching.flags.length ? 'Flags: ' + state.overreaching.flags.join(' | ') : 'Geen flags'}

PLATEAU DETECTIE
${state.plateaus.length ? state.plateaus.map(p => `• ${p.domain}${p.exercise ? ' (' + p.exercise + ')' : ''}: ${p.detail}`).join('\n') : 'Geen plateaus gedetecteerd'}

ROLLING FTP (laatste 60 dagen): ${state.ftpInfo ? state.ftpInfo.ftp + 'W (' + state.ftpInfo.method + ')' : 'onvoldoende data'}

PERSOONLIJK RESPONSMODEL
• Optimale TSB-range historisch: ${state.personalModel.optimalTSB.min} tot ${state.personalModel.optimalTSB.max}
• Load tolerance: ${state.personalModel.loadTolerance}
${state.personalModel.note ? '• ' + state.personalModel.note : ''}

INTENSITEITSVERDELING (laatste 8 weken — Z1-Z2 / Z3 / Z4-Z5)
${recentZones.map(z => `${z.week}: ${z.lowPct}% / ${z.midPct}% / ${z.highPct}% — ${z.totalMin}min — model: ${z.model}`).join('\n') || 'Geen data'}
HUIDIG MODEL: ${state.currentZoneModel?.model || 'onvoldoende data'}

═══════════════════════════════════════════════════════════
BEREKENDE METRICS — KRACHTTRAINING (apart beoordeeld)
═══════════════════════════════════════════════════════════
${sm ? `
Volume load deze week: ${sm.weeklyLoad} (4w gemiddeld: ${sm.avgWeeklyLoad4w})
Dagen sinds laatste sessie: ${sm.daysSinceLastSession}

Per spiergroep (weekload / trend / dagen-herstel):
${Object.entries(sm.muscleGroups).map(([g, v]) => `  ${g}: ${v.weeklyLoad} load · trend: ${v.trend} · laatste sessie: ${v.daysSinceLastSession === 999 ? 'geen data' : v.daysSinceLastSession + 'd geleden'}`).join('\n')}

e1RM trend (laatste 8 sessies via Epley):
${sm.e1RMTrends.slice(0, 8).map(e => {
  const s = e.sessions;
  const delta = s[s.length-1].e1rm - s[0].e1rm;
  return `  ${e.exercise}: ${s[0].e1rm} → ${s[s.length-1].e1rm} kg (${delta >= 0 ? '+' : ''}${delta})`;
}).join('\n') || '  Onvoldoende data'}
` : 'Geen Hevy data beschikbaar.'}

═══════════════════════════════════════════════════════════
DETAIL DATA
═══════════════════════════════════════════════════════════

ACTIVITEITEN AFGELOPEN 90 DAGEN
${JSON.stringify(recent90)}

HEVY WORKOUTS recent
${JSON.stringify((hevyWorkouts || []).slice(0, 5).map(w => ({ datum: w.start_time?.split('T')[0], naam: w.name, oefeningen: (w.exercises || []).map(e => ({ naam: e.title, sets: (e.sets || []).map(s => ({ reps: s.reps, kg: s.weight_kg, rpe: s.rpe })) })) })))}

PERFORMANCE TRENDS
Wielrennen NP per maand: ${JSON.stringify(state.perfTrends.cyclingMonthly?.slice(-12) || [])}
Hardlopen pace per maand: ${JSON.stringify(state.perfTrends.runMonthly?.slice(-12) || [])}
Krachttraining e1RM trend: ${JSON.stringify(state.perfTrends.liftTrends?.slice(0, 8) || [])}

VOEDING (14 dagen): ${nutrLast14.length ? JSON.stringify(nutrLast14) : 'Geen data'}
Gemiddeld 7d: ${Math.round(avgKcal7)} kcal/dag · ${Math.round(avgProtein7)}g eiwit (${proteinPerKg || '–'} g/kg)

GEWICHT (14 dagen): ${wLast14.length ? JSON.stringify(wLast14) : 'Geen data'}
Trend 4w: ${weightTrend4w !== null ? weightTrend4w + ' kg/week' : 'onvoldoende data'} (doel: ${targetWtLoss} kg/week)

GEPLANDE WEEK: ${weekPlanFormatted.length ? JSON.stringify(weekPlanFormatted) : 'Geen week gepland'}
DAGNOTITIE: ${todayNote || 'Geen'}

═══════════════════════════════════════════════════════════
ANALYSEOPDRACHT
═══════════════════════════════════════════════════════════

Schrijf een uitgebreide, mechanistisch onderbouwde analyse. ATL/CTL/TSB reflecteert ALLEEN duurtraining. Krachttraining wordt apart beoordeeld via volume load en e1RM-trend. Leg expliciete kruisverbanden (training × voeding × gewicht × intensiteitsverdeling × herstel).

**1. GEÏNTEGREERDE TRENDANALYSE**
Verbanden tussen duurload, krachtontwikkeling, gewichtsverloop en performance.

**2. DUURTRAINING — HUIDIGE STAAT**
Beoordeel ATL ${em.atl}, CTL ${em.ctl}, TSB ${em.tsb}, ACWR ${em.acwr}, readiness ${state.readiness.total}/100. Is het trainingsmodel passend?

**3. KRACHTTRAINING — HUIDIGE STAAT**
Beoordeel volume load trend, e1RM progressie per spiergroep, herstelstatus. Zijn er interferentie-risico's met de duurtraining?

**4. VOEDING × GEWICHT × ADAPTATIE**
Toets eiwit (${proteinPerKg || '–'} g/kg) aan Helms. Kcal-balans (${Math.round(avgKcal7)}/dag) vs gewichtstrend (${weightTrend4w !== null ? weightTrend4w + ' kg/week' : 'onbekend'}) vs doel (${targetWtLoss} kg/week). Risico LBM-verlies of LEA?

**5. PER GEPLANDE SESSIE — TYPE EN INTENSITEIT**
Specifiek sessietype-advies met intensiteit, duur, RPE voor gym. Onderbouw met TSB, trainingsmodel-deficit en cut.

**6. STRUCTURELE OPTIMALISATIES & RODE VLAGGEN**
Sessievolgorde, koolhydraatperiodisering, deload-timing. Concrete waarschuwingen met fysiologische onderbouwing. Eén absolute weekprioriteit.

Nederlands. Mechanistisch en concreet. Citeer waar passend. Minimaal ~1200 woorden.`;

    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5', max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

    res.json({ analysis: resp.data.content.map(b => b.text || '').join(''), state });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── State endpoints ───────────────────────────────────────────────────────────

app.get('/api/state/full', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const [activities, hevyWorkouts, weight, nutrition, sleep] = await Promise.all([
      getActivities(userId),
      getHevyWorkouts(userId),
      getWeightMap(userId),
      getNutrition(userId),
      getSleep(userId),
    ]);
    const data = {
      activityCache: { lastSync: null, activities },
      hevyWorkouts,
      weight,
      nutrition,
      sleep,
      weekPlan: user.week_plan || {},
      settings: user.settings || {},
      calibration: user.calibration || { factor: 1.0, count: 0, reliable: false },
      cpModel: user.cp_model || null,
      goals: user.goals || {},
      patterns: user.patterns || [],
      aiInsights: user.ai_insights || {},
      weekAvailability: user.week_availability || {},
    };
    const allActivities = activities;
    const settings = data.settings;
    const state = engine.computeFullState(allActivities, hevyWorkouts, data.weight || {}, data.nutrition || {}, data.weekPlan || {}, settings, data);
    const { enduranceDailyETL, strengthDailyETL, sources, ...rest } = state;
    // Geprojecteerde TSB aan het einde van de huidige ISO-week (endurance-only,
    // consistent met de live TSB). Datumvergelijking op ISO-strings = UTC-safe.
    const { monday: wkMon, sunday: wkSun, today: wkToday } = getISOWeekBounds();
    const plannedRemainingLoads = {};
    for (const [date, sessions] of Object.entries(data.weekPlan || {})) {
      if (date < wkToday || date > wkSun) continue;
      for (const s of (sessions || [])) {
        if (s.type !== 'cycling') continue;            // TSB is endurance-only
        if (s.matchedActivityId || s.completionScore !== undefined) continue; // al voltooid, zit al in actuals
        const tss = s.targetTSS || s.tss;
        if (tss) plannedRemainingLoads[date] = (plannedRemainingLoads[date] || 0) + tss;
      }
    }
    const projectedWeekEndTSB = engine.projectWeekEndTSB(enduranceDailyETL, plannedRemainingLoads, wkSun);
    rest.enduranceMetrics = { ...rest.enduranceMetrics, history: undefined, projectedWeekEndTSB, projectedWeekEndDate: wkSun };
    rest.metrics = rest.enduranceMetrics;
    // Slaapdata laatste 14 dagen (ontbrekende dagen = null)
    const sleepData14 = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      sleepData14.push(sleep[key] ? { date: key, ...sleep[key] } : null);
    }
    res.json({
      ...rest,
      strengthDailyETL,
      hasETLData: (Object.keys(enduranceDailyETL).length + Object.keys(strengthDailyETL).length) > 0,
      calibration: data.calibration || { factor: 1.0, count: 0, reliable: false },
      alertThresholds: settings.alerts || {},
      sleepData: sleepData14
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/state/load-series', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const [allActivities, hevyWorkouts] = await Promise.all([
      getActivities(userId),
      getHevyWorkouts(userId),
    ]);
    const settings = user.settings || {};
    const { enduranceDailyETL } = engine.buildDailyETLSeries(allActivities, hevyWorkouts, settings);
    const m = engine.computeLoadMetrics(enduranceDailyETL);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 180);
    const series = Object.entries(m.history)
      .filter(([d]) => new Date(d) >= cutoff)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, ...v }));
    res.json({ series, current: { atl: m.atl, ctl: m.ctl, tsb: m.tsb, acwr: m.acwr, monotony: m.monotony, strain: m.strain } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/state/zones', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const allActivities = await getActivities(userId);
    const settings = user.settings || {};
    const breakdown = engine.weeklyZoneBreakdown(allActivities, settings);
    const ftpInfo = engine.rollingFtp(allActivities, settings);
    res.json({ weekly: breakdown.slice(-26), currentFtp: ftpInfo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/data', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const userId = user.id;
    const [nutrition, weight, sleep, hevyWorkouts, activities] = await Promise.all([
      getNutrition(userId),
      getWeightMap(userId),
      getSleep(userId),
      getHevyWorkouts(userId),
      getActivities(userId),
    ]);
    res.json({
      goals:            user.goals            || {},
      patterns:         user.patterns         || [],
      settings:         user.settings         || {},
      weekPlan:         user.week_plan         || {},
      aiInsights:       user.ai_insights       || {},
      weekAvailability: user.week_availability || {},
      calibration:      user.calibration       || { factor: 1.0, count: 0, reliable: false },
      literature:       user.literature        || [],
      nutrition,
      weight,
      sleep,
      hevyWorkouts,
      activityCache: { lastSync: null, activities },
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/data', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const body = req.body || {};
    const fields = {};
    if (body.goals     !== undefined) fields.goals     = { ...(user.goals     || {}), ...body.goals };
    if (body.settings  !== undefined) fields.settings  = { ...(user.settings  || {}), ...body.settings };
    if (body.patterns  !== undefined) fields.patterns  = body.patterns;
    if (body.weekPlan  !== undefined) fields.week_plan = body.weekPlan;
    if (Object.keys(fields).length > 0) await saveUserFields(user.id, fields);

    // Gewicht woont in de aparte weights-tabel, niet als JSONB op de user-rij.
    // De frontend stuurt de volledige weight-map (datum -> waarde, waarden als string);
    // upsert elke entry afzonderlijk. ON CONFLICT maakt dit idempotent.
    if (body.weight !== undefined && body.weight && typeof body.weight === 'object') {
      for (const [date, val] of Object.entries(body.weight)) {
        const kg = parseFloat(val);
        if (!isNaN(kg) && date) await upsertWeight(user.id, date, kg, 'manual');
      }
    }

    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Literatuur ────────────────────────────────────────────────────────────────

app.get('/api/literature', async (req, res) => {
  try {
    const user = await getDefaultUser();
    res.json(user.literature || []);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/literature', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titel en inhoud zijn verplicht' });
    const user = await getDefaultUser();
    const entry = { id: Date.now().toString(), title, content, addedDate: new Date().toISOString().split('T')[0] };
    const literature = [...(user.literature || []), entry];
    await saveUserFields(user.id, { literature });
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/literature/:id', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const literature = (user.literature || []).filter(l => l.id !== req.params.id);
    await saveUserFields(user.id, { literature });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/weight/:date', async (req, res) => {
  try {
    const user = await getDefaultUser();
    await deleteWeight(user.id, req.params.date);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/nutrition/:date', async (req, res) => {
  try {
    const user = await getDefaultUser();
    await deleteNutrition(user.id, req.params.date);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/weekplan/:date/:index', async (req, res) => {
  try {
    // Vers laden om stale-snapshot race te voorkomen.
    // De gekoppelde training_prescription wordt hier bewust niet aangeraakt;
    // prescription-status (cancelled) is een aparte commit na inspectie van reconcilePrescriptions.
    const user = await getDefaultUser();
    const wp  = { ...(user.week_plan || {}) };
    const { date } = req.params;
    const idx = parseInt(req.params.index, 10);
    const day = wp[date];
    if (!day || idx < 0 || idx >= day.length) return res.status(404).json({ error: 'Sessie niet gevonden' });
    wp[date] = day.filter((_, i) => i !== idx);
    if (!wp[date].length) delete wp[date];
    await saveUserFields(user.id, { week_plan: wp });
    res.json({ ok: true, removed: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/literature/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen' });
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Geef een titel op' });

    let content = '';
    const mime = req.file.mimetype;

    if (mime === 'application/pdf') {
      if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key vereist voor PDF-verwerking' });
      const base64 = req.file.buffer.toString('base64');
      const resp = await axios.post('https://api.anthropic.com/v1/messages', {
        model: 'claude-sonnet-4-5', max_tokens: 800,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Extraheer de kernbevindingen van dit wetenschappelijk artikel relevant voor sporttraining, krachttraining, duurtraining, concurrent training, voeding of periodisering. Geef een gestructureerde samenvatting van maximaal 400 woorden: studieopzet, belangrijkste bevindingen, praktische implicaties. Schrijf in het Nederlands.' }
        ]}]
      }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      content = resp.data.content.map(b => b.text || '').join('');
    } else {
      content = req.file.buffer.toString('utf8').substring(0, 4000);
    }

    const user = await getDefaultUser();
    const entry = { id: Date.now().toString(), title, content, addedDate: new Date().toISOString().split('T')[0], source: req.file.originalname };
    const literature = [...(user.literature || []), entry];
    await saveUserFields(user.id, { literature });
    res.json(entry);
  } catch (err) { res.status(500).json({ error: 'Upload mislukt: ' + err.message }); }
});

// ── Week availability ─────────────────────────────────────────────────────────

app.get('/api/week-availability', async (req, res) => {
  try {
    const user = await getDefaultUser();
    res.json(user.week_availability || {});
  } catch(err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/week-availability', async (req, res) => {
  try {
    const user = await getDefaultUser();
    await saveUserFields(user.id, { week_availability: req.body });
    res.json(req.body);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── AI Insights (cached per page) ────────────────────────────────────────────

const PLAN_PREAMBLE = 'Onder PLAN krijg je het deterministisch berekende trainingsplan voor vandaag en deze week. Dat plan is leidend: herbereken het niet, spreek het niet tegen en verzin geen andere sessie of andere getallen. Vertaal vanuit je paginafocus uitsluitend het relevante deel ervan naar concreet advies, en verwijs expliciet naar de voorgeschreven sessie van vandaag waar dat past.';

const PLAN_PAGE_TASKS = {
  vandaag:      'Neem de voorgeschreven sessie van vandaag uit het PLAN letterlijk over in het body-veld: noem de exacte duur, het doel-TSS en het wattagebereik. Noem geen andere sessie dan die in het PLAN staat. De accents-eis blijft gelden: kies exacte tekstfragmenten die letterlijk in body voorkomen.',
  voeding:      'Richt je advies primair op de voorgeschreven sessie van vandaag uit het PLAN: hoeveel koolhydraten ervoor, of er tijdens de sessie bijgevoed moet worden (bij hoge TSS of lange duur), en herstel (eiwit plus koolhydraten) erna, afgestemd op de duur en intensiteit van die sessie. Houd de bredere macro-analyse kort.',
  activiteiten: 'Benoem expliciet welke van de recente activiteiten het dichtst bij de voorgeschreven sessie van vandaag uit het PLAN liggen qua duur, intensiteit en zoneverdeling, en wat die historie zegt over hoe de atleet die sessie waarschijnlijk uitvoert.',
  integratie:   'Betrek de voorgeschreven sessie van vandaag uit het PLAN in de geïntegreerde analyse: hoe past die bij de actuele kracht- en voedingsstaat en het herstel.',
  week:         'Gebruik het week-skelet uit het PLAN (doelmodus, fase, weekdoel-TSS, verdeling) als kader voor je weekanalyse, in plaats van een eigen weekstructuur te bedenken.',
  weekplanning: 'Plan de PPL-gymsessies rond de voorgeschreven fietssessies uit het PLAN: vermijd Legs op de dag vóór een zware fietssessie (threshold, VO2max of de lange rit) en benoem concreet welke gymdag je waarheen zou schuiven gezien die sessies.',
  voorspelling: 'Laat je prognose aansluiten op de doelmodus en fase uit het PLAN.',
};

function summarizeBlokken(blokken) {
  if (!Array.isArray(blokken) || !blokken.length) return '';
  return blokken.map(b => {
    const reps = b.herhalingen && b.herhalingen > 1 ? `${b.herhalingen}×` : '';
    const w = (b.wattMin != null && b.wattMax != null) ? ` @${b.wattMin}-${b.wattMax}W` : '';
    let s = `${reps}${b.duration}min ${b.zone}${w}`;
    if (b.herstelBlok) s += ` (herstel ${b.herstelBlok.duration}min ${b.herstelBlok.zone})`;
    return s;
  }).join(', ');
}

function buildPrescriptionBlock(weekPlan, planSkeleton, todayStr) {
  const sk = planSkeleton || {};
  const todaySessions = (weekPlan[todayStr] || []).filter(s => s.type === 'cycling' && !s.unplanned);
  const lines = [];
  if (sk.weeklyTSSTarget) {
    const rd = sk.realizedDistribution || sk.distribution || {};
    const pct = v => (v != null ? Math.round(v * 100) : '–');
    const rec = sk.isRecoveryWeek ? ', HERSTELWEEK' : '';
    lines.push(`Week: doelmodus ${sk.mode || '–'}, fase ${sk.phase || '–'}, mesocycle week ${sk.mesocycleWeek || '–'}${rec}, weekdoel ${sk.weeklyTSSTarget} TSS, verdeling ${sk.distributionModel || '–'} (laag ${pct(rd.low)}% / mid ${pct(rd.mid)}% / hoog ${pct(rd.high)}%).`);
  }
  if (todaySessions.length) {
    todaySessions.forEach(s => {
      const dur = s.duration || s.duur_min || '–';
      const tss = s.targetTSS || s.tss || '–';
      const bl  = summarizeBlokken(s.blokken);
      lines.push(`Vandaag (${todayStr}): ${s.title || s.titel || 'Fietssessie'} — ${dur}min, doel ${tss} TSS${bl ? `. Blokken: ${bl}` : ''}.`);
    });
  } else {
    lines.push(`Vandaag (${todayStr}): geen fietssessie gepland (rustdag).`);
  }
  const active = !!(sk.weeklyTSSTarget || todaySessions.length);
  const seed = `${sk.weeklyTSSTarget || ''}|${sk.phase || ''}|${todaySessions.map(s => `${s.title || s.titel}:${s.targetTSS || s.tss}`).join(',')}`;
  return { active, text: 'PLAN (deterministisch berekend, leidend):\n' + lines.join('\n'), seed };
}

app.post('/api/insights/:page', async (req, res) => {
  try {
    const { page } = req.params;
    const force = req.body?.force === true;
    const user = await getDefaultUser();
    const [nutrition, weight, hevyWkts, acts] = await Promise.all([
      getNutrition(user.id),
      getWeightMap(user.id),
      getHevyWorkouts(user.id),
      getActivities(user.id),
    ]);
    const data = {
      goals:            user.goals            || {},
      patterns:         user.patterns         || [],
      settings:         user.settings         || {},
      weekPlan:         user.week_plan         || {},
      aiInsights:       user.ai_insights       || {},
      weekAvailability: user.week_availability || {},
      calibration:      user.calibration       || { factor: 1.0, count: 0, reliable: false },
      literature:       user.literature        || [],
      planSkeleton:     user.plan_skeleton     || {},
      nutrition,
      weight,
      hevyWorkouts:     hevyWkts,
      activityCache:    { lastSync: null, activities: acts },
    };
    if (!data.aiInsights) data.aiInsights = {};

    const weekPlan   = data.weekPlan || {};
    const settings   = data.settings || {};
    const mealTimings = getMealTimings(settings);
    const todayStr   = new Date().toISOString().split('T')[0];

    let fullState = null;
    try { fullState = engine.computeFullState(acts, hevyWkts, weight, nutrition, weekPlan, settings); }
    catch(e) { console.warn('computeFullState in insights:', e.message); }

    const recentActs  = [...acts].sort((a,b) => new Date(b.start_date)-new Date(a.start_date)).slice(0, 21);
    const recentNutr  = Object.entries(nutrition).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 14);
    const recentWt    = Object.entries(weight).sort((a,b) => b[0].localeCompare(a[0])).slice(0, 14);

    const m  = fullState?.enduranceMetrics || fullState?.metrics || {};
    const sm = fullState?.strengthMetrics;
    const canonicalWeight       = fullState?.currentWeight ?? recentWt[0]?.[1];
    const canonicalWeightTarget = data.goals?.weightTarget || '90-92';

    let systemPrompt = 'Je bent een persoonlijke sport- en voedingscoach die evidence-based, gepersonaliseerd advies geeft in het Nederlands. Wees concreet, bondig en bruikbaar.';
    let context = '';
    let dataForHash = '';
    let ttlHours = 6;
    let maxTokens = 300;
    let emptyMsg = null;

    if (page === 'vandaag') {
      if (!fullState && !recentActs.length)
        return res.json({ text: 'Sync eerst je trainingsdata om dagcoaching te activeren.', cached: false, empty: true });
      const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
      const dayAfter  = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);
      const tomorrowStr  = tomorrow.toISOString().split('T')[0];
      const dayAfterStr  = dayAfter.toISOString().split('T')[0];
      const compactState = {
        datum: todayStr,
        readiness: fullState?.readiness ? { total: fullState.readiness.total, interpretation: fullState.readiness.interpretation, breakdown: fullState.readiness.breakdown } : null,
        endurance: { atl: m.atl, ctl: m.ctl, tsb: m.tsb, acwr: m.acwr, monotony: m.monotony, strain: m.strain, weeklyLoad: m.weeklyLoad },
        overreaching: fullState?.overreaching ? { level: fullState.overreaching.level, flags: fullState.overreaching.flags } : null,
        ftp: fullState?.ftpInfo?.ftp || settings.ftp || null,
        zoneModel: fullState?.currentZoneModel ? { model: fullState.currentZoneModel.model, lowPct: fullState.currentZoneModel.lowPct, midPct: fullState.currentZoneModel.midPct, highPct: fullState.currentZoneModel.highPct } : null,
        strength: fullState?.strengthMetrics ? {
          daysSinceLastSession: fullState.strengthMetrics.daysSinceLastSession,
          weeklyLoad: fullState.strengthMetrics.weeklyLoad,
          avgWeeklyLoad4w: fullState.strengthMetrics.avgWeeklyLoad4w,
          muscleGroups: {
            lower_body: fullState.strengthMetrics.muscleGroups?.lower_body ? { daysSinceLastSession: fullState.strengthMetrics.muscleGroups.lower_body.daysSinceLastSession, trend: fullState.strengthMetrics.muscleGroups.lower_body.trend } : null,
            push: fullState.strengthMetrics.muscleGroups?.push ? { daysSinceLastSession: fullState.strengthMetrics.muscleGroups.push.daysSinceLastSession, trend: fullState.strengthMetrics.muscleGroups.push.trend } : null,
            pull: fullState.strengthMetrics.muscleGroups?.pull ? { daysSinceLastSession: fullState.strengthMetrics.muscleGroups.pull.daysSinceLastSession, trend: fullState.strengthMetrics.muscleGroups.pull.trend } : null
          },
          e1RMTrends: (fullState.strengthMetrics.e1RMTrends || []).slice(0,5).map(e => ({ exercise: e.exercise, recent: e.sessions?.slice(-2).map(s => ({ date: s.date, e1rm: s.e1rm })) || [] }))
        } : null,
        gewicht: { huidig: canonicalWeight ?? null, doel: canonicalWeightTarget },
        primairDoel: data.goals?.primary || null,
        weekplan: { vandaag: weekPlan[todayStr] || [], morgen: weekPlan[tomorrowStr] || [], overmorgen: weekPlan[dayAfterStr] || [] },
        recenteActiviteiten: recentActs.slice(0,3).map(a => ({ naam: a.name, type: a.type, datum: a.start_date?.split('T')[0], duur_min: Math.round((a.moving_time||0)/60), avg_watts: a.average_watts ? Math.round(a.average_watts) : null, tss: a.suffer_score || null })),
        notitie: data.quickNote || null
      };
      dataForHash = JSON.stringify(compactState);
      context = JSON.stringify(compactState);
      systemPrompt = `Je bent een persoonlijke, evidence-based wielercoach die in het Nederlands een korte dagbriefing schrijft voor de atleet. Je krijgt de actuele trainingsstaat als JSON. Antwoord UITSLUITEND met geldig JSON, zonder enige tekst eromheen, zonder markdown, zonder codeblok-backticks. Het JSON-object heeft exact deze velden:
{
  "kop": "een korte koptekst van 4 tot 8 woorden die de dag karakteriseert, zonder het accentwoord",
  "kopAccent": "één enkel woord dat het thema van de dag vat (bijvoorbeeld kwaliteit, herstel, volume, scherpte), dit woord wordt cursief benadrukt en mag NIET in het kop-veld voorkomen",
  "body": "twee tot drie zinnen met concrete getallen uit de data en precies één concrete aanbeveling voor vandaag. Gewone lopende tekst, geen opsomming.",
  "accents": ["een lijst van 2 tot 4 exacte tekstfragmenten die LETTERLIJK in body voorkomen en die visueel benadrukt moeten worden, bijvoorbeeld een wattage zoals 254W, een getal met eenheid zoals 60g carbs, of een metriek zoals TSB +4. Elk fragment moet een exacte substring van body zijn."]
}
De kop en kopAccent vormen samen een lopende zin: kop gevolgd door kopAccent. Voorbeeld: kop "Vandaag is een dag voor", kopAccent "kwaliteit". Gebruik concrete getallen uit de meegegeven staat in body. Verzin geen data die niet in de JSON staat.`;
      maxTokens = 400;
    }
    else if (page === 'integratie') {
      if (!fullState) return res.json({ text: 'Sync je data voor geïntegreerde analyse.', cached: false, empty: true });
      dataForHash = JSON.stringify({ m, sm: sm?.daysSinceLastSession, nutrToday: nutrition[todayStr], todayStr });
      context = `Datum: ${todayStr}
Duurtraining: ATL ${m.atl||'–'}, CTL ${m.ctl||'–'}, TSB ${m.tsb||'–'}, ACWR ${m.acwr||'–'}
Kracht (Hevy): ${sm?`${sm.daysSinceLastSession} dagen geleden, weekbelasting ${sm.weeklyLoad}`:'geen data'}
Voeding vandaag: ${nutrition[todayStr]?`${nutrition[todayStr].kcal||'–'} kcal, ${nutrition[todayStr].protein||'–'}g eiwit, ${nutrition[todayStr].carbs||'–'}g koolhydraten`:'niet gelogd'}
Gewicht: ${canonicalWeight||'–'} kg | Doel: ${canonicalWeightTarget} kg
Doel: ${data.goals?.primary||'–'}
Maaltijdtijden weekdag: ${JSON.stringify(mealTimings.weekday)}`;
      maxTokens = 400;
      systemPrompt += ' Geef een geïntegreerde daganalyse: hoe verhouden duur- en krachtbelasting zich, implicaties voor herstel, en hoe voeding de training optimaliseert. Antwoord in maximaal 200 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else if (page === 'activiteiten') {
      if (!recentActs.length) return res.json({ text: 'Geen activiteitendata beschikbaar voor analyse.', cached: false, empty: true });
      dataForHash = JSON.stringify({ acts: recentActs.slice(0,10).map(a=>a.id) });
      context = `Laatste 10 activiteiten:\n${recentActs.slice(0,10).map(a=>`${new Date(a.start_date).toLocaleDateString('nl-NL')}: ${a.type}, ${Math.round((a.moving_time||0)/60)}min, ${a.distance?(a.distance/1000).toFixed(1)+'km':'–'}, ${a.average_watts?Math.round(a.average_watts)+'W':'–'}, suffer=${a.suffer_score||'–'}`).join('\n')}
FTP: ${fullState?.ftpInfo?.ftp||settings.ftp||'–'}W | Doel: ${data.goals?.primary||'–'}`;
      systemPrompt += ' Analyseer de trainingsdistributie van de laatste 3 weken: intensiteitsverdeling (laag/middel/hoog), herstelpatronen, en concrete aanbevelingen voor de volgende sessie. Antwoord in maximaal 80 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else if (page === 'voeding') {
      if (!recentNutr.length) return res.json({ text: 'Log eerst voedingsdata om voedingsadvies te activeren.', cached: false, empty: true });
      dataForHash = JSON.stringify({ nutr: recentNutr.slice(0,7).map(([d])=>d) });
      const nutrLines = recentNutr.slice(0,7).map(([d,v])=>`${d}: ${v.kcal||'–'} kcal, ${v.protein||'–'}g eiwit, ${v.carbs||'–'}g koolhydraten, ${v.fat||'–'}g vet`).join('\n');
      const n7 = recentNutr.slice(0,7);
      const avgKcal = n7.length ? Math.round(n7.reduce((s,[,v])=>s+(v.kcal||0),0)/n7.length) : '–';
      const avgProt = n7.length ? Math.round(n7.reduce((s,[,v])=>s+(v.protein||0),0)/n7.length) : '–';
      context = `Voeding laatste 7 dagen:\n${nutrLines}\nGemiddeld: ${avgKcal} kcal/dag, ${avgProt}g eiwit/dag
Huidig gewicht: ${canonicalWeight||'–'} kg | Doel: ${canonicalWeightTarget} kg
Maaltijdtijden: ontbijt ${mealTimings.weekday.breakfast}, lunch ${mealTimings.weekday.lunch}, diner ${mealTimings.weekday.dinner}
CTL (activiteitenniveau): ${m.ctl||'–'}`;
      systemPrompt += ' Analyseer de voeding van de afgelopen week: eiwitinname vs. lichaamsgewicht, caloriebalans tov het doel, en geef concrete aanbevelingen voor timing en macroverdeling. Antwoord in maximaal 80 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else if (page === 'week') {
      if (!fullState) return res.json({ text: 'Sync trainingsdata om weekanalyse te genereren.', cached: false, empty: true });
      dataForHash = JSON.stringify({ m, todayStr });
      const n7 = recentNutr.slice(0,7);
      const avgKcalWk = n7.length ? Math.round(n7.reduce((s,[,v])=>s+(v.kcal||0),0)/n7.length) : '–';
      context = `Weekoverzicht — ${todayStr}:
ATL: ${m.atl||'–'} | CTL: ${m.ctl||'–'} | TSB: ${m.tsb||'–'} | ACWR: ${m.acwr||'–'} | Monotony: ${m.monotony||'–'}
Wekelijkse load: ${m.weeklyLoad||'–'} ETL | Overreaching: ${fullState?.overreaching?.level||'geen'}
Voeding deze week gem.: ${avgKcalWk} kcal/dag
Gewicht: ${canonicalWeight||'–'} kg | Doel: ${canonicalWeightTarget} kg
Trainingspatronen: ${(data.patterns||[]).map(p=>`${p.day}: ${p.type} ${p.duration}min`).join(', ')||'–'}
Doel: ${data.goals?.primary||'–'}`;
      systemPrompt += ' Geef een weekanalyse: belasting deze week tov chronische, ACWR acceptabel, sterkste en zwakste punten, en optimale focus voor de komende 7 dagen. Antwoord in maximaal 80 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else if (page === 'weekplanning') {
      maxTokens = 400;

      if (req.body?.generateSessions === true) {
        const result = await runWeekplanGeneration();
        return res.json(result);
      }
      // ── end generateSessions ───────────────────────────────────────────────

      const upcomingGym = Object.entries(weekPlan)
        .filter(([d]) => { const diff = (new Date(d)-new Date(todayStr))/86400000; return diff >= -1 && diff <= 7; })
        .sort(([a],[b]) => a.localeCompare(b))
        .flatMap(([d,ss]) => (ss||[]).filter(s=>s.type==='gym').map(s=>`${d}: gym ${s.split||'?'} ${s.duration}min`));
      const fourWeeksAgo = new Date(todayStr); fourWeeksAgo.setDate(fourWeeksAgo.getDate()-28);
      const recentHevy = (hevyWkts||[])
        .filter(w => new Date(w.start_time) >= fourWeeksAgo)
        .sort((a,b) => new Date(b.start_time)-new Date(a.start_time))
        .slice(0, 20)
        .map(w => `${w.start_time?.split('T')[0]||'–'}: ${w.name||'Workout'} ${w.duration_seconds?Math.round(w.duration_seconds/60)+'min':''}`);
      dataForHash = JSON.stringify({ weekPlan: Object.keys(weekPlan).sort().slice(-7), m, todayStr, hevyCount: recentHevy.length });
      context = `Datum: ${todayStr}
ATL: ${m.atl||'–'} | CTL: ${m.ctl||'–'} | TSB: ${m.tsb||'–'} | Overreaching: ${fullState?.overreaching?.level||'geen'}
Geplande gymsessies komende week:\n${upcomingGym.join('\n')||'Geen gymsessies gepland'}
Hevy workouts afgelopen 4 weken:\n${recentHevy.join('\n')||'Geen data'}
Trainingspatronen: ${(data.patterns||[]).map(p=>`${p.day}: ${p.type} ${p.duration}min`).join(', ')||'–'}
Doel: ${data.goals?.primary||'–'}`;
      systemPrompt = 'Je bent een periodiseringsexpert. De atleet volgt een vaste PPL-split (Push/Pull/Legs). Je mag de volgorde van gymdagen onderling aanpassen als dat beter uitkomt met de fietstrainingen (bijv. Legs niet de dag voor een zware fietsrit), maar plan altijd exact de gymsessies die al ingepland staan — nooit een andere split dan Push, Pull of Legs, nooit een extra gymsessie toevoegen of verwijderen. Je mag alleen fietstrainingen inplannen op dagen waar cycling=true staat in de beschikbaarheid. Houd rekening met het interferentierisico: plan geen zware fietstraining op de dag na een Legs-sessie, en verschuif bij voorkeur Legs naar na een rustdag of lichte fietsdag. Antwoord in maximaal 150 woorden. Geen inleiding, direct beginnen met de analyse.';
    }
    else if (page === 'trends') {
      if (acts.length < 10) return res.json({ text: 'Sync de volledige trainingshistory voor trendanalyse.', cached: false, empty: true });
      dataForHash = JSON.stringify({ ctl: m.ctl, atl: m.atl, todayStr, actsCount: acts.length });
      const n7 = recentNutr.slice(0,7);
      const avgKcal7 = n7.length ? Math.round(n7.reduce((s,[,v])=>s+(v.kcal||0),0)/n7.length) : '–';
      context = `Trainingsdata: ${acts.length} activiteiten totaal
ATL: ${m.atl||'–'} | CTL: ${m.ctl||'–'} | TSB: ${m.tsb||'–'}
Weekbelasting nu: ${m.weeklyLoad||'–'} ETL
FTP (rolling): ${fullState?.ftpInfo?.ftp||settings.ftp||'–'}W
Gewicht trend: ${recentWt.slice(0,4).map(([d,v])=>`${d}: ${v}kg`).join(', ')||'–'}
Voeding gem. (7d): ${avgKcal7} kcal/dag
Doel: ${data.goals?.primary||'–'}`;
      systemPrompt += ' Geef een trendanalyse: is fitheid (CTL) stijgend of dalend, wat zegt TSB over recente belasting, welke aanpassingen zijn aanbevolen voor het komende kwartaal? Antwoord in maximaal 80 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else if (page === 'voorspelling') {
      ttlHours = 24;
      if (acts.length < 30) return res.json({ text: 'Minimaal 30 activiteiten nodig voor betrouwbare prognose.', cached: false, empty: true });
      dataForHash = JSON.stringify({ ctl: m.ctl, actsCount: acts.length, todayStr, goals: data.goals });
      context = `Trainingsdata: ${acts.length} activiteiten
Huidige status: CTL ${m.ctl||'–'}, ATL ${m.atl||'–'}, TSB ${m.tsb||'–'}
FTP: ${fullState?.ftpInfo?.ftp||settings.ftp||'–'}W
Gewicht: ${canonicalWeight||'–'} kg | Doel: ${canonicalWeightTarget} kg
Tijdlijn: ${data.goals?.timeline||'–'} | Doel: ${data.goals?.primary||'–'}`;
      maxTokens = 500;
      systemPrompt += ' Geef een 12-weken prognose: verwachte CTL-groei bij consistent trainen, wanneer bereikt de atleet de doelen, welke risico\'s (overtraining, blessure) verwacht je? Geef streefwaarden (CTL, gewicht, FTP) per maand. Antwoord in maximaal 200 woorden. Geen inleiding, geen afsluiting, direct to the point.';
    }
    else {
      return res.status(400).json({ error: 'Onbekende pagina: ' + page });
    }

    // ── Gedeelde plan-context: injecteer het deterministische plan als vaste input ──
    const PLAN_INJECT_PAGES = new Set(['vandaag', 'integratie', 'activiteiten', 'voeding', 'week', 'weekplanning', 'trends', 'voorspelling']);
    if (PLAN_INJECT_PAGES.has(page)) {
      const planInfo = buildPrescriptionBlock(weekPlan, data.planSkeleton, todayStr);
      if (planInfo.active) {
        context      = planInfo.text + '\n\n' + context;
        systemPrompt = PLAN_PREAMBLE + '\n' + systemPrompt + (PLAN_PAGE_TASKS[page] ? '\n' + PLAN_PAGE_TASKS[page] : '');
        dataForHash += '|plan:' + planInfo.seed;
        dataForHash += '|w:' + (canonicalWeight || '');
        maxTokens    = Math.max(maxTokens, 220);
      }
    }

    // Cache check
    const hash = simpleHash(dataForHash);
    const cached = data.aiInsights[page];
    if (!force && cached && cached.hash === hash && (Date.now() - cached.ts) < ttlHours * 3600000) {
      const hit = cached.briefing ? { briefing: cached.briefing, text: cached.text } : { text: cached.text };
      return res.json({ ...hit, cached: true, cachedAt: cached.ts });
    }

    // Check API key
    if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('jouw')) {
      return res.json({ text: 'ANTHROPIC_API_KEY niet ingesteld in .env.', cached: false, empty: true });
    }

    // Call Claude
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: context }]
    }, {
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }
    });

    const text = resp.data.content?.[0]?.text || 'Geen inzicht gegenereerd.';

    let payload = { text };
    if (page === 'vandaag') {
      const parsed = parseBriefingJSON(text);
      if (parsed) payload = { briefing: parsed, text: parsed.body };
    }

    const freshUser = await getDefaultUser();
    const updatedInsights = { ...(freshUser.ai_insights || {}) };
    updatedInsights[page] = { ...payload, hash, ts: Date.now() };
    await saveUserFields(freshUser.id, { ai_insights: updatedInsights });

    res.json({ ...payload, cached: false });
  } catch(err) {
    console.error('insights error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Inzicht genereren mislukt: ' + (err.response?.data?.error?.message || err.message) });
  }
});

// ── Goals endpoint ────────────────────────────────────────────────────────────

app.post('/api/goals', async (req, res) => {
  try {
    const user = await getDefaultUser();
    const goals = { ...(user.goals || {}), ...req.body };
    await saveUserFields(user.id, { goals });
    res.json({ ok: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── Week plan generation ──────────────────────────────────────────────────────

  function buildAvailDays(weekAvailability, patterns) {
    const dayOrder = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    const legsDays = new Set(
      (patterns || [])
        .filter(p => p.type === 'gym' && p.split === 'legs')
        .map(p => (p.day || '').toLowerCase())
    );
    function maxZoneForDate(dateStr) {
      const name = dayNameFromDate(dateStr);
      const idx  = dayOrder.indexOf(name);
      if (idx < 0) return 5;
      if (legsDays.has(name)) return 2;
      if (legsDays.has(dayOrder[(idx + 6) % 7])) return 2;
      if (legsDays.has(dayOrder[(idx + 5) % 7])) return 3;
      return 5;
    }
    // Plan is vooruitkijkend: alleen vandaag en verder voorschrijven.
    // UTC-ISO, consistent met getISOWeekBounds / reconcilePrescriptions.
    const todayISO = new Date().toISOString().split('T')[0];
    return Object.entries(weekAvailability)
      .filter(([date, v]) => v.cycling && date >= todayISO)
      .map(([date, v]) => ({ date, maxDuration: v.maxDuration || 90, maxZone: maxZoneForDate(date) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async function runWeekplanGeneration() {
    const user = await getDefaultUser();
    const [allActivities, hevyWorkouts, weight, nutrition, sleep] = await Promise.all([
      getActivities(user.id),
      getHevyWorkouts(user.id),
      getWeightMap(user.id),
      getNutrition(user.id),
      getSleep(user.id),
    ]);
    const settings         = user.settings          || {};
    const weekAvailability = user.week_availability || {};
    const goals            = user.goals             || {};
    const patterns         = user.patterns          || [];

    const availDays = buildAvailDays(weekAvailability, patterns);
    if (!availDays.length) return { sessions: [], message: 'Geen beschikbare fietsdagen ingesteld.' };

    const engineData = { sleep, goals, patterns, weekAvailability };
    const state = engine.computeFullState(allActivities, hevyWorkouts, weight, nutrition,
                                          user.week_plan || {}, settings, engineData);

    const ftp    = state.ftpInfo?.ftp || settings.ftp || 280;
    const params = await getAthleteParams(user.id);

    const plan = buildPlan({
      goals,
      metrics:       state.enduranceMetrics || { ctl: 0, atl: 0, tsb: 0, acwr: 0 },
      currentWeight: state.currentWeight || 80,
      availDays,
      ftp,
      settings,
    }, params);

    // Defensieve write: verse user vlak voor de merge.
    const freshUser = await getDefaultUser();
    const updatedWp = { ...(freshUser.week_plan || {}) };
    Object.entries(plan.sessions).forEach(([date, newSessions]) => {
      const kept = (updatedWp[date] || []).filter(x =>
        x.type !== 'cycling' || x.unplanned || x.completionScore !== undefined || x.missed
      );
      updatedWp[date] = [...kept, ...newSessions];
    });
    const planInvalidatePages = ['vandaag', 'integratie', 'activiteiten', 'voeding', 'week', 'weekplanning', 'trends', 'voorspelling'];
    const wipedInsights = { ...(freshUser.ai_insights || {}) };
    planInvalidatePages.forEach(k => { delete wipedInsights[k]; });
    await saveUserFields(freshUser.id, { week_plan: updatedWp, plan_skeleton: plan.skeleton, ai_insights: wipedInsights });

    // Prescriptions verrijken met run-id en belief-state, dan wegschrijven.
    const runId = crypto.randomUUID();
    const plannerParams = {
      athleteParams: params,
      metricsAtPlan: state.enduranceMetrics
        ? { ctl: state.enduranceMetrics.ctl, atl: state.enduranceMetrics.atl,
            tsb: state.enduranceMetrics.tsb, acwr: state.enduranceMetrics.acwr }
        : null,
      skeleton: plan.skeleton,
    };
    for (const p of plan.prescriptions) {
      try {
        await insertPrescription(freshUser.id, { ...p, plan_run_id: runId, planner_params: plannerParams });
      } catch (e) {
        console.error('insertPrescription mislukt:', e.message);
      }
    }

    return { sessions: Object.values(plan.sessions).flat(), skeleton: plan.skeleton };
  }

function dayNameFromDate(dateStr) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date(dateStr + 'T12:00:00').getDay()];
}

app.post('/api/weekplan/generate', async (req, res) => {
    try {
      const result = await runWeekplanGeneration();
      res.json(result);
    } catch (err) {
      console.error('/api/weekplan/generate:', err.message, err.stack);
      res.status(500).json({ error: err.message });
    }
  });

// ── Strava Webhooks ───────────────────────────────────────────────────────────

app.get('/webhook/strava', (req, res) => {
  const verifyToken = process.env.STRAVA_VERIFY_TOKEN;
  if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === verifyToken) {
    return res.status(200).json({ 'hub.challenge': req.query['hub.challenge'] });
  }
  res.sendStatus(403);
});

app.post('/webhook/strava', (req, res) => {
  res.status(200).send('OK');

  const { object_type, aspect_type, object_id } = req.body || {};
  if (object_type !== 'activity' || (aspect_type !== 'create' && aspect_type !== 'update')) return;

  (async () => {
    try {
      if (aspect_type === 'create') {
        const user = await getDefaultUser();
        const userId = user.id;
        const token = await getStravaToken();
        const { data: activity } = await axios.get(
          `https://www.strava.com/api/v3/activities/${object_id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const existingActivities = await getActivities(userId);
        if (!existingActivities.some(a => a.id === activity.id)) {
          assignPowerSource(activity);
          await upsertActivity(userId, activity);

          const allActivities = await getActivities(userId);
          const calibration = engine.computeCalibrationFactor(allActivities, user.settings || {});
          await saveUserFields(userId, {
            settings:    { ...(user.settings || {}), sufferToTSSFactor: calibration.factor, lastSync: new Date().toISOString() },
            calibration,
          });

          // Naweeën — verse user na cache-invalidatie door saveUserFields
          const freshUser = await getDefaultUser();
          const [hevyWorkouts, weight, nutrition, sleep] = await Promise.all([
            getHevyWorkouts(userId),
            getWeightMap(userId),
            getNutrition(userId),
            getSleep(userId),
          ]);
          const data = {
            activityCache: { lastSync: freshUser.settings?.lastSync, activities: allActivities },
            hevyWorkouts,
            weight,
            nutrition,
            sleep,
            weekPlan:         freshUser.week_plan         || {},
            settings:         freshUser.settings          || {},
            calibration:      freshUser.calibration        || { factor: 1.0, count: 0, reliable: false },
            goals:            freshUser.goals              || {},
            patterns:         freshUser.patterns           || [],
            aiInsights:       freshUser.ai_insights        || {},
            weekAvailability: freshUser.week_availability  || {},
          };

          const wp1 = await matchPlannedToActual(data);
          data.weekPlan = wp1;

          let wbState = {};
          let finalWeekPlan = wp1;
          try {
            wbState = engine.computeFullState(allActivities, data.hevyWorkouts, data.weight, data.nutrition, data.weekPlan, data.settings, data);
            finalWeekPlan = await adjustCurrentWeek(data, wbState);
          } catch(e) { console.warn('adjustCurrentWeek (webhook):', e.message); }

          await saveUserFields(userId, { week_plan: finalWeekPlan });
          try { await reconcilePrescriptions(data, wbState, userId); } catch(e) { console.warn('reconcile (webhook):', e.message); }
        }
      }
    } catch (err) {
      console.error('Webhook verwerking mislukt:', err.message);
    }
  })();
});

app.get('/activity/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'activity-detail', 'dist', 'index.html'));
});

app.get('/workout/:id', (req, res) => {
  res.sendFile('index.html', { root: path.join(__dirname, 'public') });
});

// ── Eenmalige migratie: data.json → Postgres ──────────────────────────────────
app.post('/api/admin/migrate-to-postgres', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'Geen database geconfigureerd' });
  if (req.body?.confirm !== 'MIGRATE') return res.status(400).json({ error: 'Bevestiging vereist' });
  if (!process.env.AUTH_USERNAME || !process.env.AUTH_PASSWORD_HASH) {
    return res.status(500).json({ error: 'AUTH_USERNAME of AUTH_PASSWORD_HASH niet geconfigureerd' });
  }

  const data = await loadData();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Stap A: gebruiker seeden
    const userResult = await client.query(
      `INSERT INTO users (username, password_hash, goals, patterns, settings, week_plan, ai_insights, week_availability, calibration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (username) DO UPDATE SET
         goals             = EXCLUDED.goals,
         patterns          = EXCLUDED.patterns,
         settings          = EXCLUDED.settings,
         week_plan         = EXCLUDED.week_plan,
         ai_insights       = EXCLUDED.ai_insights,
         week_availability = EXCLUDED.week_availability,
         calibration       = EXCLUDED.calibration
       RETURNING id`,
      [
        process.env.AUTH_USERNAME,
        process.env.AUTH_PASSWORD_HASH,
        JSON.stringify(data.goals            || {}),
        JSON.stringify(data.patterns         || []),
        JSON.stringify(data.settings         || {}),
        JSON.stringify(data.weekPlan         || {}),
        JSON.stringify(data.aiInsights       || {}),
        JSON.stringify(data.weekAvailability || {}),
        JSON.stringify(data.calibration      || {}),
      ]
    );
    const userId = userResult.rows[0].id;

    // Stap B: activiteiten
    let activities = 0;
    for (const a of (data.activityCache?.activities || [])) {
      const mmpVal = data.mmpCache?.[String(a.id)] ? JSON.stringify(data.mmpCache[String(a.id)]) : null;
      await client.query(
        `INSERT INTO activities
           (user_id, strava_id, start_date, type, moving_time, average_watts,
            weighted_average_watts, suffer_score, device_watts, power_source,
            tss, tss_source, raw, mmp, streams)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (user_id, strava_id) DO UPDATE SET
           start_date             = EXCLUDED.start_date,
           type                   = EXCLUDED.type,
           moving_time            = EXCLUDED.moving_time,
           average_watts          = EXCLUDED.average_watts,
           weighted_average_watts = EXCLUDED.weighted_average_watts,
           suffer_score           = EXCLUDED.suffer_score,
           device_watts           = EXCLUDED.device_watts,
           power_source           = EXCLUDED.power_source,
           tss                    = EXCLUDED.tss,
           tss_source             = EXCLUDED.tss_source,
           raw                    = EXCLUDED.raw,
           mmp                    = EXCLUDED.mmp,
           streams                = EXCLUDED.streams`,
        [
          userId, a.id, a.start_date, a.type, a.moving_time,
          a.average_watts, a.weighted_average_watts, a.suffer_score,
          a.device_watts, a.powerSource,
          a.tss ?? null, a.tss_source ?? null,
          JSON.stringify(a), mmpVal, null,
        ]
      );
      activities++;
    }

    // Stap C: gewicht
    let weights = 0;
    for (const [date, value] of Object.entries(data.weight || {})) {
      const kg = parseFloat(value);
      if (isNaN(kg)) continue;
      await client.query(
        `INSERT INTO weights (user_id, date, weight_kg, source)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg, source = EXCLUDED.source`,
        [userId, date, kg, null]
      );
      weights++;
    }

    // Stap D: slaap
    let sleep = 0;
    for (const [date, obj] of Object.entries(data.sleep || {})) {
      await client.query(
        `INSERT INTO sleep (user_id, date, hours, quality, source)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, date) DO UPDATE SET hours = EXCLUDED.hours, quality = EXCLUDED.quality, source = EXCLUDED.source`,
        [userId, date, obj.hours, obj.quality ?? null, obj.source ?? null]
      );
      sleep++;
    }

    // Stap E: voeding
    let nutrition = 0;
    for (const [date, obj] of Object.entries(data.nutrition || {})) {
      await client.query(
        `INSERT INTO nutrition (user_id, date, kcal, protein_g, carbs_g, fat_g, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (user_id, date) DO UPDATE SET
           kcal      = EXCLUDED.kcal,
           protein_g = EXCLUDED.protein_g,
           carbs_g   = EXCLUDED.carbs_g,
           fat_g     = EXCLUDED.fat_g,
           raw       = EXCLUDED.raw`,
        [userId, date, obj.kcal ?? null, obj.protein ?? null, obj.carbs ?? null, obj.fat ?? null, JSON.stringify(obj)]
      );
      nutrition++;
    }

    // Stap F: Hevy workouts
    let hevy = 0;
    for (const w of (data.hevyWorkouts || [])) {
      await client.query(
        `INSERT INTO hevy_workouts (user_id, hevy_id, start_date, raw)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, hevy_id) DO UPDATE SET start_date = EXCLUDED.start_date, raw = EXCLUDED.raw`,
        [userId, w.id, w.start_time, JSON.stringify(w)]
      );
      hevy++;
    }

    await client.query('COMMIT');
    res.json({ ok: true, user_id: userId, activities, weights, sleep, nutrition, hevy });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('migrate-to-postgres mislukt:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

(async () => {
  try {
    const data = await loadData();
    const versionBefore = data.schemaVersion;
    migrateData(data);

    // Eenmalige backfill powerSource voor gecachte activiteiten
    let backfilled = 0;
    (data.activityCache?.activities || []).forEach(a => {
      if (a.powerSource !== undefined) return;
      assignPowerSource(a);
      backfilled++;
    });
    if (backfilled > 0) console.info(`Startup backfill: powerSource gezet voor ${backfilled} activiteiten`);

    if (data.schemaVersion !== versionBefore || backfilled > 0) await saveData(data);
  } catch(e) { console.error('Startup migratie mislukt:', e.message); }
})();

app.listen(PORT, () => {
  console.log(`\n⚡ Training Dashboard draait op http://localhost:${PORT}\n`);
  if (!process.env.STRAVA_CLIENT_SECRET || process.env.STRAVA_CLIENT_SECRET.includes('jouw')) console.warn('⚠️  Strava credentials niet ingesteld');
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('jouw')) console.warn('⚠️  Anthropic API key niet ingesteld');
  if (!AUTH_USERNAME || !AUTH_PASSWORD_HASH || !JWT_SECRET) console.warn('⚠️  AUTH_USERNAME / AUTH_PASSWORD_HASH / JWT_SECRET niet volledig ingesteld — auth uitgeschakeld');
  console.info(`Auth bypass: ${BYPASS_IPS.length} IP('s) geconfigureerd`);
  console.info(`Database: ${process.env.DATABASE_URL ? 'DATABASE_URL geconfigureerd' : 'geen DATABASE_URL — JSON-bestand is enige bron van waarheid'}`);
  initSchema().catch(err => console.error('DB schema-initialisatie mislukt:', err.message));
});
