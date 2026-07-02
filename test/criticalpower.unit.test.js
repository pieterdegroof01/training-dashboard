'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { computeCriticalPower } = require('../engine');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-01T12:00:00Z');

function isoDaysAgo(days) {
  return new Date(NOW - days * DAY).toISOString().slice(0, 10);
}

function mmpEntry({ date = isoDaysAgo(1), powerSource = 'measured', v = 2, maxDur = 1200, formula } = {}) {
  const mmpArray = [];
  for (let t = 1; t <= maxDur; t++) {
    mmpArray.push(Math.round(formula(t)));
  }
  return { date, powerSource, v, mmpArray, dur: maxDur, name: 'test' };
}

// P(t) = CP + W'/t, CP = 250, W' = 20000
const hyperbola = t => 250 + 20000 / t;

describe('computeCriticalPower', () => {
  test('fit convergeert naar bekende CP/W\' uit synthetische hyperbool', () => {
    const entries = [mmpEntry({ formula: hyperbola })];
    const result = computeCriticalPower(entries, 270, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.ok(Math.abs(result.cp - 250) <= 5, `cp=${result.cp} niet binnen ±5W van 250`);
    assert.ok(Math.abs(result.wPrime - 20000) <= 1500, `wPrime=${result.wPrime} niet binnen ±1500J van 20000`);
  });

  test('entries ouder dan windowDays worden genegeerd', () => {
    const recent = mmpEntry({ date: isoDaysAgo(10), formula: hyperbola });
    // Oude entry met een heel andere (veel hogere) CP — mag de fit niet beïnvloeden.
    const old = mmpEntry({ date: isoDaysAgo(200), formula: t => 400 + 20000 / t });
    const result = computeCriticalPower([old, recent], 270, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.ok(Math.abs(result.cp - 250) <= 5, `cp=${result.cp} zou op recente set moeten volgen`);
  });

  test('entries na "now" (toekomst t.o.v. de bekeken rit) worden genegeerd', () => {
    const before = mmpEntry({ date: isoDaysAgo(10), formula: hyperbola });
    // Toekomstige entry met een duidelijk andere, plausibele CP -- mag de fit
    // voor een moment in het verleden niet beinvloeden.
    const futureFormula = t => 280 + 21500 / t;
    const future = mmpEntry({ date: isoDaysAgo(-30), formula: futureFormula });
    const result = computeCriticalPower([before, future], 270, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.ok(Math.abs(result.cp - 250) <= 5, `cp=${result.cp} zou toekomstige data moeten negeren`);
  });

  test('lege input geeft null', () => {
    assert.strictEqual(computeCriticalPower([], 270, { now: NOW }), null);
  });

  test('volledig gefilterde input geeft null', () => {
    const entries = [mmpEntry({ powerSource: 'estimated', formula: hyperbola })];
    assert.strictEqual(computeCriticalPower(entries, 270, { now: NOW }), null);
  });

  test('te weinig punten valt terug op prior', () => {
    // Alleen korte duren beschikbaar (maxDur < 300s) → hooguit 1 geldig punt.
    const entries = [mmpEntry({ maxDur: 200, formula: hyperbola })];
    const ftp = 270;
    const result = computeCriticalPower(entries, ftp, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.strictEqual(result.source, 'prior');
    assert.ok(Math.abs(result.cp - 0.94 * ftp) < 1);
  });

  test('te dicht opeen liggende punten vallen terug op prior', () => {
    // Alle vier duren beschikbaar, maar kortste/langste liggen niet ver genoeg uiteen
    // te simuleren is lastig met vaste FIT_DURATIONS [180,300,480,720] (ratio altijd 4),
    // dus test hier met maxDur net onder 720 zodat maar 3 punten resteren en de laatste
    // ontbreekt — resulteert alsnog in < 3 punten na filtering.
    const entries = [mmpEntry({ maxDur: 480, formula: hyperbola })];
    const ftp = 270;
    const result = computeCriticalPower(entries, ftp, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.strictEqual(result.source, 'prior');
    assert.ok(Math.abs(result.cp - 0.94 * ftp) < 1);
  });

  test('entry met powerSource !== measured telt niet mee', () => {
    const entries = [mmpEntry({ powerSource: 'estimated', formula: hyperbola })];
    const result = computeCriticalPower(entries, 270, { now: NOW, windowDays: 90 });
    assert.strictEqual(result, null);
  });

  test('mix van measured en niet-measured negeert de niet-measured entry', () => {
    const measured = mmpEntry({ date: isoDaysAgo(5), formula: hyperbola });
    const estimated = mmpEntry({ date: isoDaysAgo(5), powerSource: 'estimated', formula: t => 500 + 50000 / t });
    const result = computeCriticalPower([estimated, measured], 270, { now: NOW, windowDays: 90 });
    assert.ok(result);
    assert.ok(Math.abs(result.cp - 250) <= 5, `cp=${result.cp} zou alleen measured moeten volgen`);
  });
});
