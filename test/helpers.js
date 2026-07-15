'use strict';
// Shared fixture-builders for deterministic test data. No clock calls here.

function makeRide({ date, durationSec, watts, npWatts, type = 'Ride' }) {
  return {
    type,
    start_date: date + 'T12:00:00Z',
    moving_time: durationSec,
    average_watts: watts,
    weighted_average_watts: npWatts ?? watts,
    powerSource: 'measured',
    device_watts: true,
  };
}

function makeRun({ date, durationSec, avgHr, avgSpeed, watts, type = 'Run' }) {
  const a = {
    type,
    start_date: date + 'T12:00:00Z',
    moving_time: durationSec,
    average_heartrate: avgHr,
  };
  if (avgSpeed != null) a.average_speed = avgSpeed;                          // m/s
  if (watts != null) { a.average_watts = watts; a.weighted_average_watts = watts; }  // Strava-schatting
  return a;
}

// Returns { 'YYYY-MM-DD': loadPerDay, ... } for `days` consecutive days.
function constantDailyETL(startDate, days, loadPerDay) {
  const out = {};
  const d = new Date(startDate + 'T12:00:00');
  for (let i = 0; i < days; i++) {
    out[d.toISOString().split('T')[0]] = loadPerDay;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// spikeDay is 0-indexed. That single day gets spikeLoad; all others get baseLoad.
function impulseDailyETL(startDate, days, spikeDay, baseLoad, spikeLoad) {
  const out = {};
  const d = new Date(startDate + 'T12:00:00');
  for (let i = 0; i < days; i++) {
    out[d.toISOString().split('T')[0]] = i === spikeDay ? spikeLoad : baseLoad;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// pattern: [{dur, watts}, ...] → [{t, w}, ...] with t incrementing per sample.
function makePowerTimeline(pattern) {
  const out = [];
  let t = 0;
  for (const seg of pattern) {
    for (let i = 0; i < seg.dur; i++) out.push({ t: t++, w: seg.watts });
  }
  return out;
}

function availDay(date, maxDuration, maxZone) {
  return { date, maxDuration, maxZone };
}

// Mirrors POPULATION_PRIORS from athleteParams.js (hardcoded to avoid DB import).
function planParams() {
  return {
    rampCapCtlPerWeek:            6,
    loadWeeksBeforeRecovery:      3,
    ctlTimeConstantDays:         42,
    atlTimeConstantDays:          7,
    minTsbForQuality:           -25,
    interferenceFactor:          1.0,
    maxHitSessionsPerWeek:         3,
    minHoursBetweenHit:           48,
    distributionPolarizedMinHours: 8,
    distributionPyramidalMinHours: 6,
  };
}

module.exports = {
  makeRide, makeRun,
  constantDailyETL, impulseDailyETL,
  makePowerTimeline,
  availDay, planParams,
};
