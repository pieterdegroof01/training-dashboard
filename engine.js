// ════════════════════════════════════════════════════════════════════════════
// engine.js — Deterministische rekenlaag voor het training dashboard
// ════════════════════════════════════════════════════════════════════════════

const ATL_TAU = 7;
const CTL_TAU = 42;
const DEFAULT_FTP = 280;
const DEFAULT_HR_MAX = 197;

const ENDURANCE_TYPES = new Set(['Ride','VirtualRide','Run','TrailRun','Swim','Hike','Walk']);
const STRENGTH_TYPES  = new Set(['WeightTraining','Workout']);

// ────────────────────────────────────────────────────────────────────────────
// HULPFUNCTIES
// ────────────────────────────────────────────────────────────────────────────
function isUnreliablePower(date, settings) {
  return settings && date >= (settings.unreliablePowerStart || '2020-01-01') &&
         date <= (settings.unreliablePowerEnd || '2020-12-31');
}

function dateRange(start, end) {
  const out = [];
  const d = new Date(start); d.setHours(12);
  const last = new Date(end); last.setHours(12);
  while (d <= last) {
    out.push(d.toISOString().split('T')[0]);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function pctile(arr, p) {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

// ────────────────────────────────────────────────────────────────────────────
// HARTSLAG-GEBASEERDE TSS (hrTSS)
// ────────────────────────────────────────────────────────────────────────────
function computeHrTSS(activity, lthr) {
  if (!lthr || !activity.average_heartrate) return null;
  const durSec = activity.moving_time || 0;
  if (durSec === 0) return null;
  const hrIF = activity.average_heartrate / lthr;
  return Math.round((durSec * hrIF * hrIF) / 3600 * 100);
}

// ────────────────────────────────────────────────────────────────────────────
// KALIBRATIE — suffer_score → TSS conversiefactor
// ────────────────────────────────────────────────────────────────────────────
function computeCalibrationFactor(activities, settings) {
  const ftp = settings?.ftp || DEFAULT_FTP;
  const ratios = [];

  activities.forEach(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return;
    if (!a.suffer_score || a.suffer_score <= 0) return;
    const date = a.start_date?.split('T')[0] || '';
    if (isUnreliablePower(date, settings)) return;
    if (!a.average_watts || a.moving_time < 600) return;
    const durH = a.moving_time / 3600;
    const np = a.weighted_average_watts || a.average_watts;
    const IF = np / ftp;
    const tss = IF * IF * durH * 100;
    if (tss > 0) ratios.push(tss / a.suffer_score);
  });

  const count = ratios.length;
  if (count < 3) return { factor: 1.0, count, reliable: false };
  const factor = pctile(ratios, 50);
  return { factor: +factor.toFixed(3), count, reliable: count >= 5 };
}

// ────────────────────────────────────────────────────────────────────────────
// ROLLING FTP ESTIMATE
// ────────────────────────────────────────────────────────────────────────────
function rollingFtp(activities, settings, asOfDate = null) {
  const cutoffEnd = asOfDate ? new Date(asOfDate) : new Date();
  const cutoffStart = new Date(cutoffEnd); cutoffStart.setDate(cutoffStart.getDate() - 60);

  const candidates = activities.filter(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return false;
    if (a.powerSource !== 'measured' && a.powerSource !== 'unknown') return false;
    const d = a.start_date?.split('T')[0] || '';
    if (!d || isUnreliablePower(d, settings)) return false;
    const dt = new Date(d);
    if (dt < cutoffStart || dt > cutoffEnd) return false;
    if (!a.average_watts || a.moving_time < 1200) return false;
    return true;
  });

  if (!candidates.length) return null;

  const efforts = candidates.map(a => ({
    date: a.start_date.split('T')[0],
    np: a.weighted_average_watts || a.average_watts,
    name: a.name,
    powerSource: a.powerSource
  }));
  const sorted = efforts.sort((a, b) => b.np - a.np);
  const top3 = sorted.slice(0, 3);
  const median = top3[Math.floor(top3.length / 2)].np;
  const uncertainCount = top3.filter(r => r.powerSource === 'unknown').length;

  return { ftp: Math.round(median * 0.95), basedOn: top3, uncertainCount, method: 'top-20min × 0.95' };
}

function ftpForDate(activities, settings, date) {
  const r = rollingFtp(activities, settings, date);
  return r?.ftp || settings?.ftp || DEFAULT_FTP;
}

// ────────────────────────────────────────────────────────────────────────────
// ZONE-CLASSIFICATIE
// ────────────────────────────────────────────────────────────────────────────
function activityZoneClassification(activity, ftp, hrMax, settings) {
  const inUnreliable = activity.average_watts && (activity._unreliablePower || false);
  const z = settings?.zones || {};
  // zones opgeslagen als gehele getallen (55, 75, 90, 105), omzetten naar fracties
  const z1 = (z.z1 != null ? z.z1 / 100 : null) ?? 0.55;
  const z2 = (z.z2 != null ? z.z2 / 100 : null) ?? 0.75;
  const z3 = (z.z3 != null ? z.z3 / 100 : null) ?? 0.91; // Z3 = 76-90% FTP, Z4 vanaf 91% (PeakForm_Trainingstheorie.md §Zones)
  const z4 = (z.z4 != null ? z.z4 / 100 : null) ?? 1.05;
  const hrMaxEff = settings?.hrMax || hrMax || DEFAULT_HR_MAX;

  if (activity.average_watts && !inUnreliable) {
    const np = activity.weighted_average_watts || activity.average_watts;
    const IF = np / ftp;
    if (IF < z1) return { zone: 'Z1', method: 'power', IF: +IF.toFixed(2) };
    if (IF < z2) return { zone: 'Z2', method: 'power', IF: +IF.toFixed(2) };
    if (IF < z3) return { zone: 'Z3', method: 'power', IF: +IF.toFixed(2) };
    if (IF < z4) return { zone: 'Z4', method: 'power', IF: +IF.toFixed(2) };
    return { zone: 'Z5', method: 'power', IF: +IF.toFixed(2) };
  }

  if (activity.average_heartrate && hrMaxEff) {
    const hrPct = activity.average_heartrate / hrMaxEff;
    if (hrPct < 0.68) return { zone: 'Z1', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.83) return { zone: 'Z2', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.90) return { zone: 'Z3', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.95) return { zone: 'Z4', method: 'hr', hrPct: +hrPct.toFixed(2) };
    return { zone: 'Z5', method: 'hr', hrPct: +hrPct.toFixed(2) };
  }

  if (activity.suffer_score && activity.moving_time) {
    const intensity = activity.suffer_score / (activity.moving_time / 3600);
    if (intensity < 25) return { zone: 'Z2', method: 'suffer-rate' };
    if (intensity < 50) return { zone: 'Z3', method: 'suffer-rate' };
    if (intensity < 90) return { zone: 'Z4', method: 'suffer-rate' };
    return { zone: 'Z5', method: 'suffer-rate' };
  }

  return { zone: 'Z2', method: 'default' };
}

function zoneToCategory(zone) {
  if (zone === 'Z1' || zone === 'Z2') return 'low';
  if (zone === 'Z3') return 'mid';
  return 'high';
}

// ────────────────────────────────────────────────────────────────────────────
// ETL — EQUIVALENT TRAINING LOAD
// ────────────────────────────────────────────────────────────────────────────
function computeETLForActivity(activity, settings) {
  const date = activity.start_date?.split('T')[0] || '';
  const inUnreliable = isUnreliablePower(date, settings);
  const durH = (activity.moving_time || 0) / 3600;
  const ftp = settings?.ftp || DEFAULT_FTP;
  const hrMax = settings?.hrMax || DEFAULT_HR_MAX;
  const sufferFactor = settings?.sufferToTSSFactor || 1.0;
  const lthr = settings?.lthr || null;

  // Cycling — prioriteitsvolgorde bronkeuze
  if (activity.type === 'Ride' || activity.type === 'VirtualRide') {
    // Prioriteit 1: defect vermogensmeter-venster → bestaande fallback
    if (inUnreliable) {
      if (activity.suffer_score > 0) return { etl: Math.round(activity.suffer_score * sufferFactor), tssSource: 'fallback' };
      return { etl: Math.round(durH * 50), tssSource: 'fallback' };
    }
    // Prioriteit 2: gemeten of onbekend-bron vermogen
    if ((activity.powerSource === 'measured' || activity.powerSource === 'unknown') && activity.average_watts && durH > 0) {
      const np = activity.weighted_average_watts || activity.average_watts;
      const IF = np / ftp;
      const tssSource = activity.powerSource === 'measured' ? 'power' : 'power_unverified';
      return { etl: Math.min(Math.round(IF * IF * durH * 100), 400), tssSource };
    }
    // Prioriteit 3: hrTSS via LTHR-instelling
    if (lthr && activity.average_heartrate) {
      const hrTss = computeHrTSS(activity, lthr);
      if (hrTss !== null) return { etl: Math.min(hrTss, 400), tssSource: 'hr' };
    }
    // Prioriteit 4: fallback (suffer_score of duur)
    if (activity.suffer_score > 0) return { etl: Math.round(activity.suffer_score * sufferFactor), tssSource: 'fallback' };
    return { etl: Math.round(durH * 50), tssSource: 'fallback' };
  }

  // Running
  if (activity.type === 'Run' || activity.type === 'TrailRun') {
    if (activity.suffer_score > 0) return { etl: Math.round(activity.suffer_score * 1.2), tssSource: 'fallback' };
    if (activity.average_heartrate) {
      const hrR = (activity.average_heartrate - 60) / (hrMax - 60);
      const trimp = durH * 60 * hrR * (0.64 * Math.exp(1.92 * hrR));
      return { etl: Math.min(Math.round(trimp * 1.2), 400), tssSource: 'fallback' };
    }
    return { etl: Math.round(durH * 75 * 1.2), tssSource: 'fallback' };
  }

  if (activity.type === 'Swim') return { etl: Math.round(durH * 65), tssSource: 'fallback' };
  if (activity.type === 'Hike') return { etl: Math.round(durH * 35), tssSource: 'fallback' };
  if (activity.type === 'Walk') return { etl: Math.round(durH * 20), tssSource: 'fallback' };

  if (activity.type === 'WeightTraining' || activity.type === 'Workout') {
    return { etl: Math.round(durH * 45), tssSource: 'fallback' };
  }

  return { etl: Math.round(durH * 40), tssSource: 'fallback' };
}

// Krachttraining ETL uit Hevy workout data
function computeETLForHevyWorkout(workout, opts = {}) {
  if (!workout || !workout.exercises) return 0;

  const startTime = new Date(workout.start_time);
  const endTime = workout.end_time ? new Date(workout.end_time) : null;
  const durMin = endTime ? (endTime - startTime) / 60000 : 60;

  let totalSets = 0, totalReps = 0, totalTonnage = 0;
  let lowerBodySets = 0, upperBodySets = 0, compoundSets = 0;
  const highRPESets = [];

  const lowerBodyKeywords = ['squat','deadlift','leg press','lunge','rdl','leg curl','leg extension','hip thrust','calf','glute'];
  const compoundKeywords  = ['squat','deadlift','bench press','overhead press','row','pull-up','pullup','chin','press','rdl','clean','snatch'];

  workout.exercises.forEach(ex => {
    const name = (ex.title || '').toLowerCase();
    const isLower = lowerBodyKeywords.some(k => name.includes(k));
    const isCompound = compoundKeywords.some(k => name.includes(k));
    (ex.sets || []).forEach(s => {
      if (!s.reps && !s.weight_kg) return;
      totalSets++;
      totalReps += s.reps || 0;
      totalTonnage += (s.weight_kg || 0) * (s.reps || 0);
      if (isLower) lowerBodySets++; else upperBodySets++;
      if (isCompound) compoundSets++;
      if (s.rpe && s.rpe >= 8) highRPESets.push(s.rpe);
    });
  });

  if (totalSets === 0) return 0;

  const defaultRPE = opts.defaultRPE ?? 7.5;
  let avgRPE = defaultRPE;
  if (highRPESets.length) {
    avgRPE = highRPESets.reduce((a, b) => a + b, 0) / highRPESets.length;
  }

  const lowerRatio    = lowerBodySets / totalSets;
  const muscleGroupFactor = 1.0 + 0.3 * lowerRatio;
  const compoundRatio = compoundSets / totalSets;
  const compoundFactor = 0.85 + 0.35 * compoundRatio;
  const volumeFactor  = Math.min(1.0 + (totalSets - 12) / 30, 1.5);
  const intensityFactor = avgRPE / 7.5;

  const etl = (avgRPE * durMin * volumeFactor * muscleGroupFactor * compoundFactor * intensityFactor) / 10;
  return {
    etl: Math.min(Math.round(etl), 250),
    breakdown: {
      durMin: Math.round(durMin), totalSets, totalReps,
      tonnage: Math.round(totalTonnage), avgRPE: +avgRPE.toFixed(1),
      lowerBodyRatio: +lowerRatio.toFixed(2), compoundRatio: +compoundRatio.toFixed(2)
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DAILY ETL SERIES — gesplitst in duur en kracht
// ────────────────────────────────────────────────────────────────────────────
function buildDailyETLSeries(activities, hevyWorkouts, settings) {
  const enduranceDailyETL = {};
  const strengthDailyETL  = {};
  const sources  = {};

  activities.forEach(a => {
    const d = a.start_date?.split('T')[0];
    if (!d) return;
    a._unreliablePower = isUnreliablePower(d, settings);
    const result = computeETLForActivity(a, settings);
    const etl = result.etl;
    const tssSource = result.tssSource;
    if (!sources[d]) sources[d] = [];
    sources[d].push({ kind: 'strava', type: a.type, name: a.name, etl, tssSource, durMin: Math.round((a.moving_time || 0) / 60) });
    if (ENDURANCE_TYPES.has(a.type)) {
      enduranceDailyETL[d] = (enduranceDailyETL[d] || 0) + etl;
    } else {
      strengthDailyETL[d] = (strengthDailyETL[d] || 0) + etl;
    }
  });

  (hevyWorkouts || []).forEach(w => {
    const d = w.start_time?.split('T')[0];
    if (!d) return;
    const result = computeETLForHevyWorkout(w, { defaultRPE: settings?.defaultRPE });
    const etl = typeof result === 'number' ? result : result.etl;
    const breakdown = typeof result === 'number' ? null : result.breakdown;
    if (!sources[d]) sources[d] = [];
    strengthDailyETL[d] = (strengthDailyETL[d] || 0) + etl;
    sources[d].push({ kind: 'hevy', name: w.name || 'Workout', etl, breakdown });
  });

  return { enduranceDailyETL, strengthDailyETL, sources };
}

// ────────────────────────────────────────────────────────────────────────────
// KRACHT METRICS — per spiergroep, e1RM trend, herstelstatus
// ────────────────────────────────────────────────────────────────────────────
function computeStrengthMetrics(hevyWorkouts) {
  if (!hevyWorkouts || !hevyWorkouts.length) return null;

  const todayStr = new Date().toISOString().split('T')[0];
  const todayDate = new Date(todayStr + 'T12:00:00');

  const groupKws = {
    lower_body: ['squat','deadlift','leg press','lunge','rdl','leg curl','leg extension','hip thrust','calf','glute'],
    push:  ['bench','fly','push-up','pushup','dip','tricep','chest press','incline','decline','lateral raise','shoulder press','overhead'],
    pull:  ['row','pull-up','pullup','lat','bicep','curl','chin','face pull','shrug'],
    core:  ['plank','crunch','ab ','core','hollow','sit-up','cable crunch']
  };

  const MAIN_KWS = ['squat','deadlift','bench','overhead press','row','pull-up','pullup'];

  // 4-week buckets: index 0 = lopende week, 1-3 = vorige weken
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const weekStarts = Array.from({length: 4}, (_, i) => {
    const s = new Date(now);
    s.setDate(now.getDate() - dow - i * 7);
    s.setHours(0, 0, 0, 0);
    return s;
  });

  const buckets = weekStarts.map(() => ({ lower_body: 0, push: 0, pull: 0, core: 0, other: 0 }));
  const daysSince = { lower_body: 999, push: 999, pull: 999, core: 999 };
  const e1rmHistory = {};

  const sorted = [...hevyWorkouts].sort((a, b) => a.start_time.localeCompare(b.start_time));

  sorted.forEach(w => {
    const wDate = w.start_time?.split('T')[0];
    if (!wDate) return;
    const wDateObj = new Date(wDate + 'T12:00:00');
    const daysDiff = Math.round((todayDate - wDateObj) / 86400000);

    const bucketIdx = weekStarts.findIndex((s, i) => {
      const end = i === 0 ? new Date(now) : weekStarts[i - 1];
      return wDateObj >= s && wDateObj < (i === 0 ? new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) : weekStarts[i - 1]);
    });

    const groupsThisSession = new Set();

    (w.exercises || []).forEach(ex => {
      const name = (ex.title || '').toLowerCase();
      let exGroup = 'other';
      for (const [grp, kws] of Object.entries(groupKws)) {
        if (kws.some(k => name.includes(k))) { exGroup = grp; break; }
      }
      groupsThisSession.add(exGroup);

      let load = 0;
      const isMain = MAIN_KWS.some(k => name.includes(k));

      (ex.sets || []).forEach(s => {
        if (!s.reps) return;
        load += (s.weight_kg || 0) * s.reps;
        if (s.weight_kg > 0 && isMain) {
          const e1rm = s.weight_kg * (1 + s.reps / 30);
          if (!e1rmHistory[ex.title]) e1rmHistory[ex.title] = [];
          const arr = e1rmHistory[ex.title];
          const last = arr[arr.length - 1];
          if (last && last.date === wDate) {
            last.e1rm = Math.max(last.e1rm, e1rm);
          } else {
            arr.push({ date: wDate, e1rm });
          }
        }
      });

      if (bucketIdx >= 0) buckets[bucketIdx][exGroup] = (buckets[bucketIdx][exGroup] || 0) + load;
    });

    groupsThisSession.forEach(grp => {
      if (grp !== 'other' && daysDiff < daysSince[grp]) daysSince[grp] = daysDiff;
    });
  });

  const currentWeek = buckets[0];
  const prevAvg = {};
  for (const grp of Object.keys(groupKws)) {
    const sum = buckets.slice(1).reduce((s, b) => s + (b[grp] || 0), 0);
    prevAvg[grp] = sum / 3;
  }

  const muscleGroups = {};
  for (const grp of Object.keys(groupKws)) {
    const wkLoad = Math.round(currentWeek[grp] || 0);
    const avg = prevAvg[grp] || 0;
    let trend = 'stabiel';
    if (avg > 0) {
      const ratio = wkLoad / avg;
      if (ratio > 1.15) trend = 'stijgend';
      else if (ratio < 0.85) trend = 'dalend';
    } else if (wkLoad > 0) trend = 'stijgend';
    muscleGroups[grp] = { weeklyLoad: wkLoad, avgWeeklyLoad4w: Math.round(avg), trend, daysSinceLastSession: daysSince[grp] };
  }

  const e1RMTrends = Object.entries(e1rmHistory)
    .map(([exercise, sessions]) => ({
      exercise,
      sessions: sessions.slice(-8).map(s => ({ date: s.date, e1rm: Math.round(s.e1rm) }))
    }))
    .filter(e => e.sessions.length >= 2)
    .sort((a, b) => b.sessions[b.sessions.length - 1].date.localeCompare(a.sessions[a.sessions.length - 1].date));

  const weeklyLoad = Math.round(Object.values(currentWeek).reduce((s, v) => s + v, 0));
  const avgWeeklyLoad4w = Math.round(Object.values(prevAvg).reduce((s, v) => s + v, 0));

  const lastWorkout = sorted[sorted.length - 1];
  const daysSinceLastSession = lastWorkout
    ? Math.round((todayDate - new Date(lastWorkout.start_time?.split('T')[0] + 'T12:00:00')) / 86400000)
    : 99;

  return { muscleGroups, e1RMTrends, weeklyLoad, avgWeeklyLoad4w, daysSinceLastSession };
}

// ────────────────────────────────────────────────────────────────────────────
// ATL / CTL / TSB / ACWR / MONOTONY / STRAIN
// ────────────────────────────────────────────────────────────────────────────
function computeLoadMetrics(dailyETL, asOfDate = null) {
  const dates = Object.keys(dailyETL).sort();
  if (!dates.length) return { atl: 0, ctl: 0, tsb: 0, acwr: 0, monotony: 0, strain: 0, history: {} };

  const startDate = new Date(dates[0]);
  const endDate = asOfDate ? new Date(asOfDate) : new Date();
  const allDays = dateRange(startDate, endDate);

  const k_atl = 1 - Math.exp(-1 / ATL_TAU);
  const k_ctl = 1 - Math.exp(-1 / CTL_TAU);

  let atl = 0, ctl = 0;
  const history = {};

  for (const day of allDays) {
    const load = dailyETL[day] || 0;
    atl = atl + k_atl * (load - atl);
    ctl = ctl + k_ctl * (load - ctl);
    history[day] = {
      atl: Math.round(atl * 10) / 10,
      ctl: Math.round(ctl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
      load: Math.round(load * 10) / 10
    };
  }

  const acwr = ctl > 0 ? +(atl / ctl).toFixed(2) : 0;
  const last7Days = allDays.slice(-7);
  const last7Loads = last7Days.map(d => dailyETL[d] || 0);
  const meanLoad = last7Loads.reduce((a, b) => a + b, 0) / 7;
  const variance = last7Loads.reduce((s, v) => s + (v - meanLoad) ** 2, 0) / 7;
  const sd = Math.sqrt(variance);
  const monotony = sd > 0.5 ? +(meanLoad / sd).toFixed(2) : (meanLoad > 0 ? 5 : 0);
  const totalLoad7 = last7Loads.reduce((a, b) => a + b, 0);
  const strain = Math.round(monotony * totalLoad7);

  return {
    atl: Math.round(atl * 10) / 10,
    ctl: Math.round(ctl * 10) / 10,
    tsb: Math.round((ctl - atl) * 10) / 10,
    acwr, monotony, strain,
    weeklyLoad: Math.round(totalLoad7),
    history
  };
}

// Projecteert de TSB op weekEndISO door geplande resterende load in de
// EWMA-reeks te mengen en computeLoadMetrics tot die datum te draaien.
// Pure functie: enduranceDailyETL = {date: load}, plannedRemainingLoads = {date: load}.
function projectWeekEndTSB(enduranceDailyETL, plannedRemainingLoads, weekEndISO) {
  if (!enduranceDailyETL || !Object.keys(enduranceDailyETL).length) return null;
  const merged = { ...enduranceDailyETL };
  for (const [date, load] of Object.entries(plannedRemainingLoads || {})) {
    if (!load) continue;
    merged[date] = (merged[date] || 0) + load;
  }
  const m = computeLoadMetrics(merged, weekEndISO);
  const tsbAtEnd = m.history && m.history[weekEndISO] ? m.history[weekEndISO].tsb : m.tsb;
  return typeof tsbAtEnd === 'number' ? tsbAtEnd : null;
}

// ────────────────────────────────────────────────────────────────────────────
// WEEKLY ZONE BREAKDOWN
// ────────────────────────────────────────────────────────────────────────────
function weeklyZoneBreakdown(activities, settings) {
  const weeks = {};
  activities.forEach(a => {
    if (!['Ride','VirtualRide','Run','TrailRun'].includes(a.type)) return;
    const date = a.start_date?.split('T')[0] || '';
    if (!date) return;
    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    const wk = mon.toISOString().split('T')[0];
    a._unreliablePower = isUnreliablePower(date, settings);
    const ftp = ftpForDate(activities, settings, date);
    const hrMax = settings?.hrMax || DEFAULT_HR_MAX;
    const z = activityZoneClassification(a, ftp, hrMax, settings);
    const cat = zoneToCategory(z.zone);
    const minutes = (a.moving_time || 0) / 60;
    if (!weeks[wk]) weeks[wk] = { low: 0, mid: 0, high: 0, total: 0, sessions: 0 };
    weeks[wk][cat] += minutes;
    weeks[wk].total += minutes;
    weeks[wk].sessions++;
  });

  return Object.entries(weeks).sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => {
      const total = v.total || 1;
      return {
        week, sessions: v.sessions,
        lowMin: Math.round(v.low), midMin: Math.round(v.mid), highMin: Math.round(v.high), totalMin: Math.round(v.total),
        lowPct: Math.round(v.low / total * 100), midPct: Math.round(v.mid / total * 100), highPct: Math.round(v.high / total * 100),
        model: classifyTrainingModel(v.low / total, v.mid / total, v.high / total)
      };
    });
}

function classifyTrainingModel(lowFrac, midFrac, highFrac) {
  if (lowFrac < 0.5) return 'mixed/onbekend';
  if (highFrac >= 0.12 && midFrac < 0.20 && lowFrac >= 0.65) return 'polarized';
  if (midFrac >= 0.25 || (midFrac + highFrac) >= 0.40) return 'threshold-heavy';
  if (lowFrac > midFrac && midFrac > highFrac && highFrac >= 0.05) return 'pyramidal';
  if (lowFrac >= 0.85 && highFrac < 0.05) return 'volume-only';
  return 'gemengd';
}

// ────────────────────────────────────────────────────────────────────────────
// PERFORMANCE TRENDS
// ────────────────────────────────────────────────────────────────────────────
function performanceTrends(activities, hevyWorkouts, settings) {
  const cyclingPerf = {};
  activities.filter(a => (a.type === 'Ride' || a.type === 'VirtualRide') && a.moving_time > 1800)
    .forEach(a => {
      const date = a.start_date?.split('T')[0];
      if (!date || isUnreliablePower(date, settings)) return;
      const np = a.weighted_average_watts || a.average_watts;
      if (!np) return;
      const monthKey = date.substring(0, 7);
      if (!cyclingPerf[monthKey]) cyclingPerf[monthKey] = [];
      cyclingPerf[monthKey].push(np);
    });

  const cyclingMonthly = Object.entries(cyclingPerf).sort()
    .map(([month, vals]) => ({
      month,
      topNP: Math.round(Math.max(...vals)),
      avgNP: Math.round(vals.reduce((a, b) => a + b) / vals.length),
      rides: vals.length
    }));

  const runPerf = {};
  activities.filter(a => a.type === 'Run' && a.moving_time > 600)
    .forEach(a => {
      const date = a.start_date?.split('T')[0];
      const monthKey = date?.substring(0, 7);
      if (!monthKey || !a.distance || !a.moving_time) return;
      const speed = a.distance / a.moving_time;
      if (!runPerf[monthKey]) runPerf[monthKey] = [];
      runPerf[monthKey].push(speed);
    });

  const runMonthly = Object.entries(runPerf).sort()
    .map(([month, vals]) => {
      const topSpeed = Math.max(...vals);
      const avgSpeed = vals.reduce((a, b) => a + b) / vals.length;
      return {
        month,
        topPaceMinPerKm: +(1000 / topSpeed / 60).toFixed(2),
        avgPaceMinPerKm: +(1000 / avgSpeed / 60).toFixed(2),
        runs: vals.length
      };
    });

  const liftPerf = {};
  (hevyWorkouts || []).forEach(w => {
    const date = w.start_time?.split('T')[0];
    const monthKey = date?.substring(0, 7);
    if (!monthKey) return;
    (w.exercises || []).forEach(ex => {
      const exName = ex.title;
      if (!exName) return;
      (ex.sets || []).forEach(s => {
        if (!s.weight_kg || !s.reps) return;
        const e1rm = s.weight_kg * (1 + s.reps / 30);
        if (!liftPerf[exName]) liftPerf[exName] = {};
        if (!liftPerf[exName][monthKey] || liftPerf[exName][monthKey] < e1rm) {
          liftPerf[exName][monthKey] = e1rm;
        }
      });
    });
  });

  const liftTrends = Object.entries(liftPerf).map(([ex, byMonth]) => ({
    exercise: ex,
    months: Object.entries(byMonth).sort().map(([m, e1rm]) => ({ month: m, e1rm: Math.round(e1rm) }))
  }));

  return { cyclingMonthly, runMonthly, liftTrends };
}

// ────────────────────────────────────────────────────────────────────────────
// PLATEAU DETECTIE
// ────────────────────────────────────────────────────────────────────────────
function detectPlateau(performanceTrend, hasIncreasingLoad) {
  const plateaus = [];
  if (performanceTrend.cyclingMonthly?.length >= 3) {
    const last3 = performanceTrend.cyclingMonthly.slice(-3);
    const tops = last3.map(m => m.topNP);
    if (Math.abs(tops[tops.length - 1] - tops[0]) < 5 && hasIncreasingLoad)
      plateaus.push({ domain: 'cycling', detail: `Top NP stagneert rond ${tops[0]}W over 3+ maanden ondanks gelijkblijvende of stijgende load.` });
  }
  if (performanceTrend.runMonthly?.length >= 3) {
    const last3 = performanceTrend.runMonthly.slice(-3);
    const paces = last3.map(m => m.topPaceMinPerKm);
    if (Math.abs(paces[0] - paces[paces.length - 1]) < 0.05 && hasIncreasingLoad)
      plateaus.push({ domain: 'running', detail: `Top pace stagneert rond ${paces[0]} min/km over 3+ maanden.` });
  }
  performanceTrend.liftTrends?.forEach(lift => {
    if (lift.months.length < 3) return;
    const last3 = lift.months.slice(-3);
    if (Math.abs(last3[last3.length - 1].e1rm - last3[0].e1rm) < 2.5)
      plateaus.push({ domain: 'strength', exercise: lift.exercise, detail: `e1RM ${lift.exercise} stagneert rond ${last3[0].e1rm}kg.` });
  });
  return plateaus;
}

// ────────────────────────────────────────────────────────────────────────────
// OVERREACHING DETECTIE — gebruikt instellingsdrempels
// ────────────────────────────────────────────────────────────────────────────
function detectOverreaching(metrics, history, settings) {
  const al = settings?.alerts || {};
  const tsbCrit    = al.tsbCrit    ?? -30;
  const tsbWarn    = al.tsbWarn    ?? -20;
  const acwrCrit   = al.acwrCrit   ?? 1.5;
  const acwrWarn   = al.acwrWarn   ?? 1.3;
  const monoWarn   = al.monotonyWarn ?? 2.0;

  const flags = [];
  const dates = Object.keys(history).sort().slice(-14);

  if (metrics.tsb < tsbCrit) flags.push(`TSB ${metrics.tsb} < ${tsbCrit} (zwaar overbelast)`);
  if (metrics.acwr > acwrCrit) flags.push(`ACWR ${metrics.acwr} > ${acwrCrit} (acute spike, blessurerisico)`);
  if (metrics.monotony > monoWarn + 0.5) flags.push(`Monotony ${metrics.monotony} > ${monoWarn + 0.5} (te eentonig)`);
  if (metrics.strain > 6000) flags.push(`Strain ${metrics.strain} > 6000 (zeer hoge weekbelasting × eentonigheid)`);

  const negativeDays = dates.filter(d => history[d]?.tsb < tsbWarn).length;
  if (negativeDays >= 7) flags.push(`TSB < ${tsbWarn} op ${negativeDays}/14 dagen (chronische vermoeidheid)`);

  let level = 'none';
  if (flags.length >= 3) level = 'severe';
  else if (flags.length >= 2) level = 'moderate';
  else if (flags.length >= 1) level = 'mild';

  return { level, flags };
}

// ────────────────────────────────────────────────────────────────────────────
// SLAAP METRICS — schuld, behoefte, nachtscore
// ────────────────────────────────────────────────────────────────────────────
function computeSleepMetrics(sleepData) {
  if (!sleepData || !sleepData.length) return null;

  const nights = sleepData.filter(d => d && d.hours >= 6 && d.hours <= 11);
  const availableNights = nights.length;
  let sleepNeed, reliable;
  if (availableNights < 5) {
    sleepNeed = 8.0; reliable = false;
  } else {
    const top3 = [...nights].sort((a, b) => b.hours - a.hours).slice(0, 3);
    const avg = top3.reduce((s, n) => s + n.hours, 0) / 3;
    sleepNeed = Math.round(avg * 2) / 2;
    reliable = availableNights >= 10;
  }

  const last14 = sleepData.slice(-14);
  let sleepDebt = 0;
  for (const night of last14) {
    if (!night || night.hours == null) continue;
    const h = night.hours;
    const deficit = sleepNeed - h;
    if (deficit > 0) sleepDebt += deficit;
    else sleepDebt = Math.max(0, sleepDebt - (-deficit) * 0.5);
  }
  sleepDebt = Math.max(0, Math.round(sleepDebt * 10) / 10);
  const debtCategory = sleepDebt < 0.5 ? 'optimal' : sleepDebt < 1.5 ? 'low' : sleepDebt < 3.0 ? 'moderate' : 'high';

  const yesterday = sleepData[sleepData.length - 1];
  let sleepScore, lastNight;
  if (!yesterday || yesterday.hours == null) {
    sleepScore = 50;
    lastNight = null;
  } else {
    lastNight = yesterday;
    const normalizedHours = Math.min(yesterday.hours / sleepNeed, 1.0);
    sleepScore = Math.round((normalizedHours * 0.6 + (yesterday.quality / 5) * 0.4) * 100);
  }

  return { sleepNeed, reliable, sleepDebt, debtCategory, sleepScore, lastNight, availableNights };
}

// ────────────────────────────────────────────────────────────────────────────
// READINESS SCORE — duurbelasting + krachtherstel + voeding + slaap
// ────────────────────────────────────────────────────────────────────────────
function readinessScore(enduranceMetrics, strengthMetrics, recentNutrition, currentWeight, personalModel, settings, sleepMetrics = null) {
  const optimalTSB = personalModel?.optimalTSB ?? { min: -10, max: 5 };

  // TSB component (×0.8 → max 28) — alleen duurtraining
  let tsbRaw = 35;
  if (enduranceMetrics.tsb < optimalTSB.min - 25) tsbRaw = 0;
  else if (enduranceMetrics.tsb < optimalTSB.min - 10) tsbRaw = 8;
  else if (enduranceMetrics.tsb < optimalTSB.min) tsbRaw = 22;
  else if (enduranceMetrics.tsb > optimalTSB.max + 15) tsbRaw = 26;
  else if (enduranceMetrics.tsb > optimalTSB.max + 5) tsbRaw = 30;
  const tsbScore = Math.round(tsbRaw * 0.8);

  // ACWR component (×0.8 → max 16) — alleen duurtraining
  let acwrRaw = 20;
  if (enduranceMetrics.acwr > 1.5) acwrRaw = 0;
  else if (enduranceMetrics.acwr > 1.3) acwrRaw = 8;
  else if (enduranceMetrics.acwr > 1.2) acwrRaw = 14;
  else if (enduranceMetrics.acwr < 0.6) acwrRaw = 12;
  const acwrScore = Math.round(acwrRaw * 0.8);

  // Monotony component (×0.8 → max 12) — alleen duurtraining
  let monotonyRaw = 15;
  if (enduranceMetrics.monotony > 2.5) monotonyRaw = 0;
  else if (enduranceMetrics.monotony > 2.0) monotonyRaw = 6;
  else if (enduranceMetrics.monotony > 1.7) monotonyRaw = 11;
  const monotonyScore = Math.round(monotonyRaw * 0.8);

  // Load slope (×0.8 → max 8)
  let loadSlopeRaw = 10;
  if (enduranceMetrics.acwr > 1.4) loadSlopeRaw = 2;
  else if (enduranceMetrics.acwr > 1.25) loadSlopeRaw = 6;
  const loadSlopeScore = Math.round(loadSlopeRaw * 0.8);

  // Voeding (×0.8 → max 8)
  let nutritionRaw = 5;
  if (recentNutrition && recentNutrition.length >= 3) {
    const avgKcal    = recentNutrition.reduce((s, n) => s + (parseInt(n.kcal) || 0), 0) / recentNutrition.length;
    const avgProtein = recentNutrition.reduce((s, n) => s + (parseInt(n.protein) || 0), 0) / recentNutrition.length;
    const proteinPerKg = currentWeight ? avgProtein / currentWeight : 0;
    nutritionRaw = 0;
    if (proteinPerKg >= 2.0) nutritionRaw += 5;
    else if (proteinPerKg >= 1.6) nutritionRaw += 3;
    if (avgKcal >= 1800) nutritionRaw += 5;
    else if (avgKcal >= 1500) nutritionRaw += 3;
  }
  const nutritionScore = Math.round(nutritionRaw * 0.8);

  // Krachtherstel component (×0.8 → max 8)
  let strengthFatigueRaw = 10;
  if (strengthMetrics) {
    const daysSinceLower = strengthMetrics.muscleGroups?.lower_body?.daysSinceLastSession ?? 99;
    const volRatio = strengthMetrics.avgWeeklyLoad4w > 0
      ? strengthMetrics.weeklyLoad / strengthMetrics.avgWeeklyLoad4w : 1;
    if (daysSinceLower <= 1) strengthFatigueRaw = 2;
    else if (daysSinceLower <= 2) strengthFatigueRaw = 5;
    else if (daysSinceLower <= 3) strengthFatigueRaw = 7;
    if (volRatio > 1.5) strengthFatigueRaw = Math.max(0, strengthFatigueRaw - 3);
    else if (volRatio > 1.2) strengthFatigueRaw = Math.max(0, strengthFatigueRaw - 1);
  }
  const strengthFatigueScore = Math.round(strengthFatigueRaw * 0.8);

  // Slaap component (max 20)
  const sleepScore = sleepMetrics ? Math.round(sleepMetrics.sleepScore * 0.20) : 10;

  const total = tsbScore + acwrScore + monotonyScore + loadSlopeScore + nutritionScore + strengthFatigueScore + sleepScore;
  return {
    total,
    breakdown: {
      tsb: tsbScore, acwr: acwrScore, monotony: monotonyScore,
      loadSlope: loadSlopeScore, nutrition: nutritionScore, strengthFatigue: strengthFatigueScore,
      sleep: sleepScore
    },
    interpretation: total >= 80 ? 'uitgerust' : total >= 65 ? 'goed' : total >= 50 ? 'matig' : total >= 35 ? 'vermoeid' : 'overbelast'
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PERSONAL RESPONSE MODEL
// ────────────────────────────────────────────────────────────────────────────
function buildPersonalResponseModel(activities, history, settings) {
  const cyclingActs = activities.filter(a =>
    (a.type === 'Ride' || a.type === 'VirtualRide') &&
    a.moving_time > 1800 && a.average_watts &&
    !isUnreliablePower(a.start_date?.split('T')[0] || '', settings)
  );

  if (cyclingActs.length < 20) {
    return {
      optimalTSB: { min: -10, max: 5 },
      fatigueDelay: 1, loadTolerance: 'onbekend', interferenceSensitivity: 'onbekend',
      note: 'Onvoldoende data voor gepersonaliseerd model — defaults gebruikt.'
    };
  }

  const npValues = cyclingActs.map(a => a.weighted_average_watts || a.average_watts);
  const top10pct = pctile(npValues, 90);
  const topRides = cyclingActs.filter(a => (a.weighted_average_watts || a.average_watts) >= top10pct);
  const tsbAtTopRides = topRides.map(a => history[a.start_date?.split('T')[0]]?.tsb).filter(t => t !== undefined);

  let optimalTSB = { min: -10, max: 5 };
  if (tsbAtTopRides.length >= 5) {
    const srt = [...tsbAtTopRides].sort((a, b) => a - b);
    optimalTSB = {
      min: Math.round(srt[Math.floor(srt.length * 0.25)]),
      max: Math.round(srt[Math.floor(srt.length * 0.75)])
    };
  }

  const weeklyMax = {};
  Object.entries(history).forEach(([day, h]) => {
    const d = new Date(day);
    const dow = (d.getDay() + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    const wk = mon.toISOString().split('T')[0];
    if (!weeklyMax[wk]) weeklyMax[wk] = { totalLoad: 0, minTSB: 0 };
    weeklyMax[wk].totalLoad += h.load;
    if (h.tsb < weeklyMax[wk].minTSB) weeklyMax[wk].minTSB = h.tsb;
  });

  const sustainableWeeks = Object.values(weeklyMax).filter(w => w.minTSB > -25);
  const sustainableLoads = sustainableWeeks.map(w => w.totalLoad).sort((a, b) => b - a);
  const loadTolerance = sustainableLoads.length ? Math.round(pctile(sustainableLoads, 90)) : null;

  return {
    optimalTSB, fatigueDelay: 2,
    loadTolerance: loadTolerance ? `~${loadTolerance} ETL/week zonder overreaching` : 'onbekend',
    interferenceSensitivity: 'medium',
    sampleSize: { topRides: topRides.length, sustainableWeeks: sustainableWeeks.length }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ADAPTIVE PLANNING
// ────────────────────────────────────────────────────────────────────────────
function adaptiveWeekAdjustments(weekPlan, readiness, overreaching, plateaus, currentZoneModel) {
  const suggestions = {};
  Object.entries(weekPlan || {}).forEach(([date, sessions]) => {
    const adjusted = sessions.map(s => ({ ...s, suggestion: null, reason: null }));
    adjusted.forEach(s => {
      const reasons = [];
      if (readiness.total < 50) {
        if (s.type === 'cycling' && s.duration > 60) {
          s.suggestion = 'recovery ride'; s.duration = Math.min(s.duration, 60);
          reasons.push(`Readiness ${readiness.total}/100 — beperk tot recovery ride`);
        }
        if (s.type === 'gym') {
          s.suggestion = 'reduce volume to MEV';
          reasons.push(`Readiness ${readiness.total}/100 — reduceer volume tot MEV`);
        }
      }
      if (overreaching.level === 'severe' || overreaching.level === 'moderate') {
        if (s.type === 'cycling' && s.duration > 45) {
          s.suggestion = 'recovery ride <45min Z1';
          reasons.push(`Overreaching ${overreaching.level} — vervang door pure recovery`);
        }
        if (s.type === 'gym' && s.split === 'Legs') {
          s.suggestion = 'skip or move to next week';
          reasons.push(`Overreaching ${overreaching.level} — lower body sessie blokkeren`);
        }
      }
      const cyclingPlateau = plateaus.find(p => p.domain === 'cycling');
      if (cyclingPlateau && s.type === 'cycling' && !s.suggestion) {
        if (currentZoneModel?.lowPct > 80 && currentZoneModel?.highPct < 8) {
          s.suggestion = 'voeg VO2max intervallen toe (5×4min Z5, 3min herstel)';
          reasons.push('Plateau cycling — huidige verdeling te eenzijdig laag');
        } else if (currentZoneModel?.midPct > 30) {
          s.suggestion = 'shift naar polarized: meer Z2, minder Z3';
          reasons.push('Plateau cycling — te veel grey zone');
        }
      }
      const strengthPlateau = plateaus.find(p => p.domain === 'strength');
      if (strengthPlateau && s.type === 'gym' && !s.suggestion) {
        s.suggestion = 'verander rep range of voeg accommodating resistance toe';
        reasons.push(`Plateau ${strengthPlateau.exercise} — varieer prikkel`);
      }
      if (reasons.length) s.reason = reasons.join(' | ');
    });
    suggestions[date] = adjusted;
  });
  return suggestions;
}

// ────────────────────────────────────────────────────────────────────────────
// PERIODISATION PLAN
// ────────────────────────────────────────────────────────────────────────────
function computeTrainingPlan(data, state) {
  const eventDate = data?.goals?.eventDate;
  const eventName = data?.goals?.eventName || '';
  if (!eventDate) return null;

  const weeksToEvent = Math.ceil((new Date(eventDate) - new Date()) / (7 * 24 * 60 * 60 * 1000));

  let phase;
  if (weeksToEvent <= 1)      phase = 'race_week';
  else if (weeksToEvent <= 2) phase = 'taper_week1';
  else if (weeksToEvent <= 4) phase = 'peak';
  else if (weeksToEvent <= 8) phase = 'build';
  else                        phase = 'base';

  const mesocycleWeek = ((weeksToEvent - 1) % 4) + 1;
  const isRecoveryWeek = mesocycleWeek === 4;

  const ctl = state?.metrics?.ctl || state?.enduranceMetrics?.ctl || 0;

  let weeklyTSSTarget;
  if (isRecoveryWeek) {
    weeklyTSSTarget = Math.round(ctl * 7 * 0.60);
  } else {
    switch (phase) {
      case 'base':       weeklyTSSTarget = Math.round((ctl + 6) * 7); break;
      case 'build':      weeklyTSSTarget = Math.round((ctl + 7) * 7); break;
      case 'peak':       weeklyTSSTarget = Math.round((ctl + 4) * 7); break;
      case 'taper_week1':weeklyTSSTarget = Math.round(ctl * 7 * 0.50); break;
      case 'race_week':  weeklyTSSTarget = Math.round(ctl * 7 * 0.30); break;
      default:           weeklyTSSTarget = Math.round(ctl * 7);
    }
  }
  weeklyTSSTarget = Math.max(50, weeklyTSSTarget);

  // Total training minutes (1 TSS ≈ 1 min at mixed intensity)
  let timeFactor = 1.0;
  if (phase === 'taper_week1') timeFactor = 0.5;
  if (phase === 'race_week')   timeFactor = 0.3;
  const totalMinutes = Math.round(weeklyTSSTarget * timeFactor);

  let pcts;
  if (isRecoveryWeek) {
    pcts = { low: 1.0, mid: 0.0, high: 0.0 };
  } else {
    switch (phase) {
      case 'base':        pcts = { low: 0.80, mid: 0.15, high: 0.05 }; break;
      case 'build':       pcts = { low: 0.75, mid: 0.20, high: 0.05 }; break;
      case 'peak':        pcts = { low: 0.65, mid: 0.20, high: 0.15 }; break;
      case 'taper_week1': pcts = { low: 0.70, mid: 0.20, high: 0.10 }; break;
      case 'race_week':   pcts = { low: 0.80, mid: 0.15, high: 0.05 }; break;
      default:            pcts = { low: 0.80, mid: 0.15, high: 0.05 };
    }
  }
  const tidMinutes = {
    low:   Math.round(totalMinutes * pcts.low),
    mid:   Math.round(totalMinutes * pcts.mid),
    high:  Math.round(totalMinutes * pcts.high),
    total: totalMinutes
  };

  // Concurrent training restrictions per day-of-week
  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const gymPatterns = (data?.patterns || []).filter(p => p.type === 'gym' && p.split);
  const legsDays = new Set(gymPatterns.filter(p => p.split === 'legs').map(p => p.day));

  const cyclingRestrictions = {};
  dayOrder.forEach((day, idx) => {
    if (legsDays.has(day)) {
      cyclingRestrictions[day] = { maxZone: 2, reason: 'legs_day' };
    } else {
      const prevDay    = dayOrder[(idx + 6) % 7];
      const twoDaysPrev = dayOrder[(idx + 5) % 7];
      if (legsDays.has(prevDay)) {
        cyclingRestrictions[day] = { maxZone: 2, reason: 'day_after_legs' };
      } else if (legsDays.has(twoDaysPrev)) {
        cyclingRestrictions[day] = { maxZone: 3, reason: 'two_days_after_legs' };
      } else {
        cyclingRestrictions[day] = { maxZone: 5, reason: 'no_restriction' };
      }
    }
  });

  return { phase, mesocycleWeek, isRecoveryWeek, weeksToEvent, weeklyTSSTarget, tidMinutes, cyclingRestrictions, eventDate, eventName };
}

// ────────────────────────────────────────────────────────────────────────────
// POWER-DURATION CURVE (MMP) — O(n) sliding window per duratie
// ────────────────────────────────────────────────────────────────────────────
function computeMMP(powerTimeline, durations = [5,10,30,60,120,300,600,1200,1800,3600]) {
  if (!powerTimeline || powerTimeline.length < 60) return null;
  const n = powerTimeline.length;
  const result = {};
  for (const dur of durations) {
    if (dur > n) continue;
    let sum = 0, maxAvg = 0;
    for (let i = 0; i < n; i++) {
      sum += powerTimeline[i].w;
      if (i >= dur) sum -= powerTimeline[i - dur].w;
      if (i >= dur - 1) {
        const avg = sum / dur;
        if (avg > maxAvg) maxAvg = avg;
      }
    }
    if (maxAvg > 0) result[dur] = Math.round(maxAvg);
  }
  return Object.keys(result).length > 0 ? result : null;
}

// ────────────────────────────────────────────────────────────────────────────
// POWER PROFILE — Coggan-categorietabel (mannen) + niveau-interpolatie
// Bron: Allen & Coggan, Training and Racing with a Power Meter (power-profile chart).
// Getranscribeerd uit een open implementatie en kruisgecontroleerd: FTP-anchors
// 6.40 (top) / 1.86 (bodem) en de top-anchors 5s=24.04, 1min=11.50, 5min=7.60.
// Elke band is [low, high] W/kg; banden overlappen zoals in de originele tabel.
// Index 0..7 = Untrained, Fair(Cat5), Moderate(Cat4), Good(Cat3), Very Good(Cat2),
// Excellent(Cat1), Exceptional(Domestic Pro), World Class(Intl Pro).
// ────────────────────────────────────────────────────────────────────────────
const POWER_PROFILE_MALE = {
  '5s':    [[10.17,12.35],[11.80,13.98],[13.44,15.61],[15.07,17.24],[16.97,19.45],[18.60,20.78],[20.23,22.41],[21.86,24.04]],
  '1min':  [[5.64,6.56],[6.33,7.25],[7.02,7.94],[7.71,8.63],[8.51,9.43],[9.20,10.12],[9.89,10.81],[10.58,11.50]],
  '5min':  [[2.33,3.15],[2.95,3.77],[3.57,4.39],[4.19,5.01],[4.91,5.74],[5.53,6.36],[6.15,6.98],[6.77,7.60]],
  '20min': [[1.86,2.58],[2.40,3.11],[2.93,3.64],[3.47,4.18],[4.09,4.80],[4.62,5.33],[5.15,5.87],[5.69,6.40]],
};

const POWER_PROFILE_CATEGORIES = [
  'Untrained', 'Fair', 'Moderate', 'Good', 'Very Good', 'Excellent', 'Exceptional', 'World Class',
];

// Oplopende breekpunten: 8 ondergrenzen (niveaus 0..7) + world-class bovengrens (niveau 8).
function _ppBreakpoints(durationKey) {
  const bands = POWER_PROFILE_MALE[durationKey];
  if (!bands) return null;
  const bp = bands.map(b => b[0]);
  bp.push(bands[bands.length - 1][1]);
  return bp;
}

// Map W/kg → continu niveau 0..8 via stuksgewijs-lineaire interpolatie binnen de duur.
// Geeft { level, category } terug; category is de floor-band (geclamped).
function powerProfileLevel(wkg, durationKey) {
  const bp = _ppBreakpoints(durationKey);
  if (!bp || !(wkg > 0)) return { level: null, category: null };
  if (wkg <= bp[0]) return { level: 0, category: POWER_PROFILE_CATEGORIES[0] };
  if (wkg >= bp[8]) return { level: 8, category: POWER_PROFILE_CATEGORIES[7] };
  let i = 0;
  while (i < 8 && wkg >= bp[i + 1]) i++;
  const level = i + (wkg - bp[i]) / (bp[i + 1] - bp[i]);
  const catIdx = Math.min(7, Math.floor(level));
  return { level: +level.toFixed(3), category: POWER_PROFILE_CATEGORIES[catIdx] };
}

// ────────────────────────────────────────────────────────────────────────────
// RENNERSTYPE — deterministische classificatie uit de vier niveaus (0..8)
// Vergelijkt het korte spectrum (5s + 1min, neuromusculair/anaeroob) met het
// lange spectrum (5min + FTP, aeroob/drempel). Geen schatting, pure vorm-analyse.
// ────────────────────────────────────────────────────────────────────────────
function classifyRiderType(levels) {
  const s5 = levels && levels['5s'], m1 = levels && levels['1min'];
  const m5 = levels && levels['5min'], ft = levels && levels['20min'];
  if ([s5, m1, m5, ft].some(v => v == null)) {
    return { type: null, description: 'Onvolledig profiel: niet alle vier de duraties hebben gemeten data in dit venster.' };
  }
  const shortEnd = (s5 + m1) / 2;
  const longEnd  = (m5 + ft) / 2;
  const diff = longEnd - shortEnd;   // positief = duurtype, negatief = sprinttype
  const TH = 0.75;

  // Sterkste en zwakste as voor de omschrijving.
  const axes = [
    { k: 'sprint',  v: s5 }, { k: 'anaeroob', v: m1 },
    { k: 'VO₂max',  v: m5 }, { k: 'drempel',  v: ft },
  ];
  const strongest = axes.reduce((a, b) => b.v > a.v ? b : a);
  const weakest   = axes.reduce((a, b) => b.v < a.v ? b : a);

  let type, description;
  if (diff >= TH) {
    type = ft >= m5 ? 'Tijdritrenner' : 'Klimmer / VO₂-type';
    description = `Sterk op ${strongest.k}, zwakker op ${weakest.k}. Je profiel leunt naar duurvermogen: aeroob en drempel domineren over explosiviteit.`;
  } else if (diff <= -TH) {
    type = (s5 - m1) >= 0.5 ? 'Sprinter' : 'Puncheur';
    description = `Sterk op ${strongest.k}, zwakker op ${weakest.k}. Je profiel leunt naar korte, explosieve inspanningen boven langdurig drempelvermogen.`;
  } else {
    type = 'Allrounder';
    description = `Gebalanceerd over alle duraties (sterkste: ${strongest.k}, zwakste: ${weakest.k}). Geen uitgesproken specialisme.`;
  }
  return { type, description, diff: +diff.toFixed(2), shortEnd: +shortEnd.toFixed(2), longEnd: +longEnd.toFixed(2) };
}

// ────────────────────────────────────────────────────────────────────────────
// POWER-DURATION CURVE VOLLEDIG — één waarde per seconde (Int16Array)
// ────────────────────────────────────────────────────────────────────────────
function computeMMPFull(powerTimeline) {
  if (!powerTimeline || powerTimeline.length < 10) return null;
  const n = powerTimeline.length;
  const result = new Int16Array(n);
  for (let dur = 1; dur <= n; dur++) {
    let sum = 0, maxAvg = 0;
    for (let i = 0; i < n; i++) {
      sum += powerTimeline[i].w;
      if (i >= dur) sum -= powerTimeline[i - dur].w;
      if (i >= dur - 1) {
        const avg = sum / dur;
        if (avg > maxAvg) maxAvg = avg;
      }
    }
    result[dur - 1] = Math.round(maxAvg);
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// AEROBE EFFICIËNTIE TREND
// ────────────────────────────────────────────────────────────────────────────
function computeAerobicEfficiencyTrend(activities, settings) {
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - 180);

  const eligible = activities.filter(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return false;
    if ((a.moving_time || 0) < 2700) return false;
    if (!a.average_heartrate || a.average_heartrate <= 0) return false;
    if (!a.start_date) return false;
    const date = a.start_date.split('T')[0];
    if (isUnreliablePower(date, settings)) return false;
    return new Date(date) >= cutoff;
  });

  const powerPoints = [];
  const speedPoints = [];

  eligible.forEach(a => {
    const date = a.start_date.split('T')[0];
    const hr = a.average_heartrate;
    const name = a.name || '';
    if ((a.powerSource === 'measured' || a.powerSource === 'unknown') &&
        (a.weighted_average_watts || a.average_watts)) {
      const np = a.weighted_average_watts || a.average_watts;
      powerPoints.push({ date, ei: Math.round(np / hr * 100) / 100, basis: 'power', name });
    } else if (a.powerSource === 'estimated' && a.average_speed) {
      const speedKmh = a.average_speed * 3.6;
      powerPoints.length; // noop — keep series separate
      speedPoints.push({ date, ei: Math.round(speedKmh / hr * 1000) / 1000, basis: 'speed', name });
    }
  });

  powerPoints.sort((a, b) => a.date.localeCompare(b.date));
  speedPoints.sort((a, b) => a.date.localeCompare(b.date));

  if (!powerPoints.length && !speedPoints.length) return null;

  function addRolling(points) {
    return points.map(p => {
      const pDate = new Date(p.date);
      const win28 = new Date(pDate); win28.setDate(pDate.getDate() - 27);
      const inWin = points.filter(q => { const d = new Date(q.date); return d >= win28 && d <= pDate; });
      const rollingEI = Math.round(inWin.reduce((s, q) => s + q.ei, 0) / inWin.length * 100) / 100;
      return { date: p.date, ei: p.ei, rollingEI, name: p.name };
    });
  }

  function computeTrend(points) {
    const win56Start = new Date(now); win56Start.setDate(now.getDate() - 56);
    const win = points.filter(p => new Date(p.date) >= win56Start);
    if (win.length < 5) return { slope: 0, trendDirection: 'insufficient_data' };
    const origin = new Date(win[0].date);
    const n = win.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    win.forEach(p => {
      const x = Math.round((new Date(p.date) - origin) / 86400000);
      sumX += x; sumY += p.ei; sumXY += x * p.ei; sumX2 += x * x;
    });
    const denom = n * sumX2 - sumX * sumX;
    const slope = denom !== 0 ? Math.round((n * sumXY - sumX * sumY) / denom * 10000) / 10000 : 0;
    const trendDirection = slope > 0.001 ? 'improving' : slope < -0.001 ? 'declining' : 'stable';
    return { slope, trendDirection };
  }

  return {
    powerSeries: addRolling(powerPoints),
    speedSeries: addRolling(speedPoints),
    powerTrend: computeTrend(powerPoints),
    speedTrend: computeTrend(speedPoints)
  };
}

// ────────────────────────────────────────────────────────────────────────────
// LTHR SUGGESTIE — schat lactaatdrempel-hartslag uit measured ritten
// ────────────────────────────────────────────────────────────────────────────
function suggestLTHR(activities) {
  const now = new Date();
  const cutoff = new Date(now); cutoff.setDate(now.getDate() - 90);
  const eligible = activities.filter(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return false;
    if (a.powerSource !== 'measured') return false;
    if (!a.average_heartrate) return false;
    if ((a.moving_time || 0) < 1800) return false;
    const d = new Date(a.start_date);
    return d >= cutoff;
  });
  if (!eligible.length) return null;
  const hrs = eligible.map(a => a.average_heartrate).sort((a, b) => a - b);
  return { lthr: Math.round(hrs[Math.floor(hrs.length / 2)]), basedOn: eligible.length };
}

// ────────────────────────────────────────────────────────────────────────────
// COMPLETE STATE
// ────────────────────────────────────────────────────────────────────────────
function computeFullState(activities, hevyWorkouts, weight, nutrition, weekPlan, settings, data = null) {
  const { enduranceDailyETL, strengthDailyETL, sources } = buildDailyETLSeries(activities, hevyWorkouts, settings);
  const enduranceMetrics = computeLoadMetrics(enduranceDailyETL);
  const strengthMetrics  = computeStrengthMetrics(hevyWorkouts);
  const ftpInfo = rollingFtp(activities, settings);
  const zoneBreakdown = weeklyZoneBreakdown(activities, settings);
  const currentZoneModel = zoneBreakdown[zoneBreakdown.length - 1] || null;
  const perfTrends = performanceTrends(activities, hevyWorkouts, settings);
  const recentLoadSlope = computeLoadSlope(enduranceDailyETL);
  const plateaus = detectPlateau(perfTrends, recentLoadSlope >= 0);
  const overreaching = detectOverreaching(enduranceMetrics, enduranceMetrics.history, settings);

  const recentNutrition = Object.entries(nutrition || {})
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7).map(([, v]) => v);
  const wEntries = Object.entries(weight || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const currentWeight = wEntries[0] ? parseFloat(wEntries[0][1]) : 100;

  const personalModel = buildPersonalResponseModel(activities, enduranceMetrics.history, settings);

  // Slaapdata — laatste 90 dagen, ontbrekende dagen als null
  let sleepMetrics = null;
  if (data?.sleep) {
    const now = new Date();
    const sleepArr = [];
    for (let i = 89; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = d.toISOString().split('T')[0];
      sleepArr.push(data.sleep[key] ? { date: key, ...data.sleep[key] } : null);
    }
    sleepMetrics = computeSleepMetrics(sleepArr);
  }

  const readiness = readinessScore(enduranceMetrics, strengthMetrics, recentNutrition, currentWeight, personalModel, settings, sleepMetrics);
  const adaptivePlan = adaptiveWeekAdjustments(weekPlan, readiness, overreaching, plateaus, currentZoneModel);

  return {
    enduranceDailyETL, strengthDailyETL, sources,
    enduranceMetrics,
    metrics: enduranceMetrics, // backward-compat alias
    strengthMetrics,
    ftpInfo, zoneBreakdown, currentZoneModel,
    perfTrends, plateaus, overreaching,
    readiness, personalModel, adaptivePlan,
    currentWeight,
    sleepMetrics,
    aerobicEfficiencyTrend: computeAerobicEfficiencyTrend(activities, settings),
    trainingPlan: computeTrainingPlan(data, { metrics: enduranceMetrics })
  };
}

function computeLoadSlope(dailyETL) {
  const dates = Object.keys(dailyETL).sort().slice(-28);
  if (dates.length < 14) return 0;
  const half = Math.floor(dates.length / 2);
  const firstHalf  = dates.slice(0, half).reduce((s, d) => s + (dailyETL[d] || 0), 0) / half;
  const secondHalf = dates.slice(half).reduce((s, d) => s + (dailyETL[d] || 0), 0) / (dates.length - half);
  return secondHalf - firstHalf;
}

// ────────────────────────────────────────────────────────────────────────────
// SESSIE-CLASSIFICATIE OP BASIS VAN HARTSLAG (voor estimated/niet-gemeten ritten)
// ────────────────────────────────────────────────────────────────────────────
function classifySessionFromHR(hrTimeline, settings) {
  const hrMax = settings?.hrMax || DEFAULT_HR_MAX;
  if (!hrTimeline || hrTimeline.length < 10) {
    return { sessionType: 'onbekend', basis: 'hr', boutCount: 0, boutDurationCV: null, polarizationIndex: null, dominantBinFraction: null };
  }
  let timeLow = 0, timeMid = 0, timeHigh = 0;
  for (const pt of hrTimeline) {
    const hrPct = pt.hr / hrMax;
    if (hrPct < 0.83) timeLow++;
    else if (hrPct < 0.90) timeMid++;
    else timeHigh++;
  }
  const total = timeLow + timeMid + timeHigh;
  if (total === 0) return { sessionType: 'onbekend', basis: 'hr', boutCount: 0, boutDurationCV: null, polarizationIndex: null, dominantBinFraction: null };
  const lowFrac = timeLow / total;
  const midFrac = timeMid / total;
  const highFrac = timeHigh / total;
  let sessionType;
  if (lowFrac >= 0.80 && highFrac < 0.10) sessionType = 'steady endurance';
  else if (midFrac >= 0.35) sessionType = 'tempo/sweetspot';
  else if (highFrac >= 0.15 && midFrac < 0.20) sessionType = 'gestructureerde intervals';
  else sessionType = 'variabel';
  const polarizationIndex = timeMid > 0 ? Math.round((timeLow + timeHigh) / timeMid * 100) / 100 : null;
  return {
    sessionType, basis: 'hr',
    boutCount: 0, boutDurationCV: null,
    polarizationIndex,
    dominantBinFraction: Math.round(Math.max(lowFrac, midFrac, highFrac) * 100) / 100,
    hrZoneBreakdown: { lowPct: Math.round(lowFrac * 100), midPct: Math.round(midFrac * 100), highPct: Math.round(highFrac * 100) }
  };
}

function classifySession(powerTimeline, ftp) {
  if (!powerTimeline || powerTimeline.length < 60 || !ftp) {
    return { sessionType: 'onbekend', boutCount: 0, boutDurationCV: null, polarizationIndex: null, dominantBinFraction: null };
  }

  // Stap 1: 30-seconden voortschrijdend gemiddelde
  const WIN = 30;
  const smoothed = powerTimeline.map((p, i) => {
    let sum = 0, cnt = 0, j = i;
    while (j >= 0 && p.t - powerTimeline[j].t < WIN) { sum += powerTimeline[j].w; cnt++; j--; }
    return { t: p.t, w: cnt ? sum / cnt : p.w };
  });

  // Stap 2: Bout detection op 88% FTP (sweetspot/drempel threshold)
  const workThreshold = ftp * 0.88;
  const MIN_BOUT = 20;    // seconden
  const GAP_MERGE = 10;   // seconden

  const runs = [];
  let inWork = false, startT = 0;
  for (let i = 0; i < smoothed.length; i++) {
    const above = smoothed[i].w >= workThreshold;
    if (above && !inWork)  { inWork = true; startT = smoothed[i].t; }
    if (!above && inWork)  { inWork = false; runs.push({ start: startT, end: smoothed[i].t, dur: smoothed[i].t - startT }); }
  }
  if (inWork) runs.push({ start: startT, end: smoothed[smoothed.length-1].t, dur: smoothed[smoothed.length-1].t - startT });

  // Gap merge
  const merged = [];
  for (const r of runs) {
    if (merged.length && r.start - merged[merged.length-1].end <= GAP_MERGE) {
      merged[merged.length-1].end = r.end;
      merged[merged.length-1].dur = merged[merged.length-1].end - merged[merged.length-1].start;
    } else {
      merged.push({ ...r });
    }
  }

  // Filter korte bouts
  const bouts = merged.filter(b => b.dur >= MIN_BOUT);
  const boutCount = bouts.length;

  // Bout duration CV (standaardafwijking / gemiddelde)
  let boutDurationCV = null;
  if (boutCount >= 2) {
    const mean = bouts.reduce((s, b) => s + b.dur, 0) / boutCount;
    const sd = Math.sqrt(bouts.reduce((s, b) => s + Math.pow(b.dur - mean, 2), 0) / boutCount);
    boutDurationCV = mean > 0 ? Math.round(sd / mean * 100) / 100 : null;
  }

  // Stap 3: Power distribution — polarization index
  // Bins: laag < 65% FTP, middenveld 75-88% FTP, hoog > 90% FTP
  let timeLow = 0, timeMid = 0, timeHigh = 0, timeTotal = 0;
  const binCounts = {};
  for (const p of powerTimeline) {
    if (p.w <= 0) continue;
    const pct = p.w / ftp;
    timeTotal++;
    if (pct < 0.65) timeLow++;
    else if (pct >= 0.75 && pct < 0.88) timeMid++;
    else if (pct >= 0.90) timeHigh++;
    const bin = Math.floor(pct * 20);  // 5% brede bins
    binCounts[bin] = (binCounts[bin] || 0) + 1;
  }
  const polarizationIndex = timeMid > 0
    ? Math.round((timeLow + timeHigh) / timeMid * 100) / 100
    : null;

  // Dominant bin fraction
  const maxBin = timeTotal > 0 ? Math.max(...Object.values(binCounts)) / timeTotal : 0;
  const dominantBinFraction = Math.round(maxBin * 100) / 100;

  // Stap 4: Classificatie
  const IF = powerTimeline.reduce((s, p) => s + Math.pow(p.w, 4), 0);  // proxy via NP
  let sessionType;
  if (boutCount >= 3 && boutDurationCV !== null && boutDurationCV < 0.40) {
    sessionType = 'gestructureerde intervals';
  } else if (boutCount >= 3 && boutDurationCV !== null && boutDurationCV >= 0.40) {
    sessionType = 'ongestructureerd of groepsrit';
  } else if (boutCount <= 1 && dominantBinFraction >= 0.50) {
    sessionType = 'steady endurance';
  } else if (boutCount === 1 || (boutCount === 2 && dominantBinFraction >= 0.40)) {
    sessionType = 'tempo of sweetspot';
  } else if (polarizationIndex !== null && polarizationIndex > 2.0) {
    sessionType = 'polarized';
  } else {
    sessionType = 'variabel';
  }

  return { sessionType, boutCount, boutDurationCV, polarizationIndex, dominantBinFraction };
}

module.exports = {
  computeETLForActivity,
  computeETLForHevyWorkout,
  buildDailyETLSeries,
  computeLoadMetrics,
  projectWeekEndTSB,
  computeStrengthMetrics,
  computeCalibrationFactor,
  rollingFtp, ftpForDate,
  activityZoneClassification,
  weeklyZoneBreakdown, classifyTrainingModel,
  performanceTrends,
  detectPlateau, detectOverreaching,
  readinessScore,
  buildPersonalResponseModel,
  adaptiveWeekAdjustments,
  computeTrainingPlan,
  computeFullState,
  isUnreliablePower,
  classifySession,
  classifySessionFromHR,
  computeHrTSS,
  suggestLTHR,
  computeSleepMetrics,
  computeAerobicEfficiencyTrend,
  computeMMP,
  computeMMPFull,
  powerProfileLevel, POWER_PROFILE_MALE, POWER_PROFILE_CATEGORIES, classifyRiderType,
  ENDURANCE_TYPES, STRENGTH_TYPES
};
