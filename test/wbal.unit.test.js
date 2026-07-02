'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeWbal } = require('../engine');

function constantTimeline(w, n, startT = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: startT + i, w });
  return out;
}

describe('computeWbal', () => {
  test('constant vermogen onder cp houdt wbal ≈ wPrime', () => {
    const cp = 250, wPrime = 20000;
    const timeline = constantTimeline(200, 600);
    const result = computeWbal(timeline, cp, wPrime);
    assert.ok(result);
    assert.strictEqual(result.length, 600);
    const last = result[result.length - 1].wbal;
    assert.ok(Math.abs(last - wPrime) <= wPrime * 0.01, `wbal=${last} niet binnen 1% van ${wPrime}`);
  });

  test('constant vermogen boven cp klemt wbal op 0 en wordt nooit negatief', () => {
    const cp = 250, wPrime = 20000;
    // (350-250) * 200s = 20000 == wPrime → volledig uitgeput na 200s.
    const timeline = constantTimeline(350, 300);
    const result = computeWbal(timeline, cp, wPrime);
    assert.ok(result);
    assert.ok(result.every(p => p.wbal >= 0), 'wbal mag nooit negatief zijn');
    const later = result.find(p => p.t === 250);
    assert.strictEqual(later.wbal, 0);
  });

  test('herstel onder cp na depletie: wbal stijgt boven het dieptepunt maar blijft <= wPrime', () => {
    const cp = 250, wPrime = 20000;
    const depletion = constantTimeline(400, 60, 0);           // t=0..59
    const recovery = constantTimeline(150, 300, 60);          // t=60..359
    const timeline = [...depletion, ...recovery];
    const result = computeWbal(timeline, cp, wPrime);
    assert.ok(result);

    const trough = result[59].wbal; // dieptepunt aan het einde van de depletiefase
    const final = result[result.length - 1].wbal;

    assert.ok(trough < wPrime, 'depletie moet wbal onder wPrime brengen');
    assert.ok(final > trough, `wbal na herstel (${final}) moet hoger zijn dan dieptepunt (${trough})`);
    assert.ok(result.every(p => p.wbal <= wPrime), 'wbal mag nooit boven wPrime uitkomen');
  });

  test('niet-uniforme dt: groot gat telt als één lang herstelinterval, geen overshoot boven wPrime', () => {
    const cp = 250, wPrime = 20000;
    const timeline = [
      { t: 0,  w: 300 },
      { t: 1,  w: 300 },
      { t: 2,  w: 300 },
      { t: 10, w: 100 }, // gat van 8s → één lang herstelinterval
      { t: 11, w: 100 },
    ];
    const result = computeWbal(timeline, cp, wPrime);
    assert.ok(result);
    assert.strictEqual(result.length, 5);
    assert.ok(result.every(p => p.wbal <= wPrime), 'wbal mag nooit boven wPrime uitkomen');

    // Los het verwachte herstel voor de dt=8 stap onafhankelijk op met dezelfde
    // Skiba-formule om te bevestigen dat het gat als één interval van 8s is verwerkt
    // (niet als 8 losse stappen van 1s, en niet genegeerd).
    const wbalAtT2 = result[2].wbal;
    const tauW = 546 * Math.exp(-0.01 * (cp - 100)) + 316;
    const expectedAtGap = wbalAtT2 + (wPrime - wbalAtT2) * (1 - Math.exp(-8 / tauW));
    assert.ok(Math.abs(result[3].wbal - expectedAtGap) <= 1, `wbal na gat=${result[3].wbal}, verwacht ≈${expectedAtGap}`);

    // Eén stap van 1s recovery vanaf hetzelfde punt zou veel minder herstel geven.
    const expectedSingleSecond = wbalAtT2 + (wPrime - wbalAtT2) * (1 - Math.exp(-1 / tauW));
    assert.ok(result[3].wbal > expectedSingleSecond, 'het gat moet als lang interval herstellen, niet als 1s');
  });

  test('lege input geeft null', () => {
    assert.strictEqual(computeWbal([], 250, 20000), null);
    assert.strictEqual(computeWbal(null, 250, 20000), null);
  });

  test('niet-eindige cp of wPrime geeft null', () => {
    const timeline = constantTimeline(200, 10);
    assert.strictEqual(computeWbal(timeline, NaN, 20000), null);
    assert.strictEqual(computeWbal(timeline, 250, Infinity), null);
  });
});
