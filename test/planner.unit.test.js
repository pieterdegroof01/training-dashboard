'use strict';
// NOTE: alle datums zijn in januari 2026 (CET = UTC+1), identiek aan de origin
// (2024-01-01 CET). Zomerdatums veroorzaken een 1-uur-scheefstand door CEST (UTC+2)
// waardoor weekIndex met 1 daalt en recovery-detectie omslaat — dat is bewust
// gedrag in de planner, maar maakt klok-onafhankelijke tests lastiger met
// zomerdatums. Winterdatums zijn DST-vrij en geven exacte weekIndex-berekeningen.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPlan, zoneWatts, blockTSS,
  DIST_BASE, ZONE_IF,
} = require('../planner');
const { availDay, planParams } = require('./helpers');

// ── blockTSS — Coggan-consistent ─────────────────────────────────────────────
// Formule: (durationMin/60) × IF² × 100,  IF = ZONE_IF[ifKey]

describe('blockTSS', () => {
  test('blockTSS(60,"Z4") = 0.98²×100 = 96.04 (±0.01)', () => {
    assert.ok(Math.abs(blockTSS(60, 'Z4') - 96.04) < 0.01,
      `blockTSS(60,"Z4") = ${blockTSS(60,'Z4')}`);
  });

  test('blockTSS(60,"SS") = 0.90²×100 = 81.00 (±0.01)', () => {
    assert.ok(Math.abs(blockTSS(60, 'SS') - 81.00) < 0.01,
      `blockTSS(60,"SS") = ${blockTSS(60,'SS')}`);
  });

  test('blockTSS(120,"Z2") = 2×0.65²×100 = 84.50 (±0.01)', () => {
    // Onafhankelijk: (120/60) × 0.65² × 100 = 2 × 42.25 = 84.50
    assert.ok(Math.abs(blockTSS(120, 'Z2') - 84.50) < 0.01,
      `blockTSS(120,"Z2") = ${blockTSS(120,'Z2')}`);
  });
});

// ── zoneWatts — %-FTP-coëfficiënten ─────────────────────────────────────────

describe('zoneWatts', () => {
  const z = zoneWatts(280);

  test('Z1 bovengrens = round(280×0.55) = 154', () => {
    assert.strictEqual(z.Z1[1], Math.round(280 * 0.55));
  });

  test('Z2 ondergrens = round(280×0.56) = 157', () => {
    assert.strictEqual(z.Z2[0], Math.round(280 * 0.56));
  });

  test('Z5 bovengrens = round(280×1.20) = 336', () => {
    assert.strictEqual(z.Z5[1], Math.round(280 * 1.20));
  });

  test('SS = [round(280×0.88), round(280×0.94)] = [246, 263]', () => {
    assert.strictEqual(z.SS[0], Math.round(280 * 0.88));
    assert.strictEqual(z.SS[1], Math.round(280 * 0.94));
  });
});

// ── DIST_BASE sommeert per model naar 1.0 ───────────────────────────────────

describe('DIST_BASE', () => {
  for (const [model, d] of Object.entries(DIST_BASE)) {
    test(`${model}: low+mid+high = 1.0`, () => {
      const sum = d.low + d.mid + d.high;
      assert.ok(Math.abs(sum - 1.0) < 1e-9, `${model} = ${sum}`);
    });
  }
});

// ── buildPlan — invarianten ──────────────────────────────────────────────────
//
// Week-keuze (alle CET, DST-vrij):
//   2026-01-19 (ma) → weekIndex=107, 107%4=3 → mesocycleWeek=4 = cadence → RECOVERY
//   2026-01-26 (ma) → weekIndex=108, 108%4=0 → mesocycleWeek=1             → NORMAAL
//
// Verificatie weekIndex 107: Δ van 2024-01-01 = 749 dagen, 749/7 = 107.0 exact.
// Verificatie weekIndex 108: Δ van 2024-01-01 = 756 dagen, 756/7 = 108.0 exact.

// Niet-recovery week: 2026-01-26 (weekIndex=108, mesocycleWeek=1)
const AD_STD = [
  availDay('2026-01-26', 60, 5),
  availDay('2026-01-27', 90, 5),
  availDay('2026-01-28', 120, 5),
  availDay('2026-01-29', 90, 4),
  availDay('2026-01-30', 60, 5),
];

const BASE_INPUT = {
  goals: { mode: 'base' },
  metrics: { ctl: 50 },
  currentWeight: 75,
  ftp: 280,
  settings: {},
};

describe('buildPlan: geen availDays', () => {
  test('lege availDays → { skeleton:{}, sessions:{}, prescriptions:[] }', () => {
    const p = buildPlan({ ...BASE_INPUT, availDays: [] }, planParams());
    assert.deepStrictEqual(p.skeleton, {});
    assert.deepStrictEqual(p.prescriptions, []);
  });
});

describe('buildPlan: TSS-targeting', () => {
  test('som(prescriptions.target_tss) binnen 5% van skeleton.weeklyTSSTarget', () => {
    const p = buildPlan({ ...BASE_INPUT, availDays: AD_STD }, planParams());
    const sumPrescribed = p.prescriptions.reduce((s, pr) => s + pr.target_tss, 0);
    const target = p.skeleton.weeklyTSSTarget;
    const deviation = target > 0 ? Math.abs(sumPrescribed - target) / target : 0;
    assert.ok(deviation <= 0.05,
      `TSS-afwijking ${(deviation * 100).toFixed(1)}% (som=${sumPrescribed}, target=${target})`);
  });
});

describe('buildPlan: distributionModel', () => {
  test('weeklyHours >= 8 → distributionModel "polarized"', () => {
    // 4 × 120 min = 8 uur >= distributionPolarizedMinHours (8)
    const adPolarized = [
      availDay('2026-01-26', 120, 5),
      availDay('2026-01-27', 120, 5),
      availDay('2026-01-28', 120, 5),
      availDay('2026-01-29', 120, 5),
    ];
    const p = buildPlan({ ...BASE_INPUT, availDays: adPolarized }, planParams());
    assert.strictEqual(p.skeleton.distributionModel, 'polarized');
  });

  test('weeklyHours < 6 → distributionModel "sweetspot"', () => {
    // 3 × 60 min = 3 uur < distributionPyramidalMinHours (6)
    const adSweet = [
      availDay('2026-01-26', 60, 5),
      availDay('2026-01-27', 60, 5),
      availDay('2026-01-28', 60, 5),
    ];
    const p = buildPlan({ ...BASE_INPUT, availDays: adSweet }, planParams());
    assert.strictEqual(p.skeleton.distributionModel, 'sweetspot');
  });
});

describe('buildPlan: recovery-week', () => {
  // Week 2026-01-19: weekIndex=107, 107%4=3 → mesocycleWeek=4=cadence → recovery
  const AD_RECOV = [
    availDay('2026-01-19', 60, 5),
    availDay('2026-01-20', 90, 5),
    availDay('2026-01-21', 60, 5),
  ];

  test('isRecoveryWeek = true', () => {
    const p = buildPlan({ ...BASE_INPUT, availDays: AD_RECOV }, planParams());
    assert.strictEqual(p.skeleton.isRecoveryWeek, true);
  });

  test('distribution = {low:1, mid:0, high:0}', () => {
    const p = buildPlan({ ...BASE_INPUT, availDays: AD_RECOV }, planParams());
    const d = p.skeleton.distribution;
    assert.strictEqual(d.low,  1);
    assert.strictEqual(d.mid,  0);
    assert.strictEqual(d.high, 0);
  });

  test('weeklyTSSAim lager dan vergelijkbare niet-recovery week (week 2026-01-26)', () => {
    // Recovery:     weeklyTSSAim = round(50 × 7 × 0.55) = 193
    // Niet-recovery: weeklyTSSAim = round((50 + 6) × 7) = 392
    const pRecov = buildPlan({ ...BASE_INPUT, availDays: AD_RECOV }, planParams());
    const adNorm = [
      availDay('2026-01-26', 60, 5),
      availDay('2026-01-27', 90, 5),
      availDay('2026-01-28', 60, 5),
    ];
    const pNorm  = buildPlan({ ...BASE_INPUT, availDays: adNorm }, planParams());
    assert.ok(pRecov.skeleton.weeklyTSSAim < pNorm.skeleton.weeklyTSSAim,
      `recovery ${pRecov.skeleton.weeklyTSSAim} niet < normaal ${pNorm.skeleton.weeklyTSSAim}`);
  });
});

describe('buildPlan: distribution.{low,mid,high} sommeert naar 1.0 in niet-recovery', () => {
  test('ftp-mode, week 2026-01-26 (niet-recovery): som = 1.0', () => {
    const p = buildPlan(
      { ...BASE_INPUT, goals: { mode: 'ftp' }, availDays: AD_STD },
      planParams()
    );
    assert.strictEqual(p.skeleton.isRecoveryWeek, false);
    const { low, mid, high } = p.skeleton.distribution;
    assert.ok(Math.abs(low + mid + high - 1.0) < 1e-9,
      `som ${low + mid + high} ≠ 1.0`);
  });
});
