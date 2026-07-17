'use strict';
// scoreEnduranceSession/scoreStrengthSession/stravaModality: verplaatst uit
// server.js (was computeSessionScore) naar de pure scoringslaag in planner.js
// als onderdeel van C5g. Verwachte waarden met de hand uitgerekend uit de drie
// componenten (duur/intensiteit/zone), niet uit een run, zodat een regressie op
// de fietsuitkomst hier altijd zichtbaar wordt.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { stravaModality, scoreEnduranceSession, scoreStrengthSession } = require('../planner');

describe('scoreEnduranceSession — fiets (regressie t.o.v. de oude computeSessionScore)', () => {
  test('rit met vermogen tegen sessie met targetTSS: durScore 7, intScore 2, zoneScore 7 -> 5.3', () => {
    const planned = { duration: 90, targetTSS: 70, zone: 'Z2' };
    const actual = {
      type: 'Ride', moving_time: 4500, // 75 min, durRatio 0.833 -> 7
      average_watts: 230, weighted_average_watts: 235, // actualIF 235/280=0.8393
    };
    const settings = { ftp: 280, hrMax: 197 };

    // durScore 7 (0.75 <= 0.833 < 0.90)
    // intScore: plannedIF = sqrt(70/150) = 0.68313; actualIF = 0.83929;
    //           diff = |0.83929/0.68313 - 1| = 0.2286 >= 0.20 -> intScore 2
    // zoneScore: actualZone via power IF=0.8393 -> Z3 (0.75<=IF<0.91);
    //            plannedPrimaryZone = 'Z2'; diff 1 -> zoneScore 7
    // score = 0.40*7 + 0.35*2 + 0.25*7 = 2.8 + 0.7 + 1.75 = 5.25 -> 5.3
    assert.strictEqual(scoreEnduranceSession(planned, actual, settings), 5.3);
  });
});

describe('scoreEnduranceSession — loop', () => {
  test('duurloop op 70% van drempelsnelheid tegen Z2-loopsessie scoort hoog op zone en intensiteit', () => {
    const settings = { thresholdPace: 300, ftp: 280, hrMax: 197 }; // 300 s/km drempel
    const planned = { duration: 60, targetTSS: 61, zone: 'Z2' };
    const actual = {
      type: 'Run', moving_time: 3600, average_speed: 2.6, // ratio 2.6*300/1000 = 0.78 -> Z2
    };

    // durScore 10 (60/60 = 1.0)
    // pace-ratio 0.78 -> RUN_ZONE_BOUNDS z1=0.72,z2=0.83 dus zone Z2, IF 0.78
    // plannedIF = sqrt(61/100) = 0.78102; diff = |0.78/0.78102-1| = 0.0013 -> intScore 10
    // actualZone Z2 == plannedPrimaryZone Z2 -> zoneScore 10
    // score = 0.40*10 + 0.35*10 + 0.25*10 = 10
    assert.strictEqual(scoreEnduranceSession(planned, actual, settings), 10);
  });

  test('loop zonder thresholdPace en zonder hartslag: intScore null, weging 55/45, score binnen 1..10', () => {
    const settings = { ftp: 280, hrMax: 197 }; // geen thresholdPace
    const planned = { duration: 60, targetTSS: 50, zone: 'Z2' };
    const actual = { type: 'Run', moving_time: 3600, average_speed: 2.8 }; // geen average_heartrate

    // computeRunningLoad geeft IF null zonder thresholdPace -> intScore blijft null
    // durScore 10 (60/60); zoneAnchor ontbreekt (geen pace-anker, geen HR) -> zoneScore 5
    // score = 0.55*10 + 0.45*5 = 5.5 + 2.25 = 7.75 -> 7.8
    const score = scoreEnduranceSession(planned, actual, settings);
    assert.strictEqual(score, 7.8);
    assert.ok(score >= 1 && score <= 10);
  });

  test('R2-regressie: rustige loop met Strava-geschatte watts die via power Z4 zou opleveren, scoort laag op zone via de pace-tak', () => {
    const settings = { thresholdPace: 300, ftp: 280, hrMax: 197 };
    const planned = { duration: 60, zone: 'Z4' }; // geen targetTSS -> intScore blijft null, isoleert de zone-component
    const actual = {
      type: 'Run', moving_time: 3600,
      average_speed: 2.5, // ratio 2.5*300/1000 = 0.75 -> Z2 via de pace-tak
      average_watts: 290, weighted_average_watts: 290, // 290/280 = 1.036 -> zou Z4 opleveren als de fiets-tak hier las
    };

    // isRun is true, dus runZoneFromActivity (pace) wordt eerst genomen en de
    // vermogenstak wordt nooit bereikt: actualZone = Z2, niet Z4.
    // durScore 10; zoneScore: |zNum(Z2)-zNum(Z4)| = 2 -> 4
    // score = 0.55*10 + 0.45*4 = 5.5 + 1.8 = 7.3
    // Zonder de R2-fix zou actualZone via watts Z4 worden, gelijk aan planned Z4,
    // zoneScore 10 en score 10 -- een stil terugkerende bug.
    assert.strictEqual(scoreEnduranceSession(planned, actual, settings), 7.3);
  });
});

describe('scoreStrengthSession', () => {
  test('workout van 55 minuten tegen sessie van 60 minuten geeft 10', () => {
    const planned = { duration: 60 };
    const workout = { start_time: '2026-07-10T08:00:00Z', end_time: '2026-07-10T08:55:00Z' };
    assert.strictEqual(scoreStrengthSession(planned, workout), 10);
  });

  test('ontbrekende end_time geeft 5', () => {
    const planned = { duration: 60 };
    const workout = { start_time: '2026-07-10T08:00:00Z' };
    assert.strictEqual(scoreStrengthSession(planned, workout), 5);
  });
});

describe('stravaModality', () => {
  test('Ride en VirtualRide -> cycling', () => {
    assert.strictEqual(stravaModality('Ride'), 'cycling');
    assert.strictEqual(stravaModality('VirtualRide'), 'cycling');
  });

  test('Run en TrailRun -> running', () => {
    assert.strictEqual(stravaModality('Run'), 'running');
    assert.strictEqual(stravaModality('TrailRun'), 'running');
  });

  test('Swim en Hike -> other', () => {
    assert.strictEqual(stravaModality('Swim'), 'other');
    assert.strictEqual(stravaModality('Hike'), 'other');
  });
});
