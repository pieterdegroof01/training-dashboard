'use strict';
// computeStrengthTrends is UTC-maandag geankerd (Date.UTC), dus DST-onafhankelijk.
// We bouwen synthetische Hevy-workouts met bekende tonnage en Epley-e1RM en
// asserteren tegen handmatig berekende waarden, niet tegen de code zelf.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeStrengthTrends } = require('../engine');

function isoDaysAgo(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

describe('computeStrengthTrends — tonnage', () => {
  test('squat 100kg×5 telt als 500kg lower_body-tonnage in de juiste week', () => {
    const workouts = [{
      start_time: isoDaysAgo(3) + 'T18:00:00Z',
      exercises: [{ title: 'Back Squat', sets: [{ reps: 5, weight_kg: 100 }] }],
    }];
    const { muscleSeries } = computeStrengthTrends(workouts, { weeks: 26, minSessions: 3 });
    const total = muscleSeries.reduce((s, w) => s + w.lower_body, 0);
    assert.equal(total, 500);
    // Geen lekkage naar andere groepen.
    assert.equal(muscleSeries.reduce((s, w) => s + w.push + w.pull + w.core + w.other, 0), 0);
  });

  test('onbekende oefening valt in de other-bucket', () => {
    const workouts = [{
      start_time: isoDaysAgo(2) + 'T18:00:00Z',
      exercises: [{ title: 'Elliptical Trainer', sets: [{ reps: 10, weight_kg: 40 }] }],
    }];
    const { muscleSeries } = computeStrengthTrends(workouts);
    assert.equal(muscleSeries.reduce((s, w) => s + w.other, 0), 400);
  });

  test('workout ouder dan het venster telt niet mee', () => {
    const workouts = [{
      start_time: isoDaysAgo(26 * 7 + 14) + 'T18:00:00Z',
      exercises: [{ title: 'Deadlift', sets: [{ reps: 3, weight_kg: 150 }] }],
    }];
    const { muscleSeries } = computeStrengthTrends(workouts, { weeks: 26 });
    assert.equal(muscleSeries.reduce((s, w) => s + w.lower_body, 0), 0);
  });
});

describe('computeStrengthTrends — e1RM', () => {
  test('Epley: bench 100kg×5 => e1RM 117 (100×(1+5/30)=116.67, afgerond)', () => {
    const workouts = [
      { start_time: isoDaysAgo(20) + 'T18:00:00Z', exercises: [{ title: 'Bench Press', sets: [{ reps: 5, weight_kg: 100 }] }] },
      { start_time: isoDaysAgo(13) + 'T18:00:00Z', exercises: [{ title: 'Bench Press', sets: [{ reps: 5, weight_kg: 102 }] }] },
      { start_time: isoDaysAgo(6)  + 'T18:00:00Z', exercises: [{ title: 'Bench Press', sets: [{ reps: 3, weight_kg: 105 }] }] },
    ];
    const { e1rmSeries } = computeStrengthTrends(workouts, { minSessions: 3 });
    const bench = e1rmSeries.find(e => e.exercise === 'Bench Press');
    assert.ok(bench, 'Bench Press moet in de reeks staan');
    assert.equal(bench.enough, true);
    assert.equal(bench.sessions.length, 3);
    assert.equal(bench.sessions[0].e1rm, 117);
  });

  test('beste set per sessie wint (zwaardere set bepaalt e1RM van die dag)', () => {
    const workouts = [{
      start_time: isoDaysAgo(5) + 'T18:00:00Z',
      exercises: [{ title: 'Deadlift', sets: [
        { reps: 8, weight_kg: 120 },   // e1RM 152
        { reps: 3, weight_kg: 160 },   // e1RM 176 => moet winnen
      ] }],
    }];
    const { e1rmSeries } = computeStrengthTrends(workouts, { minSessions: 1 });
    const dl = e1rmSeries.find(e => e.exercise === 'Deadlift');
    assert.equal(dl.sessions[0].e1rm, 176);
  });

  test('onder de sessie-drempel => enough=false', () => {
    const workouts = [
      { start_time: isoDaysAgo(10) + 'T18:00:00Z', exercises: [{ title: 'Overhead Press', sets: [{ reps: 5, weight_kg: 60 }] }] },
      { start_time: isoDaysAgo(3)  + 'T18:00:00Z', exercises: [{ title: 'Overhead Press', sets: [{ reps: 5, weight_kg: 60 }] }] },
    ];
    const { e1rmSeries } = computeStrengthTrends(workouts, { minSessions: 3 });
    const ohp = e1rmSeries.find(e => e.exercise === 'Overhead Press');
    assert.equal(ohp.enough, false);
    assert.equal(ohp.sessions.length, 2);
  });

  test('niet-hoofdlift levert geen e1RM-reeks op', () => {
    const workouts = [{
      start_time: isoDaysAgo(4) + 'T18:00:00Z',
      exercises: [{ title: 'Bicep Curl', sets: [{ reps: 10, weight_kg: 15 }] }],
    }];
    const { e1rmSeries } = computeStrengthTrends(workouts, { minSessions: 1 });
    assert.equal(e1rmSeries.find(e => e.exercise === 'Bicep Curl'), undefined);
  });
});
