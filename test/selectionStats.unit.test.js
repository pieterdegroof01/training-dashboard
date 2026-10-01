'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// selectionStats.js is ESM (activity-detail is een Vite-subapp), dus dynamisch laden binnen de tests.
const load = () => import('../activity-detail/src/components/selectionStats.js');

function series(n, fn, startT = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(fn(startT + i, i));
  return out;
}

function near(actual, expected, tol, label) {
  assert.ok(
    actual != null && Math.abs(actual - expected) <= tol,
    `${label}=${actual} niet binnen ${tol} van ${expected}`
  );
}

const ALL_SHOW = { tempo: true, gap: true, speed: true, power: true, hr: true, cadence: true, gradient: true };
const FULL_STATS = {
  durationSec: 600, distanceKm: 1.6667, speedKmh: 10, paceSecPerKm: 360, gapSecPerKm: 350,
  hr: 150, power: 210, cadence: 88, gradient: 1.2,
};

describe('computeSelectionStats', () => {
  test('a. constant 10 km/u over 600 s: afstand, snelheid en tempo uit de distance-stream', async () => {
    const { computeSelectionStats } = await load();
    const distance = series(601, t => ({ t, d: (10 / 6) * (t / 600) }));
    const speed = series(601, t => ({ t, v: 10 }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 600, distance, speed });
    assert.strictEqual(st.durationSec, 600);
    near(st.distanceKm, 1.6667, 0.001, 'distanceKm');
    near(st.speedKmh, 10, 0.001, 'speedKmh');
    near(st.paceSecPerKm, 360, 0.01, 'paceSecPerKm');
  });

  test('a2. deelvenster interpoleert de afstand op de vensterranden', async () => {
    const { computeSelectionStats } = await load();
    // Punten om de 10 s; venster 95..305 valt tussen de samples.
    const distance = series(61, (_, i) => ({ t: i * 10, d: (10 / 6) * (i / 60) }));
    const st = computeSelectionStats({ tStart: 95, tEnd: 305, distance });
    near(st.distanceKm, 210 / 360, 0.001, 'distanceKm');
    near(st.speedKmh, 10, 0.001, 'speedKmh');
  });

  test('b. GAP wordt harmonisch gemiddeld: 240 en 360 s/km geeft 288, niet 300', async () => {
    const { computeSelectionStats } = await load();
    const gap = series(600, t => ({ t, pace: t < 300 ? 240 : 360 }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 599, gap });
    near(st.gapSecPerKm, 288, 0.5, 'gapSecPerKm');
    assert.ok(Math.abs(st.gapSecPerKm - 300) > 5, 'gapSecPerKm mag geen rekenkundig pace-gemiddelde zijn');
  });

  test('c. vermogen middelt inclusief nullen', async () => {
    const { computeSelectionStats } = await load();
    const power = [200, 0, 200, 0].map((w, t) => ({ t, w }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 3, power });
    assert.strictEqual(st.power, 100);
  });

  test('d. cadans middelt alleen punten boven nul', async () => {
    const { computeSelectionStats } = await load();
    const cadence = [90, 0, 90, 0].map((c, t) => ({ t, c }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 3, cadence });
    assert.strictEqual(st.cadence, 90);
  });

  test('d2. hartslag middelt alleen punten boven nul, helling rekenkundig', async () => {
    const { computeSelectionStats } = await load();
    const hr = [140, 0, 160].map((v, t) => ({ t, hr: v }));
    const gradient = [4, -2, 1].map((g, t) => ({ t, g }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 2, hr, gradient });
    assert.strictEqual(st.hr, 150);
    assert.strictEqual(st.gradient, 1);
  });

  test('e. zonder distance valt de afstand terug op gemiddelde snelheid × duur', async () => {
    const { computeSelectionStats } = await load();
    const speed = series(361, t => ({ t, v: 20 }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 360, speed });
    near(st.distanceKm, 2, 0.01, 'distanceKm');
    near(st.speedKmh, 20, 0.01, 'speedKmh');
    near(st.paceSecPerKm, 180, 0.5, 'paceSecPerKm');
  });

  test('e2. vlakke distance-stream (indoor) telt niet als afstand', async () => {
    const { computeSelectionStats } = await load();
    const distance = series(361, t => ({ t, d: 0 }));
    const speed = series(361, t => ({ t, v: 20 }));
    const st = computeSelectionStats({ tStart: 0, tEnd: 360, distance, speed });
    near(st.distanceKm, 2, 0.01, 'distanceKm');
  });

  test('f. venster met 1 punt: hr, power, cadence en gapSecPerKm zijn null', async () => {
    const { computeSelectionStats } = await load();
    const st = computeSelectionStats({
      tStart: 5, tEnd: 5.5,
      hr: series(20, t => ({ t, hr: 150 })),
      power: series(20, t => ({ t, w: 200 })),
      cadence: series(20, t => ({ t, c: 90 })),
      gap: series(20, t => ({ t, pace: 300 })),
    });
    assert.strictEqual(st.hr, null);
    assert.strictEqual(st.power, null);
    assert.strictEqual(st.cadence, null);
    assert.strictEqual(st.gapSecPerKm, null);
  });

  test('f2. zonder streams: alleen de duur is gevuld', async () => {
    const { computeSelectionStats } = await load();
    const st = computeSelectionStats({ tStart: 10, tEnd: 70 });
    assert.deepStrictEqual(st, {
      durationSec: 60, distanceKm: null, speedKmh: null, paceSecPerKm: null, gapSecPerKm: null,
      hr: null, power: null, cadence: null, gradient: null,
    });
  });
});

describe('buildSelectionLines', () => {
  test("g. kind 'run': geen enkele value bevat 'km/u'", async () => {
    const { buildSelectionLines } = await load();
    const lines = buildSelectionLines(FULL_STATS, { kind: 'run', show: ALL_SHOW, colors: {} });
    assert.deepStrictEqual(lines.map(l => l.key), ['time', 'distance', 'tempo', 'gap', 'hr', 'cadence']);
    for (const l of lines) assert.ok(!l.value.includes('km/u'), `${l.key} bevat km/u: ${l.value}`);
    assert.strictEqual(lines.find(l => l.key === 'tempo').value, '6:00 /km');
    assert.strictEqual(lines.find(l => l.key === 'cadence').value, '88 spm');
  });

  test("g. kind 'ride': geen key 'tempo' of 'gap'", async () => {
    const { buildSelectionLines } = await load();
    const colors = { speed: 'var(--green)', power: 'var(--accent)' };
    const lines = buildSelectionLines(FULL_STATS, { kind: 'ride', show: ALL_SHOW, colors });
    assert.deepStrictEqual(lines.map(l => l.key), ['time', 'distance', 'speed', 'power', 'hr', 'cadence', 'gradient']);
    assert.deepStrictEqual(lines.find(l => l.key === 'speed'), { key: 'speed', label: 'Gem. snelheid', value: '10.0 km/u', color: 'var(--green)' });
    assert.strictEqual(lines.find(l => l.key === 'power').value, '210 W');
    assert.strictEqual(lines.find(l => l.key === 'cadence').value, '88 rpm');
    assert.strictEqual(lines.find(l => l.key === 'gradient').value, '1.2%');
  });

  test('g2. show uit of waarde null laat de regel weg; tijd staat er altijd', async () => {
    const { buildSelectionLines } = await load();
    const stats = { ...FULL_STATS, distanceKm: null, hr: null };
    const lines = buildSelectionLines(stats, { kind: 'ride', show: { power: true, hr: true }, colors: {} });
    assert.deepStrictEqual(lines.map(l => l.key), ['time', 'power']);
  });
});

describe('formattering', () => {
  test('h. fmtClock en fmtKm', async () => {
    const { fmtClock, fmtKm } = await load();
    assert.strictEqual(fmtClock(225), '3:45');
    assert.strictEqual(fmtClock(3725), '1:02:05');
    assert.strictEqual(fmtClock(59.6), '1:00');
    assert.strictEqual(fmtKm(3.456), '3.46 km');
    assert.strictEqual(fmtKm(12.34), '12.3 km');
  });

  test('h2. secToPace', async () => {
    const { secToPace } = await load();
    assert.strictEqual(secToPace(360), '6:00');
    assert.strictEqual(secToPace(299.6), '5:00');
    assert.strictEqual(secToPace(null), '–');
    assert.strictEqual(secToPace(Infinity), '–');
    assert.strictEqual(secToPace(0), '–');
  });
});
