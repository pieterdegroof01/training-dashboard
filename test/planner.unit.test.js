'use strict';
// Weektelling in de planner loopt via UTC-middernacht (Date.UTC), dat geen DST
// kent. Het verschil tussen twee UTC-middernachten is altijd een exact veelvoud
// van 86400000 ms, ongeacht tijdzone of zomertijd. Testdatums mogen vrij worden
// gekozen — zomer- en winterdatums geven beide stabiele weekIndex-waarden.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildPlan, zoneWatts, blockTSS, deriveMode,
  DIST_BASE, ZONE_IF,
  dateToUTCms, daysBetweenUTC, getMondayOf, computePlanWindow,
  goalsToGoalSet, resolveGoalPriority, buildMacrocycle,
  runPaceZones, runBlockTSS, buildRunSession, buildSession,
  modalityInterferenceWeight, clampInterferenceParams,
  requiredSeparationHours, separationLevel,
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

// ── UTC-helpers: daysBetweenUTC en getMondayOf ──────────────────────────────
// Onafhankelijk berekend: van 2024-01-01 tot doeldatum in exacte dagentelling.

describe('daysBetweenUTC', () => {
  test('2024-01-01 → 2026-01-19 = 749 dagen', () => {
    // 2024: 366 dagen (schrikkeljaar), 2025: 365 d, 2026 jan 1-19: 18 d elapsed → 731+18=749
    assert.strictEqual(daysBetweenUTC('2024-01-01', '2026-01-19'), 749);
  });

  test('2024-01-01 → 2026-01-26 = 756 dagen', () => {
    assert.strictEqual(daysBetweenUTC('2024-01-01', '2026-01-26'), 756);
  });

  test('2024-01-01 → 2026-06-15 = 896 dagen (over DST-grens)', () => {
    // 731 + jan(31)+feb(28)+mar(31)+apr(30)+may(31)+jun1-15(15)-1 = 731+165 = 896
    assert.strictEqual(daysBetweenUTC('2024-01-01', '2026-06-15'), 896);
  });
});

describe('getMondayOf', () => {
  test('2026-06-17 (woensdag) → 2026-06-15', () => {
    assert.strictEqual(getMondayOf('2026-06-17'), '2026-06-15');
  });

  test('2026-06-15 (maandag) blijft 2026-06-15', () => {
    assert.strictEqual(getMondayOf('2026-06-15'), '2026-06-15');
  });
});

// ── computePlanWindow — regressie op de venstergrens (commit 0a27f21 bug) ───────
// windowStart moet VANDAAG zijn, niet de maandag van de week: buildAvailDays
// schrijft alleen vanaf vandaag voor. windowEnd blijft wel de zondag van de week
// waarin de eerste prescription valt.
describe('computePlanWindow', () => {
  test('vandaag = woensdag, prescriptions op woensdag+zaterdag → windowStart = woensdag, windowEnd = zondag', () => {
    const nowMs = Date.parse('2026-01-07T09:00:00Z');   // woensdag
    const { windowStart, windowEnd } = computePlanWindow(
      ['2026-01-07', '2026-01-10'],   // woensdag, zaterdag
      nowMs
    );
    assert.strictEqual(windowStart, '2026-01-07');
    assert.strictEqual(windowEnd, '2026-01-11');          // zondag van diezelfde week
  });

  test('ongesorteerde input geeft hetzelfde windowEnd als gesorteerde input', () => {
    const nowMs = Date.parse('2026-01-07T09:00:00Z');
    const a = computePlanWindow(['2026-01-10', '2026-01-07'], nowMs);
    const b = computePlanWindow(['2026-01-07', '2026-01-10'], nowMs);
    assert.strictEqual(a.windowEnd, b.windowEnd);
  });
});

// ── deriveMode — nowMs-injectie i.p.v. systeemklok (commit C1) ──────────────────
// deriveMode las voorheen de systeemklok direct via new Date(); niet-deterministisch
// en ontestbaar zonder klok te mocken. nowMs wordt nu meegegeven met Date.now() als
// default, en de vergelijking loopt via dateToUTCms (UTC-middernacht, DST-onafhankelijk).
describe('deriveMode', () => {
  const NOW = Date.UTC(2026, 6, 13);   // 2026-07-13, referentiemoment

  test('eventDate in de toekomst t.o.v. NOW → "event"', () => {
    assert.strictEqual(
      deriveMode({ eventDate: '2026-08-01' }, 70, NOW),
      'event'
    );
  });

  test('eventDate in het verleden t.o.v. NOW, geen weightTarget → "base"', () => {
    assert.strictEqual(
      deriveMode({ eventDate: '2026-06-01' }, 70, NOW),
      'base'
    );
  });

  test('eventDate exact op NOW (dateToUTCms === nowMs) → niet "event" (strikt groter-dan)', () => {
    assert.strictEqual(
      deriveMode({ eventDate: '2026-07-13' }, 70, NOW),
      'base'
    );
  });

  test('geen eventDate, weightTarget > 1 kg onder currentWeight → "fatloss"', () => {
    assert.strictEqual(
      deriveMode({ weightTarget: '65 kg' }, 70, NOW),
      'fatloss'
    );
  });

  test('geen eventDate, geen weightTarget → "base"', () => {
    assert.strictEqual(
      deriveMode({}, 70, NOW),
      'base'
    );
  });

  test('determinisme: identieke NOW geeft identiek resultaat, onafhankelijk van systeemklok', () => {
    const goals = { eventDate: '2026-08-01' };
    const a = deriveMode(goals, 70, NOW);
    const b = deriveMode(goals, 70, NOW);
    assert.strictEqual(a, b);
    assert.strictEqual(a, 'event');
  });
});

// ── DST-regressietest ────────────────────────────────────────────────────────
// Vastpinnen dat de bug niet terugkomt: zomerweek 2026-06-15 krijgt
// weekIndex = 896/7 = 128 (exact), 128%4 = 0 → mesocycleWeek = 1, GEEN recovery.
// De oude lokale-tijd-code (new Date('...T12:00:00') zonder 'Z') gaf op een CEST-
// machine (UTC+2 vs. CET UTC+1 van de origin) weekIndex = 127 → mesocycleWeek = 4
// = cadence → isRecoveryWeek = true (fout).

describe('DST-regressie: zomerweek 2026-06-15', () => {
  const adSummer = [
    availDay('2026-06-15', 60,  5),
    availDay('2026-06-16', 90,  5),
    availDay('2026-06-17', 120, 5),
    availDay('2026-06-18', 90,  4),
    availDay('2026-06-19', 60,  5),
  ];

  test('ftp-mode: isRecoveryWeek === false (weekIndex 128, 128%4=0, mesocycleWeek=1)', () => {
    const p = buildPlan(
      { ...BASE_INPUT, goals: { mode: 'ftp' }, availDays: adSummer },
      planParams()
    );
    assert.strictEqual(p.skeleton.isRecoveryWeek,  false,
      `isRecoveryWeek=${p.skeleton.isRecoveryWeek}, mesocycleWeek=${p.skeleton.mesocycleWeek}`);
    assert.strictEqual(p.skeleton.mesocycleWeek, 1,
      `mesocycleWeek=${p.skeleton.mesocycleWeek}, verwacht 1`);
  });
});

// ── C3 Backward planner: goalsToGoalSet, resolveGoalPriority, buildMacrocycle ──

function isoPlusDays(iso, days) {
  return new Date(dateToUTCms(iso) + days * 86400000).toISOString().split('T')[0];
}

const MACRO_PARAMS = {
  rampCapCtlPerWeek: 6,
  distributionPolarizedMinHours: 8,
  distributionPyramidalMinHours: 6,
};

describe('goalsToGoalSet — legacy-adapter', () => {
  const NOW = Date.UTC(2026, 5, 1); // 2026-06-01

  test('event: type "event", target_date = eventDate', () => {
    const [g] = goalsToGoalSet({ eventDate: '2026-08-01' }, 75, NOW);
    assert.strictEqual(g.type, 'event');
    assert.strictEqual(g.target_date, '2026-08-01');
    assert.strictEqual(g.weight, 2);
    assert.strictEqual(g.status, 'active');
  });

  test('fatloss: type "composition", target_value uit weightTarget, baseline_value = currentWeight', () => {
    const [g] = goalsToGoalSet({ weightTarget: '65 kg' }, 70, NOW);
    assert.strictEqual(g.type, 'composition');
    assert.strictEqual(g.target_value, 65);
    assert.strictEqual(g.baseline_value, 70);
  });

  test('geen eventDate, geen weightTarget: type "base"', () => {
    const [g] = goalsToGoalSet({}, 70, NOW);
    assert.strictEqual(g.type, 'base');
  });

  test('expliciete goals.mode "ftp" wint van deriveMode', () => {
    const [g] = goalsToGoalSet({ mode: 'ftp' }, 70, NOW);
    assert.strictEqual(g.type, 'ftp');
  });
});

describe('resolveGoalPriority — temporele voorrang (winterdatum)', () => {
  test('doel met target_date binnen 4 weken wint van zwaarder doel zonder target_date', () => {
    const weekStart = '2026-01-05'; // winter, maandag
    const nowMs = Date.UTC(2026, 0, 1);
    const nearGoal  = { type: 'event', weight: 1, target_date: '2026-01-20', status: 'active' }; // 15 dagen
    const heavyGoal = { type: 'base',  weight: 5, target_date: null,         status: 'active' };
    const { dominant } = resolveGoalPriority([nearGoal, heavyGoal], weekStart, nowMs);
    assert.strictEqual(dominant, nearGoal);
  });
});

describe('resolveGoalPriority — sequencing bij gelijk gewicht (zomerdatum)', () => {
  test('sessionBudget met twee gelijkwaardige doelen === sessionBudget met alleen de dominante (niet gesommeerd)', () => {
    const weekStart = '2026-06-15';
    const nowMs = Date.UTC(2026, 5, 1);
    const both = [
      { type: 'base',     weight: 2, target_date: null, status: 'active' },
      { type: 'strength', weight: 2, target_date: null, status: 'active' },
    ];
    const { dominant, sessionBudget: budgetBoth } = resolveGoalPriority(both, weekStart, nowMs);
    const { sessionBudget: budgetSolo } = resolveGoalPriority([dominant], weekStart, nowMs);
    assert.deepStrictEqual(budgetBoth, budgetSolo);
  });
});

describe('buildMacrocycle — faseduren (som fase-weken == weeksToEvent)', () => {
  const cases = [
    ['zomer, 8 weken',  '2026-06-17', 8],
    ['winter, 12 weken', '2026-01-07', 12],
    ['zomer, 16 weken', '2026-06-10', 16],
  ];

  for (const [label, start, weeks] of cases) {
    test(`${label}`, () => {
      const monday = getMondayOf(start);
      const targetDate = isoPlusDays(monday, weeks * 7);
      const goalSet = [{ type: 'event', weight: 2, target_date: targetDate, status: 'active' }];
      const rows = buildMacrocycle(goalSet, start, { ctl: 55, weeklyHours: 9 }, MACRO_PARAMS, Date.UTC(2026, 5, 1));
      assert.strictEqual(rows.length, weeks);
      const sumPhaseWeeks = rows.reduce((acc, r) => { acc[r.phase] = (acc[r.phase] || 0) + 1; return acc; }, {});
      const sum = Object.values(sumPhaseWeeks).reduce((a, b) => a + b, 0);
      assert.strictEqual(sum, weeks);
    });
  }
});

describe('buildMacrocycle — deload-cadans', () => {
  test('geen event-doel: deload op elke 4e week (cadence 4)', () => {
    const rows = buildMacrocycle([], '2026-06-15', { ctl: 50, weeklyHours: 7 }, MACRO_PARAMS, Date.UTC(2026, 5, 1));
    rows.forEach((r, i) => {
      assert.strictEqual(r.is_deload, (i + 1) % 4 === 0, `week ${i + 1}`);
    });
  });

  test('masters (settings.age >= 50): deload op elke 3e week (cadence 3), winterdatum', () => {
    const baseline = { ctl: 50, weeklyHours: 7, settings: { age: 55 } };
    const rows = buildMacrocycle([], '2026-01-05', baseline, MACRO_PARAMS, Date.UTC(2026, 0, 1));
    rows.forEach((r, i) => {
      assert.strictEqual(r.is_deload, (i + 1) % 3 === 0, `week ${i + 1}`);
    });
  });
});

describe('buildMacrocycle — step-taper (regel 95, Bosquet)', () => {
  test('eerste taperweek: 40-60% lager dan laatste peak-week; distribution_model ongewijzigd', () => {
    const start = '2026-06-17';
    const monday = getMondayOf(start);
    const targetDate = isoPlusDays(monday, 16 * 7);
    const goalSet = [{ type: 'event', weight: 2, target_date: targetDate, status: 'active' }];
    const rows = buildMacrocycle(goalSet, start, { ctl: 55, weeklyHours: 9 }, MACRO_PARAMS, Date.UTC(2026, 5, 1));

    const peakRows  = rows.filter(r => r.phase === 'peak');
    const taperRows = rows.filter(r => r.phase === 'taper');
    const lastPeak  = peakRows[peakRows.length - 1];
    const firstTaper = taperRows[0];

    const reduction = 1 - firstTaper.endurance_tss_target / lastPeak.endurance_tss_target;
    assert.ok(reduction >= 0.40 && reduction <= 0.60,
      `reductie ${(reduction * 100).toFixed(1)}% buiten 40-60% band`);
    assert.strictEqual(firstTaper.distribution_model, lastPeak.distribution_model);
  });
});

// ── runPaceZones — pace-omkering t.o.v. RUN_ZONE_BOUNDS ─────────────────────
// thresholdPace 255 sec/km. Hogere snelheidsratio = lager (sneller) tempo, dus
// de ratio-ondergrens van een zone levert de tempo-bovengrens (traagste kant).

describe('runPaceZones', () => {
  const z = runPaceZones(255);

  test('Z4 = [round(255/1.02), round(255/0.95)] = [250, 268]', () => {
    assert.deepStrictEqual(z.Z4, [250, 268]);
  });

  test('omkering: Z5 (sneller) heeft een lager tempogetal dan Z2 (trager)', () => {
    assert.ok(z.Z5[0] < z.Z2[0], `Z5[0]=${z.Z5[0]} moet < Z2[0]=${z.Z2[0]}`);
    assert.ok(z.Z5[1] < z.Z2[1], `Z5[1]=${z.Z5[1]} moet < Z2[1]=${z.Z2[1]}`);
  });

  test('per zone paceSnelSec < paceTraagSec (waar beide gezet zijn)', () => {
    for (const key of ['Z2', 'Z3', 'Z4', 'Z5']) {
      assert.ok(z[key][0] < z[key][1], `${key}: ${JSON.stringify(z[key])}`);
    }
  });

  test('Z1 heeft geen trage bovengrens (null), Z6 geen snelle ondergrens (null)', () => {
    assert.strictEqual(z.Z1[1], null);
    assert.strictEqual(z.Z6[0], null);
  });

  test('aansluiting tussen zones: Z1[0] == Z2[1], Z2[0] == Z3[1], ... Z5[0] == Z6[1]', () => {
    assert.strictEqual(z.Z1[0], z.Z2[1]);
    assert.strictEqual(z.Z2[0], z.Z3[1]);
    assert.strictEqual(z.Z3[0], z.Z4[1]);
    assert.strictEqual(z.Z4[0], z.Z5[1]);
    assert.strictEqual(z.Z5[0], z.Z6[1]);
  });
});

// ── runBlockTSS — leest RUN_ZONE_IF, niet de fietstabel ZONE_IF ─────────────

describe('runBlockTSS', () => {
  test('runBlockTSS(60,"Z4") = 1.00²×100 = 100', () => {
    assert.strictEqual(runBlockTSS(60, 'Z4'), 100);
  });

  test('runBlockTSS(60,"Z1") ligt rond 49 (0.70²×100), niet rond 25 zoals ZONE_IF.Z1=0.50 zou geven', () => {
    assert.ok(Math.abs(runBlockTSS(60, 'Z1') - 49) < 0.1,
      `runBlockTSS(60,"Z1") = ${runBlockTSS(60, 'Z1')}`);
  });
});

// ── buildRunSession ──────────────────────────────────────────────────────────

describe('buildRunSession', () => {
  test("threshold, 60min budget: type 'running', werkblok met herhalingen >= 1, duur <= maxDur", () => {
    const s = buildRunSession('2026-07-20', 'threshold', 60, 60, 255);
    assert.strictEqual(s.type, 'running');
    const w = s.blokken.find(b => b.type === 'work');
    assert.ok(w, 'geen werkblok gevonden');
    assert.ok(w.herhalingen >= 1, `herhalingen = ${w.herhalingen}`);
    assert.ok(s.duration <= 60, `duration ${s.duration} > maxDur 60`);
  });

  test('thresholdPace null: geen anker, dus null i.p.v. gokken', () => {
    assert.strictEqual(buildRunSession('2026-07-20', 'threshold', 60, 60, null), null);
  });

  test('thresholdPace 0: eveneens null (niet > 0)', () => {
    assert.strictEqual(buildRunSession('2026-07-20', 'threshold', 60, 60, 0), null);
  });

  test('regressie: loop-endurance 60min Z2 heeft strikt hogere targetTSS dan fiets-endurance 60min Z2 (snelheidsratio\'s comprimeren minder dan vermogensratio\'s)', () => {
    const run = buildRunSession('2026-07-20', 'endurance', 60, 60, 255);
    const cyc = buildSession('2026-07-20', 'endurance', 60, 60, 280);
    assert.ok(run.targetTSS > cyc.targetTSS,
      `run ${run.targetTSS} moet > cyc ${cyc.targetTSS} zijn`);
  });
});

// ── modalityInterferenceWeight — cycling anker 1.0, running atleet-variabel ──

describe('modalityInterferenceWeight', () => {
  const p = planParams();

  test('cycling = 1.0', () => {
    assert.strictEqual(modalityInterferenceWeight('cycling', p), 1.0);
  });

  test('running = 1.75 (prior)', () => {
    assert.strictEqual(modalityInterferenceWeight('running', p), 1.75);
  });

  test('running met prior 3.0 wordt geclampt naar 2.0', () => {
    assert.strictEqual(modalityInterferenceWeight('running', { ...p, runInterferenceWeight: 3.0 }), 2.0);
  });

  test('running met prior 1.0 wordt geclampt naar 1.5', () => {
    assert.strictEqual(modalityInterferenceWeight('running', { ...p, runInterferenceWeight: 1.0 }), 1.5);
  });
});

// ── clampInterferenceParams — 6-uursbodem universeel, geen mutatie ──────────

describe('clampInterferenceParams', () => {
  test('minHoursRunToLegs 2 -> 6, input blijft ongemoeid', () => {
    const input = { ...planParams(), minHoursRunToLegs: 2 };
    const snapshot = { ...input };
    const out = clampInterferenceParams(input);
    assert.strictEqual(out.minHoursRunToLegs, 6);
    assert.deepStrictEqual(input, snapshot, 'clampInterferenceParams mag de input niet muteren');
  });
});

// ── requiredSeparationHours — alleen loop-legs-paren tellen ─────────────────

describe('requiredSeparationHours', () => {
  const p = planParams();

  test('cycling-legs: 0 (fiets valt buiten de heuristiek, zie server.js AI-prompt)', () => {
    const r = requiredSeparationHours({ modality: 'cycling' }, { modality: 'strength', isLegs: true }, p);
    assert.strictEqual(r.hours, 0);
  });

  test('run-push (isLegs false): 0', () => {
    const r = requiredSeparationHours({ modality: 'running' }, { modality: 'strength', isLegs: false }, p);
    assert.strictEqual(r.hours, 0);
  });

  test('run-legs zonder eimdFlag: 24 (preferred)', () => {
    const r = requiredSeparationHours({ modality: 'running', eimdFlag: false }, { modality: 'strength', isLegs: true }, p);
    assert.strictEqual(r.hours, 24);
    assert.strictEqual(r.level, 'preferred');
  });

  test('run-legs met eimdFlag: 48 (eimd)', () => {
    const r = requiredSeparationHours({ modality: 'running', eimdFlag: true }, { modality: 'strength', isLegs: true }, p);
    assert.strictEqual(r.hours, 48);
    assert.strictEqual(r.level, 'eimd');
  });
});

// ── separationLevel ──────────────────────────────────────────────────────────

describe('separationLevel', () => {
  const p = planParams();

  test('4u tegen required 24u = conflict (onder minHoursRunToLegs)', () => {
    assert.strictEqual(separationLevel(4, 24, p), 'conflict');
  });

  test('12u tegen required 24u = suboptimaal', () => {
    assert.strictEqual(separationLevel(12, 24, p), 'suboptimaal');
  });

  test('26u tegen required 24u = ok', () => {
    assert.strictEqual(separationLevel(26, 24, p), 'ok');
  });
});

// ── R4 regressie: interferenceFactor is dode code, geen consumenten ─────────

describe('R4 regressie: interferenceFactor verwijderd', () => {
  const fs = require('fs');
  const path = require('path');

  test('geen enkel bronbestand noemt interferenceFactor nog', () => {
    for (const rel of ['planner.js', 'athleteParams.js', 'test/helpers.js']) {
      const src = fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
      assert.ok(!src.includes('interferenceFactor'), `${rel} noemt interferenceFactor nog`);
    }
  });
});
