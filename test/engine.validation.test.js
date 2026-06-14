'use strict';
// ════════════════════════════════════════════════════════════════════════════
// Wetenschappelijk validatieharnas — elke verwachte waarde wordt ONAFHANKELIJK
// berekend uit de gepubliceerde formule. De te testen functie bepaalt NOOIT de
// verwachte waarde. Bronvermelding staat boven elke testgroep.
// ════════════════════════════════════════════════════════════════════════════
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeETLForActivity, computeLoadMetrics,
  classifyTrainingModel, detectOverreaching,
} = require('../engine');
const {
  makeRide, makeRun,
  constantDailyETL, impulseDailyETL,
} = require('./helpers');

// ── 1. TSS — Coggan (Training and Racing with a Power Meter) ─────────────────
// Formule: TSS = IF² × uren × 100,  IF = NP / FTP
// Bron: PeakForm_Trainingstheorie.md §2.1

describe('TSS Coggan-formule', () => {
  const FTP = 280;

  test('3600s NP=FTP → IF=1.0 → TSS=100', () => {
    // Onafhankelijk: 1.0² × 1.0 × 100 = 100
    const a = makeRide({ date: '2026-03-10', durationSec: 3600, watts: FTP, npWatts: FTP });
    assert.strictEqual(computeETLForActivity(a, { ftp: FTP }).etl, 100);
  });

  test('3600s NP=0.80×FTP → IF=0.80 → TSS=64', () => {
    // Onafhankelijk: 0.80² × 1.0 × 100 = 64
    const np = FTP * 0.80; // 224 — exact integer bij ftp=280
    const a = makeRide({ date: '2026-03-10', durationSec: 3600, watts: np, npWatts: np });
    assert.strictEqual(computeETLForActivity(a, { ftp: FTP }).etl, 64);
  });

  test('7200s NP=0.70×FTP → IF=0.70 → TSS=98', () => {
    // Onafhankelijk: 0.70² × 2.0 × 100 = 0.49 × 200 = 98
    const np = FTP * 0.70; // 196
    const a = makeRide({ date: '2026-03-10', durationSec: 7200, watts: np, npWatts: np });
    assert.strictEqual(computeETLForActivity(a, { ftp: FTP }).etl, 98);
  });
});

// ── 2. CTL/ATL — EWMA impuls-respons (Banister/Coggan PMC) ──────────────────
// Formule: k = 1 − e^(−1/τ),  x_t = x_{t-1} + k × (load_t − x_{t-1})
// τ_CTL = 42, τ_ATL = 7. Bron: PeakForm_Trainingstheorie.md §2.2

describe('CTL/ATL EWMA Banister/Coggan', () => {
  const k_atl = 1 - Math.exp(-1 / 7);
  const k_ctl = 1 - Math.exp(-1 / 42);

  test('eerste stap vanuit 0 met L=100: ATL en CTL conform EWMA-formule', () => {
    // Onafhankelijk:
    //   ATL_1 = 0 + k_atl × (100 − 0) = k_atl × 100 ≈ 13.3
    //   CTL_1 = 0 + k_ctl × (100 − 0) = k_ctl × 100 ≈  2.36
    const expectedATL = k_atl * 100;
    const expectedCTL = k_ctl * 100;
    const m = computeLoadMetrics({ '2026-03-10': 100 }, '2026-03-10');
    const h = m.history['2026-03-10'];
    assert.ok(Math.abs(h.atl - expectedATL) < 0.1,
      `ATL ${h.atl} ≠ verwacht ${expectedATL.toFixed(2)} (±0.1)`);
    assert.ok(Math.abs(h.ctl - expectedCTL) < 0.1,
      `CTL ${h.ctl} ≠ verwacht ${expectedCTL.toFixed(2)} (±0.1)`);
  });

  test('steady-state: constante load 250 dagen → CTL en ATL convergeren naar L', () => {
    // Onafhankelijk: steady-state EWMA → lim x = L. Na 250 dagen ≈ volledig geconvergeerd.
    // CTL_∞ = L × (1 − e^(−250/42)) ≈ L × 0.9974
    // ATL_∞ = L × (1 − e^(−250/7))  ≈ L (vrijwel exact)
    const L = 80;
    const etl = constantDailyETL('2022-01-01', 250, L);
    const m = computeLoadMetrics(etl, '2022-09-07'); // dag 249 (0-indexed)
    assert.ok(Math.abs(m.ctl - L) < 0.5, `CTL ${m.ctl} niet binnen 0.5 van ${L}`);
    assert.ok(Math.abs(m.atl - L) < 0.1, `ATL ${m.atl} niet binnen 0.1 van ${L}`);
    assert.ok(Math.abs(m.tsb) < 1.0,     `TSB ${m.tsb} niet ~0 in steady-state`);
  });
});

// ── 3. Detraining — exponentieel verval, halfwaardetijd τ × ln(2) ────────────
// t_half_CTL = 42 × ln(2) ≈ 29.1 dagen.
// Bron: PeakForm_Trainingstheorie.md §2.3

describe('Detraining halfwaardetijd CTL', () => {
  test('na plateau + 29 dagen nul: CTL ≈ halve plateauwaarde (±5%)', () => {
    // Onafhankelijk: CTL_t = CTL_0 × e^(−t/42).
    //   Na t=29: factor = e^(−29/42) ≈ 0.5015 ≈ 0.50 (binnen 1.5%).
    const plateau = constantDailyETL('2022-01-01', 250, 80);
    const mPlateau = computeLoadMetrics(plateau, '2022-09-07');
    const ctlPlateau = mPlateau.ctl;

    // Geen extra load na plateau; asOfDate 29 dagen later (sep 8 t/m okt 6).
    const mAfter = computeLoadMetrics(plateau, '2022-10-06');
    const frac = mAfter.ctl / ctlPlateau;
    assert.ok(Math.abs(frac - 0.5) < 0.05,
      `CTL na 29 dagen nul: ${mAfter.ctl.toFixed(1)} = ${(frac*100).toFixed(1)}% van plateau ${ctlPlateau.toFixed(1)} (±5% van 50% verwacht)`);
  });
});

// ── 4. Banister TRIMP — mannelijke constanten 0.64 / 1.92 ────────────────────
// trimp = durH×60 × hrR × (0.64 × e^(1.92×hrR)),  hrR = (avgHR−60)/(hrMax−60)
// Engine past ×1.2 toe voor Run. Bron: PeakForm_Trainingstheorie.md §3.1

describe('Banister TRIMP (mannelijk) — Run-pad', () => {
  test('Run met avgHr/hrMax → etl conform TRIMP×1.2 formule', () => {
    const avgHr = 150, hrMax = 200, durationSec = 3600;
    // Onafhankelijk:
    const hrR  = (avgHr - 60) / (hrMax - 60);           // 90/140
    const durH = durationSec / 3600;
    const trimp = durH * 60 * hrR * (0.64 * Math.exp(1.92 * hrR));
    const expectedETL = Math.min(Math.round(trimp * 1.2), 400);

    const a = makeRun({ date: '2026-03-10', durationSec, avgHr });
    const r = computeETLForActivity(a, { ftp: 280, hrMax });
    assert.strictEqual(r.etl, expectedETL);
  });
});

// ── 5. ACWR-zones — Gabbett sweet spot 0.8–1.3, gevaar >1.5 ─────────────────
// Bron: Gabbett (2016) "Training-injury prevention paradox".
// PeakForm_Trainingstheorie.md §2.4

describe('ACWR-zones (Gabbett)', () => {
  test('steady-state load 250 dagen → ACWR ≈ 1.0 (±0.05)', () => {
    // Onafhankelijk: ATL ≈ CTL ≈ L in steady-state → ACWR = ATL/CTL ≈ 1.0.
    const m = computeLoadMetrics(constantDailyETL('2022-01-01', 250, 80), '2022-09-07');
    assert.ok(Math.abs(m.acwr - 1.0) < 0.05,
      `ACWR ${m.acwr} niet in [0.95,1.05] na steady-state`);
  });

  test('acute spike na lage basis → ACWR > 1.5 en detectOverreaching pusht ACWR-flag', () => {
    // Onafhankelijk: 14 dagen L=10, dan 1 dag L=300.
    // ATL_spike ≈ 47, CTL_spike ≈ 10 → ACWR ≈ 4.7 >> 1.5 (acwrCrit default).
    const etl = impulseDailyETL('2026-03-01', 15, 14, 10, 300);
    const m = computeLoadMetrics(etl, '2026-03-15');
    assert.ok(m.acwr > 1.5, `ACWR ${m.acwr} niet > 1.5 na spike`);
    const { flags } = detectOverreaching(m, m.history, {});
    assert.ok(flags.some(f => f.includes('ACWR')),
      `Geen ACWR-flag in: ${JSON.stringify(flags)}`);
  });
});

// ── 6. TID-modellen — Seiler polarized ~80/20 ────────────────────────────────
// Seiler & Kjerland (2006): élite duursporters trainen ~80% laag / ~20% hoog.
// PeakForm_Trainingstheorie.md §4.1

describe('TID-modellen (Seiler)', () => {
  test('80/5/15 → polarized (Seiler definitie: hoog>=12%, mid<20%, laag>=65%)', () => {
    assert.strictEqual(classifyTrainingModel(0.80, 0.05, 0.15), 'polarized');
  });

  test('75/20/5 → pyramidal (laag>mid>hoog, hoog>=5%)', () => {
    assert.strictEqual(classifyTrainingModel(0.75, 0.20, 0.05), 'pyramidal');
  });

  test('55/30/15 → threshold-heavy (Seiler: te veel grey zone, mid>=25%)', () => {
    assert.strictEqual(classifyTrainingModel(0.55, 0.30, 0.15), 'threshold-heavy');
  });
});
