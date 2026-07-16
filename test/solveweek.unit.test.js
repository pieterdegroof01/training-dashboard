'use strict';
// Alle testcases delen dezelfde vaste nowMs (maandag 2026-07-13T00:00:00Z) en
// hetzelfde week_start, zodat het venster (week_start .. +6 dagen) en
// "vandaag"-filter (slot_date >= todayISO(nowMs)) voorspelbaar blijven.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { solveWeek } = require('../planner');
const { slot, mesoRow, planParams } = require('./helpers');

const NOW_MS = Date.UTC(2026, 6, 13);

function baseState(overrides) {
  return Object.assign({
    ftp: 250,
    thresholdPace: 300, // 5:00/km
    runBaseline: null,
    runAcwr: null,
    lastWeekRunMinutes: 0,
  }, overrides);
}

describe('solveWeek — C5a', () => {
  test('a. legszoneplafond: 2 binnen 48u, 5 erna; sessie geen sweetspot/threshold binnen het venster', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'ftp', dominant_modality: 'cycling',
      strength_sessions: 1, running_minutes_cap: 0, endurance_tss_target: 400,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['strength'], minutes: 60, hour: '18:00' }),
      slot({ date: '2026-07-14', modalities: ['cycling'],  minutes: 90, hour: '18:00' }),
      slot({ date: '2026-07-15', modalities: ['cycling'],  minutes: 90, hour: '18:00' }),
    ];
    const state = baseState({ thresholdPace: null });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    assert.strictEqual(result.diagnostics.zoneCeilings['2026-07-14'], 2);
    assert.strictEqual(result.diagnostics.zoneCeilings['2026-07-15'], 5);

    const tuePresc = result.prescriptions.find(p => p.prescribed_date === '2026-07-14' && p.modality === 'cycling');
    assert.ok(tuePresc, 'dinsdag heeft een fietsprescriptie');
    assert.notStrictEqual(tuePresc.session_type, 'sweetspot');
    assert.notStrictEqual(tuePresc.session_type, 'threshold');

    const legsPresc = result.prescriptions.find(p => p.modality === 'strength');
    assert.strictEqual(legsPresc.session_type, 'legs');
    assert.strictEqual(legsPresc.prescribed_date, '2026-07-13');
  });

  test('b. idempotentie: tweede aanroep met output van de eerste levert nul nieuwe sessies', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'ftp', dominant_modality: 'cycling',
      strength_sessions: 1, running_minutes_cap: 0, endurance_tss_target: 400,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['strength'], minutes: 60, hour: '18:00' }),
      slot({ date: '2026-07-14', modalities: ['cycling'],  minutes: 90, hour: '18:00' }),
      slot({ date: '2026-07-15', modalities: ['cycling'],  minutes: 90, hour: '18:00' }),
    ];
    const state = baseState({ thresholdPace: null });

    const first = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);
    const second = solveWeek(meso, slots, state, first.sessions, planParams(), NOW_MS);

    assert.strictEqual(Object.keys(second.sessions).length, 0);
    assert.strictEqual(second.prescriptions.length, 0);
  });

  test('c. handmatige krachtsessie blijft staan en telt af van strength_sessions', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 2, running_minutes_cap: 0, endurance_tss_target: 200,
    });
    const slots = [
      slot({ date: '2026-07-14', modalities: ['strength'], minutes: 60, hour: '18:00' }),
      slot({ date: '2026-07-15', modalities: ['strength'], minutes: 60, hour: '18:00' }),
    ];
    const existingSessions = {
      '2026-07-13': [{
        date: '2026-07-13', type: 'strength', split: 'push', duration: 60,
        timeOfDay: '07:00', targetTSS: null, aiGenerated: false, source: 'manual', title: 'Manual Push',
      }],
    };
    const before = JSON.parse(JSON.stringify(existingSessions));
    const state = baseState({ thresholdPace: null });

    const result = solveWeek(meso, slots, state, existingSessions, planParams(), NOW_MS);

    const newStrength = Object.values(result.sessions).flat().filter(s => s.type === 'strength');
    assert.strictEqual(newStrength.length, 1); // 2 - 1 bestaande = 1 nieuwe
    assert.deepStrictEqual(existingSessions, before); // input niet gemuteerd
  });

  test('d. loopslot binnen 6u van legs: conflict; op 24u: geplaatst', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 0, running_minutes_cap: 180, endurance_tss_target: 100,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['running'], minutes: 60, hour: '21:00' }), // 3u na legs
      slot({ date: '2026-07-14', modalities: ['running'], minutes: 60, hour: '18:00' }), // 24u na legs
    ];
    const existingSessions = {
      '2026-07-13': [{
        date: '2026-07-13', type: 'strength', split: 'legs', duration: 60,
        timeOfDay: '18:00', targetTSS: null,
      }],
    };
    const state = baseState({ runBaseline: { longestM: 50000, runCount: 10 } });

    const result = solveWeek(meso, slots, state, existingSessions, planParams(), NOW_MS);

    assert.ok(result.diagnostics.constraints.some(
      c => c.kind === 'run_legs_conflict' && c.date === '2026-07-13'));
    const runOn13 = (result.sessions['2026-07-13'] || []).some(s => s.type === 'running');
    assert.strictEqual(runOn13, false);
    const runOn14 = (result.sessions['2026-07-14'] || []).some(s => s.type === 'running');
    assert.strictEqual(runOn14, true);
  });

  test('e. spike-guard kort de lange duurloop in tot hoogstens 11km bij runBaseline longestM=10000', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 0, running_minutes_cap: 200, endurance_tss_target: 100,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['running'], minutes: 97, hour: '18:00' }),
    ];
    const state = baseState({ runBaseline: { longestM: 10000, runCount: 5 } });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const runSession = (result.sessions['2026-07-13'] || []).find(s => s.type === 'running');
    assert.ok(runSession, 'lange duurloop is geplaatst');
    const { plannedRunDistanceM } = require('../planner');
    const distanceM = plannedRunDistanceM(runSession.blokken, state.thresholdPace);
    assert.ok(distanceM <= 11000, `distanceM=${distanceM}`);
    assert.ok(result.diagnostics.constraints.some(c => c.kind === 'run_spike_capped'));
  });

  test('f. runAcwr.status high blokkeert alle nieuwe loopsessies', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 0, running_minutes_cap: 200, endurance_tss_target: 100,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['running'], minutes: 60, hour: '18:00' }),
    ];
    const state = baseState({ runAcwr: { status: 'high', acwr: 1.8 } });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const hasRunning = Object.values(result.sessions).flat().some(s => s.type === 'running');
    assert.strictEqual(hasRunning, false);
    assert.ok(result.diagnostics.constraints.some(c => c.kind === 'acwr_blocked'));
  });

  test('g. lastWeekRunMinutes=100 cappt loopvolume op 110 minuten ondanks hogere running_minutes_cap', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 0, running_minutes_cap: 300, endurance_tss_target: 100,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['running'], minutes: 90, hour: '18:00' }),
      slot({ date: '2026-07-14', modalities: ['running'], minutes: 90, hour: '18:00' }),
    ];
    const state = baseState({ lastWeekRunMinutes: 100, runBaseline: { longestM: 100000, runCount: 10 } });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const totalMin = Object.values(result.sessions).flat()
      .filter(s => s.type === 'running')
      .reduce((s, x) => s + x.duration, 0);
    assert.ok(Math.abs(totalMin - 110) < 1e-6, `totalMin=${totalMin}`);
  });

  test('h. krachtsessies hebben targetTSS null; endurance-TSS (fiets+loop) overschrijdt endurance_tss_target niet', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 1, running_minutes_cap: 60, endurance_tss_target: 300,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['strength'], minutes: 60, hour: '18:00' }),
      slot({ date: '2026-07-14', modalities: ['running'],  minutes: 60, hour: '18:00' }),
      slot({ date: '2026-07-15', modalities: ['cycling'],  minutes: 90, hour: '18:00' }),
    ];
    const state = baseState({ runBaseline: { longestM: 50000, runCount: 10 } });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const strengthSessions = Object.values(result.sessions).flat().filter(s => s.type === 'strength');
    assert.ok(strengthSessions.length > 0);
    for (const s of strengthSessions) assert.strictEqual(s.targetTSS, null);
    for (const p of result.prescriptions.filter(p => p.modality === 'strength')) {
      assert.strictEqual(p.target_tss, null);
    }

    const enduranceTSS = result.prescriptions
      .filter(p => p.modality === 'cycling' || p.modality === 'running')
      .reduce((sum, p) => sum + (p.target_tss || 0), 0);
    assert.ok(enduranceTSS <= meso.endurance_tss_target, `enduranceTSS=${enduranceTSS}`);
  });

  test('i. is_deload: true levert geen enkele HIT-sessie', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'ftp', dominant_modality: 'cycling',
      is_deload: true, strength_sessions: 0, running_minutes_cap: 0, endurance_tss_target: 300,
    });
    const slots = [
      slot({ date: '2026-07-16', modalities: ['cycling'], minutes: 90, hour: '18:00' }),
      slot({ date: '2026-07-17', modalities: ['cycling'], minutes: 90, hour: '18:00' }),
      slot({ date: '2026-07-18', modalities: ['cycling'], minutes: 60, hour: '18:00' }),
    ];
    const state = baseState({ thresholdPace: null });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const hitTypes = ['threshold', 'vo2max', 'sweetspot', 'tempo'];
    for (const p of result.prescriptions.filter(p => p.modality === 'cycling')) {
      assert.ok(!hitTypes.includes(p.session_type), `onverwacht HIT-type in deload: ${p.session_type}`);
    }
  });

  test('j. zonder thresholdPace: geen loopsessie, diagnostiek no_threshold_pace', () => {
    const meso = mesoRow({
      phase: 'build', dominant_type: 'base', dominant_modality: 'cycling',
      strength_sessions: 0, running_minutes_cap: 100, endurance_tss_target: 100,
    });
    const slots = [
      slot({ date: '2026-07-13', modalities: ['running'], minutes: 60, hour: '18:00' }),
    ];
    const state = baseState({ thresholdPace: null });

    const result = solveWeek(meso, slots, state, {}, planParams(), NOW_MS);

    const hasRunning = Object.values(result.sessions).flat().some(s => s.type === 'running');
    assert.strictEqual(hasRunning, false);
    assert.ok(result.diagnostics.constraints.some(c => c.kind === 'no_threshold_pace'));
  });
});
