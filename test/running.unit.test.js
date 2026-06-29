'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const {
  gradeAdjustFactor, computeNGP,
  computeRunningLoad, computeRunningEF, computeRunningDecoupling,
} = engine;

// ── gradeAdjustFactor (Minetti 2002) ────────────────────────────────────────

describe('gradeAdjustFactor', () => {
  test('factor(0) === 1.0', () => {
    assert.strictEqual(gradeAdjustFactor(0), 1.0);
  });

  test('C(0.45)/C(0) binnen 5% van 18.93/3.40', () => {
    const expected = 18.93 / 3.40; // ≈ 5.568
    const actual   = gradeAdjustFactor(0.45);
    const relErr   = Math.abs(actual - expected) / expected;
    assert.ok(relErr < 0.05,
      `gradeAdjustFactor(0.45) = ${actual.toFixed(4)}, verwacht ≈${expected.toFixed(4)} ± 5% (rel. fout ${(relErr*100).toFixed(2)}%)`);
  });

  test('minimum over [-0.45,0] ligt rond -0.20: C(-0.20)/C(0) binnen 10% van 1.73/3.40', () => {
    const expected = 1.73 / 3.40; // ≈ 0.509
    const actual   = gradeAdjustFactor(-0.20);
    const relErr   = Math.abs(actual - expected) / expected;
    assert.ok(relErr < 0.10,
      `gradeAdjustFactor(-0.20) = ${actual.toFixed(4)}, verwacht ≈${expected.toFixed(4)} ± 10% (rel. fout ${(relErr*100).toFixed(2)}%)`);

    // -0.20 moet lager zijn dan grove buurpunten -0.10 en -0.30 (lokaal minimum)
    assert.ok(actual < gradeAdjustFactor(-0.10),
      `gradeAdjustFactor(-0.20) moet lager zijn dan bij -0.10`);
    assert.ok(actual < gradeAdjustFactor(-0.30),
      `gradeAdjustFactor(-0.20) moet lager zijn dan bij -0.30`);
  });

  test('factor monotoon stijgend voor i in [0, 0.45]', () => {
    const steps = [0, 0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45];
    for (let j = 1; j < steps.length; j++) {
      const prev = gradeAdjustFactor(steps[j - 1]);
      const curr = gradeAdjustFactor(steps[j]);
      assert.ok(curr > prev,
        `factor niet monotoon stijgend: f(${steps[j-1]})=${prev.toFixed(4)} >= f(${steps[j]})=${curr.toFixed(4)}`);
    }
  });

  test('clamp: waarden buiten [-0.45, 0.45] worden geclamped', () => {
    assert.strictEqual(gradeAdjustFactor(-1.0), gradeAdjustFactor(-0.45));
    assert.strictEqual(gradeAdjustFactor(1.0),  gradeAdjustFactor(0.45));
  });
});

// ── computeRunningLoad ───────────────────────────────────────────────────────

describe('computeRunningLoad', () => {
  test('1 uur op exact drempeltempo → load 100, source rtss, IF 1.0', () => {
    const thresholdPace = 300; // 5:00 min/km = 300 s/km → ftpSpeed = 1000/300 m/s
    const ftpSpeed      = 1000 / thresholdPace;
    const result = computeRunningLoad(3600, ftpSpeed, {}, { thresholdPace });
    assert.strictEqual(result.load,   100);
    assert.strictEqual(result.source, 'rtss');
    assert.strictEqual(result.IF,     1.0);
  });

  test('rTSS cap op 400', () => {
    const thresholdPace = 300;
    const fastSpeed     = 4 * (1000 / thresholdPace); // IF=4 → rTSS=1600
    const result = computeRunningLoad(3600, fastSpeed, {}, { thresholdPace });
    assert.strictEqual(result.load, 400);
    assert.strictEqual(result.source, 'rtss');
  });

  test('zonder thresholdPace maar met lthr → source hr', () => {
    const activity = { average_heartrate: 155, moving_time: 3600 };
    const result   = computeRunningLoad(3600, 3.0, activity, { lthr: 160 });
    assert.strictEqual(result.source, 'hr');
    assert.strictEqual(result.IF,     null);
  });

  test('zonder thresholdPace en zonder lthr maar met HR → source fallback', () => {
    const activity = { average_heartrate: 150, moving_time: 3600 };
    const result   = computeRunningLoad(3600, 3.0, activity, {});
    assert.ok(result.source === 'hr' || result.source === 'fallback');
    assert.strictEqual(result.IF, null);
  });

  test('thresholdPace maar ngpSpeed=0 → valt terug op hr/fallback', () => {
    const activity = { average_heartrate: 150, moving_time: 3600 };
    const result   = computeRunningLoad(3600, 0, activity, { thresholdPace: 300 });
    assert.ok(result.source === 'hr' || result.source === 'fallback');
  });
});

// ── computeRunningEF ─────────────────────────────────────────────────────────

describe('computeRunningEF', () => {
  test('hogere ngpSpeed bij gelijke HR geeft hogere EF', () => {
    const ef1 = computeRunningEF(3.0, 150);
    const ef2 = computeRunningEF(3.5, 150);
    assert.ok(ef2 > ef1,
      `EF bij 3.5 m/s (${ef2}) moet hoger zijn dan bij 3.0 m/s (${ef1})`);
  });

  test('berekening: (ngpSpeed × 60) / HR, 2 decimalen', () => {
    const ef = computeRunningEF(3.0, 150);
    assert.strictEqual(ef, Math.round(3.0 * 60 / 150 * 100) / 100);
  });

  test('ontbrekende HR → null', () => {
    assert.strictEqual(computeRunningEF(3.0, null),      null);
    assert.strictEqual(computeRunningEF(3.0, undefined), null);
    assert.strictEqual(computeRunningEF(3.0, 0),         null);
  });
});

// ── computeRunningDecoupling ─────────────────────────────────────────────────

describe('computeRunningDecoupling', () => {
  function makeSamples(n, speed, grade = 0) {
    return Array.from({ length: n }, (_, t) => ({ t, v: speed, g: grade }));
  }

  test('gelijke snelheid, hogere HR tweede helft → status drift', () => {
    const n       = 3600; // 1 uur
    const samples = makeSamples(n, 3.0);
    const hrSamples = Array.from({ length: n }, (_, t) => t < n / 2 ? 140 : 160);
    const result  = computeRunningDecoupling(samples, hrSamples);
    assert.ok(result !== null, 'verwacht niet-null');
    assert.strictEqual(result.status, 'drift');
    assert.ok(result.decoupling > 0, 'positieve drift verwacht');
  });

  test('constante snelheid en HR → status goed', () => {
    const n       = 3600;
    const samples = makeSamples(n, 3.0);
    const hrSamples = Array.from({ length: n }, () => 150);
    const result  = computeRunningDecoupling(samples, hrSamples);
    assert.ok(result !== null);
    assert.strictEqual(result.status, 'goed');
    assert.strictEqual(result.decoupling, 0);
  });

  test('run korter dan 1800s → null', () => {
    const samples   = Array.from({ length: 100 }, (_, i) => ({ t: i * 10, v: 3.0, g: 0 }));
    const hrSamples = Array.from({ length: 100 }, () => 150);
    assert.strictEqual(computeRunningDecoupling(samples, hrSamples), null);
  });

  test('ontbrekende samples of hrSamples → null', () => {
    assert.strictEqual(computeRunningDecoupling(null, []),   null);
    assert.strictEqual(computeRunningDecoupling([], null),   null);
    assert.strictEqual(computeRunningDecoupling(null, null), null);
  });
});
