'use strict';
// Eenrichtingsafhankelijkheid: planner.js mag engine.js importeren, nooit andersom.
// engine.js mag planner.js nooit importeren.
const { RUN_ZONE_IF, RUN_ZONE_BOUNDS, RUN_SPIKE_BAND, RUN_ACWR_BAND, classifyRunSpike } = require('./engine');
// planner.js — Deterministische planningsmodule. Geen I/O, geen netwerkverzoeken.

// ─── Zone-constanten ──────────────────────────────────────────────────────────

const ZONE_IF = { Z1: 0.50, Z2: 0.65, Z3: 0.83, Z4: 0.98, Z5: 1.12, SS: 0.90 };

function zoneWatts(ftp) {
  return {
    Z1: [0,                      Math.round(ftp * 0.55)],
    Z2: [Math.round(ftp * 0.56), Math.round(ftp * 0.75)],
    Z3: [Math.round(ftp * 0.76), Math.round(ftp * 0.90)],
    Z4: [Math.round(ftp * 0.91), Math.round(ftp * 1.05)],
    Z5: [Math.round(ftp * 1.06), Math.round(ftp * 1.20)],
    SS: [Math.round(ftp * 0.88), Math.round(ftp * 0.94)],
  };
}

// Loop-equivalent van zoneWatts: leest RUN_ZONE_BOUNDS (fracties van drempelsnelheid)
// en zet ze om naar tempo in sec/km. Omkering t.o.v. snelheid: een hogere
// snelheidsratio is een LAGER tempo, dus de ondergrens van een ratio-band levert de
// bovengrens (traagste kant) van de tempo-band op, en omgekeerd. Per zone
// [paceSnelSec, paceTraagSec], paceSnelSec < paceTraagSec. Z1 heeft geen trage
// bovengrens (null), Z6 geen snelle ondergrens (null): buiten drempel is er geen
// vastgelegd uiterste.
function runPaceZones(thresholdPace) {
  const b = RUN_ZONE_BOUNDS;
  const pace = ratio => Math.round(thresholdPace / ratio);
  return {
    Z1: [pace(b.z1), null],
    Z2: [pace(b.z2), pace(b.z1)],
    Z3: [pace(b.z3), pace(b.z2)],
    Z4: [pace(b.z4), pace(b.z3)],
    Z5: [pace(b.z5), pace(b.z4)],
    Z6: [null,       pace(b.z5)],
  };
}

// ─── Doel-profielen ───────────────────────────────────────────────────────────

const GOAL_PROFILES = {
  event:       { rampMultiplier: 1.0,  distShift: { low:  0,     mid:  0,     high:  0     }, hit: 'phase'     },
  base:        { rampMultiplier: 1.0,  distShift: { low: +0.05,  mid:  0,     high: -0.05  }, hit: 'low'       },
  ftp:         { rampMultiplier: 0.9,  distShift: { low: -0.10,  mid: +0.15,  high: -0.05  }, hit: 'threshold' },
  vo2max:      { rampMultiplier: 0.85, distShift: { low: -0.05,  mid: -0.05,  high: +0.10  }, hit: 'vo2max'    },
  fatloss:     { rampMultiplier: 0.8,  distShift: { low: +0.08,  mid: -0.05,  high: -0.03  }, hit: 'low', deficitVolumeFactor: 0.85, protectIntensity: true },
  maintenance: { rampMultiplier: 0.0,  distShift: { low:  0,     mid:  0,     high:  0     }, hit: 'hold', minSessions: 2, maxSessions: 3 },
};

const DIST_BASE = {
  polarized:  { low: 0.80, mid: 0.05, high: 0.15 },
  pyramidal:  { low: 0.75, mid: 0.20, high: 0.05 },
  sweetspot:  { low: 0.55, mid: 0.35, high: 0.10 },
};

// ─── Periodisering per atleetsituatie (R7, canon sectie 217) ─────────────────

const LEVEL_CTL_BOUNDS = {
  cycling: { novice: 40, intermediate: 70, advanced: 100 },
  running: { novice: 20, intermediate: 40, advanced: 60 },
};
// cycling: bestaande niveaudrempels, ongewijzigd overgenomen.
// running: afgeleide synthese, GEEN gepubliceerde tabel. Geijkt op
// rTSS-equivalenten: rCTL 40 ≈ 280 rTSS/week ≈ 4-5u lopen rond drempel-IF.
// Zelfde status als RUN_ZONE_IF (zie R1-besluitlog).

const LEVEL_MIN_HISTORY_DAYS = 84;
// 2× ctlTimeConstantDays (42). Onder deze historielengte is CTL nog niet
// verzadigd en is 'novice' de veilige aanname, ongeacht de gemeten waarde.
// Canon sectie 217: voor een beginner is de verdeling ondergeschikt aan
// consistentie en geleidelijke volumeopbouw.

function deriveLevel({ ctl, historyDays = null }, discipline = 'cycling') {
  if (historyDays !== null && historyDays < LEVEL_MIN_HISTORY_DAYS) return 'novice';
  const b = LEVEL_CTL_BOUNDS[discipline] || LEVEL_CTL_BOUNDS.cycling;
  return ctl < b.novice ? 'novice' : ctl <= b.intermediate ? 'intermediate' : ctl <= b.advanced ? 'advanced' : 'elite';
}

// Puur, muteert params niet. Analoog aan clampInterferenceParams (R4-precedent):
// de leerlaag mag deze knoppen verschuiven, maar niet onder de canon-bodem.
function clampProfileParams(params) {
  const timeBudgetHighMinHours = Math.max(10, params.timeBudgetHighMinHours);
  const timeBudgetModerateMinHours = Math.min(
    Math.max(4, params.timeBudgetModerateMinHours),
    timeBudgetHighMinHours - 1e-9
  );
  return { ...params, timeBudgetHighMinHours, timeBudgetModerateMinHours };
}

// situation: { weeklyHours, level, discipline = 'cycling', phase = 'build',
//              role = 'primary' }. Retourneert { distributionModel, timeBudget,
// rationale }. rationale is een korte Nederlandse string; geen AI, geen schatting.
function selectPeriodizationProfile(situation, params) {
  const { weeklyHours, level, discipline = 'cycling', phase = 'build', role = 'primary' } = situation;
  const p = clampProfileParams(params);
  const timeBudget = weeklyHours >= p.timeBudgetHighMinHours ? 'high'
    : weeklyHours >= p.timeBudgetModerateMinHours ? 'moderate' : 'low';
  // Bosquet-taper verlaagt volume, niet intensiteit: de taper erft het profiel
  // van de piekfase i.p.v. terug te vallen naar een lager model.
  const effPhase = (phase === 'taper' || phase === 'race_week') ? 'peak' : phase;

  let distributionModel, rationale;

  if (level === 'novice') {
    distributionModel = 'pyramidal';
    rationale = 'Beginner: verdeling ondergeschikt aan consistentie en geleidelijke volumeopbouw.';
  } else if (discipline === 'running' && role === 'secondary') {
    distributionModel = 'pyramidal';
    rationale = 'Lopen als tweede sport: laag loopvolume, hoog aandeel lage band, beperkt EIMD en interferentie.';
  } else if (discipline === 'cycling') {
    if (timeBudget === 'low') {
      distributionModel = 'sweetspot';
      rationale = '4-6u levert te weinig absolute uren in de lage band; licht drempelgericht is efficiënter.';
    } else if (timeBudget === 'moderate') {
      distributionModel = 'pyramidal';
      rationale = 'Gematigd tijdsbudget: pyramidale verdeling.';
    } else {
      distributionModel = effPhase === 'base' ? 'pyramidal' : 'polarized';
      rationale = effPhase === 'base'
        ? 'Hoog tijdsbudget, basisfase: pyramidaal bouwen.'
        : 'Hoog tijdsbudget, build/piek: polariseren.';
    }
  } else {
    if (timeBudget === 'low') {
      distributionModel = 'polarized';
      rationale = 'Recreatieve lopers op laag volume winnen meer met polarized dan drempeltraining (Muñoz & Seiler).';
    } else if (timeBudget === 'moderate') {
      distributionModel = effPhase === 'peak' ? 'polarized' : 'pyramidal';
      rationale = effPhase === 'peak'
        ? 'Richting wedstrijd: polariseren (Kenneally).'
        : 'Overwegend pyramidaal, polariseert richting wedstrijd (Kenneally).';
    } else {
      distributionModel = effPhase === 'base' ? 'pyramidal' : 'polarized';
      rationale = effPhase === 'base'
        ? 'Hoog tijdsbudget, basisfase: pyramidaal bouwen.'
        : 'Hoog tijdsbudget, build/piek: polariseren.';
    }
  }

  return { distributionModel, timeBudget, rationale };
}

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function blockTSS(durationMin, ifKey) {
  const v = ZONE_IF[ifKey];
  return (durationMin / 60) * v * v * 100;
}

// RUN_ZONE_IF is prescriptief en mag uitsluitend geplande loopbelasting berekenen;
// de load van een werkelijke loop komt altijd uit computeRunningLoad, dat IF uit
// NGP afleidt.
function runBlockTSS(durationMin, ifKey) {
  const v = RUN_ZONE_IF[ifKey];
  return (durationMin / 60) * v * v * 100;
}

function dateToUTCms(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);        // UTC-middernacht, DST-onafhankelijk
}

function daysBetweenUTC(a, b) {
  return Math.round((dateToUTCms(b) - dateToUTCms(a)) / 86400000);
}

function getMondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = (dt.getUTCDay() + 6) % 7;   // 0 = maandag
  dt.setUTCDate(dt.getUTCDate() - dow);
  return dt.toISOString().split('T')[0];
}

/**
 * Berekent het supersede-venster voor een planrun. Begint bij nowMs (vandaag), niet
 * bij de maandag van de week: buildAvailDays schrijft alleen vanaf vandaag voor, dus
 * verstreken voorschriften in dezelfde week moeten actief blijven zodat
 * reconcilePrescriptions ze nog kan matchen of als missed markeren. Eindigt op de
 * zondag van de week waarin de eerste prescription valt, zodat toekomstige dagen die
 * uit de beschikbaarheid zijn verdwenen alsnog hun voorschrift verliezen.
 * Puur: nowMs wordt ingegeven, geen systeemklok-aanroepen hier.
 */
function computePlanWindow(prescriptionDates, nowMs) {
  const dates       = [...prescriptionDates].sort();
  const windowStart = new Date(nowMs).toISOString().split('T')[0];
  const weekMonday  = getMondayOf(dates[0]);
  const windowEnd   = new Date(new Date(weekMonday + 'T00:00:00Z').getTime() + 6 * 864e5)
                        .toISOString().split('T')[0];
  return { windowStart, windowEnd };
}

function daysBetween(a, b) {
  return daysBetweenUTC(a, b);
}

function deriveMode(goals, currentWeight, nowMs = Date.now()) {
  if (goals.eventDate && dateToUTCms(goals.eventDate) > nowMs) return 'event';
  if (goals.weightTarget) {
    const m = String(goals.weightTarget).match(/[\d.]+/);
    if (m) {
      const target = parseFloat(m[0]);
      if (!isNaN(target) && currentWeight - target > 1) return 'fatloss';
    }
  }
  return 'base';
}

// ─── Blok-TSS en duur ────────────────────────────────────────────────────────

function calcBlockDuration(b) {
  const n = b.herhalingen || 1;
  return b.duration * n + (b.herstelBlok ? b.herstelBlok.duration * n : 0);
}

function calcBlockTSS(b) {
  const n = b.herhalingen || 1;
  // _tssZone overrides zone for IF-berekening (sweetspot: 'SS' ipv 'Z4')
  const tss = blockTSS(b.duration, b._tssZone || b.zone) * n;
  return tss + (b.herstelBlok ? blockTSS(b.herstelBlok.duration, b.herstelBlok.zone) * n : 0);
}

function calcSessionTSS(blokken) {
  return blokken.reduce((s, b) => s + calcBlockTSS(b), 0);
}

function calcSessionDuration(blokken) {
  return blokken.reduce((s, b) => s + calcBlockDuration(b), 0);
}

// calcBlockDuration/calcSessionDuration zijn IF-agnostisch (alleen duration ×
// herhalingen) en gelden onveranderd voor loopblokken. calcBlockTSS niet: die
// leest ZONE_IF via blockTSS, dus loopblokken hebben hun eigen paar op RUN_ZONE_IF.
function calcRunBlockTSS(b) {
  const n = b.herhalingen || 1;
  const tss = runBlockTSS(b.duration, b._tssZone || b.zone) * n;
  return tss + (b.herstelBlok ? runBlockTSS(b.herstelBlok.duration, b.herstelBlok.zone) * n : 0);
}

function calcRunSessionTSS(blokken) {
  return blokken.reduce((s, b) => s + calcRunBlockTSS(b), 0);
}

// ─── Blok-bouwers ────────────────────────────────────────────────────────────

function buildRecoveryBlocks(targetTSS, maxDur, zones) {
  const ifv = ZONE_IF['Z1'];
  const dur = Math.min(maxDur, Math.max(20, Math.round(targetTSS / (ifv * ifv * 100) * 60)));
  return [{ type: 'work', zone: 'Z1', duration: dur, wattMin: zones.Z1[0], wattMax: zones.Z1[1] }];
}

function buildEnduranceBlocks(targetTSS, maxDur, zones) {
  const warmup = 10;
  const remainTSS = Math.max(0, targetTSS - blockTSS(warmup, 'Z1'));
  const ifv = ZONE_IF['Z2'];
  const workDur = Math.min(Math.max(10, Math.round(remainTSS / (ifv * ifv * 100) * 60)), maxDur - warmup);
  return [
    { type: 'warmup',  zone: 'Z1', duration: warmup,   wattMin: zones.Z1[0], wattMax: zones.Z1[1] },
    { type: 'work',    zone: 'Z2', duration: workDur,   wattMin: zones.Z2[0], wattMax: zones.Z2[1] },
  ];
}

function buildIntervalBlocks(cfg, targetTSS, maxDur, zones) {
  const { warmupDur, warmupZone, cooldownDur, cooldownZone,
          workDur, workZone, workIfKey, recoveryDur, recoveryZone } = cfg;

  const fixedDur = warmupDur + cooldownDur;
  const fixedTSS = blockTSS(warmupDur, warmupZone) + blockTSS(cooldownDur, cooldownZone);
  const perRepTSS = blockTSS(workDur, workIfKey) + blockTSS(recoveryDur, recoveryZone);
  const perRepDur = workDur + recoveryDur;

  const nTarget = Math.max(1, Math.round((targetTSS - fixedTSS) / Math.max(perRepTSS, 0.1)));
  const nMax    = Math.max(1, Math.floor((maxDur - fixedDur) / perRepDur));
  const n = Math.min(nTarget, nMax);

  // Sweetspot: zone='Z4' voor frontend, maar watts en IF van 'SS'
  const wattKey = workIfKey;

  return [
    { type: 'warmup',   zone: warmupZone,   duration: warmupDur,   wattMin: zones[warmupZone][0],   wattMax: zones[warmupZone][1] },
    {
      type: 'work', zone: workZone, duration: workDur,
      wattMin: zones[wattKey][0], wattMax: zones[wattKey][1],
      herhalingen: n,
      herstelBlok: { duration: recoveryDur, zone: recoveryZone, wattMin: zones[recoveryZone][0], wattMax: zones[recoveryZone][1] },
      _tssZone: workIfKey,
    },
    { type: 'cooldown', zone: cooldownZone, duration: cooldownDur, wattMin: zones[cooldownZone][0], wattMax: zones[cooldownZone][1] },
  ];
}

function buildSessionBlocks(sessionType, targetTSS, maxDur, zones) {
  switch (sessionType) {
    case 'recovery':   return buildRecoveryBlocks(targetTSS, maxDur, zones);
    case 'endurance':  return buildEnduranceBlocks(targetTSS, maxDur, zones);
    case 'tempo':
      return buildIntervalBlocks({
        warmupDur: 10, warmupZone: 'Z2', cooldownDur: 5, cooldownZone: 'Z1',
        workDur: 18, workZone: 'Z3', workIfKey: 'Z3', recoveryDur: 5, recoveryZone: 'Z2',
      }, targetTSS, maxDur, zones);
    case 'sweetspot':
      return buildIntervalBlocks({
        warmupDur: 10, warmupZone: 'Z2', cooldownDur: 5, cooldownZone: 'Z1',
        workDur: 15, workZone: 'Z4', workIfKey: 'SS', recoveryDur: 5, recoveryZone: 'Z2',
      }, targetTSS, maxDur, zones);
    case 'threshold':
      return buildIntervalBlocks({
        warmupDur: 12, warmupZone: 'Z2', cooldownDur: 8, cooldownZone: 'Z1',
        workDur: 12, workZone: 'Z4', workIfKey: 'Z4', recoveryDur: 5, recoveryZone: 'Z2',
      }, targetTSS, maxDur, zones);
    case 'vo2max':
      return buildIntervalBlocks({
        warmupDur: 12, warmupZone: 'Z2', cooldownDur: 8, cooldownZone: 'Z1',
        workDur: 4, workZone: 'Z5', workIfKey: 'Z5', recoveryDur: 4, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    default:
      return buildEnduranceBlocks(targetTSS, maxDur, zones);
  }
}

// ─── Loopblok-bouwers ────────────────────────────────────────────────────────
// Parallel aan de fietsbouwers hierboven, niet generaliseren: de eenheid (tempo
// i.p.v. watt) en de zonesemantiek (snelheidsratio i.p.v. vermogensratio) lopen
// uiteen, en gedeelde code zou dat verschil verhullen. runPaceZones levert de
// zones-tabel; velden heten paceMinSec/paceMaxSec i.p.v. wattMin/wattMax.

function buildRunRecoveryBlocks(targetTSS, maxDur, zones) {
  const ifv = RUN_ZONE_IF['Z1'];
  const dur = Math.min(maxDur, Math.max(20, Math.round(targetTSS / (ifv * ifv * 100) * 60)));
  return [{ type: 'work', zone: 'Z1', duration: dur, paceMinSec: zones.Z1[0], paceMaxSec: zones.Z1[1] }];
}

function buildRunEnduranceBlocks(targetTSS, maxDur, zones) {
  const warmup = 10;
  const remainTSS = Math.max(0, targetTSS - runBlockTSS(warmup, 'Z1'));
  const ifv = RUN_ZONE_IF['Z2'];
  const workDur = Math.min(Math.max(10, Math.round(remainTSS / (ifv * ifv * 100) * 60)), maxDur - warmup);
  return [
    { type: 'warmup',  zone: 'Z1', duration: warmup,   paceMinSec: zones.Z1[0], paceMaxSec: zones.Z1[1] },
    { type: 'work',    zone: 'Z2', duration: workDur,   paceMinSec: zones.Z2[0], paceMaxSec: zones.Z2[1] },
  ];
}

function buildRunIntervalBlocks(cfg, targetTSS, maxDur, zones) {
  const { warmupDur, warmupZone, cooldownDur, cooldownZone,
          workDur, workZone, workIfKey, recoveryDur, recoveryZone } = cfg;

  const fixedDur = warmupDur + cooldownDur;
  const fixedTSS = runBlockTSS(warmupDur, warmupZone) + runBlockTSS(cooldownDur, cooldownZone);
  const perRepTSS = runBlockTSS(workDur, workIfKey) + runBlockTSS(recoveryDur, recoveryZone);
  const perRepDur = workDur + recoveryDur;

  const nTarget = Math.max(1, Math.round((targetTSS - fixedTSS) / Math.max(perRepTSS, 0.1)));
  const nMax    = Math.max(1, Math.floor((maxDur - fixedDur) / perRepDur));
  const n = Math.min(nTarget, nMax);

  const paceKey = workIfKey;

  return [
    { type: 'warmup',   zone: warmupZone,   duration: warmupDur,   paceMinSec: zones[warmupZone][0],   paceMaxSec: zones[warmupZone][1] },
    {
      type: 'work', zone: workZone, duration: workDur,
      paceMinSec: zones[paceKey][0], paceMaxSec: zones[paceKey][1],
      herhalingen: n,
      herstelBlok: { duration: recoveryDur, zone: recoveryZone, paceMinSec: zones[recoveryZone][0], paceMaxSec: zones[recoveryZone][1] },
      _tssZone: workIfKey,
    },
    { type: 'cooldown', zone: cooldownZone, duration: cooldownDur, paceMinSec: zones[cooldownZone][0], paceMaxSec: zones[cooldownZone][1] },
  ];
}

function buildRunSessionBlocks(sessionType, targetTSS, maxDur, zones) {
  switch (sessionType) {
    case 'recovery':   return buildRunRecoveryBlocks(targetTSS, maxDur, zones);
    case 'endurance':  return buildRunEnduranceBlocks(targetTSS, maxDur, zones);
    case 'tempo':
      return buildRunIntervalBlocks({
        warmupDur: 10, warmupZone: 'Z1', cooldownDur: 10, cooldownZone: 'Z1',
        workDur: 20, workZone: 'Z3', workIfKey: 'Z3', recoveryDur: 3, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    case 'sweetspot':
      // Z3 IS het sweetspot-analoog bij lopen; geen aparte SS-zone zoals bij fietsen.
      return buildRunIntervalBlocks({
        warmupDur: 10, warmupZone: 'Z1', cooldownDur: 10, cooldownZone: 'Z1',
        workDur: 20, workZone: 'Z3', workIfKey: 'Z3', recoveryDur: 3, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    case 'threshold':
      // Daniels cruise intervals, 5-15 min werkblokken.
      return buildRunIntervalBlocks({
        warmupDur: 12, warmupZone: 'Z1', cooldownDur: 10, cooldownZone: 'Z1',
        workDur: 10, workZone: 'Z4', workIfKey: 'Z4', recoveryDur: 2, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    case 'vo2max':
      // Daniels I, 3-5 min werkblokken.
      return buildRunIntervalBlocks({
        warmupDur: 15, warmupZone: 'Z1', cooldownDur: 10, cooldownZone: 'Z1',
        workDur: 4, workZone: 'Z5', workIfKey: 'Z5', recoveryDur: 3, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    case 'repetition':
      // Daniels R, kortdurend.
      return buildRunIntervalBlocks({
        warmupDur: 15, warmupZone: 'Z1', cooldownDur: 10, cooldownZone: 'Z1',
        workDur: 1, workZone: 'Z6', workIfKey: 'Z6', recoveryDur: 3, recoveryZone: 'Z1',
      }, targetTSS, maxDur, zones);
    default:
      return buildRunEnduranceBlocks(targetTSS, maxDur, zones);
  }
}

function sessionTitle(sessionType, blokken) {
  const w = blokken.find(b => b.type === 'work');
  const dur = calcSessionDuration(blokken);
  switch (sessionType) {
    case 'recovery':   return `Herstel Z1 ${dur}min`;
    case 'endurance':  return `Duur Z2 ${dur}min`;
    case 'tempo':      return w ? `Tempo Z3 ${w.herhalingen}×${w.duration}min` : `Tempo ${dur}min`;
    case 'sweetspot':  return w ? `Sweet Spot ${w.herhalingen}×${w.duration}min` : `Sweet Spot ${dur}min`;
    case 'threshold':  return w ? `Drempel Z4 ${w.herhalingen}×${w.duration}min` : `Drempel ${dur}min`;
    case 'vo2max':     return w ? `VO2max Z5 ${w.herhalingen}×${w.duration}min` : `VO2max ${dur}min`;
    default:           return `Training ${dur}min`;
  }
}

function formatPaceMinSec(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Labels volgen RUN_ZONE_NAMES-semantiek (Herstel/Duur/Tempo/Drempel/VO2max/
// Herhaling). Sweetspot krijgt hetzelfde label als tempo: bij lopen is Z3 het
// sweetspot-analoog, er is geen aparte SS-zone om te onderscheiden.
function runSessionTitle(sessionType, blokken) {
  const w = blokken.find(b => b.type === 'work');
  const dur = calcSessionDuration(blokken);
  const paceStr = (w && w.paceMinSec != null && w.paceMaxSec != null)
    ? ` ${formatPaceMinSec(w.paceMinSec)}-${formatPaceMinSec(w.paceMaxSec)}/km`
    : '';
  switch (sessionType) {
    case 'recovery':   return `Herstel Z1 ${dur}min`;
    case 'endurance':  return `Duur Z2 ${dur}min`;
    case 'tempo':      return w ? `Tempo${paceStr} ${w.herhalingen}×${w.duration}min` : `Tempo ${dur}min`;
    case 'sweetspot':  return w ? `Tempo${paceStr} ${w.herhalingen}×${w.duration}min` : `Tempo ${dur}min`;
    case 'threshold':  return w ? `Drempel${paceStr} ${w.herhalingen}×${w.duration}min` : `Drempel ${dur}min`;
    case 'vo2max':     return w ? `VO2max${paceStr} ${w.herhalingen}×${w.duration}min` : `VO2max ${dur}min`;
    case 'repetition': return w ? `Herhaling${paceStr} ${w.herhalingen}×${w.duration}min` : `Herhaling ${dur}min`;
    default:           return `Duur Z2 ${dur}min`;
  }
}

function buildSession(date, sessionType, targetTSS, maxDur, ftp) {
  const zones = zoneWatts(ftp);
  const rawBlokken = buildSessionBlocks(sessionType, targetTSS, maxDur, zones);

  // _tssZone bewaren: onderscheidt sweetspot (SS) van threshold (Z4) voor zone-classificatie
  const blokken = rawBlokken.map(b => {
    const out = Object.assign({}, b);
    return out;
  });

  const targetTSSCalc = Math.round(calcSessionTSS(rawBlokken));
  const duration = calcSessionDuration(rawBlokken);

  return {
    date,
    type: 'cycling',
    aiGenerated: true,
    source: 'planner',
    title: sessionTitle(sessionType, blokken),
    targetTSS: targetTSSCalc,
    duration,
    blokken,
  };
}

// Zonder thresholdPace is er geen anker en dus geen loopzone: de planner mag dan
// niet gokken, vandaar null i.p.v. een fallback-schatting.
function buildRunSession(date, sessionType, targetTSS, maxDur, thresholdPace) {
  if (!(thresholdPace > 0)) return null;

  const zones = runPaceZones(thresholdPace);
  const rawBlokken = buildRunSessionBlocks(sessionType, targetTSS, maxDur, zones);

  const blokken = rawBlokken.map(b => Object.assign({}, b));

  const targetTSSCalc = Math.round(calcRunSessionTSS(rawBlokken));
  const duration = calcSessionDuration(rawBlokken);

  return {
    date,
    type: 'running',
    aiGenerated: true,
    source: 'planner',
    title: runSessionTitle(sessionType, blokken),
    targetTSS: targetTSSCalc,
    duration,
    blokken,
  };
}

// ─── Dag-selectie helpers ─────────────────────────────────────────────────────

function selectSpreadDays(eligibleDays, count, minDaysBetween) {
  const selected = [];
  for (const day of eligibleDays) {
    if (selected.length >= count) break;
    if (!selected.some(s => daysBetween(s.date, day.date) < minDaysBetween)) {
      selected.push(day);
    }
  }
  return selected;
}

function resolveHitType(mode, phase) {
  const hit = GOAL_PROFILES[mode].hit;
  if (hit === 'phase')     return (phase === 'peak' || phase === 'race_week') ? 'vo2max' : 'threshold';
  if (hit === 'threshold') return 'threshold';
  if (hit === 'vo2max')    return 'vo2max';
  if (hit === 'hold')      return 'sweetspot';
  return null; // 'low' → geen HIT
}

function addZoneTime(acc, zone, minutes) {
  acc.total += minutes;
  if (zone === 'Z1' || zone === 'Z2') acc.low  += minutes;
  else if (zone === 'Z3')             acc.mid  += minutes;
  else                                acc.high += minutes;
}

function buildRationale(sessionType, mode, phase, isRecoveryWeek, ctl) {
  if (isRecoveryWeek) return `Herstelweek: volume 55% van CTL-baseline (CTL ${Math.round(ctl)}).`;
  const mLabel = { event: 'wedstrijdvoorbereiding', base: 'basisopbouw', ftp: 'drempelverbetering', vo2max: 'VO2max-ontwikkeling', fatloss: 'vetverbranding', maintenance: 'onderhoud' };
  const pLabel = { base: 'basisfase', build: 'opbouwfase', peak: 'piekfase', taper: 'afbouwfase', race_week: 'wedstrijdweek' };
  const sLabel = { recovery: 'herstelrit', endurance: 'duurrit Z2', tempo: 'temporit Z3', sweetspot: 'sweet spot Z3-4', threshold: 'drempelintervals Z4', vo2max: 'VO2max-intervals Z5' };
  const base = `${mLabel[mode] || mode} — ${pLabel[phase] || phase}`;
  return sessionType ? `${sLabel[sessionType] || sessionType}: ${base}` : base;
}

// ─── Hoofd-planfunctie ────────────────────────────────────────────────────────

function buildPlan(input, params) {
  const { goals = {}, metrics, currentWeight, availDays, ftp, settings = {} } = input;
  const {
    rampCapCtlPerWeek, loadWeeksBeforeRecovery,
    maxHitSessionsPerWeek, minHoursBetweenHit,
    timeBudgetModerateMinHours, timeBudgetHighMinHours,
  } = params;
  const { ctl } = metrics;

  // 1. Mode
  const mode = (goals.mode && goals.mode !== 'auto') ? goals.mode : deriveMode(goals, currentWeight, params.nowMs);

  // 2. weekStart & weeklyHours
  const sortedDays = [...availDays].sort((a, b) => a.date.localeCompare(b.date));
  if (!sortedDays.length) return { skeleton: {}, sessions: {}, prescriptions: [] };
  const weekStart = getMondayOf(sortedDays[0].date);
  const weeklyHours = sortedDays.reduce((s, d) => s + d.maxDuration / 60, 0);

  // 3. tijdsbudget & niveau
  // Tijdsbudget is een structurele atleeteigenschap, geen weekgrid-uitkomst.
  // Zonder deze fallback klapt het model om zodra één week minder slots heeft.
  const budgetHours = Number(settings.weekCapacity?.hours) > 0
    ? Number(settings.weekCapacity.hours)
    : weeklyHours;
  const level = deriveLevel({ ctl, historyDays: metrics.history?.length ?? null }, 'cycling');
  const masters = (settings.age || 0) >= 50;

  // 4. rampCap & cadence
  let rampCap = rampCapCtlPerWeek;
  if (level === 'novice' || masters) rampCap = Math.min(rampCap, 4);
  const cadence = (masters ? 2 : loadWeeksBeforeRecovery) + 1;

  // 5. Fase & mesocycle — volledig UTC, geen lokale-tijd Date-objecten
  let phase, mesocycleWeek, weeksToEvent = null;

  if (mode === 'event' && goals.eventDate &&
      dateToUTCms(goals.eventDate) > dateToUTCms(weekStart)) {
    weeksToEvent = Math.ceil(daysBetweenUTC(weekStart, goals.eventDate) / 7);
    phase = weeksToEvent <= 1 ? 'race_week' : weeksToEvent <= 2 ? 'taper'
          : weeksToEvent <= 4 ? 'peak'      : weeksToEvent <= 8 ? 'build' : 'base';
    mesocycleWeek = ((weeksToEvent - 1) % cadence) + 1;
  } else {
    phase = 'build';
    const ORIGIN = '2024-01-01';         // maandag; weekStart is ook maandag → exact veelvoud van 7
    const weekIndex = Math.floor(daysBetweenUTC(ORIGIN, weekStart) / 7);
    mesocycleWeek = ((weekIndex % cadence) + cadence) % cadence + 1;
  }
  const isRecoveryWeek = mesocycleWeek === cadence;

  // 5.5. Periodiseringsprofiel — heeft phase nodig, dus pas na stap 5
  const prof = selectPeriodizationProfile(
    { weeklyHours: budgetHours, level, discipline: 'cycling', phase }, params);
  const distributionModel = prof.distributionModel;

  // 5.6. hitType vooraf bepalen — nodig voor distributie-gewogen cap (FIX 1)
  const hitType = isRecoveryWeek ? null : resolveHitType(mode, phase);
  const hitMinZone = hitType === 'vo2max' ? 5 : 4;

  // 7 (verplaatst vóór 6). Distributie (FIX 1)
  const profile = GOAL_PROFILES[mode];
  let distribution;
  if (isRecoveryWeek) {
    distribution = { low: 1, mid: 0, high: 0 };
  } else {
    const base = DIST_BASE[distributionModel];
    const shift = profile.distShift;
    const raw = {
      low:  Math.max(0, Math.min(1, base.low  + shift.low)),
      mid:  Math.max(0, Math.min(1, base.mid  + shift.mid)),
      high: Math.max(0, Math.min(1, base.high + shift.high)),
    };
    const sum = raw.low + raw.mid + raw.high || 1;
    distribution = { low: raw.low / sum, mid: raw.mid / sum, high: raw.high / sum };

    // Event peak/race: extra verschuiving richting high
    if (mode === 'event' && (phase === 'peak' || phase === 'race_week')) {
      const extra = phase === 'peak' ? 0.05 : 0.08;
      const take = Math.min(distribution.low, extra);
      distribution.low  -= take;
      distribution.high += take;
    }
  }

  // 6. weeklyTSSAim (CTL-ramp) + distributie-gewogen maxFeasible + weeklyTSSTarget (FIX 1)
  const rampEff = Math.min(rampCap, rampCap * profile.rampMultiplier);
  let weeklyTSSAim;

  if (isRecoveryWeek) {
    weeklyTSSAim = Math.round(ctl * 7 * 0.55);
  } else if (mode === 'maintenance') {
    weeklyTSSAim = Math.round(ctl * 7);
  } else if (mode === 'event' && weeksToEvent !== null) {
    if      (phase === 'taper')     weeklyTSSAim = Math.round(ctl * 7 * 0.5);
    else if (phase === 'race_week') weeklyTSSAim = Math.round(ctl * 7 * 0.3);
    else {
      const r = phase === 'peak' ? rampEff * 0.6 : rampEff;
      weeklyTSSAim = Math.round((ctl + r) * 7);
    }
  } else {
    weeklyTSSAim = Math.round((ctl + rampEff) * 7);
    if (mode === 'fatloss') weeklyTSSAim = Math.round(weeklyTSSAim * (profile.deficitVolumeFactor || 1));
  }
  weeklyTSSAim = Math.max(50, weeklyTSSAim);

  const bandIF = {
    low:  ZONE_IF.Z2,
    mid:  ZONE_IF.SS,
    high: hitType === 'vo2max' ? ZONE_IF.Z5 : ZONE_IF.Z4,
  };
  const effIF2 = distribution.low * bandIF.low ** 2
               + distribution.mid * bandIF.mid ** 2
               + distribution.high * bandIF.high ** 2;
  const totalHours = sortedDays.reduce((s, d) => s + d.maxDuration, 0) / 60;
  const maxFeasible = Math.round(totalHours * effIF2 * 100);

  let weeklyTSSTarget = Math.max(50, Math.min(weeklyTSSAim, maxFeasible));
  const volumeLimited = weeklyTSSAim > maxFeasible;

  // 8a. HIT-dagen
  const minDaysBetweenHIT = (minHoursBetweenHit || 48) / 24;
  let hitCount = 0;

  if (!isRecoveryWeek) {
    if (mode === 'maintenance') {
      hitCount = Math.min(2, maxHitSessionsPerWeek);
    } else if (hitType !== null) {
      hitCount = Math.min(
        Math.max(1, Math.round(weeklyTSSTarget * distribution.high / 70)),
        maxHitSessionsPerWeek
      );
    }
  }

  const eligibleHIT = sortedDays.filter(d => d.maxZone >= hitMinZone);
  const hitDays = selectSpreadDays(eligibleHIT, hitCount, minDaysBetweenHIT);
  const hitDateSet = new Set(hitDays.map(d => d.date));

  // 8b. Langste niet-HIT-dag → endurance
  const nonHitDays = sortedDays.filter(d => !hitDateSet.has(d.date));
  const longestDay = nonHitDays.reduce((best, d) => (!best || d.maxDuration > best.maxDuration) ? d : best, null);
  const longestDayTSS = longestDay ? Math.round(weeklyTSSTarget * 0.35) : 0;

  // 8c & 8d. Overige TSS proportioneel verdelen
  const otherNonHit = longestDay ? nonHitDays.filter(d => d.date !== longestDay.date) : [];
  const allOther = [...hitDays, ...otherNonHit];
  const totalOtherDur = allOther.reduce((s, d) => s + d.maxDuration, 0) || 1;
  const remainingTSS = Math.max(0, weeklyTSSTarget - longestDayTSS);

  const dayAssignment = {};
  const dayTargetTSS  = {};

  if (longestDay) {
    dayAssignment[longestDay.date] = 'endurance';
    const capZ2 = Math.round((longestDay.maxDuration / 60) * ZONE_IF['Z2'] ** 2 * 100);
    dayTargetTSS[longestDay.date] = Math.min(longestDayTSS, capZ2);
  }

  for (const d of hitDays) {
    dayAssignment[d.date] = hitType || 'endurance';
    const prop = d.maxDuration / totalOtherDur;
    const feasible = Math.round((d.maxDuration / 60) * ZONE_IF['Z' + Math.min(d.maxZone, 4)] ** 2 * 100);
    const tss = Math.min(Math.round(remainingTSS * prop), feasible, Math.round(weeklyTSSTarget * 0.20));
    dayTargetTSS[d.date] = Math.max(20, tss);
  }

  // FIX 2: minuten-gestuurd mid-budget voor otherNonHit
  const sortedOtherNonHit = [...otherNonHit].sort((a, b) => {
    if (b.maxZone !== a.maxZone) return b.maxZone - a.maxZone;
    return b.maxDuration - a.maxDuration;
  });
  const totalOtherMin = otherNonHit.reduce((s, d) => s + d.maxDuration, 0);
  let midBudgetMin = Math.round(totalOtherMin * distribution.mid);
  let midUsedMin = 0;

  for (const d of sortedOtherNonHit) {
    let sType;
    if (d.maxZone <= 2) {
      sType = 'endurance';
    } else if (midUsedMin < midBudgetMin) {
      sType = d.maxZone >= 4 ? 'sweetspot' : 'tempo';
      midUsedMin += Math.round(d.maxDuration * 0.7);
    } else {
      sType = 'endurance';
    }
    dayAssignment[d.date] = sType;
    const prop = d.maxDuration / totalOtherDur;
    const tssIfKey = sType === 'sweetspot' ? 'SS' : sType === 'tempo' ? 'Z3' : 'Z2';
    const ifv = ZONE_IF[tssIfKey];
    const feasible = Math.round((d.maxDuration / 60) * ifv * ifv * 100);
    const tss = Math.min(Math.round(remainingTSS * prop), feasible, Math.round(weeklyTSSTarget * 0.20));
    dayTargetTSS[d.date] = Math.max(15, tss);
  }

  // 9 & 10. Sessies en prescriptions bouwen
  const sessions = {};
  const prescriptions = [];

  for (const d of sortedDays) {
    const sType = dayAssignment[d.date] || 'endurance';
    const tTSS  = dayTargetTSS[d.date]  || 30;
    const session = buildSession(d.date, sType, tTSS, d.maxDuration, ftp);
    sessions[d.date] = [session];

    const targetIf = session.duration > 0
      ? +Math.sqrt(session.targetTSS / (session.duration / 60 * 100)).toFixed(3)
      : 0;

    prescriptions.push({
      prescribed_date: d.date,
      session_type:    sType,
      target_duration_min: session.duration,
      target_tss:      session.targetTSS,
      target_if:       targetIf,
      blocks:          session.blokken,
      mesocycle:       { phase, mesocycleWeek, isRecoveryWeek, weeksToEvent },
      distribution_model: distributionModel,
      rationale:       buildRationale(sType, mode, phase, isRecoveryWeek, ctl),
    });
  }

  // FIX 3: reconcilieer weeklyTSSTarget en tidMinutes met de werkelijk gebouwde sessies.
  // Sweet spot werkblokken (zone='Z4', sessie='sweetspot') tellen als mid, niet als high.
  let sumTSS = 0;
  const tidMinutes = { low: 0, mid: 0, high: 0 };

  for (const p of prescriptions) {
    sumTSS += p.target_tss;
    const isSweetspot = p.session_type === 'sweetspot';
    for (const b of p.blocks) {
      const n = b.herhalingen || 1;
      const isSweetspotWork = isSweetspot && b.type === 'work' && b.zone === 'Z4';
      const cat = isSweetspotWork ? 'mid'
        : (b.zone === 'Z1' || b.zone === 'Z2') ? 'low'
        : b.zone === 'Z3' ? 'mid' : 'high';
      tidMinutes[cat] += b.duration * n;
      if (b.herstelBlok) {
        const hCat = (b.herstelBlok.zone === 'Z1' || b.herstelBlok.zone === 'Z2') ? 'low'
          : b.herstelBlok.zone === 'Z3' ? 'mid' : 'high';
        tidMinutes[hCat] += b.herstelBlok.duration * n;
      }
    }
  }
  tidMinutes.total = tidMinutes.low + tidMinutes.mid + tidMinutes.high;
  weeklyTSSTarget = Math.round(sumTSS);

  const _t = tidMinutes.total || 1;
  const realizedDistribution = {
    low:  Math.round(tidMinutes.low  / _t * 100) / 100,
    mid:  Math.round(tidMinutes.mid  / _t * 100) / 100,
    high: Math.round(tidMinutes.high / _t * 100) / 100,
  };

  const skeleton = {
    mode, phase, mesocycleWeek, isRecoveryWeek, weeksToEvent,
    weeklyTSSAim, weeklyTSSTarget, volumeLimited,
    distributionModel, distribution, realizedDistribution, tidMinutes,
    eventDate:  goals.eventDate  || null,
    eventName:  goals.eventName  || null,
    rationale:  buildRationale(null, mode, phase, isRecoveryWeek, ctl),
    athleteSituation: {
      timeBudget: prof.timeBudget, level, budgetHours,
      budgetSource: settings.weekCapacity?.hours > 0 ? 'weekCapacity' : 'availDays',
      rationale: prof.rationale,
    },
  };

  return { skeleton, sessions, prescriptions };
}

// ─── C3 Backward planner: doel-sets, prioriteit, macrocyclus ────────────────
// Puur; geen I/O. Bouwt voort op deriveMode/GOAL_PROFILES zonder ze te wijzigen.

function goalsToGoalSet(legacyGoals, currentWeight, nowMs) {
  // Zelfde mode-resolutie als buildPlan stap 1: expliciete goals.mode wint,
  // anders deriveMode. deriveMode zelf blijft ongemoeid.
  const resolved = (legacyGoals.mode && legacyGoals.mode !== 'auto')
    ? legacyGoals.mode
    : deriveMode(legacyGoals, currentWeight, nowMs);

  let type = resolved;
  let target_date = null;
  let target_value = null;
  let baseline_value = null;

  if (resolved === 'event') {
    target_date = legacyGoals.eventDate || null;
  } else if (resolved === 'fatloss') {
    type = 'composition';
    const m = legacyGoals.weightTarget ? String(legacyGoals.weightTarget).match(/[\d.]+/) : null;
    target_value = m ? parseFloat(m[0]) : null;
    baseline_value = currentWeight;
  }

  return [{ type, weight: 2, target_date, target_value, baseline_value, status: 'active' }];
}

// Vaste modaliteitsvolgorde: laatste, deterministische tie-break bij gelijk
// gewicht en gelijke fase-voorkeur (sectie 5).
const MODALITY_ORDER = ['cycling', 'strength', 'running'];

// Cycling is het anker (1.0): Wilson et al. 2012 vindt bij fietsen geen
// significante krachtdecrementen door interferentie. Running is null hier
// omdat zijn gewicht atleet-variabel is en uit params komt, niet uit een
// vaste tabel — zie modalityInterferenceWeight. Strength is de bron niet de
// ontvanger van interferentie in deze richting en heeft daarom geen eigen
// gewicht nodig.
const MODALITY_INTERFERENCE = { cycling: 1.0, running: null, strength: null };

// Puur. Geeft het interferentiegewicht van modality t.o.v. het fiets-anker
// (1.0). Voor running komt de waarde uit params, geclampt op de gepubliceerde
// band 1.5-2.0 (Wilson 2012, semi-kwantitatief). Nooit een default hardcoden
// buiten de clampgrenzen: ontbreekt de waarde, dan is 1.5 (de bandbodem) de
// enige toegestane terugval.
function modalityInterferenceWeight(modality, params) {
  if (modality === 'cycling') return MODALITY_INTERFERENCE.cycling;
  if (modality === 'running') {
    const w = typeof params?.runInterferenceWeight === 'number' ? params.runInterferenceWeight : 1.5;
    return Math.min(2.0, Math.max(1.5, w));
  }
  return 1.0;
}

// Puur, muteert params niet. De 6-uursbodem (minHoursRunToLegs) is de harde
// fysiologische ondergrens uit Wilson 2012 en is universeel: de leerlaag (C9)
// mag hem nooit onderschrijden. preferredHoursRunToLegs en eimdRecoveryHours
// zijn daarom ook naar boven toe verankerd op elkaar (eimd >= preferred >=
// min), zodat een geleerde waarde de volgorde niet kan omdraaien. De weging
// runInterferenceWeight is wél personaliseerbaar, maar binnen zijn eigen band.
function clampInterferenceParams(params) {
  const runInterferenceWeight = Math.min(2.0, Math.max(1.5, params.runInterferenceWeight));
  const minHoursRunToLegs = Math.max(6, params.minHoursRunToLegs);
  const preferredHoursRunToLegs = Math.max(minHoursRunToLegs, params.preferredHoursRunToLegs);
  const eimdRecoveryHours = Math.max(preferredHoursRunToLegs, params.eimdRecoveryHours);
  return { ...params, runInterferenceWeight, minHoursRunToLegs, preferredHoursRunToLegs, eimdRecoveryHours };
}

// Puur. prev/next zijn descriptors { modality, isLegs, eimdFlag }. Fiets-legs
// valt hier bewust buiten: Wilson 2012 vindt bij fietsen geen significante
// krachtdecrementen, en de bestaande fiets-legs-heuristiek leeft al in de
// AI-prompt van server.js — die blijft ongemoeid.
function requiredSeparationHours(prev, next, params) {
  const p = clampInterferenceParams(params);
  const runLegsPair =
    (prev.modality === 'running' && next.modality === 'strength' && next.isLegs) ||
    (prev.modality === 'strength' && prev.isLegs && next.modality === 'running');
  if (!runLegsPair) {
    return { hours: 0, level: 'ok', reason: 'geen loop-legs-paar' };
  }
  if (prev.modality === 'running' && prev.eimdFlag && next.modality === 'strength' && next.isLegs) {
    return { hours: p.eimdRecoveryHours, level: 'eimd' };
  }
  return { hours: p.preferredHoursRunToLegs, level: 'preferred' };
}

// Puur.
function separationLevel(hoursBetween, required, params) {
  const p = clampInterferenceParams(params);
  if (hoursBetween < p.minHoursRunToLegs) return 'conflict';
  if (hoursBetween < required) return 'suboptimaal';
  return 'ok';
}

function goalModality(type) {
  if (type === 'strength') return 'strength';
  if (type === 'running')  return 'running';
  return 'cycling'; // event, composition, ftp, vo2max, base, maintenance zijn fiets-doelen
}

function profileForType(type) {
  return GOAL_PROFILES[type === 'composition' ? 'fatloss' : type] || null;
}

// Fase van een event-doel t.o.v. weekStartISO, dezelfde drempels als buildPlan
// stap 5 (regels 307-308), hier alleen gebruikt voor de kracht/uithouding-
// sequencing in resolveGoalPriority — beïnvloedt buildPlan niet.
function phaseForGoal(goal, weekStartISO) {
  if (goal && goal.type === 'event' && goal.target_date &&
      dateToUTCms(goal.target_date) > dateToUTCms(weekStartISO)) {
    const weeksToEvent = Math.ceil(daysBetweenUTC(weekStartISO, goal.target_date) / 7);
    if (weeksToEvent <= 1) return 'race_week';
    if (weeksToEvent <= 2) return 'taper';
    if (weeksToEvent <= 4) return 'peak';
    if (weeksToEvent <= 8) return 'build';
    return 'base';
  }
  return 'build'; // geen (toekomstige) event-datum: doorlopend blokmodel
}

// Sessietabel sectie 5: dominante modaliteit → concreet sessieaantal per
// modaliteit (nooit een bereik). Fiets-dominant kiest 4 uit 3-5 (midden);
// kracht-dominant kiest 3 uit 3-4 (ondergrens, PPL-herstelbaarheid). De
// hardloop-dominante tabel staat niet expliciet in sectie 5 ("etc.") en is
// naar analogie met de fiets-tabel geëxtrapoleerd.
const SESSION_TABLE = {
  cycling:  (phase) => ({ cycling: 4, strength: (phase === 'base' || phase === 'build') ? 2 : 1, running: 1 }),
  strength: ()      => ({ strength: 3, cycling: 2, running: 1 }),
  running:  (phase) => ({ running: 4, strength: (phase === 'base' || phase === 'build') ? 2 : 1, cycling: 1 }),
};

function resolveGoalPriority(goalSet, weekStartISO, nowMs) {
  const active = (goalSet || []).filter(g => g.status === 'active');
  if (!active.length) {
    return { dominant: null, sessionBudget: { cycling: 0, strength: 0, running: 0 } };
  }

  // Regel 1: doel met target_date binnen 4 weken krijgt tijdelijke voorrang,
  // los van weight.
  const windowed = active.filter(g => g.target_date &&
    daysBetweenUTC(weekStartISO, g.target_date) >= 0 &&
    daysBetweenUTC(weekStartISO, g.target_date) <= 28);
  const pool = windowed.length ? windowed : active;

  // Regel 2: hoogste weight wint. Bij gelijk weight: fase-sequencing
  // (Rønnestad/Mujika) — kracht voorrang in de base-fase, uithouding
  // (fiets/hardlopen) voorrang in build/peak/taper/race_week — en als dat
  // ook gelijk blijft, de vaste modaliteitsvolgorde (MODALITY_ORDER).
  const maxWeight = Math.max(...pool.map(g => g.weight));
  const tied = pool.filter(g => g.weight === maxWeight);

  let dominant = tied[0];
  if (tied.length > 1) {
    const eventGoal = tied.find(g => g.type === 'event') || active.find(g => g.type === 'event');
    const phase = phaseForGoal(eventGoal, weekStartISO);
    const favoured = phase === 'base' ? 'strength' : null;
    const score = (g) => {
      const modality = goalModality(g.type);
      if (favoured ? modality === favoured : (modality === 'cycling' || modality === 'running')) return 0;
      return 1 + MODALITY_ORDER.indexOf(modality);
    };
    dominant = [...tied].sort((a, b) => score(a) - score(b))[0];
  }

  // Regel 3: de lagere modaliteit verliest sessies (naar onderhoud), niet uren.
  const dominantModality = goalModality(dominant.type);
  const eventGoal = active.find(g => g.type === 'event');
  const phase = phaseForGoal(dominant.type === 'event' ? dominant : eventGoal, weekStartISO);
  const sessionBudget = SESSION_TABLE[dominantModality](phase);

  return { dominant, sessionBudget };
}

function addWeeksISO(dateISO, n) {
  return new Date(dateToUTCms(dateISO) + n * 7 * 86400000).toISOString().split('T')[0];
}

// Faseduren voor een event-doel, gebucket op weeksToEvent (sectie 5: 8/12/16+
// weken-tabellen). Afrondingsregel: start op de ondergrens van elke fase,
// verdeel de resterende weken achtereenvolgens over base → build → peak tot
// de bovengrens; taper blijft vast op 1 week (6-10 dagen ≈ 1 week bij het
// 8-wekenbucket; ondergrens van 1-2 weken bij de andere buckets). Zo sluit de
// som van fase-weken altijd exact op weeksToEvent.
function buildPhasePlan(weeksToEvent) {
  const bucket = weeksToEvent <= 9  ? { base: [2, 3], build: [3, 3], peak: [1, 2] }
    : weeksToEvent <= 13            ? { base: [4, 5], build: [4, 5], peak: [2, 2] }
    :                                  { base: [6, 8], build: [4, 6], peak: [2, 3] };
  const taper = 1;

  let base = bucket.base[0], build = bucket.build[0], peak = bucket.peak[0];
  let remainder = weeksToEvent - (base + build + peak + taper);
  for (const key of ['base', 'build', 'peak']) {
    const max = bucket[key][1];
    while (remainder > 0 && (key === 'base' ? base : key === 'build' ? build : peak) < max) {
      if (key === 'base') base++; else if (key === 'build') build++; else peak++;
      remainder--;
    }
  }
  if (remainder > 0) base += remainder; // veiligheidsklep buiten de gedocumenteerde bereiken

  return [
    { phase: 'base',  weeks: base },
    { phase: 'build', weeks: build },
    { phase: 'peak',  weeks: peak },
    { phase: 'taper', weeks: taper },
  ];
}

const RUNNING_SESSION_MIN = 45; // aanname: onderhoudsduur per hardloopsessie; sectie 5 geeft geen minuten

function buildMacrocycle(goalSet, startDateISO, baseline, params, nowMs) {
  const active = (goalSet || []).filter(g => g.status === 'active');
  const eventGoal = active.find(g => g.type === 'event' && g.target_date &&
    dateToUTCms(g.target_date) > dateToUTCms(getMondayOf(startDateISO)));

  const weekStart0 = getMondayOf(startDateISO);
  const masters = !!(params && params.masters) || !!(baseline.settings && baseline.settings.age >= 50);
  const cadence = masters ? 3 : 4; // 2+1 masters, anders 3+1

  let phasePlan;
  if (eventGoal) {
    const weeksToEvent = Math.max(1, Math.ceil(daysBetweenUTC(weekStart0, eventGoal.target_date) / 7));
    phasePlan = buildPhasePlan(weeksToEvent);
  } else {
    // Doorlopend blokmodel zonder target_date: 12 weken (midden van het
    // gespecificeerde 8-12 wekenbereik), geen taper, altijd fase 'build'.
    phasePlan = [{ phase: 'build', weeks: 12 }];
  }

  const weekPhases = [];
  for (const seg of phasePlan) {
    for (let i = 0; i < seg.weeks; i++) weekPhases.push(seg.phase);
  }

  let ctlProjected = baseline.ctl;
  let lastLoadTSS = ctlProjected * 7;
  const rows = [];

  for (let i = 0; i < weekPhases.length; i++) {
    const weekStart = addWeeksISO(weekStart0, i);
    const phase = weekPhases[i];
    const weekIndex = (i % cadence) + 1;
    const isDeload = weekIndex === cadence;

    const priority = resolveGoalPriority(active, weekStart, nowMs);
    const dominantType = priority.dominant ? priority.dominant.type : 'base';
    const dominantModality = priority.dominant ? goalModality(priority.dominant.type) : 'cycling';

    const level = deriveLevel({ ctl: ctlProjected }, 'cycling');
    const weekProfile = selectPeriodizationProfile(
      { weeklyHours: baseline.weeklyHours, level, discipline: 'cycling', phase }, params);

    let enduranceTarget;
    if (phase === 'taper') {
      // STEP-TAPER, NIET PROGRESSIEF. Bewuste afwijking van de
      // handoff-formulering "progressief", conform PeakForm_Trainingstheorie.md
      // regel 95 (Bosquet): het volume gaat in de eerste taperweek in één stap
      // naar ~50% (binnen de 41-60% reductieband) van de laatste build/peak-
      // week en blijft op dat niveau tot de eventdag. Intensiteit
      // (distribution_model, zoneverdeling) verandert niet in de taper: de
      // taper erft het profiel van de piekfase via selectPeriodizationProfile.
      enduranceTarget = Math.round(lastLoadTSS * 0.5);
    } else if (isDeload) {
      enduranceTarget = Math.round(ctlProjected * 7 * 0.55);
    } else {
      let rampCap = params.rampCapCtlPerWeek;
      if (level === 'novice' || masters) rampCap = Math.min(rampCap, 4);
      const profile = profileForType(dominantType);
      const rampMultiplier = profile ? profile.rampMultiplier : 1;
      const rampEff = Math.min(rampCap, rampCap * rampMultiplier);
      const rampThisWeek = phase === 'peak' ? rampEff * 0.6 : rampEff;
      ctlProjected += rampThisWeek;
      enduranceTarget = Math.round(ctlProjected * 7);
      lastLoadTSS = enduranceTarget;
    }

    let strengthSessions = priority.sessionBudget.strength;
    let runningMinutesCap = priority.sessionBudget.running * RUNNING_SESSION_MIN;
    if (phase === 'taper') {
      // Frequentie hooguit 20% omlaag in de taper; intensiteit blijft ongemoeid.
      strengthSessions = Math.max(1, Math.round(strengthSessions * 0.8));
      runningMinutesCap = Math.round(runningMinutesCap * 0.8);
    }

    rows.push({
      week_start: weekStart,
      phase,
      week_index: weekIndex,
      is_deload: isDeload,
      endurance_tss_target: enduranceTarget,
      strength_sessions: strengthSessions,
      running_minutes_cap: runningMinutesCap,
      distribution_model: weekProfile.distributionModel,
      dominant_modality: dominantModality,
      dominant_type: dominantType,
    });
  }

  return rows;
}

// ─── C5a Multimodale weeksolver ───────────────────────────────────────────────

// Aanname, geen bron. Slots en bestaande sessies zonder time_of_day vallen
// hierop terug, zodat de interferentierekening in uren altijd een anker
// heeft. Deze aanname komt in C5b uit echte slot-uren zodra alle slots een
// uur dragen.
const DEFAULT_SLOT_HOUR = 18;

// Canon docs/PeakForm_Trainingstheorie.md, sectie "Concurrent training:
// fietsen en krachttraining combineren": sweetspot kan pas vanaf 48 uur na
// de beensessie.
const LEGS_QUALITY_BLOCK_HOURS = 48;

// Zelfde sectie: de beendag en de dag erna zijn alleen geschikt voor Z1/Z2.
const LEGS_BLOCKED_MAX_ZONE = 2;

// Temporele voorkeur binnen de week, geen selectievolgorde.
const STRENGTH_SPLIT_ORDER = ['push', 'pull', 'legs'];

// Aanname, analoog aan de bestaande RUNNING_SESSION_MIN; sectie 5 geeft geen
// minuten.
const STRENGTH_SESSION_MIN = 60;

// Maximaal tien procent weekstijging loopvolume.
const RUN_WEEK_GROWTH_CAP = 1.10;

function todayISO(nowMs) {
  return new Date(nowMs).toISOString().split('T')[0];
}

function hoursBetweenMs(aMs, bMs) {
  return Math.abs(aMs - bMs) / 3600000;
}

// Date.UTC op de datumcomponenten plus het uur uit time_of_day ('HH:MM',
// zoals HOUR_OPTIONS in public/js/app.js het schrijft). Bij null of
// onparsebaar: DEFAULT_SLOT_HOUR. Geen lokale-tijd-Date-objecten.
function slotStartMs(slotDate, timeOfDay) {
  const [y, m, d] = slotDate.split('-').map(Number);
  let hour = DEFAULT_SLOT_HOUR;
  if (typeof timeOfDay === 'string') {
    const match = timeOfDay.match(/^(\d{1,2}):\d{2}$/);
    if (match) {
      const h = Number(match[1]);
      if (h >= 0 && h <= 23) hour = h;
    }
  }
  return Date.UTC(y, m - 1, d, hour);
}

function sessionModality(session) {
  const t = session.type;
  if (t === 'cycling') return 'cycling';
  if (t === 'running' || t === 'Run' || t === 'TrailRun') return 'running';
  return 'strength';
}

// Bij lopen ís RUN_ZONE_IF de snelheidsfractie van drempelsnelheid, en dat is
// precies waarom deze afleiding mag en de fiets-ZONE_IF niet zo gebruikt mag
// worden.
function plannedRunDistanceM(blokken, thresholdPace) {
  if (!(thresholdPace > 0)) return null;
  const speedMps = zone => (1000 / thresholdPace) * RUN_ZONE_IF[zone];
  return blokken.reduce((sum, b) => {
    const n = b.herhalingen || 1;
    let d = b.duration * 60 * speedMps(b.zone) * n;
    if (b.herstelBlok) d += b.herstelBlok.duration * 60 * speedMps(b.herstelBlok.zone) * n;
    return sum + d;
  }, 0);
}

// requiredSeparationHours sluit fiets-legs bewust uit, want Wilson 2012 vindt
// bij fietsen geen krachtdecrementen; dit is de aparte, wél fiets-gerichte
// 48-uursregel uit canon "Concurrent training: fietsen en krachttraining
// combineren". Legs-events ná het slot leggen geen plafond op.
function legsZoneCeiling(slotMs, legsEvents) {
  const blocked = (legsEvents || []).some(ev => {
    const delta = slotMs - ev.startMs;
    return delta >= 0 && delta < LEGS_QUALITY_BLOCK_HOURS * 3600000;
  });
  return blocked ? LEGS_BLOCKED_MAX_ZONE : 5;
}

// Rønnestad en Mujika bouwen hun protocol op zwaar beenwerk, dus bij één of
// twee krachtsessies per week is legs de sessie die je niet mag laten
// vallen; STRENGTH_SPLIT_ORDER is de temporele voorkeur, geen prioritering
// van de pool. Legs gaat daarom eerst, zolang legsBudget het toelaat.
function selectStrengthSplits(n, legsBudget) {
  const budget = Math.max(0, legsBudget);
  const splits = [];
  let legsUsed = 0;
  while (legsUsed < budget && splits.length < n) {
    splits.push('legs');
    legsUsed++;
  }
  let ri = 0;
  while (splits.length < n) {
    const candidate = STRENGTH_SPLIT_ORDER[ri % STRENGTH_SPLIT_ORDER.length];
    ri++;
    if (candidate === 'legs') {
      if (legsUsed >= budget) continue;
      legsUsed++;
    }
    splits.push(candidate);
  }
  return splits;
}

const STRENGTH_SPLIT_TITLES = { push: 'Kracht push', pull: 'Kracht pull', legs: 'Kracht benen' };

function buildStrengthSession(date, split, durationMin, timeOfDay) {
  return {
    date,
    type: 'strength',
    split,
    timeOfDay,
    aiGenerated: true,
    source: 'planner',
    title: STRENGTH_SPLIT_TITLES[split] || `Kracht ${split}`,
    duration: durationMin,
    // Coggan-TSS en het Foster sRPE-krachtkanaal zijn incommensurabel en
    // worden nooit gesommeerd; kracht telt in de solver mee als bezetting en
    // als interferentiebron, nooit als aftrek op endurance_tss_target.
    targetTSS: null,
  };
}

function cyclingRationale(sessionType, mesocycle) {
  const sLabel = { recovery: 'herstelrit', endurance: 'duurrit Z2', tempo: 'temporit Z3', sweetspot: 'sweet spot Z3-4', threshold: 'drempelintervals Z4', vo2max: 'VO2max-intervals Z5' };
  return `${sLabel[sessionType] || sessionType} — ${mesocycle.phase}`;
}

// Groot genoeg zodat de sessieduur nooit TSS-gebonden is: alleen maxDur (het
// toegewezen minutenbudget) begrenst de gebouwde loopsessie.
const RUN_TSS_SENTINEL = 9999;

// Puur. mesocycle is één rij uit buildMacrocycle. slots is
// [{ slot_date, minutes, modalities, time_of_day }]. state is { ftp,
// thresholdPace, runBaseline, runAcwr, lastWeekRunMinutes }. existingSessions
// is { 'YYYY-MM-DD': [session] } in week_plan-vorm. Retourneert
// { sessions, prescriptions, diagnostics }.
function solveWeek(mesocycle, slots, state, existingSessions, params, nowMs) {
  const weekStart = mesocycle.week_start;
  const weekEnd = new Date(dateToUTCms(weekStart) + 6 * 86400000).toISOString().split('T')[0];
  const today = todayISO(nowMs);
  const inWindow = date => date >= weekStart && date <= weekEnd;

  // Stap 1: venster.
  const windowSlots = (slots || [])
    .filter(s => inWindow(s.slot_date) && s.slot_date >= today)
    .slice()
    .sort((a, b) => a.slot_date === b.slot_date
      ? (a.time_of_day || '').localeCompare(b.time_of_day || '')
      : a.slot_date.localeCompare(b.slot_date));

  const diagnostics = { zoneCeilings: {}, placed: [], skipped: [], constraints: [], unplacedTSS: 0, budget: {} };
  const sessions = {};
  const prescriptions = [];
  const addSession = (date, session, modality) => {
    if (!sessions[date]) sessions[date] = [];
    sessions[date].push(session);
    diagnostics.placed.push({ date, modality });
  };

  // Stap 2: bezetting. Bestaande sessies blijven ongewijzigd, tellen als
  // bezetting van hun datum plus modaliteit en als interferentiebron met hun
  // eigen tijd (timeOfDay als aanwezig, anders DEFAULT_SLOT_HOUR).
  const occupiedByDate = {};
  const legsEvents = []; // alle bestaande legs-sessies, ongeacht venster
  let existingStrengthInWindow = 0;
  let existingLegsInWindow = 0;
  let existingRunMinutesInWindow = 0;
  let existingEnduranceTSSInWindow = 0; // fietsen + lopen delen dezelfde PMC-as

  for (const [date, sessOnDate] of Object.entries(existingSessions || {})) {
    if (!occupiedByDate[date]) occupiedByDate[date] = new Set();
    for (const s of sessOnDate) {
      const modality = sessionModality(s);
      occupiedByDate[date].add(modality);

      if (modality === 'strength' && s.split === 'legs') {
        legsEvents.push({ startMs: slotStartMs(date, s.timeOfDay) });
        if (inWindow(date)) existingLegsInWindow++;
      }
      if (modality === 'strength' && inWindow(date)) existingStrengthInWindow++;
      if (modality === 'running' && inWindow(date)) {
        existingRunMinutesInWindow += s.duration || 0;
        existingEnduranceTSSInWindow += s.targetTSS || 0;
      }
      if (modality === 'cycling' && inWindow(date)) {
        existingEnduranceTSSInWindow += s.targetTSS || 0;
      }
    }
  }

  // Stap 3: kracht.
  const strengthTarget = Math.max(0, mesocycle.strength_sessions - existingStrengthInWindow);
  const legsBudget = Math.max(0, (mesocycle.dominant_modality === 'strength' ? 2 : 1) - existingLegsInWindow);

  const strengthCandidates = windowSlots.filter(s =>
    (s.modalities || []).includes('strength') && !(occupiedByDate[s.slot_date] || new Set()).has('strength'));
  const usedStrengthDates = new Set();

  const placedStrengthMs = [];
  for (const [date, sessOnDate] of Object.entries(existingSessions || {})) {
    if (!inWindow(date)) continue;
    for (const s of sessOnDate) {
      if (sessionModality(s) === 'strength') placedStrengthMs.push(slotStartMs(date, s.timeOfDay));
    }
  }

  const cyclingSlotsForHitDamage = windowSlots.filter(s => (s.modalities || []).includes('cycling'));
  const splits = selectStrengthSplits(strengthTarget, legsBudget);

  for (const split of splits) {
    const available = strengthCandidates.filter(s => !usedStrengthDates.has(s.slot_date));
    if (!available.length) {
      diagnostics.constraints.push({ kind: 'strength_no_slot', date: null, detail: `Geen kandidaat-slot meer voor split ${split}` });
      continue;
    }

    let chosen = null;
    if (split === 'legs') {
      // Legs stuurt de zoneplafonds, dus een legs-slot dat twee HIT-eligible
      // fietsslots doodt is objectief slechter dan een dat er nul doodt.
      let bestDamage = Infinity;
      for (const cand of available) {
        const candMs = slotStartMs(cand.slot_date, cand.time_of_day);
        const damage = cyclingSlotsForHitDamage.reduce((sum, c) => {
          const delta = slotStartMs(c.slot_date, c.time_of_day) - candMs;
          return (delta >= 0 && delta < LEGS_QUALITY_BLOCK_HOURS * 3600000) ? sum + (c.minutes || 0) : sum;
        }, 0);
        if (!chosen || damage < bestDamage ||
            (damage === bestDamage && candMs < slotStartMs(chosen.slot_date, chosen.time_of_day))) {
          bestDamage = damage;
          chosen = cand;
        }
      }
    } else {
      let bestDist = -Infinity;
      for (const cand of available) {
        const candMs = slotStartMs(cand.slot_date, cand.time_of_day);
        const dist = placedStrengthMs.length
          ? Math.min(...placedStrengthMs.map(ms => Math.abs(candMs - ms)))
          : Infinity;
        if (!chosen || dist > bestDist ||
            (dist === bestDist && candMs < slotStartMs(chosen.slot_date, chosen.time_of_day))) {
          bestDist = dist;
          chosen = cand;
        }
      }
    }

    if (!chosen) continue;
    usedStrengthDates.add(chosen.slot_date);
    placedStrengthMs.push(slotStartMs(chosen.slot_date, chosen.time_of_day));
    const session = buildStrengthSession(chosen.slot_date, split, STRENGTH_SESSION_MIN, chosen.time_of_day);
    addSession(chosen.slot_date, session, 'strength');
    if (split === 'legs') legsEvents.push({ startMs: slotStartMs(chosen.slot_date, chosen.time_of_day) });

    prescriptions.push({
      prescribed_date: chosen.slot_date,
      session_type: split,
      target_duration_min: STRENGTH_SESSION_MIN,
      target_tss: null,
      target_if: null,
      blocks: [],
      mesocycle: { phase: mesocycle.phase, mesocycleWeek: mesocycle.week_index, isRecoveryWeek: mesocycle.is_deload, weeksToEvent: null },
      distribution_model: mesocycle.distribution_model,
      rationale: `Kracht ${split}`,
      modality: 'strength',
    });
  }

  // Stap 4: zoneplafonds. Vervangt maxZoneForDate.
  const remainingCyclingSlots = windowSlots
    .filter(s => (s.modalities || []).includes('cycling')
      && !usedStrengthDates.has(s.slot_date)
      && !(occupiedByDate[s.slot_date] || new Set()).has('cycling'))
    .map(s => {
      const slotMs = slotStartMs(s.slot_date, s.time_of_day);
      const maxZone = legsZoneCeiling(slotMs, legsEvents);
      diagnostics.zoneCeilings[s.slot_date] = maxZone;
      return Object.assign({}, s, { maxZone });
    });

  // Stap 5: lopen.
  const growthCap = state.lastWeekRunMinutes > 0 ? state.lastWeekRunMinutes * RUN_WEEK_GROWTH_CAP : Infinity;
  let runBudget = Math.max(0, Math.min(mesocycle.running_minutes_cap, growthCap) - existingRunMinutesInWindow);

  if (state.runAcwr && state.runAcwr.status === 'high') {
    diagnostics.constraints.push({ kind: 'acwr_blocked', date: null, detail: `runAcwr=${state.runAcwr.acwr} > crit ${RUN_ACWR_BAND.crit}` });
    runBudget = 0;
  } else if (state.runAcwr && state.runAcwr.status === 'warn') {
    // De 10%-cap (RUN_WEEK_GROWTH_CAP) dekt de groei al af; een tweede rem op
    // dezelfde as zou dubbeltellen, dus warn blokkeert niet.
    diagnostics.constraints.push({ kind: 'acwr_warn', date: null, detail: `runAcwr=${state.runAcwr.acwr}` });
  }
  diagnostics.budget.running = { budgetMinutes: runBudget };

  const runCandidatesRaw = windowSlots.filter(s =>
    (s.modalities || []).includes('running')
    && !(occupiedByDate[s.slot_date] || new Set()).has('running')
    && !usedStrengthDates.has(s.slot_date));

  const runnableCandidates = [];
  for (const cand of runCandidatesRaw) {
    const candMs = slotStartMs(cand.slot_date, cand.time_of_day);
    let conflict = false;
    let suboptimal = false;
    for (const legs of legsEvents) {
      // eimdFlag van een gepláánde loop is altijd false: een geplande sessie
      // heeft geen hoogteprofiel, en gokken is hier niet toegestaan.
      const runDesc = { modality: 'running', isLegs: false, eimdFlag: false };
      const legsDesc = { modality: 'strength', isLegs: true, eimdFlag: false };
      const prev = candMs <= legs.startMs ? runDesc : legsDesc;
      const next = candMs <= legs.startMs ? legsDesc : runDesc;
      const required = requiredSeparationHours(prev, next, params).hours;
      const level = separationLevel(hoursBetweenMs(candMs, legs.startMs), required, params);
      if (level === 'conflict') { conflict = true; break; }
      if (level === 'suboptimaal') suboptimal = true;
    }
    if (conflict) {
      diagnostics.constraints.push({ kind: 'run_legs_conflict', date: cand.slot_date, detail: 'separationLevel conflict' });
      continue;
    }
    if (suboptimal) {
      diagnostics.constraints.push({ kind: 'run_legs_suboptimaal', date: cand.slot_date, detail: 'separationLevel suboptimaal' });
    }
    runnableCandidates.push(cand);
  }

  if (!(state.thresholdPace > 0)) {
    diagnostics.constraints.push({ kind: 'no_threshold_pace', date: null, detail: 'Geen thresholdPace: geen loopsessies geplaatst' });
  } else if (runBudget > 0 && runnableCandidates.length) {
    // Verdeling: de langste kandidaat krijgt de lange duurloop, de rest
    // krijgt easy runs.
    const sortedCands = [...runnableCandidates].sort((a, b) =>
      b.minutes - a.minutes || a.slot_date.localeCompare(b.slot_date));
    const longCand = sortedCands[0];
    const restCands = sortedCands.slice(1).sort((a, b) => a.slot_date.localeCompare(b.slot_date));

    let remaining = runBudget;
    const placements = [];
    const longDur = Math.min(longCand.minutes, remaining);
    if (longDur > 0) { placements.push({ cand: longCand, sessionType: 'endurance', duration: longDur, isLong: true }); remaining -= longDur; }
    for (const cand of restCands) {
      if (remaining <= 0) break;
      const dur = Math.min(cand.minutes, remaining);
      if (dur > 0) { placements.push({ cand, sessionType: 'recovery', duration: dur, isLong: false }); remaining -= dur; }
    }

    for (const p of placements) {
      let duration = p.duration;
      let session = buildRunSession(p.cand.slot_date, p.sessionType, RUN_TSS_SENTINEL, duration, state.thresholdPace);
      if (!session) continue;

      if (p.isLong) {
        // Spike-guard op de lange duurloop, en alleen daar.
        const distanceM = plannedRunDistanceM(session.blokken, state.thresholdPace);
        const spike = classifyRunSpike(distanceM, state.runBaseline);
        if (spike.reliability === 'insufficient') {
          diagnostics.constraints.push({ kind: 'spike_baseline_insufficient', date: p.cand.slot_date, detail: 'onvoldoende loophistorie voor spike-cap' });
        } else if (spike.severity !== 'none') {
          const speedZ1 = (1000 / state.thresholdPace) * RUN_ZONE_IF.Z1;
          const speedZ2 = (1000 / state.thresholdPace) * RUN_ZONE_IF.Z2;
          const capM = (1 + RUN_SPIKE_BAND.small) * state.runBaseline.longestM;
          const warmupDist = 10 * 60 * speedZ1;
          const workDurTarget = Math.max(0, capM - warmupDist) / (60 * speedZ2);
          duration = Math.floor(10 + workDurTarget);
          diagnostics.constraints.push({ kind: 'run_spike_capped', date: p.cand.slot_date, detail: `severity=${spike.severity}` });
          session = duration < 20 ? null : buildRunSession(p.cand.slot_date, p.sessionType, RUN_TSS_SENTINEL, duration, state.thresholdPace);
          if (!session) {
            diagnostics.constraints.push({ kind: 'run_spike_dropped', date: p.cand.slot_date, detail: 'sessie geschrapt: ingekorte duur < 20min' });
          }
        }
      }

      if (session) {
        addSession(p.cand.slot_date, session, 'running');
        prescriptions.push({
          prescribed_date: p.cand.slot_date,
          session_type: p.sessionType,
          target_duration_min: session.duration,
          target_tss: session.targetTSS,
          target_if: session.duration > 0 ? +Math.sqrt(session.targetTSS / (session.duration / 60 * 100)).toFixed(3) : 0,
          blocks: session.blokken,
          mesocycle: { phase: mesocycle.phase, mesocycleWeek: mesocycle.week_index, isRecoveryWeek: mesocycle.is_deload, weeksToEvent: null },
          distribution_model: mesocycle.distribution_model,
          rationale: p.isLong ? 'lange duurloop' : 'herstelloop',
          modality: 'running',
        });
      }
    }
  }

  // Stap 6: fiets-TSS-budget. Hardlopen zit in enduranceDailyETL en deelt dus
  // dezelfde PMC-as als fietsen; dit is één budget, en dat is het enige punt
  // waar de twee kanalen wél optellen. Kracht doet hier niet aan mee.
  const placedRunningTSS = prescriptions
    .filter(p => p.modality === 'running')
    .reduce((s, p) => s + (p.target_tss || 0), 0);
  const restTSS = Math.max(0, mesocycle.endurance_tss_target - placedRunningTSS - existingEnduranceTSSInWindow);
  diagnostics.budget.cycling = { restTSS };

  // Stap 7: distributie. Analoog aan buildPlan stap 7 en 8a-10; buildPlan
  // blijft ongewijzigd en blijft de solver die productie draait tot C5b.
  const isDeload = !!mesocycle.is_deload;
  const dominantType = mesocycle.dominant_type || 'base';
  const profile = GOAL_PROFILES[dominantType] || GOAL_PROFILES.base;

  let distribution;
  if (isDeload) {
    distribution = { low: 1, mid: 0, high: 0 };
  } else {
    const base = DIST_BASE[mesocycle.distribution_model] || DIST_BASE.pyramidal;
    const shift = profile.distShift;
    const raw = {
      low:  Math.max(0, Math.min(1, base.low  + shift.low)),
      mid:  Math.max(0, Math.min(1, base.mid  + shift.mid)),
      high: Math.max(0, Math.min(1, base.high + shift.high)),
    };
    const sum = raw.low + raw.mid + raw.high || 1;
    distribution = { low: raw.low / sum, mid: raw.mid / sum, high: raw.high / sum };
  }

  // GOAL_PROFILES kent geen 'strength'/'running'/'composition'-sleutel; als
  // dominant_type daarop uitkomt is er geen HIT-regel gedefinieerd en valt
  // hitType terug op null (geen HIT), conservatiever dan crashen.
  const hitType = (isDeload || !GOAL_PROFILES[dominantType]) ? null : resolveHitType(dominantType, mesocycle.phase);
  const hitMinZone = hitType === 'vo2max' ? 5 : 4;
  const minDaysBetweenHIT = (params.minHoursBetweenHit || 48) / 24;

  const cyclingDays = remainingCyclingSlots
    .map(s => ({ date: s.slot_date, maxDuration: s.minutes, maxZone: s.maxZone, timeOfDay: s.time_of_day }))
    .sort((a, b) => a.date.localeCompare(b.date));

  let hitCount = 0;
  if (!isDeload) {
    if (dominantType === 'maintenance') {
      hitCount = Math.min(2, params.maxHitSessionsPerWeek);
    } else if (hitType !== null) {
      hitCount = Math.min(Math.max(1, Math.round(restTSS * distribution.high / 70)), params.maxHitSessionsPerWeek);
    }
  }

  const eligibleHIT = cyclingDays.filter(d => d.maxZone >= hitMinZone);
  const hitDays = selectSpreadDays(eligibleHIT, hitCount, minDaysBetweenHIT);
  const hitDateSet = new Set(hitDays.map(d => d.date));

  const nonHitDays = cyclingDays.filter(d => !hitDateSet.has(d.date));
  const longestDay = nonHitDays.reduce((best, d) => (!best || d.maxDuration > best.maxDuration) ? d : best, null);
  const longestDayTSS = longestDay ? Math.round(restTSS * 0.35) : 0;

  const otherNonHit = longestDay ? nonHitDays.filter(d => d.date !== longestDay.date) : nonHitDays;
  const allOther = [...hitDays, ...otherNonHit];
  const totalOtherDur = allOther.reduce((s, d) => s + d.maxDuration, 0) || 1;
  const remainingRestTSS = Math.max(0, restTSS - longestDayTSS);

  const dayAssignment = {};
  const dayTargetTSS = {};

  if (longestDay) {
    dayAssignment[longestDay.date] = 'endurance';
    const capZ2 = Math.round((longestDay.maxDuration / 60) * ZONE_IF['Z2'] ** 2 * 100);
    dayTargetTSS[longestDay.date] = Math.min(longestDayTSS, capZ2);
  }

  for (const d of hitDays) {
    dayAssignment[d.date] = hitType || 'endurance';
    const prop = d.maxDuration / totalOtherDur;
    const feasible = Math.round((d.maxDuration / 60) * ZONE_IF['Z' + Math.min(d.maxZone, 4)] ** 2 * 100);
    const tss = Math.min(Math.round(remainingRestTSS * prop), feasible, Math.round(restTSS * 0.20));
    dayTargetTSS[d.date] = Math.max(20, tss);
  }

  const sortedOtherNonHit = [...otherNonHit].sort((a, b) => {
    if (b.maxZone !== a.maxZone) return b.maxZone - a.maxZone;
    return b.maxDuration - a.maxDuration;
  });
  const totalOtherMin = otherNonHit.reduce((s, d) => s + d.maxDuration, 0);
  const midBudgetMin = Math.round(totalOtherMin * distribution.mid);
  let midUsedMin = 0;

  for (const d of sortedOtherNonHit) {
    let sType;
    if (d.maxZone <= 2) {
      sType = 'endurance';
    } else if (midUsedMin < midBudgetMin) {
      sType = d.maxZone >= 4 ? 'sweetspot' : 'tempo';
      midUsedMin += Math.round(d.maxDuration * 0.7);
    } else {
      sType = 'endurance';
    }
    dayAssignment[d.date] = sType;
    const prop = d.maxDuration / totalOtherDur;
    const tssIfKey = sType === 'sweetspot' ? 'SS' : sType === 'tempo' ? 'Z3' : 'Z2';
    const ifv = ZONE_IF[tssIfKey];
    const feasible = Math.round((d.maxDuration / 60) * ifv * ifv * 100);
    const tss = Math.min(Math.round(remainingRestTSS * prop), feasible, Math.round(restTSS * 0.20));
    dayTargetTSS[d.date] = Math.max(15, tss);
  }

  let assignedTSSSum = 0;
  for (const d of cyclingDays) {
    if (!dayAssignment[d.date]) continue;
    const sType = dayAssignment[d.date];
    const tTSS = dayTargetTSS[d.date] || 30;
    const session = buildSession(d.date, sType, tTSS, d.maxDuration, state.ftp);
    addSession(d.date, session, 'cycling');
    assignedTSSSum += session.targetTSS;

    const targetIf = session.duration > 0
      ? +Math.sqrt(session.targetTSS / (session.duration / 60 * 100)).toFixed(3)
      : 0;

    prescriptions.push({
      prescribed_date: d.date,
      session_type: sType,
      target_duration_min: session.duration,
      target_tss: session.targetTSS,
      target_if: targetIf,
      blocks: session.blokken,
      mesocycle: { phase: mesocycle.phase, mesocycleWeek: mesocycle.week_index, isRecoveryWeek: mesocycle.is_deload, weeksToEvent: null },
      distribution_model: mesocycle.distribution_model,
      rationale: cyclingRationale(sType, mesocycle),
      modality: 'cycling',
    });
  }

  diagnostics.unplacedTSS = Math.max(0, restTSS - assignedTSSSum);

  return { sessions, prescriptions, diagnostics };
}

// ─── C5b: plan_skeleton-realisatie voor solveWeek-output ─────────────────────
// plan_skeleton heeft precies één consument (buildPrescriptionBlock), die
// weeklyTSSTarget/tidMinutes/realizedDistribution leest. solveWeek levert die
// realisatie zelf niet, dus deze helper rekent hem na uit de prescriptions.
// Band-indeling identiek aan buildPlan FIX 3 en de R2-besluitlog: Z1/Z2 laag,
// Z3 midden, Z4 en hoger hoog, met als enige uitzondering het
// sweetspot-werkblok dat als midden telt. Kracht doet niet mee: geen zones,
// geen TSS. zoneToCategory splitst loop-Z4 bewust niet (R2-besluitlog), dus
// loopblokken volgen dezelfde indeling als fietsblokken.
function summarizeWeek(prescriptions) {
  let sumTSS = 0;
  const tidMinutes = { low: 0, mid: 0, high: 0 };

  for (const p of (prescriptions || [])) {
    if (p.modality !== 'cycling' && p.modality !== 'running') continue;
    sumTSS += p.target_tss || 0;
    const isSweetspot = p.session_type === 'sweetspot';
    for (const b of (p.blocks || [])) {
      const n = b.herhalingen || 1;
      const isSweetspotWork = isSweetspot && b.type === 'work' && b.zone === 'Z4';
      const cat = isSweetspotWork ? 'mid'
        : (b.zone === 'Z1' || b.zone === 'Z2') ? 'low'
        : b.zone === 'Z3' ? 'mid' : 'high';
      tidMinutes[cat] += b.duration * n;
      if (b.herstelBlok) {
        const hCat = (b.herstelBlok.zone === 'Z1' || b.herstelBlok.zone === 'Z2') ? 'low'
          : b.herstelBlok.zone === 'Z3' ? 'mid' : 'high';
        tidMinutes[hCat] += b.herstelBlok.duration * n;
      }
    }
  }
  tidMinutes.total = tidMinutes.low + tidMinutes.mid + tidMinutes.high;
  const weeklyTSSTarget = Math.round(sumTSS);

  const _t = tidMinutes.total || 1;
  const realizedDistribution = {
    low:  Math.round(tidMinutes.low  / _t * 100) / 100,
    mid:  Math.round(tidMinutes.mid  / _t * 100) / 100,
    high: Math.round(tidMinutes.high / _t * 100) / 100,
  };

  return { weeklyTSSTarget, tidMinutes, realizedDistribution };
}

module.exports = {
  buildPlan, zoneWatts, blockTSS, deriveMode,
  calcSessionTSS, calcSessionDuration, calcBlockTSS, calcBlockDuration,
  DIST_BASE, ZONE_IF, GOAL_PROFILES,
  dateToUTCms, daysBetweenUTC, getMondayOf, computePlanWindow,
  goalsToGoalSet, resolveGoalPriority, buildMacrocycle,
  buildRunSession, runPaceZones, runBlockTSS, buildRunSessionBlocks,
  buildSession,
  modalityInterferenceWeight, clampInterferenceParams,
  requiredSeparationHours, separationLevel,
  deriveLevel, selectPeriodizationProfile, clampProfileParams,
  LEVEL_CTL_BOUNDS, LEVEL_MIN_HISTORY_DAYS,
  solveWeek, buildStrengthSession, slotStartMs, sessionModality,
  plannedRunDistanceM, legsZoneCeiling, selectStrengthSplits, summarizeWeek,
  DEFAULT_SLOT_HOUR, LEGS_QUALITY_BLOCK_HOURS, LEGS_BLOCKED_MAX_ZONE,
  STRENGTH_SPLIT_ORDER, STRENGTH_SESSION_MIN, RUN_WEEK_GROWTH_CAP,
};

// ─── Zelftest ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const defaultParams = {
    rampCapCtlPerWeek:            7,
    loadWeeksBeforeRecovery:      3,
    ctlTimeConstantDays:         42,
    atlTimeConstantDays:          7,
    minTsbForQuality:           -10,
    runInterferenceWeight:      1.75,
    minHoursRunToLegs:             6,
    preferredHoursRunToLegs:       24,
    eimdRecoveryHours:             48,
    maxHitSessionsPerWeek:         2,
    minHoursBetweenHit:           48,
    timeBudgetHighMinHours:       12,
    timeBudgetModerateMinHours:    5,
  };

  // FIX 4: consistentiecheck per testcase
  function runTest(label, plan, availDays) {
    const sk = plan.skeleton;
    const sumPrescribed = plan.prescriptions.reduce((s, p) => s + p.target_tss, 0);
    const deviation = sk.weeklyTSSTarget > 0
      ? Math.abs(sumPrescribed - sk.weeklyTSSTarget) / sk.weeklyTSSTarget
      : 0;
    const tssOk = deviation <= 0.05;

    const rd = sk.realizedDistribution;
    const midEligible = sk.distribution.mid > 0.10 && availDays.some(d => d.maxZone >= 3);
    const midOk = !midEligible || rd.mid >= 0.6 * sk.distribution.mid;

    const verdict = (tssOk && midOk) ? 'CONSISTENT'
      : 'INCONSISTENT' + (!tssOk ? ` — TSS-afwijking ${(deviation * 100).toFixed(1)}%` : '')
                       + (!midOk ? ` — gerealiseerde mid ${rd.mid.toFixed(2)} < 60% van doel ${sk.distribution.mid.toFixed(2)}` : '');

    console.log(`\n=== ${label} ===`);
    console.log(`weeklyTSSAim=${sk.weeklyTSSAim} weeklyTSSTarget=${sk.weeklyTSSTarget} volumeLimited=${sk.volumeLimited}`);
    console.log(`sumPrescribed=${sumPrescribed} afwijking=${(deviation * 100).toFixed(1)}%`);
    console.log(`dist low=${sk.distribution.low.toFixed(2)} mid=${sk.distribution.mid.toFixed(2)} high=${sk.distribution.high.toFixed(2)}`);
    console.log(`realized low=${rd.low.toFixed(2)} mid=${rd.mid.toFixed(2)} high=${rd.high.toFixed(2)}  (mid-fractie: ${rd.mid.toFixed(2)}, doel: ${sk.distribution.mid.toFixed(2)})`);
    console.log(`tidMinutes low=${sk.tidMinutes.low} mid=${sk.tidMinutes.mid} high=${sk.tidMinutes.high} total=${sk.tidMinutes.total}`);
    console.log(verdict);
    plan.prescriptions.forEach(p => {
      console.log(`  ${p.prescribed_date} ${p.session_type.padEnd(12)} TSS=${p.target_tss} dur=${p.target_duration_min}min IF=${p.target_if} — ${p.rationale}`);
    });
  }

  // Test 1: basismodus, intermediate atleet, 5 dagen (base → geen HIT, weinig mid)
  const ad1 = [
    { date: '2026-06-15', maxDuration: 60,  maxZone: 5 },
    { date: '2026-06-16', maxDuration: 45,  maxZone: 3 },
    { date: '2026-06-17', maxDuration: 120, maxZone: 5 },
    { date: '2026-06-18', maxDuration: 90,  maxZone: 4 },
    { date: '2026-06-20', maxDuration: 60,  maxZone: 5 },
  ];
  const plan1 = buildPlan({
    goals: { mode: 'base' }, metrics: { ctl: 55, atl: 58, tsb: -3, acwr: 1.05 },
    currentWeight: 78, ftp: 280, settings: { age: 35 }, availDays: ad1,
  }, defaultParams);
  runTest('TEST 1: base, CTL 55, 5 dagen', plan1, ad1);

  // Test 2: event-modus, 7 weken tot wedstrijd (build fase, threshold HIT)
  const ad2 = [
    { date: '2026-06-16', maxDuration: 75,  maxZone: 5 },
    { date: '2026-06-17', maxDuration: 150, maxZone: 5 },
    { date: '2026-06-18', maxDuration: 60,  maxZone: 3 },
    { date: '2026-06-19', maxDuration: 75,  maxZone: 5 },
    { date: '2026-06-21', maxDuration: 90,  maxZone: 5 },
  ];
  const plan2 = buildPlan({
    goals: { mode: 'event', eventDate: '2026-07-28', eventName: 'Gran Fondo Limburg' },
    metrics: { ctl: 72, atl: 68, tsb: 4, acwr: 0.94 },
    currentWeight: 75, ftp: 300, settings: { age: 42 }, availDays: ad2,
  }, defaultParams);
  runTest('TEST 2: event (7 wk, build), CTL 72, FTP 300', plan2, ad2);
  // Toon blokken van de HIT-sessie
  plan2.prescriptions.filter(p => ['threshold','vo2max'].includes(p.session_type)).forEach(p => {
    console.log(`  → blokken ${p.prescribed_date} (${p.session_type}):`);
    p.blocks.forEach(b => {
      const reps = b.herhalingen ? ` ×${b.herhalingen}` : '';
      const rec  = b.herstelBlok ? ` + ${b.herstelBlok.duration}min ${b.herstelBlok.zone}` : '';
      console.log(`    [${b.type}] ${b.zone} ${b.duration}min${reps}${rec} ${b.wattMin}-${b.wattMax}W`);
    });
  });

  // Test 3: ftp-modus, masters (51), cadence 3
  const ad3 = [
    { date: '2026-06-15', maxDuration: 60,  maxZone: 4 },
    { date: '2026-06-17', maxDuration: 75,  maxZone: 5 },
    { date: '2026-06-19', maxDuration: 90,  maxZone: 5 },
  ];
  const plan3 = buildPlan({
    goals: { mode: 'ftp' }, metrics: { ctl: 60, atl: 65, tsb: -5, acwr: 1.08 },
    currentWeight: 80, ftp: 260, settings: { age: 51 }, availDays: ad3,
  }, { ...defaultParams, loadWeeksBeforeRecovery: 2 });
  runTest('TEST 3: ftp, masters (51), cadence 3', plan3, ad3);
}
