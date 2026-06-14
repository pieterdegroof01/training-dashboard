'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const {
  computeETLForActivity, computeLoadMetrics,
  classifyTrainingModel, classifySession,
  readinessScore, detectOverreaching,
  computeMMP, computeMMPFull,
} = engine;
const { makeRide, makeRun, constantDailyETL, makePowerTimeline } = require('./helpers');

// ── computeETLForActivity — pad-selectie ────────────────────────────────────

describe('computeETLForActivity pad-selectie', () => {
  test('measured power → tssSource power', () => {
    const a = makeRide({ date: '2026-01-15', durationSec: 3600, watts: 280 });
    const r = computeETLForActivity(a, { ftp: 280 });
    assert.strictEqual(r.tssSource, 'power');
    assert.strictEqual(r.etl, 100);
  });

  test('unknown power → tssSource power_unverified', () => {
    const a = { ...makeRide({ date: '2026-01-15', durationSec: 3600, watts: 280 }), powerSource: 'unknown' };
    const r = computeETLForActivity(a, { ftp: 280 });
    assert.strictEqual(r.tssSource, 'power_unverified');
  });

  test('geen power maar lthr+HR → tssSource hr', () => {
    const a = {
      type: 'Ride',
      start_date: '2026-01-15T12:00:00Z',
      moving_time: 3600,
      average_heartrate: 150,
    };
    const r = computeETLForActivity(a, { ftp: 280, lthr: 155 });
    assert.strictEqual(r.tssSource, 'hr');
  });

  test('niets bruikbaar → tssSource fallback', () => {
    const a = { type: 'Ride', start_date: '2026-01-15T12:00:00Z', moving_time: 3600 };
    const r = computeETLForActivity(a, { ftp: 280 });
    assert.strictEqual(r.tssSource, 'fallback');
  });
});

describe('computeETLForActivity cap en unreliable venster', () => {
  test('reken-TSS > 400 → etl exact 400', () => {
    // IF = 300/100 = 3.0, 1h → TSS = 900 → capped at 400
    const a = makeRide({ date: '2026-01-15', durationSec: 3600, watts: 300, npWatts: 300 });
    const r = computeETLForActivity(a, { ftp: 100 });
    assert.strictEqual(r.etl, 400);
  });

  test('unreliable-power-venster → tssSource fallback', () => {
    const a = {
      ...makeRide({ date: '2025-06-15', durationSec: 3600, watts: 280 }),
      suffer_score: 80,
    };
    const r = computeETLForActivity(a, {
      ftp: 280,
      unreliablePowerStart: '2025-01-01',
      unreliablePowerEnd:   '2025-12-31',
    });
    assert.strictEqual(r.tssSource, 'fallback');
    assert.strictEqual(r.etl, 80); // suffer_score * sufferFactor(1.0)
  });
});

// ── computeLoadMetrics ──────────────────────────────────────────────────────

describe('computeLoadMetrics', () => {
  test('lege input → alles nul', () => {
    const m = computeLoadMetrics({}, '2026-01-15');
    assert.strictEqual(m.atl, 0);
    assert.strictEqual(m.ctl, 0);
    assert.strictEqual(m.tsb, 0);
    assert.strictEqual(m.acwr, 0);
  });

  test('sd <= 0.5 en load > 0 → monotony 5', () => {
    // Constante load → sd = 0, monotony = 5
    const etl = constantDailyETL('2026-01-01', 7, 100);
    const m = computeLoadMetrics(etl, '2026-01-07');
    assert.strictEqual(m.monotony, 5);
  });

  test('sd <= 0.5 en load = 0 → monotony 0', () => {
    const etl = constantDailyETL('2026-01-01', 7, 0);
    const m = computeLoadMetrics(etl, '2026-01-07');
    assert.strictEqual(m.monotony, 0);
  });

  test('history bevat één entry per dag van eerste ETL-dag t/m asOfDate', () => {
    const etl = { '2026-01-05': 100 };
    const m = computeLoadMetrics(etl, '2026-01-07');
    const days = Object.keys(m.history).sort();
    assert.deepStrictEqual(days, ['2026-01-05', '2026-01-06', '2026-01-07']);
  });
});

// ── classifyTrainingModel — exacte drempels ─────────────────────────────────

describe('classifyTrainingModel', () => {
  test('(0.80,0.05,0.15) → polarized', () => {
    assert.strictEqual(classifyTrainingModel(0.80, 0.05, 0.15), 'polarized');
  });

  test('(0.55,0.30,0.15) → threshold-heavy', () => {
    assert.strictEqual(classifyTrainingModel(0.55, 0.30, 0.15), 'threshold-heavy');
  });

  test('(0.78,0.14,0.08) → pyramidal', () => {
    assert.strictEqual(classifyTrainingModel(0.78, 0.14, 0.08), 'pyramidal');
  });

  test('(0.90,0.05,0.04) → volume-only', () => {
    assert.strictEqual(classifyTrainingModel(0.90, 0.05, 0.04), 'volume-only');
  });

  test('lowFrac < 0.5 → mixed/onbekend', () => {
    assert.strictEqual(classifyTrainingModel(0.40, 0.40, 0.20), 'mixed/onbekend');
  });
});

// ── classifySession ─────────────────────────────────────────────────────────

describe('classifySession', () => {
  test('< 60 samples → sessionType onbekend', () => {
    const tl = makePowerTimeline([{ dur: 59, watts: 200 }]);
    const r = classifySession(tl, 280);
    assert.strictEqual(r.sessionType, 'onbekend');
  });

  test('ftp ontbreekt → sessionType onbekend', () => {
    const tl = makePowerTimeline([{ dur: 200, watts: 200 }]);
    const r = classifySession(tl, null);
    assert.strictEqual(r.sessionType, 'onbekend');
  });

  test('4 gelijke hoge-intensiteitsblokken → gestructureerde intervals, boutCount>=3, CV<0.40', () => {
    const ftp = 300;
    const high = Math.round(ftp * 0.95); // 285 — ruim boven 0.88*ftp (264)
    const low  = Math.round(ftp * 0.50); // 150 — ruim onder drempel
    // 4 × 200s werk met 60s rust, omsloten door warmup/cooldown van 60s
    const tl = makePowerTimeline([
      { dur: 60, watts: low },
      { dur: 200, watts: high }, { dur: 60, watts: low },
      { dur: 200, watts: high }, { dur: 60, watts: low },
      { dur: 200, watts: high }, { dur: 60, watts: low },
      { dur: 200, watts: high },
      { dur: 60, watts: low },
    ]);
    const r = classifySession(tl, ftp);
    assert.strictEqual(r.sessionType, 'gestructureerde intervals');
    assert.ok(r.boutCount >= 3, `boutCount ${r.boutCount} < 3`);
    assert.ok(r.boutDurationCV < 0.40, `boutDurationCV ${r.boutDurationCV} >= 0.40`);
  });

  test('vlakke rit rond 60% FTP → steady endurance, boutCount <= 1', () => {
    const ftp = 300;
    const tl = makePowerTimeline([{ dur: 1200, watts: Math.round(ftp * 0.60) }]);
    const r = classifySession(tl, ftp);
    assert.strictEqual(r.sessionType, 'steady endurance');
    assert.ok(r.boutCount <= 1, `boutCount ${r.boutCount} > 1`);
  });
});

// ── readinessScore ──────────────────────────────────────────────────────────

describe('readinessScore', () => {
  const emGood = { tsb: 0, acwr: 1.0, monotony: 1.0, ctl: 50, atl: 50 };

  test('total altijd 0..100', () => {
    const r = readinessScore(emGood, null, null, 75, null, {});
    assert.ok(r.total >= 0 && r.total <= 100, `total ${r.total} buiten [0,100]`);
  });

  test('acwr 1.0 geeft hogere acwr-bijdrage dan acwr 1.6', () => {
    const r0 = readinessScore({ ...emGood, acwr: 1.0 }, null, null, 75, null, {});
    const r1 = readinessScore({ ...emGood, acwr: 1.6 }, null, null, 75, null, {});
    assert.ok(r0.breakdown.acwr > r1.breakdown.acwr,
      `acwr-bijdrage bij 1.0 (${r0.breakdown.acwr}) <= bij 1.6 (${r1.breakdown.acwr})`);
    // acwr > 1.5 nult de component
    assert.strictEqual(r1.breakdown.acwr, 0);
  });

  test('worst-case inputs leveren total >= 0', () => {
    const emBad = { tsb: -60, acwr: 2.0, monotony: 5.0, ctl: 10, atl: 60 };
    const r = readinessScore(emBad, null, null, 75, null, {});
    assert.ok(r.total >= 0);
  });
});

// ── computeMMP / computeMMPFull ─────────────────────────────────────────────

describe('computeMMP', () => {
  test('geeft de bekende max terug voor de gevraagde duur (±1W)', () => {
    // 120s at 100W, 60s at 300W, 120s at 100W → MMP[60] = 300
    const tl = [
      ...Array(120).fill(null).map(() => ({ w: 100 })),
      ...Array(60).fill(null).map(() => ({ w: 300 })),
      ...Array(120).fill(null).map(() => ({ w: 100 })),
    ];
    const mmp = computeMMP(tl, [60]);
    assert.ok(mmp !== null);
    assert.ok(Math.abs(mmp[60] - 300) <= 1, `MMP[60] = ${mmp[60]}, verwacht 300`);
  });

  test('< 60 samples → null', () => {
    const tl = Array(59).fill(null).map(() => ({ w: 200 }));
    assert.strictEqual(computeMMP(tl, [10]), null);
  });
});

describe('computeMMPFull', () => {
  test('1-sec max correct, duur-max correct (±1W)', () => {
    // 60s at 100W, 10s at 400W, 60s at 100W
    const tl = [
      ...Array(60).fill(null).map(() => ({ w: 100 })),
      ...Array(10).fill(null).map(() => ({ w: 400 })),
      ...Array(60).fill(null).map(() => ({ w: 100 })),
    ];
    const full = computeMMPFull(tl);
    assert.ok(full !== null);
    assert.ok(Math.abs(full[0] - 400) <= 1,  `MMP[1s] = ${full[0]}, verwacht 400`);
    assert.ok(Math.abs(full[9] - 400) <= 1,  `MMP[10s] = ${full[9]}, verwacht 400`);
  });

  test('< 10 samples → null', () => {
    assert.strictEqual(computeMMPFull(Array(9).fill({ w: 200 })), null);
  });
});
