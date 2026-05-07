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
    name: a.name
  }));
  const sorted = efforts.sort((a, b) => b.np - a.np);
  const top3 = sorted.slice(0, 3);
  const median = top3[Math.floor(top3.length / 2)].np;

  return { ftp: Math.round(median * 0.95), basedOn: top3, method: 'top-20min × 0.95' };
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
  const z3 = (z.z3 != null ? z.z3 / 100 : null) ?? 0.90;
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

  // Cycling
  if (activity.type === 'Ride' || activity.type === 'VirtualRide') {
    if (activity.average_watts && !inUnreliable && durH > 0) {
      const np = activity.weighted_average_watts || activity.average_watts;
      const IF = np / ftp;
      return Math.min(Math.round(IF * IF * durH * 100), 400);
    }
    if (activity.suffer_score > 0) return Math.round(activity.suffer_score * sufferFactor);
    return Math.round(durH * 50);
  }

  // Running
  if (activity.type === 'Run' || activity.type === 'TrailRun') {
    if (activity.suffer_score > 0) return Math.round(activity.suffer_score * 1.2);
    if (activity.average_heartrate) {
      const hrR = (activity.average_heartrate - 60) / (hrMax - 60);
      const trimp = durH * 60 * hrR * (0.64 * Math.exp(1.92 * hrR));
      return Math.min(Math.round(trimp * 1.2), 400);
    }
    return Math.round(durH * 75 * 1.2);
  }

  if (activity.type === 'Swim') return Math.round(durH * 65);
  if (activity.type === 'Hike') return Math.round(durH * 35);
  if (activity.type === 'Walk') return Math.round(durH * 20);

  if (activity.type === 'WeightTraining' || activity.type === 'Workout') {
    return Math.round(durH * 45);
  }

  return Math.round(durH * 40);
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
  } else if (totalReps / totalSets <= 6) avgRPE = 8.5;
  else if (totalReps / totalSets <= 10) avgRPE = 8.0;
  else avgRPE = 7.0;

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
  const dailyETL = {};
  const sources  = {};

  activities.forEach(a => {
    const d = a.start_date?.split('T')[0];
    if (!d) return;
    a._unreliablePower = isUnreliablePower(d, settings);
    const etl = computeETLForActivity(a, settings);
    if (!dailyETL[d]) { dailyETL[d] = 0; sources[d] = []; }
    dailyETL[d] += etl;
    sources[d].push({ kind: 'strava', type: a.type, name: a.name, etl, durMin: Math.round((a.moving_time || 0) / 60) });
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
    if (!dailyETL[d]) { dailyETL[d] = 0; sources[d] = []; }
    dailyETL[d] += etl;
    strengthDailyETL[d] = (strengthDailyETL[d] || 0) + etl;
    sources[d].push({ kind: 'hevy', name: w.name || 'Workout', etl, breakdown });
  });

  return { enduranceDailyETL, strengthDailyETL, dailyETL, sources };
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
// READINESS SCORE — duurbelasting + krachtherstel + voeding
// ────────────────────────────────────────────────────────────────────────────
function readinessScore(enduranceMetrics, strengthMetrics, recentNutrition, currentWeight, personalModel, settings) {
  const optimalTSB = personalModel?.optimalTSB ?? { min: -10, max: 5 };

  // TSB component (35 pts) — alleen duurtraining
  let tsbScore = 35;
  if (enduranceMetrics.tsb < optimalTSB.min - 25) tsbScore = 0;
  else if (enduranceMetrics.tsb < optimalTSB.min - 10) tsbScore = 8;
  else if (enduranceMetrics.tsb < optimalTSB.min) tsbScore = 22;
  else if (enduranceMetrics.tsb > optimalTSB.max + 15) tsbScore = 26;
  else if (enduranceMetrics.tsb > optimalTSB.max + 5) tsbScore = 30;

  // ACWR component (20 pts) — alleen duurtraining
  let acwrScore = 20;
  if (enduranceMetrics.acwr > 1.5) acwrScore = 0;
  else if (enduranceMetrics.acwr > 1.3) acwrScore = 8;
  else if (enduranceMetrics.acwr > 1.2) acwrScore = 14;
  else if (enduranceMetrics.acwr < 0.6) acwrScore = 12;

  // Monotony component (15 pts) — alleen duurtraining
  let monotonyScore = 15;
  if (enduranceMetrics.monotony > 2.5) monotonyScore = 0;
  else if (enduranceMetrics.monotony > 2.0) monotonyScore = 6;
  else if (enduranceMetrics.monotony > 1.7) monotonyScore = 11;

  // Load slope (10 pts)
  let loadSlopeScore = 10;
  if (enduranceMetrics.acwr > 1.4) loadSlopeScore = 2;
  else if (enduranceMetrics.acwr > 1.25) loadSlopeScore = 6;

  // Voeding (10 pts)
  let nutritionScore = 5;
  if (recentNutrition && recentNutrition.length >= 3) {
    const avgKcal    = recentNutrition.reduce((s, n) => s + (parseInt(n.kcal) || 0), 0) / recentNutrition.length;
    const avgProtein = recentNutrition.reduce((s, n) => s + (parseInt(n.protein) || 0), 0) / recentNutrition.length;
    const proteinPerKg = currentWeight ? avgProtein / currentWeight : 0;
    nutritionScore = 0;
    if (proteinPerKg >= 2.0) nutritionScore += 5;
    else if (proteinPerKg >= 1.6) nutritionScore += 3;
    if (avgKcal >= 1800) nutritionScore += 5;
    else if (avgKcal >= 1500) nutritionScore += 3;
  }

  // Krachtherstel component (10 pts)
  let strengthFatigueScore = 10;
  if (strengthMetrics) {
    const daysSinceLower = strengthMetrics.muscleGroups?.lower_body?.daysSinceLastSession ?? 99;
    const volRatio = strengthMetrics.avgWeeklyLoad4w > 0
      ? strengthMetrics.weeklyLoad / strengthMetrics.avgWeeklyLoad4w : 1;
    if (daysSinceLower <= 1) strengthFatigueScore = 2;
    else if (daysSinceLower <= 2) strengthFatigueScore = 5;
    else if (daysSinceLower <= 3) strengthFatigueScore = 7;
    if (volRatio > 1.5) strengthFatigueScore = Math.max(0, strengthFatigueScore - 3);
    else if (volRatio > 1.2) strengthFatigueScore = Math.max(0, strengthFatigueScore - 1);
  }

  const total = tsbScore + acwrScore + monotonyScore + loadSlopeScore + nutritionScore + strengthFatigueScore;
  return {
    total,
    breakdown: {
      tsb: tsbScore, acwr: acwrScore, monotony: monotonyScore,
      loadSlope: loadSlopeScore, nutrition: nutritionScore, strengthFatigue: strengthFatigueScore
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
// COMPLETE STATE
// ────────────────────────────────────────────────────────────────────────────
function computeFullState(activities, hevyWorkouts, weight, nutrition, weekPlan, settings) {
  const { enduranceDailyETL, strengthDailyETL, dailyETL, sources } = buildDailyETLSeries(activities, hevyWorkouts, settings);
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
  const readiness = readinessScore(enduranceMetrics, strengthMetrics, recentNutrition, currentWeight, personalModel, settings);
  const adaptivePlan = adaptiveWeekAdjustments(weekPlan, readiness, overreaching, plateaus, currentZoneModel);

  return {
    enduranceDailyETL, strengthDailyETL, dailyETL, sources,
    enduranceMetrics,
    metrics: enduranceMetrics, // backward-compat alias
    strengthMetrics,
    ftpInfo, zoneBreakdown, currentZoneModel,
    perfTrends, plateaus, overreaching,
    readiness, personalModel, adaptivePlan,
    currentWeight
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

module.exports = {
  computeETLForActivity,
  computeETLForHevyWorkout,
  buildDailyETLSeries,
  computeLoadMetrics,
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
  computeFullState,
  isUnreliablePower,
  ENDURANCE_TYPES, STRENGTH_TYPES
};
