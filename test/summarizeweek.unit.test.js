'use strict';
// summarizeWeek rekent plan_skeleton-realisatie na uit solveWeek-prescriptions.
// Bandindeling identiek aan buildPlan FIX 3 / R2-besluitlog: Z1/Z2 laag, Z3
// midden, Z4+ hoog, met het sweetspot-werkblok als enige uitzondering (telt
// als midden). Kracht doet niet mee: geen zones, geen TSS.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeWeek } = require('../planner');

describe('summarizeWeek', () => {
  test('sweetspot-werkblok (Z4) telt als midden, niet als hoog', () => {
    const prescriptions = [{
      modality: 'cycling',
      session_type: 'sweetspot',
      target_tss: 80,
      blocks: [
        { type: 'warmup',  zone: 'Z2', duration: 10 },
        { type: 'work',    zone: 'Z4', duration: 15, herhalingen: 3, herstelBlok: { duration: 5, zone: 'Z2' } },
        { type: 'cooldown', zone: 'Z1', duration: 5 },
      ],
    }];

    const result = summarizeWeek(prescriptions);

    assert.strictEqual(result.weeklyTSSTarget, 80);
    assert.strictEqual(result.tidMinutes.mid, 45);  // 15min × 3 herhalingen
    assert.strictEqual(result.tidMinutes.high, 0);
    assert.strictEqual(result.tidMinutes.low, 30);  // 10 warmup + 5×3 herstel + 5 cooldown
  });

  test('gemengde fiets-loopweek: beide modaliteiten vallen in dezelfde tidMinutes', () => {
    const prescriptions = [
      { modality: 'cycling', session_type: 'endurance', target_tss: 50,
        blocks: [{ type: 'work', zone: 'Z2', duration: 60 }] },
      { modality: 'running', session_type: 'endurance', target_tss: 40,
        blocks: [{ type: 'warmup', zone: 'Z1', duration: 10 }, { type: 'work', zone: 'Z2', duration: 50 }] },
    ];

    const result = summarizeWeek(prescriptions);

    assert.strictEqual(result.weeklyTSSTarget, 90);
    assert.strictEqual(result.tidMinutes.low, 120); // 60 (fiets) + 10 + 50 (loop)
    assert.strictEqual(result.tidMinutes.total, 120);
  });

  test('krachtvoorschrift beïnvloedt de TSS-som en tidMinutes niet', () => {
    const prescriptions = [
      { modality: 'strength', session_type: 'legs', target_tss: null, blocks: [] },
      { modality: 'cycling', session_type: 'endurance', target_tss: 60,
        blocks: [{ type: 'work', zone: 'Z2', duration: 90 }] },
    ];

    const result = summarizeWeek(prescriptions);

    assert.strictEqual(result.weeklyTSSTarget, 60);
    assert.strictEqual(result.tidMinutes.low, 90);
    assert.strictEqual(result.tidMinutes.total, 90);
  });
});
