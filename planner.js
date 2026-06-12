'use strict';
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

// ─── Hulpfuncties ─────────────────────────────────────────────────────────────

function blockTSS(durationMin, ifKey) {
  const v = ZONE_IF[ifKey];
  return (durationMin / 60) * v * v * 100;
}

function getMondayOf(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  const dow = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dow);
  return d.toISOString().split('T')[0];
}

function daysBetween(a, b) {
  return Math.abs(new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000;
}

function deriveMode(goals, currentWeight) {
  if (goals.eventDate && new Date(goals.eventDate + 'T12:00:00') > new Date()) return 'event';
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

function buildSession(date, sessionType, targetTSS, maxDur, ftp) {
  const zones = zoneWatts(ftp);
  const rawBlokken = buildSessionBlocks(sessionType, targetTSS, maxDur, zones);

  // Verwijder interne _tssZone vóór output
  const blokken = rawBlokken.map(b => {
    const out = Object.assign({}, b);
    delete out._tssZone;
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
    distributionPolarizedMinHours, distributionPyramidalMinHours,
  } = params;
  const { ctl } = metrics;

  // 1. Mode
  const mode = (goals.mode && goals.mode !== 'auto') ? goals.mode : deriveMode(goals, currentWeight);

  // 2. weekStart & weeklyHours
  const sortedDays = [...availDays].sort((a, b) => a.date.localeCompare(b.date));
  if (!sortedDays.length) return { skeleton: {}, sessions: {}, prescriptions: [] };
  const weekStart = getMondayOf(sortedDays[0].date);
  const weeklyHours = sortedDays.reduce((s, d) => s + d.maxDuration / 60, 0);

  // 3. distributionModel & niveau
  const distributionModel = weeklyHours >= distributionPolarizedMinHours ? 'polarized'
    : weeklyHours >= distributionPyramidalMinHours ? 'pyramidal' : 'sweetspot';
  const level = ctl < 40 ? 'novice' : ctl <= 70 ? 'intermediate' : ctl <= 100 ? 'advanced' : 'elite';
  const masters = (settings.age || 0) >= 50;

  // 4. rampCap & cadence
  let rampCap = rampCapCtlPerWeek;
  if (level === 'novice' || masters) rampCap = Math.min(rampCap, 4);
  const cadence = (masters ? 2 : loadWeeksBeforeRecovery) + 1;

  // 5. Fase & mesocycle
  const weekStartDate = new Date(weekStart + 'T12:00:00');
  let phase, mesocycleWeek, weeksToEvent = null;

  if (mode === 'event' && goals.eventDate && new Date(goals.eventDate + 'T12:00:00') > weekStartDate) {
    weeksToEvent = Math.ceil((new Date(goals.eventDate + 'T12:00:00') - weekStartDate) / (7 * 86400000));
    phase = weeksToEvent <= 1 ? 'race_week' : weeksToEvent <= 2 ? 'taper'
          : weeksToEvent <= 4 ? 'peak'      : weeksToEvent <= 8 ? 'build' : 'base';
    mesocycleWeek = ((weeksToEvent - 1) % cadence) + 1;
  } else {
    phase = 'build';
    const origin = new Date('2024-01-01T12:00:00');
    const weekIndex = Math.floor((weekStartDate - origin) / (7 * 86400000));
    mesocycleWeek = ((weekIndex % cadence) + cadence) % cadence + 1;
  }
  const isRecoveryWeek = mesocycleWeek === cadence;

  // 5.5. hitType vooraf bepalen — nodig voor distributie-gewogen cap (FIX 1)
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
      midUsedMin += d.maxDuration;
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

  const skeleton = {
    mode, phase, mesocycleWeek, isRecoveryWeek, weeksToEvent,
    weeklyTSSAim, weeklyTSSTarget, volumeLimited,
    distributionModel, distribution, tidMinutes,
    eventDate:  goals.eventDate  || null,
    eventName:  goals.eventName  || null,
    rationale:  buildRationale(null, mode, phase, isRecoveryWeek, ctl),
  };

  return { skeleton, sessions, prescriptions };
}

module.exports = { buildPlan };

// ─── Zelftest ────────────────────────────────────────────────────────────────

if (require.main === module) {
  const defaultParams = {
    rampCapCtlPerWeek:            7,
    loadWeeksBeforeRecovery:      3,
    ctlTimeConstantDays:         42,
    atlTimeConstantDays:          7,
    minTsbForQuality:           -10,
    interferenceFactor:          0.8,
    maxHitSessionsPerWeek:         2,
    minHoursBetweenHit:           48,
    distributionPolarizedMinHours: 8,
    distributionPyramidalMinHours: 5,
  };

  // FIX 4: consistentiecheck per testcase
  function runTest(label, plan, availDays) {
    const sk = plan.skeleton;
    const sumPrescribed = plan.prescriptions.reduce((s, p) => s + p.target_tss, 0);
    const deviation = sk.weeklyTSSTarget > 0
      ? Math.abs(sumPrescribed - sk.weeklyTSSTarget) / sk.weeklyTSSTarget
      : 0;
    const tssOk = deviation <= 0.05;

    const hasMidSession = plan.prescriptions.some(p => p.session_type === 'sweetspot' || p.session_type === 'tempo');
    const midEligible = sk.distribution.mid > 0.10 && availDays.some(d => d.maxZone >= 3);
    const midOk = !midEligible || hasMidSession;

    const verdict = (tssOk && midOk) ? 'CONSISTENT'
      : 'INCONSISTENT' + (!tssOk ? ` — TSS-afwijking ${(deviation * 100).toFixed(1)}%` : '')
                       + (!midOk ? ' — ontbrekende mid-sessie' : '');

    console.log(`\n=== ${label} ===`);
    console.log(`weeklyTSSAim=${sk.weeklyTSSAim} weeklyTSSTarget=${sk.weeklyTSSTarget} volumeLimited=${sk.volumeLimited}`);
    console.log(`sumPrescribed=${sumPrescribed} afwijking=${(deviation * 100).toFixed(1)}%`);
    console.log(`dist low=${sk.distribution.low.toFixed(2)} mid=${sk.distribution.mid.toFixed(2)} high=${sk.distribution.high.toFixed(2)}`);
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
