'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const {
  computeETLForActivity, computeLoadMetrics,
  classifyTrainingModel, classifySession,
  readinessScore, detectOverreaching,
  computeMMP, computeMMPFull,
  powerProfileLevel, classifyRiderType,
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

// ── powerProfileLevel — Coggan niveau-interpolatie ──────────────────────────

describe('powerProfileLevel', () => {
  test('onder de ondergrens clamped naar niveau 0', () => {
    const r = engine.powerProfileLevel(1.0, '20min');
    assert.strictEqual(r.level, 0);
    assert.strictEqual(r.category, 'Untrained');
  });

  test('boven de bovengrens clamped naar niveau 8', () => {
    const r = engine.powerProfileLevel(7.0, '20min');
    assert.strictEqual(r.level, 8);
    assert.strictEqual(r.category, 'World Class');
  });

  test('FTP ondergrens Very Good (4.09) → niveau 4, Very Good', () => {
    const r = engine.powerProfileLevel(4.09, '20min');
    assert.strictEqual(r.level, 4);
    assert.strictEqual(r.category, 'Very Good');
  });

  test('FTP exact op Excellent-ondergrens (4.62) → niveau 5, Excellent', () => {
    const r = engine.powerProfileLevel(4.62, '20min');
    assert.strictEqual(r.level, 5);
    assert.strictEqual(r.category, 'Excellent');
  });

  test('interpolatie midden tussen twee breekpunten', () => {
    // 20min: Good-low 3.47, Very Good-low 4.09. Midden = 3.78 → niveau ~3.5.
    const r = engine.powerProfileLevel(3.78, '20min');
    assert.ok(Math.abs(r.level - 3.5) < 0.02, `verwacht ~3.5, kreeg ${r.level}`);
    assert.strictEqual(r.category, 'Good');
  });

  test('5s-as gebruikt eigen schaal (18.60 → niveau 5)', () => {
    const r = engine.powerProfileLevel(18.60, '5s');
    assert.strictEqual(r.level, 5);
    assert.strictEqual(r.category, 'Excellent');
  });

  test('onbekende duur geeft null', () => {
    const r = engine.powerProfileLevel(5.0, '10min');
    assert.strictEqual(r.level, null);
  });

  test('nul of negatief vermogen geeft null', () => {
    assert.strictEqual(engine.powerProfileLevel(0, '20min').level, null);
  });
});

// ── classifyRiderType — rennerstype uit niveaus ─────────────────────────────

describe('classifyRiderType', () => {
  test('duur-dominant met FTP sterkste → Tijdritrenner', () => {
    const r = engine.classifyRiderType({ '5s': 2.0, '1min': 2.5, '5min': 4.0, '20min': 4.3 });
    assert.strictEqual(r.type, 'Tijdritrenner');
  });

  test('duur-dominant met 5min sterkste → Klimmer / VO₂-type', () => {
    const r = engine.classifyRiderType({ '5s': 2.0, '1min': 2.5, '5min': 4.5, '20min': 3.8 });
    assert.strictEqual(r.type, 'Klimmer / VO₂-type');
  });

  test('sprint-dominant met 5s sterkste → Sprinter', () => {
    const r = engine.classifyRiderType({ '5s': 5.0, '1min': 4.2, '5min': 2.5, '20min': 2.3 });
    assert.strictEqual(r.type, 'Sprinter');
  });

  test('sprint-dominant met 1min sterkste → Puncheur', () => {
    const r = engine.classifyRiderType({ '5s': 4.0, '1min': 4.3, '5min': 2.8, '20min': 2.6 });
    assert.strictEqual(r.type, 'Puncheur');
  });

  test('gebalanceerd → Allrounder', () => {
    const r = engine.classifyRiderType({ '5s': 3.5, '1min': 3.6, '5min': 3.7, '20min': 3.5 });
    assert.strictEqual(r.type, 'Allrounder');
  });

  test('ontbrekende as → type null met uitleg', () => {
    const r = engine.classifyRiderType({ '5s': 3.0, '1min': null, '5min': 3.5, '20min': 3.6 });
    assert.strictEqual(r.type, null);
    assert.ok(r.description.length > 0);
  });
});

// ── rollingFtp — hoogste measured waarde, geschat vermogen genegeerd ────────

describe('rollingFtp — hoogste measured waarde ipv mediaan', () => {
  test('kiest hoogste NP, niet de mediaan, bij drie measured ritten', () => {
    const activities = [
      makeRide({ date: '2026-06-01', durationSec: 1200, watts: 250, npWatts: 250 }),
      makeRide({ date: '2026-06-05', durationSec: 1200, watts: 300, npWatts: 300 }),
      makeRide({ date: '2026-06-10', durationSec: 1200, watts: 270, npWatts: 270 }),
    ];
    const r = engine.rollingFtp(activities, { ftp: 280 }, '2026-06-15');
    assert.strictEqual(r.ftp, Math.round(300 * 0.95));
  });

  test('bij twee measured ritten wordt de hoogste gepakt, niet de laagste', () => {
    const activities = [
      makeRide({ date: '2026-06-01', durationSec: 1200, watts: 240, npWatts: 240 }),
      makeRide({ date: '2026-06-10', durationSec: 1200, watts: 310, npWatts: 310 }),
    ];
    const r = engine.rollingFtp(activities, { ftp: 280 }, '2026-06-15');
    assert.strictEqual(r.ftp, Math.round(310 * 0.95));
  });

  test('Strava-geschat vermogen wordt volledig genegeerd, ook als het hoger is', () => {
    const activities = [
      makeRide({ date: '2026-06-01', durationSec: 1200, watts: 260, npWatts: 260 }),
      { ...makeRide({ date: '2026-06-10', durationSec: 1200, watts: 400, npWatts: 400 }), powerSource: 'estimated', device_watts: false },
    ];
    const r = engine.rollingFtp(activities, { ftp: 280 }, '2026-06-15');
    assert.strictEqual(r.ftp, Math.round(260 * 0.95));
  });

  test('geen measured/unknown ritten in venster → null, bestaande fallback blijft intact', () => {
    const activities = [
      { ...makeRide({ date: '2026-06-10', durationSec: 1200, watts: 400, npWatts: 400 }), powerSource: 'estimated', device_watts: false },
    ];
    const r = engine.rollingFtp(activities, { ftp: 280 }, '2026-06-15');
    assert.strictEqual(r, null);
  });
});

// ── runMinutesInWeek — weekgrens UTC, alleen loopactiviteiten ────────────────

describe('runMinutesInWeek', () => {
  test('run op de zondag telt mee, run op de maandag erna niet (weekgrens)', () => {
    const activities = [
      makeRun({ date: '2026-07-19', durationSec: 1800 }), // zondag, laatste dag van het venster
      makeRun({ date: '2026-07-20', durationSec: 3600 }), // maandag erna, buiten het venster
    ];
    assert.strictEqual(engine.runMinutesInWeek(activities, '2026-07-13'), 30);
  });

  test('niet-loopactiviteit telt niet mee', () => {
    const activities = [
      makeRide({ date: '2026-07-14', durationSec: 3600, watts: 200 }),
    ];
    assert.strictEqual(engine.runMinutesInWeek(activities, '2026-07-13'), 0);
  });

  test('geen treffers geeft 0', () => {
    assert.strictEqual(engine.runMinutesInWeek([], '2026-07-13'), 0);
  });
});
