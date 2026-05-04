// ════════════════════════════════════════════════════════════════════════════
// engine.js — Deterministische rekenlaag voor het training dashboard
// Alles wat exact berekend kan worden, gebeurt hier. AI redeneert alleen.
// ════════════════════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ────────────────────────────────────────────────────────────────────────────
const ATL_TAU = 7;     // dagen
const CTL_TAU = 42;    // dagen
const DEFAULT_FTP = 280;
const DEFAULT_HR_MAX = 197; // 220 - 23

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
// ROLLING FTP ESTIMATE
// Gebruikt beste 20-min vermogen (Strava NP/avg over rit van >20min) × 0.95
// uit de laatste 30-60 dagen, defecte periode uitgesloten.
// ────────────────────────────────────────────────────────────────────────────
function rollingFtp(activities, settings, asOfDate = null) {
  const cutoffEnd = asOfDate ? new Date(asOfDate) : new Date();
  const cutoffStart = new Date(cutoffEnd); cutoffStart.setDate(cutoffStart.getDate() - 60);

  const candidates = activities.filter(a => {
    if (a.type !== 'Ride' && a.type !== 'VirtualRide') return false;
    const d = a.start_date?.split('T')[0] || '';
    if (!d) return false;
    if (isUnreliablePower(d, settings)) return false;
    const dt = new Date(d);
    if (dt < cutoffStart || dt > cutoffEnd) return false;
    if (!a.average_watts || a.moving_time < 1200) return false; // ≥20 min
    return true;
  });

  if (!candidates.length) return null;

  // Beste benadering van 20-min vermogen: weighted_average_watts of average_watts
  // van een rit van minstens 20 min. Voor langere ritten beter NP gebruiken.
  const efforts = candidates.map(a => {
    const np = a.weighted_average_watts || a.average_watts;
    return { date: a.start_date.split('T')[0], np, name: a.name };
  });

  const sorted = efforts.sort((a, b) => b.np - a.np);
  const top3 = sorted.slice(0, 3);
  const median = top3[Math.floor(top3.length / 2)].np;

  return {
    ftp: Math.round(median * 0.95),
    basedOn: top3,
    method: 'top-20min × 0.95'
  };
}

function ftpForDate(activities, settings, date) {
  // Snapshot van rolling FTP op een specifieke datum (voor historische zone-analyse)
  const r = rollingFtp(activities, settings, date);
  return r?.ftp || settings?.ftp || DEFAULT_FTP;
}

// ────────────────────────────────────────────────────────────────────────────
// ZONE-CLASSIFICATIE PER ACTIVITEIT
// Classificeert dominante zone op basis van power (primair), HR (fallback), RPE.
// ────────────────────────────────────────────────────────────────────────────
function activityZoneClassification(activity, ftp, hrMax) {
  const date = activity.start_date?.split('T')[0] || '';
  const inUnreliable = activity.average_watts &&
    (activity._unreliablePower || false);

  // Power-based (primair)
  if (activity.average_watts && !inUnreliable) {
    const np = activity.weighted_average_watts || activity.average_watts;
    const IF = np / ftp;
    if (IF < 0.55) return { zone: 'Z1', method: 'power', IF: +IF.toFixed(2) };
    if (IF < 0.75) return { zone: 'Z2', method: 'power', IF: +IF.toFixed(2) };
    if (IF < 0.90) return { zone: 'Z3', method: 'power', IF: +IF.toFixed(2) };
    if (IF < 1.05) return { zone: 'Z4', method: 'power', IF: +IF.toFixed(2) };
    return { zone: 'Z5', method: 'power', IF: +IF.toFixed(2) };
  }

  // HR-based (fallback)
  if (activity.average_heartrate && hrMax) {
    const hrPct = activity.average_heartrate / hrMax;
    if (hrPct < 0.68) return { zone: 'Z1', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.83) return { zone: 'Z2', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.90) return { zone: 'Z3', method: 'hr', hrPct: +hrPct.toFixed(2) };
    if (hrPct < 0.95) return { zone: 'Z4', method: 'hr', hrPct: +hrPct.toFixed(2) };
    return { zone: 'Z5', method: 'hr', hrPct: +hrPct.toFixed(2) };
  }

  // Suffer score / duration ratio fallback
  if (activity.suffer_score && activity.moving_time) {
    const intensity = activity.suffer_score / (activity.moving_time / 3600);
    if (intensity < 25) return { zone: 'Z2', method: 'suffer-rate' };
    if (intensity < 50) return { zone: 'Z3', method: 'suffer-rate' };
    if (intensity < 90) return { zone: 'Z4', method: 'suffer-rate' };
    return { zone: 'Z5', method: 'suffer-rate' };
  }

  // Default
  return { zone: 'Z2', method: 'default' };
}

function zoneToCategory(zone) {
  if (zone === 'Z1' || zone === 'Z2') return 'low';
  if (zone === 'Z3') return 'mid';
  return 'high';
}

// ────────────────────────────────────────────────────────────────────────────
// ETL — EQUIVALENT TRAINING LOAD
// Uniform voor alle modaliteiten. Output is direct vergelijkbaar.
// ────────────────────────────────────────────────────────────────────────────
function computeETLForActivity(activity, settings) {
  const date = activity.start_date?.split('T')[0] || '';
  const inUnreliable = isUnreliablePower(date, settings);
  const durH = (activity.moving_time || 0) / 3600;
  const ftp = settings?.ftp || DEFAULT_FTP;

  // Cycling
  if (activity.type === 'Ride' || activity.type === 'VirtualRide') {
    // Strava effort score (suffer_score) als directe ETL bij beschikbaarheid
    if (activity.suffer_score > 0) return activity.suffer_score;
    // Anders TSS uit power (mits betrouwbaar)
    if (activity.average_watts && !inUnreliable && durH > 0) {
      const np = activity.weighted_average_watts || activity.average_watts;
      const IF = np / ftp;
      const tss = IF * IF * durH * 100;
      return Math.min(Math.round(tss), 400);
    }
    // Fallback op duur × baseline
    return Math.round(durH * 50);
  }

  // Running — impactcorrectie 1.2× tov fietsen
  if (activity.type === 'Run' || activity.type === 'TrailRun') {
    if (activity.suffer_score > 0) return Math.round(activity.suffer_score * 1.2);
    // HR-based TRIMP-achtig
    if (activity.average_heartrate) {
      const hrR = (activity.average_heartrate - 60) / (DEFAULT_HR_MAX - 60);
      const trimp = durH * 60 * hrR * (0.64 * Math.exp(1.92 * hrR));
      return Math.min(Math.round(trimp * 1.2), 400);
    }
    return Math.round(durH * 75 * 1.2);
  }

  // Swim
  if (activity.type === 'Swim') return Math.round(durH * 65);

  // Hike/Walk
  if (activity.type === 'Hike') return Math.round(durH * 35);
  if (activity.type === 'Walk') return Math.round(durH * 20);

  // Krachttraining (Strava WeightTraining of zonder hevy data)
  if (activity.type === 'WeightTraining' || activity.type === 'Workout') {
    return Math.round(durH * 45);
  }

  // Default
  return Math.round(durH * 40);
}

// Krachttraining ETL uit Hevy workout data
// session_RPE × duration_min × volumeFactor × muscleGroupFactor × compoundFactor / 10
function computeETLForHevyWorkout(workout, opts = {}) {
  if (!workout || !workout.exercises) return 0;

  const startTime = new Date(workout.start_time);
  const endTime = workout.end_time ? new Date(workout.end_time) : null;
  const durMin = endTime ? (endTime - startTime) / 60000 : 60;

  // Volume: totale tonnage
  let totalSets = 0, totalReps = 0, totalTonnage = 0;
  let lowerBodySets = 0, upperBodySets = 0;
  let compoundSets = 0;
  const highRPESets = []; // sets met expliciete RPE >= 8

  const lowerBodyKeywords = ['squat', 'deadlift', 'leg press', 'lunge', 'rdl', 'leg curl', 'leg extension', 'hip thrust', 'calf', 'glute'];
  const compoundKeywords = ['squat', 'deadlift', 'bench press', 'overhead press', 'row', 'pull-up', 'pullup', 'chin', 'press', 'rdl', 'clean', 'snatch'];

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

  // RPE: gemiddelde van logged RPE, of schat op basis van rep range
  let avgRPE = 7.5; // default moderate
  if (highRPESets.length) {
    avgRPE = highRPESets.reduce((a, b) => a + b, 0) / highRPESets.length;
  } else if (totalReps / totalSets <= 6) avgRPE = 8.5; // zwaar laag rep
  else if (totalReps / totalSets <= 10) avgRPE = 8.0;
  else avgRPE = 7.0;

  // Factoren
  const lowerRatio = lowerBodySets / totalSets;
  const muscleGroupFactor = 1.0 + 0.3 * lowerRatio; // 1.0 (full upper) → 1.3 (full lower)
  const compoundRatio = compoundSets / totalSets;
  const compoundFactor = 0.85 + 0.35 * compoundRatio; // 0.85 isolation → 1.2 compound
  const volumeFactor = Math.min(1.0 + (totalSets - 12) / 30, 1.5); // schaalt met set-aantal
  const intensityFactor = avgRPE / 7.5; // RPE 7.5 = neutraal

  const etl = (avgRPE * durMin * volumeFactor * muscleGroupFactor * compoundFactor * intensityFactor) / 10;
  return {
    etl: Math.min(Math.round(etl), 250),
    breakdown: {
      durMin: Math.round(durMin), totalSets, totalReps,
      tonnage: Math.round(totalTonnage),
      avgRPE: +avgRPE.toFixed(1),
      lowerBodyRatio: +lowerRatio.toFixed(2),
      compoundRatio: +compoundRatio.toFixed(2)
    }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// DAILY ETL SERIES — combineer alle bronnen tot één dagload
// ────────────────────────────────────────────────────────────────────────────
function buildDailyETLSeries(activities, hevyWorkouts, settings) {
  const dailyETL = {};
  const sources = {}; // per dag een array met bronnen

  // Strava activiteiten
  activities.forEach(a => {
    const d = a.start_date?.split('T')[0];
    if (!d) return;
    a._unreliablePower = isUnreliablePower(d, settings);
    const etl = computeETLForActivity(a, settings);
    if (!dailyETL[d]) { dailyETL[d] = 0; sources[d] = []; }
    dailyETL[d] += etl;
    sources[d].push({ kind: 'strava', type: a.type, name: a.name, etl, durMin: Math.round((a.moving_time || 0) / 60) });
  });

  // Hevy workouts
  (hevyWorkouts || []).forEach(w => {
    const d = w.start_time?.split('T')[0];
    if (!d) return;
    const result = computeETLForHevyWorkout(w);
    const etl = typeof result === 'number' ? result : result.etl;
    const breakdown = typeof result === 'number' ? null : result.breakdown;
    if (!dailyETL[d]) { dailyETL[d] = 0; sources[d] = []; }
    dailyETL[d] += etl;
    sources[d].push({ kind: 'hevy', name: w.name || 'Workout', etl, breakdown });
  });

  return { dailyETL, sources };
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

  // ACWR: ATL/CTL
  const acwr = ctl > 0 ? +(atl / ctl).toFixed(2) : 0;

  // Monotony & strain over laatste 7 dagen
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
    acwr,
    monotony,
    strain,
    weeklyLoad: Math.round(totalLoad7),
    history
  };
}

// ────────────────────────────────────────────────────────────────────────────
// WEEKLY ZONE BREAKDOWN — voor polarized/pyramidal/threshold classificatie
// ────────────────────────────────────────────────────────────────────────────
function weeklyZoneBreakdown(activities, settings) {
  const weeks = {};

  activities.forEach(a => {
    if (!['Ride', 'VirtualRide', 'Run', 'TrailRun'].includes(a.type)) return;
    const date = a.start_date?.split('T')[0] || '';
    if (!date) return;

    const d = new Date(date);
    const dow = (d.getDay() + 6) % 7;
    const mon = new Date(d); mon.setDate(d.getDate() - dow);
    const wk = mon.toISOString().split('T')[0];

    a._unreliablePower = isUnreliablePower(date, settings);
    const ftp = ftpForDate(activities, settings, date);
    const z = activityZoneClassification(a, ftp, DEFAULT_HR_MAX);
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
        week,
        sessions: v.sessions,
        lowMin: Math.round(v.low),
        midMin: Math.round(v.mid),
        highMin: Math.round(v.high),
        totalMin: Math.round(v.total),
        lowPct: Math.round(v.low / total * 100),
        midPct: Math.round(v.mid / total * 100),
        highPct: Math.round(v.high / total * 100),
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
// PERFORMANCE TREND — power voor wielrennen, pace voor lopen, volume voor kracht
// ────────────────────────────────────────────────────────────────────────────
function performanceTrends(activities, hevyWorkouts, settings) {
  // Wielrennen: 4-weeks rolling van top NP per rit > 30 min
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

  // Hardlopen: gemiddelde pace (m/s) per maand
  const runPerf = {};
  activities.filter(a => a.type === 'Run' && a.moving_time > 600)
    .forEach(a => {
      const date = a.start_date?.split('T')[0];
      const monthKey = date?.substring(0, 7);
      if (!monthKey || !a.distance || !a.moving_time) return;
      const speed = a.distance / a.moving_time; // m/s
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

  // Krachttraining: top set per oefening per maand (uit Hevy)
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
        // E1RM formule (Epley)
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
// PLATEAU DETECTIE — per domein
// ────────────────────────────────────────────────────────────────────────────
function detectPlateau(performanceTrend, hasIncreasingLoad) {
  const plateaus = [];

  // Cycling: laatste 4 maanden geen NP-progressie ondanks load
  if (performanceTrend.cyclingMonthly?.length >= 3) {
    const last3 = performanceTrend.cyclingMonthly.slice(-3);
    const tops = last3.map(m => m.topNP);
    const change = tops[tops.length - 1] - tops[0];
    if (Math.abs(change) < 5 && hasIncreasingLoad) {
      plateaus.push({ domain: 'cycling', detail: `Top NP stagneert rond ${tops[0]}W over 3+ maanden ondanks gelijkblijvende of stijgende load.` });
    }
  }

  // Running
  if (performanceTrend.runMonthly?.length >= 3) {
    const last3 = performanceTrend.runMonthly.slice(-3);
    const paces = last3.map(m => m.topPaceMinPerKm);
    const improvement = paces[0] - paces[paces.length - 1];
    if (Math.abs(improvement) < 0.05 && hasIncreasingLoad) {
      plateaus.push({ domain: 'running', detail: `Top pace stagneert rond ${paces[0]} min/km over 3+ maanden.` });
    }
  }

  // Strength: gemiddelde e1RM-verandering
  performanceTrend.liftTrends?.forEach(lift => {
    if (lift.months.length < 3) return;
    const last3 = lift.months.slice(-3);
    const change = last3[last3.length - 1].e1rm - last3[0].e1rm;
    if (Math.abs(change) < 2.5) {
      plateaus.push({ domain: 'strength', exercise: lift.exercise, detail: `e1RM ${lift.exercise} stagneert rond ${last3[0].e1rm}kg.` });
    }
  });

  return plateaus;
}

// ────────────────────────────────────────────────────────────────────────────
// OVERREACHING DETECTIE
// ────────────────────────────────────────────────────────────────────────────
function detectOverreaching(metrics, history) {
  const flags = [];
  const dates = Object.keys(history).sort().slice(-14);

  if (metrics.tsb < -25) flags.push(`TSB ${metrics.tsb} < -25 (zwaar overbelast)`);
  if (metrics.acwr > 1.5) flags.push(`ACWR ${metrics.acwr} > 1.5 (acute spike, blessurerisico)`);
  if (metrics.monotony > 2.5) flags.push(`Monotony ${metrics.monotony} > 2.5 (te eentonig, geen herstel-pieken)`);
  if (metrics.strain > 6000) flags.push(`Strain ${metrics.strain} > 6000 (zeer hoge weekbelasting × eentonigheid)`);

  // Aanhoudend negatieve TSB
  const negativeDays = dates.filter(d => history[d].tsb < -15).length;
  if (negativeDays >= 7) flags.push(`TSB < -15 op ${negativeDays}/14 dagen (chronische vermoeidheid)`);

  let level = 'none';
  if (flags.length >= 3) level = 'severe';
  else if (flags.length >= 2) level = 'moderate';
  else if (flags.length >= 1) level = 'mild';

  return { level, flags };
}

// ────────────────────────────────────────────────────────────────────────────
// READINESS SCORE — 0-100 met breakdown
// ────────────────────────────────────────────────────────────────────────────
function readinessScore(metrics, recentNutrition, currentWeight, personalModel) {
  const optimalTSB = personalModel?.optimalTSB ?? { min: -10, max: 5 };

  // TSB component (40 pts)
  let tsbScore = 40;
  if (metrics.tsb < optimalTSB.min - 25) tsbScore = 0;
  else if (metrics.tsb < optimalTSB.min - 10) tsbScore = 10;
  else if (metrics.tsb < optimalTSB.min) tsbScore = 25;
  else if (metrics.tsb > optimalTSB.max + 15) tsbScore = 30; // te uitgerust = lichte detraining
  else if (metrics.tsb > optimalTSB.max + 5) tsbScore = 35;

  // ACWR component (25 pts)
  let acwrScore = 25;
  if (metrics.acwr > 1.5) acwrScore = 0;
  else if (metrics.acwr > 1.3) acwrScore = 10;
  else if (metrics.acwr > 1.2) acwrScore = 18;
  else if (metrics.acwr < 0.6) acwrScore = 15; // laag is detraining

  // Monotony component (15 pts)
  let monotonyScore = 15;
  if (metrics.monotony > 2.5) monotonyScore = 0;
  else if (metrics.monotony > 2.0) monotonyScore = 6;
  else if (metrics.monotony > 1.7) monotonyScore = 11;

  // Recent load slope (10 pts) — niet te snel stijgend
  let loadSlopeScore = 10;
  if (metrics.acwr > 1.4) loadSlopeScore = 2;
  else if (metrics.acwr > 1.25) loadSlopeScore = 6;

  // Voeding (10 pts)
  let nutritionScore = 5;
  if (recentNutrition && recentNutrition.length >= 3) {
    const avgKcal = recentNutrition.reduce((s, n) => s + (parseInt(n.kcal) || 0), 0) / recentNutrition.length;
    const avgProtein = recentNutrition.reduce((s, n) => s + (parseInt(n.protein) || 0), 0) / recentNutrition.length;
    const proteinPerKg = currentWeight ? avgProtein / currentWeight : 0;
    nutritionScore = 0;
    if (proteinPerKg >= 2.0) nutritionScore += 5;
    else if (proteinPerKg >= 1.6) nutritionScore += 3;
    if (avgKcal >= 1800) nutritionScore += 5;
    else if (avgKcal >= 1500) nutritionScore += 3;
  }

  const total = tsbScore + acwrScore + monotonyScore + loadSlopeScore + nutritionScore;
  return {
    total,
    breakdown: {
      tsb: tsbScore,
      acwr: acwrScore,
      monotony: monotonyScore,
      loadSlope: loadSlopeScore,
      nutrition: nutritionScore
    },
    interpretation: total >= 80 ? 'uitgerust' : total >= 65 ? 'goed' : total >= 50 ? 'matig' : total >= 35 ? 'vermoeid' : 'overbelast'
  };
}

// ────────────────────────────────────────────────────────────────────────────
// PERSONAL RESPONSE MODEL — analyseer historische respons
// ────────────────────────────────────────────────────────────────────────────
function buildPersonalResponseModel(activities, history, settings) {
  // Bepaal in welke TSB range deze atleet historisch het best presteerde
  // (top 10% van NP-prestaties matchen tegen TSB op die dag)
  const cyclingActs = activities.filter(a =>
    (a.type === 'Ride' || a.type === 'VirtualRide') &&
    a.moving_time > 1800 && a.average_watts &&
    !isUnreliablePower(a.start_date?.split('T')[0] || '', settings)
  );

  if (cyclingActs.length < 20) {
    return {
      optimalTSB: { min: -10, max: 5 },
      fatigueDelay: 1,
      loadTolerance: 'onbekend',
      interferenceSensitivity: 'onbekend',
      note: 'Onvoldoende data voor gepersonaliseerd model — defaults gebruikt.'
    };
  }

  const npValues = cyclingActs.map(a => a.weighted_average_watts || a.average_watts);
  const top10pct = pctile(npValues, 90);
  const topRides = cyclingActs.filter(a => (a.weighted_average_watts || a.average_watts) >= top10pct);

  const tsbAtTopRides = topRides.map(a => {
    const d = a.start_date?.split('T')[0];
    return history[d]?.tsb;
  }).filter(t => t !== undefined);

  let optimalTSB = { min: -10, max: 5 };
  if (tsbAtTopRides.length >= 5) {
    const sorted = [...tsbAtTopRides].sort((a, b) => a - b);
    optimalTSB = {
      min: Math.round(sorted[Math.floor(sorted.length * 0.25)]),
      max: Math.round(sorted[Math.floor(sorted.length * 0.75)])
    };
  }

  // Load tolerance: peak weekly ETL die historisch werd volgehouden zonder TSB < -25
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
    optimalTSB,
    fatigueDelay: 2, // default; vereist HRV data voor exacte berekening
    loadTolerance: loadTolerance ? `~${loadTolerance} ETL/week zonder overreaching` : 'onbekend',
    interferenceSensitivity: 'medium', // default; vereist gym+duur correlatie data
    sampleSize: { topRides: topRides.length, sustainableWeeks: sustainableWeeks.length }
  };
}

// ────────────────────────────────────────────────────────────────────────────
// ADAPTIVE PLANNING — pas geplande sessies aan op readiness/overreaching/plateau
// ────────────────────────────────────────────────────────────────────────────
function adaptiveWeekAdjustments(weekPlan, readiness, overreaching, plateaus, currentZoneModel) {
  const suggestions = {};

  Object.entries(weekPlan || {}).forEach(([date, sessions]) => {
    const adjusted = sessions.map(s => ({ ...s, suggestion: null, reason: null }));

    adjusted.forEach(s => {
      const reasons = [];

      // Bij lage readiness: volume verlagen
      if (readiness.total < 50) {
        if (s.type === 'cycling' && s.duration > 60) {
          s.suggestion = 'recovery ride';
          s.duration = Math.min(s.duration, 60);
          reasons.push(`Readiness ${readiness.total}/100 — beperk tot recovery ride`);
        }
        if (s.type === 'gym') {
          s.suggestion = 'reduce volume to MEV';
          reasons.push(`Readiness ${readiness.total}/100 — reduceer volume tot MEV`);
        }
      }

      // Bij overreaching: hersteldagen
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

      // Bij plateau: nieuwe stimulus
      const cyclingPlateau = plateaus.find(p => p.domain === 'cycling');
      if (cyclingPlateau && s.type === 'cycling' && !s.suggestion) {
        // Suggestie afhankelijk van huidig model
        if (currentZoneModel?.lowPct > 80 && currentZoneModel?.highPct < 8) {
          s.suggestion = 'voeg VO2max intervallen toe (5×4min Z5, 3min herstel)';
          reasons.push('Plateau cycling — huidige verdeling te eenzijdig laag, voeg high-intensity prikkel toe');
        } else if (currentZoneModel?.midPct > 30) {
          s.suggestion = 'shift naar polarized: meer Z2, minder Z3';
          reasons.push('Plateau cycling — te veel grey zone, verschuif naar polarized model');
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
// COMPLETE STATE — alles samen voor de AI prompt en frontend
// ────────────────────────────────────────────────────────────────────────────
function computeFullState(activities, hevyWorkouts, weight, nutrition, weekPlan, settings) {
  const { dailyETL, sources } = buildDailyETLSeries(activities, hevyWorkouts, settings);
  const metrics = computeLoadMetrics(dailyETL);
  const ftpInfo = rollingFtp(activities, settings);
  const zoneBreakdown = weeklyZoneBreakdown(activities, settings);
  const currentZoneModel = zoneBreakdown[zoneBreakdown.length - 1] || null;
  const perfTrends = performanceTrends(activities, hevyWorkouts, settings);

  const recentLoadSlope = computeLoadSlope(dailyETL);
  const plateaus = detectPlateau(perfTrends, recentLoadSlope >= 0);
  const overreaching = detectOverreaching(metrics, metrics.history);

  // Recente voeding voor readiness
  const recentNutrition = Object.entries(nutrition || {})
    .sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7).map(([d, v]) => v);
  const wEntries = Object.entries(weight || {}).sort((a, b) => b[0].localeCompare(a[0]));
  const currentWeight = wEntries[0] ? parseFloat(wEntries[0][1]) : 100;

  const personalModel = buildPersonalResponseModel(activities, metrics.history, settings);
  const readiness = readinessScore(metrics, recentNutrition, currentWeight, personalModel);
  const adaptivePlan = adaptiveWeekAdjustments(weekPlan, readiness, overreaching, plateaus, currentZoneModel);

  return {
    dailyETL, sources,
    metrics, ftpInfo, zoneBreakdown, currentZoneModel,
    perfTrends, plateaus, overreaching,
    readiness, personalModel, adaptivePlan,
    currentWeight
  };
}

function computeLoadSlope(dailyETL) {
  // Slope van load over laatste 28 dagen (positief = stijgende belasting)
  const dates = Object.keys(dailyETL).sort().slice(-28);
  if (dates.length < 14) return 0;
  const half = Math.floor(dates.length / 2);
  const firstHalf = dates.slice(0, half).reduce((s, d) => s + (dailyETL[d] || 0), 0) / half;
  const secondHalf = dates.slice(half).reduce((s, d) => s + (dailyETL[d] || 0), 0) / (dates.length - half);
  return secondHalf - firstHalf;
}

module.exports = {
  computeETLForActivity,
  computeETLForHevyWorkout,
  buildDailyETLSeries,
  computeLoadMetrics,
  rollingFtp,
  ftpForDate,
  activityZoneClassification,
  weeklyZoneBreakdown,
  classifyTrainingModel,
  performanceTrends,
  detectPlateau,
  detectOverreaching,
  readinessScore,
  buildPersonalResponseModel,
  adaptiveWeekAdjustments,
  computeFullState,
  isUnreliablePower
};
