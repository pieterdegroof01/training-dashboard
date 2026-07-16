'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../engine');
const {
  gradeAdjustFactor, computeNGP,
  computeRunningLoad, computeRunningEF, computeRunningDecoupling,
  RUN_ZONE_BOUNDS, RUN_ZONE_IF, runZoneFromSpeedRatio, computeRunPaceZones,
  runZoneFromActivity, activityZoneClassification, zoneToCategory, weeklyZoneBreakdown,
  buildDailyETLSeries, computeETLForActivity,
  computeRunAcwr, longestRunDistance, classifyRunSpike,
} = engine;
const { makeRun, makeRide, constantDailyETL, impulseDailyETL } = require('./helpers');

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

// ── Loopzones op drempelsnelheid ────────────────────────────────────────────

describe('runZoneFromSpeedRatio', () => {
  test('grenzen liggen op 0.72 / 0.83 / 0.95 / 1.02 / 1.14', () => {
    assert.strictEqual(runZoneFromSpeedRatio(0.60), 1);
    assert.strictEqual(runZoneFromSpeedRatio(0.719), 1);
    assert.strictEqual(runZoneFromSpeedRatio(0.72), 2);   // ondergrens inclusief
    assert.strictEqual(runZoneFromSpeedRatio(0.80), 2);
    assert.strictEqual(runZoneFromSpeedRatio(0.83), 3);
    assert.strictEqual(runZoneFromSpeedRatio(0.94), 3);
    assert.strictEqual(runZoneFromSpeedRatio(0.95), 4);
    assert.strictEqual(runZoneFromSpeedRatio(1.00), 4);   // drempel zelf is Z4
    assert.strictEqual(runZoneFromSpeedRatio(1.02), 5);
    assert.strictEqual(runZoneFromSpeedRatio(1.13), 5);
    assert.strictEqual(runZoneFromSpeedRatio(1.14), 6);
    assert.strictEqual(runZoneFromSpeedRatio(1.50), 6);
  });

  test('niet-positieve ratio geeft null', () => {
    assert.strictEqual(runZoneFromSpeedRatio(0), null);
    assert.strictEqual(runZoneFromSpeedRatio(-1), null);
    assert.strictEqual(runZoneFromSpeedRatio(null), null);
  });
});

describe('RUN_ZONE_IF', () => {
  test('canon-waarden Z1 0.70 t/m Z6 1.20', () => {
    assert.deepStrictEqual(RUN_ZONE_IF, { Z1: 0.70, Z2: 0.78, Z3: 0.90, Z4: 1.00, Z5: 1.10, Z6: 1.20 });
  });

  test('monotoon stijgend en drempel exact 1.00', () => {
    const v = ['Z1','Z2','Z3','Z4','Z5','Z6'].map(k => RUN_ZONE_IF[k]);
    for (let i = 1; i < v.length; i++) assert.ok(v[i] > v[i-1], `Z${i+1} moet boven Z${i} liggen`);
    assert.strictEqual(RUN_ZONE_IF.Z4, 1.00);
  });

  test('is geen kopie van de fiets-tabel: Z1 ligt fors boven 0.50', () => {
    const { ZONE_IF } = require('../planner');
    assert.ok(RUN_ZONE_IF.Z1 > ZONE_IF.Z1 + 0.15, 'snelheidsratio comprimeert minder dan vermogensratio');
  });

  test('rTSS per uur volgt (dur/60) x IF^2 x 100', () => {
    const rtssPerUur = k => Math.round(RUN_ZONE_IF[k] ** 2 * 100);
    assert.strictEqual(rtssPerUur('Z1'), 49);
    assert.strictEqual(rtssPerUur('Z4'), 100);
    assert.strictEqual(rtssPerUur('Z6'), 144);
  });
});

describe('computeRunPaceZones', () => {
  const tl = (paces) => paces.map((pace, i) => ({ t: i * 5, pace }));

  test('zonder thresholdPace geen zoneverdeling', () => {
    assert.strictEqual(computeRunPaceZones(tl([300, 300]), {}), null);
    assert.strictEqual(computeRunPaceZones(tl([300, 300]), { lthr: 160 }), null);
  });

  test('lege of ontbrekende timeline geeft null', () => {
    assert.strictEqual(computeRunPaceZones([], { thresholdPace: 300 }), null);
    assert.strictEqual(computeRunPaceZones(null, { thresholdPace: 300 }), null);
  });

  test('elk punt telt 5 seconden en landt in de juiste zone', () => {
    // drempeltempo 300 s/km. ratio = 300/pace.
    // 500 -> 0.60 Z1 | 375 -> 0.80 Z2 | 333 -> 0.90 Z3 | 300 -> 1.00 Z4 | 273 -> 1.10 Z5 | 250 -> 1.20 Z6
    const z = computeRunPaceZones(tl([500, 375, 333, 300, 273, 250]), { thresholdPace: 300 });
    assert.deepStrictEqual(
      [z.z1Min, z.z2Min, z.z3Min, z.z4Min, z.z5Min, z.z6Min],
      [0.1, 0.1, 0.1, 0.1, 0.1, 0.1]
    );
    assert.strictEqual(z.totalMin, 0.5);   // 6 x 5s = 30s, afgerond op 0.1 min
    assert.strictEqual(z.basis, 'pace');
  });

  test('punten zonder tempo tellen niet mee; alles ongeldig geeft null', () => {
    const z = computeRunPaceZones(tl([500, null, 0, 500]), { thresholdPace: 300 });
    assert.strictEqual(z.z1Min, 0.2);
    assert.strictEqual(computeRunPaceZones(tl([null, 0]), { thresholdPace: 300 }), null);
  });

  test('een uur rustig lopen telt 12 minuten per 12 punten, som klopt met de tijdlijn', () => {
    const z = computeRunPaceZones(tl(Array(720).fill(400)), { thresholdPace: 300 }); // ratio 0.75 = Z2
    assert.strictEqual(z.z2Min, 60);
    assert.strictEqual(z.totalMin, 60);
  });
});

// ── Seiler-mapping: loop en fiets in één TID-analyse ────────────────────────

describe('runZoneFromActivity', () => {
  const S = { thresholdPace: 300 };   // 5:00/km → drempelsnelheid 3.333 m/s

  test('ratio = snelheid / drempelsnelheid, zonelabel volgt de grenzen', () => {
    assert.strictEqual(runZoneFromActivity({ average_speed: 2.20 }, S).zone, 'Z1');  // 0.66
    assert.strictEqual(runZoneFromActivity({ average_speed: 2.50 }, S).zone, 'Z2');  // 0.75
    assert.strictEqual(runZoneFromActivity({ average_speed: 3.00 }, S).zone, 'Z3');  // 0.90
    assert.strictEqual(runZoneFromActivity({ average_speed: 3.33 }, S).zone, 'Z4');  // 1.00
    assert.strictEqual(runZoneFromActivity({ average_speed: 3.60 }, S).zone, 'Z5');  // 1.08
    assert.strictEqual(runZoneFromActivity({ average_speed: 4.00 }, S).zone, 'Z6');  // 1.20
    assert.strictEqual(runZoneFromActivity({ average_speed: 2.50 }, S).method, 'pace');
    assert.strictEqual(runZoneFromActivity({ average_speed: 2.50 }, S).ratio, 0.75);
  });

  test('zonder drempeltempo of zonder snelheid geen zone', () => {
    assert.strictEqual(runZoneFromActivity({ average_speed: 3.0 }, {}), null);
    assert.strictEqual(runZoneFromActivity({ average_speed: 0 }, S), null);
    assert.strictEqual(runZoneFromActivity({}, S), null);
  });
});

describe('activityZoneClassification voor hardlopen', () => {
  const S = { thresholdPace: 300, hrMax: 197 };

  test('loop met drempeltempo → pace-methode', () => {
    const a = makeRun({ date: '2026-07-01', durationSec: 3600, avgHr: 140, avgSpeed: 2.5 });
    const z = activityZoneClassification(a, 280, 197, S);
    assert.strictEqual(z.method, 'pace');
    assert.strictEqual(z.zone, 'Z2');
  });

  test('Strava-loopvermogen wordt genegeerd, ook met drempeltempo', () => {
    // 300 geschatte watt / FTP 280 = IF 1.07 → zou zonder typecheck Z5 geven
    const a = makeRun({ date: '2026-07-01', durationSec: 3600, avgHr: 140, avgSpeed: 2.5, watts: 300 });
    const z = activityZoneClassification(a, 280, 197, S);
    assert.strictEqual(z.method, 'pace');
    assert.strictEqual(z.zone, 'Z2');
  });

  test('loop zonder drempeltempo valt terug op HR, niet op vermogen', () => {
    const a = makeRun({ date: '2026-07-01', durationSec: 3600, avgHr: 130, avgSpeed: 2.5, watts: 300 });
    const z = activityZoneClassification(a, 280, 197, { hrMax: 197 });
    assert.strictEqual(z.method, 'hr');
  });

  test('TrailRun volgt dezelfde tak als Run', () => {
    const a = makeRun({ date: '2026-07-01', durationSec: 3600, avgHr: 140, avgSpeed: 2.5, type: 'TrailRun' });
    assert.strictEqual(activityZoneClassification(a, 280, 197, S).method, 'pace');
  });

  test('fiets blijft ongewijzigd op vermogen classificeren', () => {
    const a = makeRide({ date: '2026-07-01', durationSec: 3600, watts: 250, npWatts: 250 });
    const z = activityZoneClassification(a, 280, 197, S);
    assert.strictEqual(z.method, 'power');
  });
});

describe('zoneToCategory mapt loop en fiets op dezelfde Seiler-banden', () => {
  test('Z1/Z2 laag, Z3 matig, Z4 t/m Z6 hoog', () => {
    assert.strictEqual(zoneToCategory('Z1'), 'low');
    assert.strictEqual(zoneToCategory('Z2'), 'low');
    assert.strictEqual(zoneToCategory('Z3'), 'mid');
    assert.strictEqual(zoneToCategory('Z4'), 'high');
    assert.strictEqual(zoneToCategory('Z5'), 'high');
    assert.strictEqual(zoneToCategory('Z6'), 'high');
  });
});

describe('weeklyZoneBreakdown telt loop en fiets in dezelfde week op', () => {
  const S = { thresholdPace: 300, hrMax: 197, ftp: 280 };

  test('rustige loop landt laag, interval landt hoog, minuten kloppen', () => {
    // De rit is powerSource 'estimated', dus rollingFtp slaat hem over en ftpForDate
    // valt terug op settings.ftp = 280. Een measured rit zou zijn eigen FTP ankeren
    // (150W → rollingFtp 143 → IF 1.05 → Z4) en de fixture zichzelf laten bijten.
    const ride = { ...makeRide({ date: '2026-07-09', durationSec: 3600, watts: 150, npWatts: 150 }),
                   powerSource: 'estimated', device_watts: false };
    const acts = [
      makeRun({ date: '2026-07-06', durationSec: 3600, avgHr: 140, avgSpeed: 2.5 }),   // 60 min Z2 → laag
      makeRun({ date: '2026-07-08', durationSec: 1800, avgHr: 175, avgSpeed: 3.6 }),   // 30 min Z5 → hoog
      ride,                                                                             // 60 min Z1 → laag
    ];
    const wk = weeklyZoneBreakdown(acts, S);
    assert.strictEqual(wk.length, 1);
    assert.strictEqual(wk[0].sessions, 3);
    assert.strictEqual(wk[0].lowMin, 120);
    assert.strictEqual(wk[0].highMin, 30);
    assert.strictEqual(wk[0].totalMin, 150);
  });

  test('zonder drempeltempo telt de loop nog steeds mee, via HR', () => {
    const acts = [makeRun({ date: '2026-07-06', durationSec: 3600, avgHr: 130, avgSpeed: 2.5 })];
    const wk = weeklyZoneBreakdown(acts, { hrMax: 197 });
    assert.strictEqual(wk[0].sessions, 1);
    assert.strictEqual(wk[0].totalMin, 60);
  });
});

// ── buildDailyETLSeries: runningDailyETL naast enduranceDailyETL ───────────

describe('buildDailyETLSeries met runningDailyETL', () => {
  test('rit + run op één dag: runningDailyETL bevat alleen de run, enduranceDailyETL blijft de som van beide', () => {
    const ride = makeRide({ date: '2026-07-06', durationSec: 3600, watts: undefined });
    const run  = makeRun({ date: '2026-07-06', durationSec: 3600 });

    // Onafhankelijk narekenen: dezelfde ETL-berekening die buildDailyETLSeries intern
    // gebruikt, rechtstreeks op de twee activiteiten, zonder vermogenspad (geen watts/ftp).
    const rideEtl = computeETLForActivity(ride, undefined, null).etl;
    const runEtl  = computeETLForActivity(run, undefined, null).etl;

    const { enduranceDailyETL, strengthDailyETL, runningDailyETL } =
      buildDailyETLSeries([ride, run], [], undefined);

    assert.deepStrictEqual(runningDailyETL, { '2026-07-06': runEtl });
    assert.deepStrictEqual(enduranceDailyETL, { '2026-07-06': rideEtl + runEtl });
    assert.deepStrictEqual(strengthDailyETL, {});
  });
});

// ── computeRunAcwr — Gabbett 2016 ───────────────────────────────────────────

describe('computeRunAcwr', () => {
  // Onafhankelijke EWMA-referentie: zelfde recursie als computeLoadMetrics in
  // engine.js (ATL_TAU=7, CTL_TAU=42), hier los van de geteste functie herbouwd.
  function ewma(dailyETL, datesAsc, tau) {
    const k = 1 - Math.exp(-1 / tau);
    let x = 0;
    for (const d of datesAsc) x = x + k * ((dailyETL[d] || 0) - x);
    return x;
  }
  function expectedAcwr(dailyETL) {
    const dates = Object.keys(dailyETL).sort();
    const atl = ewma(dailyETL, dates, 7);
    const ctl = ewma(dailyETL, dates, 42);
    return { atl, ctl, acwr: ctl > 0 ? +(atl / ctl).toFixed(2) : 0 };
  }

  test('constante loopbelasting lang genoeg voor CTL-convergentie (tau 42) geeft acwr rond 1.0 en status ok', () => {
    // 210 dagen ≈ 5x CTL_TAU: zowel ATL als CTL zijn dan nagenoeg volledig
    // geconvergeerd naar de constante load, dus acwr → 1.0.
    const dailyETL = constantDailyETL('2026-01-01', 210, 60);
    const asOfISO = Object.keys(dailyETL).sort().at(-1);
    const exp = expectedAcwr(dailyETL);
    const r = computeRunAcwr(dailyETL, asOfISO);
    assert.strictEqual(r.status, 'ok');
    assert.strictEqual(r.reliability, 'ok');
    assert.strictEqual(r.acwr, exp.acwr);
    assert.ok(Math.abs(r.acwr - 1.0) < 0.05, `acwr=${r.acwr}, verwacht rond 1.0`);
  });

  test('lege reeks geeft insufficient', () => {
    const r = computeRunAcwr({}, '2026-07-16');
    assert.deepStrictEqual(r, {
      acwr: null, atl: null, ctl: null,
      status: 'insufficient', reliability: 'insufficient',
      reason: r.reason,
    });
    assert.ok(r.reason && r.reason.length > 0);
  });

  test('reeks met ctl < 5 geeft insufficient', () => {
    const dailyETL = constantDailyETL('2026-01-01', 5, 3);
    const asOfISO = Object.keys(dailyETL).sort().at(-1);
    const exp = expectedAcwr(dailyETL);
    assert.ok(exp.ctl < 5, `test-aanname geschonden: ctl=${exp.ctl} >= 5`);
    const r = computeRunAcwr(dailyETL, asOfISO);
    assert.strictEqual(r.status, 'insufficient');
    assert.strictEqual(r.reliability, 'insufficient');
  });

  test('impuls die atl/ctl boven 1.5 duwt geeft high', () => {
    const dailyETL = impulseDailyETL('2026-01-01', 42, 41, 50, 400);
    const asOfISO = Object.keys(dailyETL).sort().at(-1);
    const exp = expectedAcwr(dailyETL);
    assert.ok(exp.acwr > 1.5, `test-aanname geschonden: acwr=${exp.acwr} <= 1.5`);
    assert.ok(exp.ctl >= 5, `test-aanname geschonden: ctl=${exp.ctl} < 5`);
    const r = computeRunAcwr(dailyETL, asOfISO);
    assert.strictEqual(r.status, 'high');
    assert.strictEqual(r.reliability, 'ok');
    assert.strictEqual(r.acwr, exp.acwr);
  });

  test('reeks die na een blok opdroogt geeft detraining', () => {
    const block = constantDailyETL('2026-01-01', 60, 50);
    const dry   = constantDailyETL('2026-03-02', 20, 0);
    const dailyETL = { ...block, ...dry };
    const asOfISO = Object.keys(dailyETL).sort().at(-1);
    const exp = expectedAcwr(dailyETL);
    assert.ok(exp.acwr < 0.8, `test-aanname geschonden: acwr=${exp.acwr} >= 0.8`);
    assert.ok(exp.ctl >= 5, `test-aanname geschonden: ctl=${exp.ctl} < 5`);
    const r = computeRunAcwr(dailyETL, asOfISO);
    assert.strictEqual(r.status, 'detraining');
    assert.strictEqual(r.reliability, 'ok');
    assert.strictEqual(r.acwr, exp.acwr);
  });
});

// ── longestRunDistance + classifyRunSpike — Frandsen 2025 ──────────────────

describe('longestRunDistance sluit de run op asOfISO zelf uit', () => {
  test('een run van 30km op asOfISO zelf verandert de baseline niet', () => {
    const activities = [
      makeRun({ date: '2026-03-05', durationSec: 3000, distanceM: 10000 }),
      makeRun({ date: '2026-03-10', durationSec: 3000, distanceM: 10000 }),
      makeRun({ date: '2026-03-15', durationSec: 3000, distanceM: 10000 }),
      makeRun({ date: '2026-03-31', durationSec: 9000, distanceM: 30000 }), // asOfISO zelf
    ];
    const baseline = longestRunDistance(activities, '2026-03-31', 30);
    assert.strictEqual(baseline.longestM, 10000);
    assert.strictEqual(baseline.runCount, 3);
    assert.strictEqual(baseline.fromISO, '2026-03-01');
    assert.strictEqual(baseline.toISO, '2026-03-31');
    assert.strictEqual(baseline.windowDays, 30);
  });
});

describe('classifyRunSpike', () => {
  const baseline = { longestM: 10000, runCount: 3, fromISO: '2026-03-01', toISO: '2026-03-31', windowDays: 30 };

  test('5% boven de langste run geeft none', () => {
    const r = classifyRunSpike(10500, baseline);
    assert.strictEqual(r.severity, 'none');
    assert.strictEqual(r.reliability, 'ok');
  });

  test('20% boven de langste run geeft small', () => {
    const r = classifyRunSpike(12000, baseline);
    assert.strictEqual(r.severity, 'small');
  });

  test('50% boven de langste run geeft moderate', () => {
    const r = classifyRunSpike(15000, baseline);
    assert.strictEqual(r.severity, 'moderate');
  });

  test('120% boven de langste run geeft large', () => {
    const r = classifyRunSpike(22000, baseline);
    assert.strictEqual(r.severity, 'large');
  });

  test('twee runs in het venster geeft reliability insufficient en severity none', () => {
    const activities = [
      makeRun({ date: '2026-03-05', durationSec: 3000, distanceM: 10000 }),
      makeRun({ date: '2026-03-10', durationSec: 3000, distanceM: 10000 }),
    ];
    const thinBaseline = longestRunDistance(activities, '2026-03-31', 30);
    assert.strictEqual(thinBaseline.runCount, 2);
    const r = classifyRunSpike(50000, thinBaseline);
    assert.strictEqual(r.severity, 'none');
    assert.strictEqual(r.reliability, 'insufficient');
  });
});
