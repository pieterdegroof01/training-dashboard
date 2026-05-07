require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const engine = require('./engine');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

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
      settings: { unreliablePowerStart: '2020-01-01', unreliablePowerEnd: '2020-12-31', ftp: 280 }
    };
  }
}

async function saveData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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

// ── ATL / CTL / TSB ───────────────────────────────────────────────────────────

function estimateLoad(activity, settings) {
  const durationH = (activity.moving_time || 0) / 3600;
  const date = activity.start_date?.split('T')[0] || '';
  const inUnreliable = date >= (settings?.unreliablePowerStart || '2020-01-01') &&
                       date <= (settings?.unreliablePowerEnd || '2020-12-31');

  if (activity.suffer_score > 0) return activity.suffer_score;

  if (activity.average_watts && !inUnreliable) {
    const IF = activity.average_watts / (settings?.ftp || 280);
    return Math.min(Math.round(IF * IF * durationH * 100), 400);
  }

  const mult = { Ride: 55, VirtualRide: 50, Run: 75, WeightTraining: 45, Swim: 65, Hike: 35, Walk: 20 };
  return Math.round(durationH * (mult[activity.type] || 40));
}

function calcMetrics(activities, settings) {
  const dailyLoad = {};
  activities.forEach(a => {
    const d = a.start_date?.split('T')[0];
    if (d) dailyLoad[d] = (dailyLoad[d] || 0) + estimateLoad(a, settings);
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
    .filter(a => {
      const d = a.start_date?.split('T')[0] || '';
      return !(d >= settings.unreliablePowerStart && d <= settings.unreliablePowerEnd);
    })
    .sort((a, b) => b.average_watts - a.average_watts)
    .slice(0, 5)
    .map(a => ({ datum: a.start_date?.split('T')[0], naam: a.name, watt: Math.round(a.average_watts), duur_min: Math.round(a.moving_time / 60) }));

  return { maandelijks: summary.slice(-24), topVermogen: topWatt };
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
    const token = await getStravaToken();
    const after = Math.floor((Date.now() - 21 * 86400000) / 1000);
    const resp = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
      headers: { Authorization: `Bearer ${token}` },
      params: { after, per_page: 50 }
    });
    res.json(resp.data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Full sync — call once manually, then incremental
app.post('/api/strava/sync-all', async (req, res) => {
  try {
    const token = await getStravaToken();
    const data = await loadData();
    const cache = data.activityCache || { lastSync: null, activities: [] };
    let newActs;

    if (cache.lastSync && cache.activities.length > 0) {
      const afterTs = Math.floor(new Date(cache.lastSync).getTime() / 1000);
      newActs = await fetchActivitiesFromStrava(token, afterTs);
      const existingIds = new Set(cache.activities.map(a => a.id));
      const toAdd = newActs.filter(a => !existingIds.has(a.id));
      cache.activities = [...toAdd, ...cache.activities];
    } else {
      newActs = await fetchActivitiesFromStrava(token);
      cache.activities = newActs;
    }

    cache.lastSync = new Date().toISOString();
    data.activityCache = cache;
    await saveData(data);
    res.json({ total: cache.activities.length, new: newActs?.length || 0, lastSync: cache.lastSync });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/strava/history-summary', async (req, res) => {
  try {
    const data = await loadData();
    const activities = data.activityCache?.activities || [];
    const settings = data.settings || {};
    const metrics = calcMetrics(activities, settings);
    const summary = buildHistorySummary(activities, settings);
    res.json({ total: activities.length, lastSync: data.activityCache?.lastSync, metrics, summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/charts/data', async (req, res) => {
  try {
    const data = await loadData();
    const activities = data.activityCache?.activities || [];
    const settings = data.settings || {};
    const cfg = { ftp: settings.ftp || 280, unreliablePowerStart: settings.unreliablePowerStart || '2020-01-01', unreliablePowerEnd: settings.unreliablePowerEnd || '2020-12-31' };

    // ── Weight series (all entries, sorted) ───────────────────────────────────
    const weightSeries = Object.entries(data.weight || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, kg]) => ({ date, kg: parseFloat(kg) }));

    // ── ATL/CTL/TSB last 120 days ─────────────────────────────────────────────
    const dailyLoad = {};
    activities.forEach(a => {
      const d = a.start_date?.split('T')[0];
      if (d) dailyLoad[d] = (dailyLoad[d] || 0) + estimateLoad(a, cfg);
    });

    const k7 = 1 - Math.exp(-1 / 7);
    const k42 = 1 - Math.exp(-1 / 42);
    const allDates = Object.keys(dailyLoad).sort();
    if (allDates.length) {
      let atl = 0, ctl = 0;
      const start = new Date(allDates[0]);
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 120);
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

    // ── Weekly volume last 52 weeks ───────────────────────────────────────────
    const weeklyMap = {};
    activities.forEach(a => {
      const d = new Date(a.start_date);
      const dow = (d.getDay() + 6) % 7;
      const mon = new Date(d); mon.setDate(d.getDate() - dow);
      const wk = mon.toISOString().split('T')[0];
      if (!weeklyMap[wk]) weeklyMap[wk] = { sessions: 0, hours: 0, km: 0, gym: 0 };
      weeklyMap[wk].sessions++;
      weeklyMap[wk].hours += (a.moving_time || 0) / 3600;
      weeklyMap[wk].km += (a.distance || 0) / 1000;
      if (a.type === 'WeightTraining') weeklyMap[wk].gym++;
    });
    const weekCutoff = new Date(); weekCutoff.setDate(weekCutoff.getDate() - 52 * 7);
    const weeklyVolume = Object.entries(weeklyMap)
      .filter(([wk]) => new Date(wk) >= weekCutoff)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([wk, v]) => ({ week: wk, sessions: v.sessions, hours: Math.round(v.hours * 10) / 10, km: Math.round(v.km), gym: v.gym }));

    // ── Nutrition last 60 days ────────────────────────────────────────────────
    const nutrCutoff = new Date(); nutrCutoff.setDate(nutrCutoff.getDate() - 60);
    const nutritionSeries = Object.entries(data.nutrition || {})
      .filter(([d]) => new Date(d) >= nutrCutoff)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, v]) => ({ date, kcal: parseInt(v.kcal) || 0, protein: parseInt(v.protein) || 0, carbs: parseInt(v.carbs) || 0, fat: parseInt(v.fat) || 0 }))
      .filter(v => v.kcal > 0);

    // ── Monthly power trend (excluding unreliable period) ─────────────────────
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

    // ── Monthly weight avg (for long-term trend) ──────────────────────────────
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
      weightSeries: weightSeries.slice(-365),  // max 1 year daily
      weightMonthly,
      loadSeries: res.locals.loadSeries || [],
      weeklyVolume,
      nutritionSeries,
      powerTrend,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


app.get('/api/hevy/workouts', async (req, res) => {
  try {
    if (!process.env.HEVY_API_KEY) return res.json([]);
    const resp = await axios.get('https://api.hevyapp.com/v1/workouts', {
      headers: { 'api-key': process.env.HEVY_API_KEY },
      params: { page: 1, pageSize: 10 }
    });
    res.json(resp.data.workouts || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/nutrition/parse-screenshot', upload.single('screenshot'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen afbeelding ontvangen' });
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });
    const base64 = req.file.buffer.toString('base64');
    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514', max_tokens: 200,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: req.file.mimetype, data: base64 } },
        { type: 'text', text: 'Screenshot van voedingsapp. Extraheer totale dagwaarden. Antwoord ALLEEN met JSON: {"kcal": 2100, "protein": 165, "carbs": 220, "fat": 65}' }
      ]}]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
    const text = resp.data.content[0].text.trim().replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (err) { res.status(500).json({ error: 'Verwerking mislukt: ' + err.message }); }
});

// ── Historisch gewicht importeren (Garmin Connect CSV) ────────────────────────

app.post('/api/weight/import', upload.single('csvfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen' });

    const text = req.file.buffer.toString('utf8').replace(/\r/g, '');
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return res.status(400).json({ error: 'Bestand lijkt leeg' });

    const header = lines[0].replace(/"/g, '').split(',').map(h => h.trim().toLowerCase());
    const dateIdx = header.findIndex(h => h.includes('date') || h === 'datum');
    const weightIdx = header.findIndex(h =>
      h === 'weight' || h === 'gewicht' || h === 'weight (kg)' || h === 'weight (lbs)' ||
      (h.includes('weight') && !h.includes('body') && !h.includes('bone') && !h.includes('muscle'))
    );

    if (dateIdx === -1 || weightIdx === -1) {
      return res.status(400).json({ error: `Kolommen niet gevonden. Gevonden: ${header.join(', ')}` });
    }

    const samples = lines.slice(1, 20).map(l => parseFloat(l.replace(/"/g,'').split(',')[weightIdx])).filter(n => !isNaN(n));
    const median = samples.sort((a,b)=>a-b)[Math.floor(samples.length/2)];
    const isLbs = median > 150;

    const imported = {};
    let skipped = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].replace(/"/g, '').split(',');
      if (cols.length <= Math.max(dateIdx, weightIdx)) continue;
      const rawDate = cols[dateIdx]?.trim();
      const rawWeight = cols[weightIdx]?.trim();
      if (!rawDate || !rawWeight) continue;

      let dateKey = null;
      const isoM = rawDate.match(/(\d{4})-(\d{2})-(\d{2})/);
      const euM  = rawDate.match(/(\d{2})-(\d{2})-(\d{4})/);
      const usM  = rawDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (isoM) dateKey = `${isoM[1]}-${isoM[2]}-${isoM[3]}`;
      else if (euM) dateKey = `${euM[3]}-${euM[2]}-${euM[1]}`;
      else if (usM) dateKey = `${usM[3]}-${usM[1]}-${usM[2]}`;
      if (!dateKey) { skipped++; continue; }

      let weight = parseFloat(rawWeight);
      if (isNaN(weight) || weight < 20 || weight > 400) { skipped++; continue; }
      if (isLbs) weight = Math.round(weight * 0.453592 * 10) / 10;
      else weight = Math.round(weight * 10) / 10;
      if (!imported[dateKey]) imported[dateKey] = String(weight);
    }

    const count = Object.keys(imported).length;
    if (count === 0) return res.status(400).json({ error: `Geen geldige metingen gevonden. ${skipped} regels overgeslagen.` });

    const data = await loadData();
    const existing = data.weight || {};
    data.weight = { ...imported, ...existing }; // existing always wins
    await saveData(data);

    const sorted = Object.keys(imported).sort();
    res.json({
      imported: count, skipped,
      total: Object.keys(data.weight).length,
      oldest: sorted[0], newest: sorted[sorted.length - 1],
      unit: isLbs ? 'lbs omgezet naar kg' : 'kg',
    });
  } catch (err) { res.status(500).json({ error: 'Import mislukt: ' + err.message }); }
});

app.post('/api/analyse', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'Anthropic API key niet ingesteld' });

    const { hevyWorkouts, goals, patterns, nutrition, weight, weekPlan, todayNote, athlete } = req.body;
    const data = await loadData();
    const allActivities = data.activityCache?.activities || [];
    const settings = data.settings || {};

    // ── DETERMINISTIC LAYER — engine berekent alle metrics ──────────────────
    const state = engine.computeFullState(allActivities, hevyWorkouts || [], weight || {}, nutrition || {}, weekPlan || {}, settings);

    const ninetyAgo = new Date(); ninetyAgo.setDate(ninetyAgo.getDate() - 90);
    const recent90 = allActivities
      .filter(a => new Date(a.start_date) >= ninetyAgo)
      .map(a => {
        const date = a.start_date?.split('T')[0] || '';
        const inUnreliable = engine.isUnreliablePower(date, settings);
        const ftp = engine.ftpForDate(allActivities, settings, date);
        const zone = engine.activityZoneClassification({ ...a, _unreliablePower: inUnreliable }, ftp, 197);
        return {
          datum: date, type: a.type, naam: a.name,
          afstand_km: a.distance ? +(a.distance / 1000).toFixed(1) : null,
          duur_min: a.moving_time ? Math.round(a.moving_time / 60) : null,
          hoogtemeters: a.total_elevation_gain || null,
          watt: a.average_watts ? (inUnreliable ? 'ONBETROUWBAAR' : Math.round(a.average_watts)) : null,
          NP: a.weighted_average_watts && !inUnreliable ? Math.round(a.weighted_average_watts) : null,
          hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          zone: zone.zone, IF: zone.IF || null,
          etl: state.dailyETL[date] ? Math.round(state.dailyETL[date]) : null
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

    const literature = data.literature || [];
    const literatureContext = literature.length
      ? literature.map(l => `--- ${l.title} ---\n${l.content}`).join('\n\n')
      : 'Geen literatuur toegevoegd door gebruiker.';

    const prompt = `Je bent een sport- en voedingswetenschappelijk onderlegde coach. Je werkt met een geïntegreerd datasysteem dat alle relevante bronnen combineert: duuractiviteiten, krachttraining, lichaamsgewicht, voeding, planning en historische voortgang. De kracht van jouw analyse zit niet in losse interpretatie van elke bron, maar in het leggen van verbanden tussen bronnen.

Een deterministische rekenmodule heeft ETL, ATL, CTL, TSB, ACWR, monotony, strain, readiness, FTP, zone-verdeling, trainingsmodel-classificatie, plateau-detectie en het persoonlijke responsmodel reeds berekend. Schat deze waarden NIET zelf opnieuw — gebruik ze direct als feiten en redeneer over wat ze betekenen.

Redeneer altijd volgens dit patroon: OBSERVATIE → MECHANISME → IMPACT → ACTIE.

═══════════════════════════════════════════════════════════
WETENSCHAPPELIJK KADER
═══════════════════════════════════════════════════════════

TRAININGSBELASTING & ADAPTATIE
Banister-impulsresponsmodel: TSB = CTL − ATL. Optimum −10 tot +10. ACWR optimaal 0,8–1,3 (Gabbett 2016, BJSM); >1,5 verhoogt blessurerisico significant. Monotony >2,0 = onvoldoende variatie (Foster, MSSE 1998); strain = monotony × weekload. Periodisering volgens Issurin (blokmodel) en Seiler (polarized).

INTENSITEITSVERDELING
Polarized model (Seiler 2010, IJSPP): ~80% laag (Z1-Z2 onder VT1/LT1), <5% mid (Z3 sweet spot), 15-20% hoog (Z4-Z5). Sweet spot training (Z3) genereert hoge cumulatieve vermoeidheid zonder proportionele adaptatie ("grey zone trap"). Pyramidal: gelijkmatige aflopende verdeling, geschikt voor base-bouw. Threshold-heavy: hoog grey-zone aandeel = stagnatie- en overreaching-risico. Z2 stimuleert mitochondriale biogenese via PGC-1α (AMPK-pad), vetoxidatie, type I vezeladaptatie. Z4-Z5: VO2max, lactaatmetabolisme, slagvolume cardiale hypertrofie.

CONCURRENT TRAINING
AMPK (geactiveerd door duur) remt mTORC1 → reduceert MPS. Krachttraining activeert mTOR via PI3K/Akt en mechanotransductie (FAK). Volume duurtraining is sterkere moderator dan intensiteit (Wilson 2012, JSCR meta-analyse). Modererende factoren: kracht vóór duur, ≥6u herstelwindow, fietsen veroorzaakt minder mechanische interferentie dan hardlopen. Voor ex-wielrenners: aerobe base intact, type II rekrutering door gym is complementair niet-competitief.

VOEDING TIJDENS CUT
Helms 2014 (IJSNEM): eiwit 2,3–3,1 g/kg/dag bij cut. Per maaltijd ≥0,3-0,4 g/kg voor leucinedrempel (Witard 2014). Distributie over 4-5 maaltijden > zelfde totaal in minder maaltijden (Moore 2012, J Physiol). Pre-sleep 40g caseïne verhoogt overnacht MPS (Res 2012). Caloriedeficit max 0,5-1% lichaamsgewicht/week voor spierbehoud. Energy availability >30 kcal/kg LBM/dag essentieel (Loucks 2004). Train-low strategie: lage glycogeenreserves bij Z2 versterkt PGC-1α; bij Z4+ altijd carb-loaded.

WIELRENFYSIOLOGIE
W/kg-ratio = functionele prestatiemaat. CP/W'-model: CP = duurzame ondergrens, W' = anaerobe capaciteit boven CP. FTP ≈ 0,95 × CP. Plasma volume daalt binnen weken bij detraining; herstel via "muscle memory" (myonuclei-persistentie).

═══════════════════════════════════════════════════════════
GEÏNTEGREERDE DATA-INSIGHTS — GEBRUIK DEZE KRUISVERBANDEN
═══════════════════════════════════════════════════════════

Het systeem bevat data van zes onderling verbonden domeinen. Elke analyse moet expliciet verbanden leggen:
• ENERGIE × GEWICHT × PERFORMANCE: Verlies de atleet te snel of te langzaam volgens Helms? Hoe correleert recente caloriebalans met TSB-trend en zone-verdeling? Daalt absoluut vermogen sneller dan op basis van enkel gewichtsverlies te verwachten zou zijn (signaal van LBM-verlies)?
• TRAININGSVERDELING × VOEDING: Bij hoog Z4-Z5 aandeel — was er adequate koolhydraatinname? Bij hoog Z2-volume — past dit bij actuele energiebeschikbaarheid?
• KRACHT × DUUR × HERSTEL: Vallen krachtsessies binnen 6u na duurtraining? Komt het concurrent training-volume historisch overeen met perioden van progressie of stagnatie?
• HISTORISCHE RESPONS: In welke TSB-range presteerde deze atleet historisch het best? Welke load-tolerance is empirisch zichtbaar?

═══════════════════════════════════════════════════════════
DOOR GEBRUIKER AANGELEVERDE LITERATUUR
═══════════════════════════════════════════════════════════
${literatureContext}

═══════════════════════════════════════════════════════════
ATLETENPROFIEL
═══════════════════════════════════════════════════════════
${athlete?.firstname || 'Pieter'} ${athlete?.lastname || ''} | 23 jaar | 188cm | huidig: ${state.currentWeight}kg | doel: ${goals?.weightTarget || '90-92'}kg
Achtergrond: ex-competitief wielrenner (FTP-piek 373W/70kg = 5,33 W/kg, La Marmotte 7u51, Cinglé du Ventoux 5u51). PPL gym ~1 jaar. PR: bench 110kg, RDL 120kg×10, incline DB 40kg×10. Actieve cut.

DOELEN: ${JSON.stringify(goals || {})}
VASTE PATRONEN: ${JSON.stringify(patterns || [])}

═══════════════════════════════════════════════════════════
BEREKENDE METRICS (deterministisch — gebruik direct, niet schatten)
═══════════════════════════════════════════════════════════

LOAD STATE
• ETL afgelopen 7 dagen: ${state.metrics.weeklyLoad}
• ATL: ${state.metrics.atl} | CTL: ${state.metrics.ctl} | TSB: ${state.metrics.tsb}
• ACWR: ${state.metrics.acwr} ${state.metrics.acwr > 1.5 ? '⚠️ SPIKE-ZONE' : state.metrics.acwr > 1.3 ? '⚠️ verhoogd' : 'normaal'}
• Monotony: ${state.metrics.monotony} | Strain: ${state.metrics.strain}

READINESS SCORE: ${state.readiness.total}/100 (${state.readiness.interpretation})
Verdeling: TSB ${state.readiness.breakdown.tsb}/40 · ACWR ${state.readiness.breakdown.acwr}/25 · Monotony ${state.readiness.breakdown.monotony}/15 · Load slope ${state.readiness.breakdown.loadSlope}/10 · Voeding ${state.readiness.breakdown.nutrition}/10

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

HUIDIG TRAININGSMODEL: ${state.currentZoneModel?.model || 'onvoldoende data'}

═══════════════════════════════════════════════════════════
DETAIL DATA
═══════════════════════════════════════════════════════════

ACTIVITEITEN AFGELOPEN 90 DAGEN (met ETL en zone per sessie)
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
Trend over 4 weken: ${weightTrend4w !== null ? weightTrend4w + ' kg/week' : 'onvoldoende data'}

GEPLANDE WEEK (met adaptive suggestions van engine)
${weekPlanFormatted.length ? JSON.stringify(weekPlanFormatted) : 'Geen week gepland'}

DAGNOTITIE: ${todayNote || 'Geen'}

═══════════════════════════════════════════════════════════
ANALYSEOPDRACHT
═══════════════════════════════════════════════════════════

Schrijf een uitgebreide, mechanistisch onderbouwde analyse. Gebruik de berekende metrics als feiten. Leg expliciet kruisverbanden tussen domeinen (training × voeding × gewicht × intensiteitsverdeling × herstel). Volg het stramien OBSERVATIE → MECHANISME → IMPACT → ACTIE bij elk inzicht.

**1. GEÏNTEGREERDE TRENDANALYSE**
Welke verbanden zie je tussen historische trainingsbelasting, intensiteitsverdeling, gewichtsverloop en performance? Wanneer was de progressie het sterkst en welke combinatie van load, zone-verdeling en energiebalans verklaart dat? Welk trainingsmodel domineerde in succesperiodes versus stagnatieperiodes?

**2. HUIDIGE STAAT — GEÏNTEGREERD**
Beoordeel TSB ${state.metrics.tsb}, ACWR ${state.metrics.acwr}, readiness ${state.readiness.total}/100 en overreaching-niveau "${state.overreaching.level}" in onderlinge samenhang. Is het huidige trainingsmodel "${state.currentZoneModel?.model || 'onbekend'}" passend bij de doelen en de cutfase? Identificeer mismatches tussen trainingsinhoud en doelen — zit er onnodig veel grey zone in? Ontbreken stimuli?

**3. VOEDING × GEWICHT × ADAPTATIE**
Toets de eiwitinname (${proteinPerKg || '–'} g/kg) aan Helms. Beoordeel kcal-balans (${Math.round(avgKcal7)}/dag) tegen gewichtstrend (${weightTrend4w !== null ? weightTrend4w + ' kg/week' : 'onbekend'}). Past dit deficit bij het huidige trainingsvolume? Risico op LBM-verlies of LEA? Effect op W/kg?

**4. PER GEPLANDE SESSIE — TYPE EN INTENSITEIT**
Voor elke geplande sessie deze week: specifiek sessietype-advies (geen "train minder", maar bijvoorbeeld "Z2 endurance 90min" of "VO2max 5×4min Z5/3min Z2 herstel" of "threshold 3×10min Z4"). Onderbouw met huidige TSB, trainingsmodel-deficit en cut. Specificeer setaantal/intensiteit/RPE bij gym, gerelateerd aan MEV/MAV gegeven concurrent training en deficit.

**5. STRUCTURELE OPTIMALISATIES**
Sessievolgorde, koolhydraatperiodisering rond intensieve sessies, pre-sleep eiwit, deload-timing op basis van CTL-trend, polarized-shift indicaties.

**6. RODE VLAGGEN & WEEKPRIORITEIT**
Concrete waarschuwingen met fysiologische onderbouwing. Eén absolute prioriteit met uitleg waarom dit het hoogste rendement heeft.

Nederlands. Mechanistisch en concreet — geen platitudes. Citeer waar passend (Helms 2014, Seiler 2010, Wilson 2012, Gabbett 2016). Subkopjes per sectie. Minimaal ~1200 woorden.`;

    const resp = await axios.post('https://api.anthropic.com/v1/messages', {
      model: 'claude-sonnet-4-20250514', max_tokens: 3500,
      messages: [{ role: 'user', content: prompt }]
    }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });

    res.json({ analysis: resp.data.content.map(b => b.text || '').join(''), state });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── State endpoints voor frontend live displays ──────────────────────────────

app.get('/api/state/full', async (req, res) => {
  try {
    const data = await loadData();
    const allActivities = data.activityCache?.activities || [];
    const settings = data.settings || {};
    const hevyResp = process.env.HEVY_API_KEY
      ? await axios.get('https://api.hevyapp.com/v1/workouts', { headers: { 'api-key': process.env.HEVY_API_KEY }, params: { page: 1, pageSize: 30 } }).catch(() => ({ data: { workouts: [] } }))
      : { data: { workouts: [] } };
    const hevyWorkouts = hevyResp.data.workouts || [];
    const state = engine.computeFullState(allActivities, hevyWorkouts, data.weight || {}, data.nutrition || {}, data.weekPlan || {}, settings);
    const { dailyETL, sources, ...rest } = state;
    rest.metrics = { ...rest.metrics, history: undefined };
    res.json({ ...rest, hasETLData: Object.keys(dailyETL).length > 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/state/load-series', async (req, res) => {
  try {
    const data = await loadData();
    const allActivities = data.activityCache?.activities || [];
    const settings = data.settings || {};
    const hevyResp = process.env.HEVY_API_KEY
      ? await axios.get('https://api.hevyapp.com/v1/workouts', { headers: { 'api-key': process.env.HEVY_API_KEY }, params: { page: 1, pageSize: 30 } }).catch(() => ({ data: { workouts: [] } }))
      : { data: { workouts: [] } };
    const { dailyETL } = engine.buildDailyETLSeries(allActivities, hevyResp.data.workouts || [], settings);
    const m = engine.computeLoadMetrics(dailyETL);
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
    const data = await loadData();
    const allActivities = data.activityCache?.activities || [];
    const settings = data.settings || {};
    const breakdown = engine.weeklyZoneBreakdown(allActivities, settings);
    const ftpInfo = engine.rollingFtp(allActivities, settings);
    res.json({ weekly: breakdown.slice(-26), currentFtp: ftpInfo });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/data', async (req, res) => {
  const data = await loadData();
  const { activityCache, ...rest } = data;
  res.json(rest);
});

app.post('/api/data', async (req, res) => {
  try {
    const current = await loadData();
    const updates = req.body;
    delete updates.activityCache;
    await saveData({ ...current, ...updates });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Literatuur ────────────────────────────────────────────────────────────────

app.get('/api/literature', async (req, res) => {
  const data = await loadData();
  res.json(data.literature || []);
});

app.post('/api/literature', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titel en inhoud zijn verplicht' });
    const data = await loadData();
    const literature = data.literature || [];
    const entry = { id: Date.now().toString(), title, content, addedDate: new Date().toISOString().split('T')[0] };
    literature.push(entry);
    data.literature = literature;
    await saveData(data);
    res.json(entry);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/literature/:id', async (req, res) => {
  try {
    const data = await loadData();
    data.literature = (data.literature || []).filter(l => l.id !== req.params.id);
    await saveData(data);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Upload PDF of tekstbestand — PDF wordt samengevat via Claude
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
        model: 'claude-sonnet-4-20250514', max_tokens: 800,
        messages: [{ role: 'user', content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: 'Extraheer de kernbevindingen van dit wetenschappelijk artikel relevant voor sporttraining, krachttraining, duurtraining, concurrent training, voeding of periodisering. Geef een gestructureerde samenvatting van maximaal 400 woorden: studieopzet, belangrijkste bevindingen, praktische implicaties. Schrijf in het Nederlands.' }
        ]}]
      }, { headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' } });
      content = resp.data.content.map(b => b.text || '').join('');
    } else {
      // Plain text file
      content = req.file.buffer.toString('utf8').substring(0, 4000);
    }

    const data = await loadData();
    const literature = data.literature || [];
    const entry = { id: Date.now().toString(), title, content, addedDate: new Date().toISOString().split('T')[0], source: req.file.originalname };
    literature.push(entry);
    data.literature = literature;
    await saveData(data);
    res.json(entry);
  } catch (err) { res.status(500).json({ error: 'Upload mislukt: ' + err.message }); }
});

// ── Weight history CSV upload ─────────────────────────────────────────────────

app.post('/api/weight/upload-history', upload.single('csv'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Geen bestand ontvangen' });

    const text = req.file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return res.status(400).json({ error: 'Bestand is leeg of ongeldig' });

    // Detect delimiter (comma or semicolon)
    const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';

    // Parse header — find date and weight column indices
    const header = lines[0].split(delim).map(h => h.replace(/"/g, '').trim().toLowerCase());
    const dateIdx = header.findIndex(h => h.includes('date') || h.includes('datum') || h.includes('time') || h.includes('tijd'));
    const weightIdx = header.findIndex(h => h.match(/^weight$|^gewicht$|^weight \(kg\)|^weight \(lbs\)|^gewicht \(kg\)/));

    if (dateIdx === -1 || weightIdx === -1) {
      return res.status(400).json({
        error: `Kolommen niet herkend. Gevonden kolommen: ${header.join(', ')}. Verwacht: een datum-kolom en een gewicht-kolom.`
      });
    }

    // Parse rows
    const entries = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delim).map(c => c.replace(/"/g, '').trim());
      const rawDate = cols[dateIdx];
      const rawWeight = cols[weightIdx];
      if (!rawDate || !rawWeight || rawWeight === '') continue;

      // Parse date — support YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD HH:MM:SS
      let dateKey = null;
      const cleanDate = rawDate.split(' ')[0].split('T')[0]; // strip time part
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        dateKey = cleanDate;
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(cleanDate)) {
        const [d, m, y] = cleanDate.split('-');
        dateKey = `${y}-${m}-${d}`;
      } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(cleanDate)) {
        const [m, d, y] = cleanDate.split('/');
        dateKey = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
      } else {
        // Try generic Date parse
        const parsed = new Date(rawDate);
        if (!isNaN(parsed)) dateKey = parsed.toISOString().split('T')[0];
      }
      if (!dateKey) continue;

      const weight = parseFloat(rawWeight.replace(',', '.'));
      if (isNaN(weight) || weight <= 0) continue;
      entries.push({ date: dateKey, weight });
    }

    if (!entries.length) return res.status(400).json({ error: 'Geen geldige gewichtsinvoeren gevonden in het bestand' });

    // Auto-detect lbs vs kg: if median > 150, assume lbs
    const sorted = [...entries].sort((a, b) => a.weight - b.weight);
    const median = sorted[Math.floor(sorted.length / 2)].weight;
    const isLbs = median > 150;
    const converted = entries.map(e => ({
      date: e.date,
      weight: isLbs ? Math.round((e.weight * 0.453592) * 10) / 10 : Math.round(e.weight * 10) / 10
    }));

    // Merge with existing — don't overwrite existing manual entries
    const data = await loadData();
    const existing = data.weight || {};
    let added = 0, skipped = 0;

    converted.forEach(({ date, weight }) => {
      if (existing[date]) {
        skipped++; // keep manual entry
      } else {
        existing[date] = String(weight);
        added++;
      }
    });

    data.weight = existing;
    await saveData(data);

    res.json({
      ok: true,
      total: converted.length,
      added,
      skipped,
      unit: isLbs ? 'lbs → omgezet naar kg' : 'kg',
      eerste: converted.sort((a,b)=>a.date.localeCompare(b.date))[0]?.date,
      laatste: converted.sort((a,b)=>b.date.localeCompare(a.date))[0]?.date,
    });
  } catch (err) {
    res.status(500).json({ error: 'Upload mislukt: ' + err.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n⚡ Training Dashboard draait op http://localhost:${PORT}\n`);
  if (!process.env.STRAVA_CLIENT_SECRET || process.env.STRAVA_CLIENT_SECRET.includes('jouw')) console.warn('⚠️  Strava credentials niet ingesteld');
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY.includes('jouw')) console.warn('⚠️  Anthropic API key niet ingesteld');
});
