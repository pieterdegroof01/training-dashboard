'use strict';
// recomputeSessionLoad is de enige plek waar een bewerkte weekPlan-sessie zijn tss
// terugkrijgt (zie server.js POST /api/data). Deze tests dekken de vier modaliteiten
// en de lege-blokken kortsluiting.
// draait geïsoleerd met: node --test test/planner-recompute.test.js

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { recomputeSessionLoad, calcSessionTSS, calcRunSessionTSS, blockTSS, ZONE_IF } = require('../planner');

describe('recomputeSessionLoad', () => {
  test('fietsintervalsessie: herhalingen en herstelBlok tellen mee', () => {
    const blokken = [
      { duration: 8, zone: 'Z4', herhalingen: 4, herstelBlok: { duration: 3, zone: 'Z1' } },
    ];
    const session = { type: 'cycling', blokken };
    const result = recomputeSessionLoad(session);
    assert.strictEqual(result.tss, Math.round(calcSessionTSS(blokken)));
    assert.ok(result.tss > blockTSS(8, 'Z4'),
      'een implementatie die herhalingen negeert komt niet boven één enkel werkblok uit');
  });

  test('sweetspotblok gebruikt ZONE_IF.SS via _tssZone, niet ZONE_IF[b.zone]', () => {
    const blokken = [{ duration: 20, zone: 'Z4', _tssZone: 'SS' }];
    const session = { type: 'cycling', blokken };
    const result = recomputeSessionLoad(session);
    assert.notStrictEqual(ZONE_IF.SS, ZONE_IF.Z4, 'testvoorwaarde: SS en Z4 moeten een ander IF hebben');
    assert.strictEqual(result.tss, Math.round(blockTSS(20, 'SS')));
    assert.notStrictEqual(result.tss, Math.round(blockTSS(20, 'Z4')));
  });

  test('loopsessie gebruikt calcRunSessionTSS en wijkt af van calcSessionTSS', () => {
    const blokken = [{ duration: 30, zone: 'Z3' }];
    const session = { type: 'running', blokken };
    const result = recomputeSessionLoad(session);
    assert.strictEqual(result.tss, Math.round(calcRunSessionTSS(blokken)));
    assert.notStrictEqual(result.tss, Math.round(calcSessionTSS(blokken)));
  });

  test('krachtsessie krijgt geen tss-veld', () => {
    const blokken = [{ naam: 'Squat', sets: 4, reps: 8 }];
    const session = { type: 'strength', blokken };
    const result = recomputeSessionLoad(session);
    assert.strictEqual('tss' in result, false);
  });

  test('sessie zonder blokken komt identiek terug', () => {
    const session = { type: 'cycling', titel: 'Leeg' };
    const result = recomputeSessionLoad(session);
    assert.deepStrictEqual(result, session);
  });
});
