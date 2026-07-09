// ── State ─────────────────────────────────────────────────────────────────────
let S = {
  athlete: null, recentActs: [], hevyWorkouts: [],
  data: { goals:{}, patterns:[], nutrition:{}, weight:{}, weekPlan:{}, settings:{} },
  parsedNutr: null, currentWeekOffset: 0,
  pendingSession: null, histSummary: null,
  insightLoaded: {},
  weekAvailability: {},
  editingAiSession: null,
};

let _coachReturnContext = null;

const DAYS_NL = ['Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag','Zondag'];
const TYPES = ['Wielrennen (buiten)','Wielrennen (trainer)','Hardlopen','Krachttraining (Push)','Krachttraining (Pull)','Krachttraining (Legs)','Zwemmen','Overig'];

function today() { return new Date().toISOString().split('T')[0]; }
function fmtT(sec) { if(!sec) return '–'; const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60); return h>0?`${h}u${String(m).padStart(2,'0')}`:`${m}m`; }
function fmtD(iso,long=false) {
  if(!iso) return '';
  return new Date(iso).toLocaleDateString('nl-NL', long ? {weekday:'long',day:'numeric',month:'long'} : {weekday:'short',day:'numeric',month:'short'});
}
function sEmoji(t) { return {Ride:'🚴',VirtualRide:'🖥️',Run:'🏃',WeightTraining:'🏋️',Swim:'🏊',Walk:'🚶',Hike:'🥾',Gym:'🏋️',Cycling:'🚴',Running:'🏃'}[t]||'⚡'; }

async function api(path, opts={}) {
  const r = await fetch(path, opts);
  if(!r.ok) { const e = await r.json().catch(()=>({error:r.statusText})); throw new Error(e.error||r.statusText); }
  return r.json();
}

// ── Load ──────────────────────────────────────────────────────────────────────
async function syncAll() {
  document.querySelectorAll('[onclick="syncAll()"]').forEach(b => b.textContent = '↻ Laden...');
  await Promise.allSettled([loadAthlete(), loadRecentActs(), loadHevy(), loadUserData(), loadHistSummary(), loadLiterature(), loadWeekAvailability(), loadFullState()]);
  renderGreeting();
  renderWeekGrid(); // re-render now that weekAvailability is guaranteed loaded
  renderActivitiesTab();
  document.querySelectorAll('[onclick="syncAll()"]').forEach(b => b.textContent = '↻ Sync');
}

async function loadAthlete() {
  try {
    const a = await api('/api/strava/athlete');
    S.athlete = a;
    document.getElementById('athName').textContent = `${a.firstname} ${a.lastname}`;
    document.getElementById('athSub').textContent = `${a.city||'Strava'} · ${a.country||''}`;
    document.getElementById('avatarInit').textContent = a.firstname?.[0]||'P';
    if (a.profile_medium) document.getElementById('avatarWrap').innerHTML = `<img class="avatar" src="${a.profile_medium}" alt="">`;
    renderGreeting();
  } catch {
    // Tijdelijke fout (bv. Strava rate-limit tijdens sync): bestaande naam behouden.
    // Alleen tonen als er nog nooit een profiel is geladen.
    if (!S.athlete || !S.athlete.firstname) {
      document.getElementById('athName').textContent = 'Strava niet verbonden';
    }
  }
}

async function loadRecentActs() {
  try {
    S.recentActs = await api('/api/strava/activities');
    renderRecentActs(); renderStats();
  } catch(e) {
    document.getElementById('recentActs').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function loadHevy() {
  try {
    S.hevyWorkouts = await api('/api/hevy/workouts');
  } catch {
    const el = document.getElementById('hevyList'); if (el) el.innerHTML = '<div class="alert alert-info">Hevy niet verbonden</div>';
    return;
  }
  renderHevy();
  try { renderHevyProgression(); } catch(e) {
    const el = document.getElementById('hevyProgression'); if (el) el.innerHTML = '<div class="alert alert-info">Progressieanalyse niet beschikbaar.</div>';
  }
  if (typeof renderActivitiesTab === 'function') renderActivitiesTab();
}

async function loadUserData() {
  try {
    S.data = await api('/api/data');
    renderNutrHistory(); renderPatterns(); renderWeekGrid(); renderStats();
    // Fill forms
    const g = S.data.goals||{};
    document.getElementById('gPrimary').value = g.primary||'';
    document.getElementById('gMode').value = g.mode || 'auto';
    document.getElementById('gWeight').value = g.weightTarget||'90-92';
    document.getElementById('gTimeline').value = g.timeline||'';
    document.getElementById('gNotes').value = g.notes||'';
    const cfg = S.data.settings||{};
    window._admSettings = cfg;
    document.getElementById('sPwrStart').value = cfg.unreliablePowerStart||'2020-01-01';
    document.getElementById('sPwrEnd').value = cfg.unreliablePowerEnd||'2020-12-31';
    document.getElementById('sFtp').value = cfg.ftp||280;
    if (document.getElementById('setting-lthr')) document.getElementById('setting-lthr').value = cfg.lthr ?? '';
    const z = cfg.zones||{};
    if (document.getElementById('sZ1')) document.getElementById('sZ1').value = z.z1||55;
    if (document.getElementById('sZ2')) document.getElementById('sZ2').value = z.z2||75;
    if (document.getElementById('sZ3')) document.getElementById('sZ3').value = z.z3||90;
    if (document.getElementById('sZ4')) document.getElementById('sZ4').value = z.z4||105;
    if (document.getElementById('sHrMax')) document.getElementById('sHrMax').value = cfg.hrMax||'';
    const hz = cfg.hrZones || [60, 70, 80, 90];
    ['sHrZ1','sHrZ2','sHrZ3','sHrZ4'].forEach((id, i) => {
      const el = document.getElementById(id);
      if (el) el.value = hz[i];
    });
    if (document.getElementById('sWeightLoss')) document.getElementById('sWeightLoss').value = cfg.targetWeightLossPerWeek||'';
    if (document.getElementById('sDefaultRPE')) document.getElementById('sDefaultRPE').value = cfg.defaultRPE||7.5;
    const al = cfg.alerts||{};
    if (document.getElementById('sTsbWarn')) document.getElementById('sTsbWarn').value = al.tsbWarn ?? -20;
    if (document.getElementById('sTsbCrit')) document.getElementById('sTsbCrit').value = al.tsbCrit ?? -30;
    if (document.getElementById('sAcwrWarn')) document.getElementById('sAcwrWarn').value = al.acwrWarn ?? 1.3;
    if (document.getElementById('sAcwrCrit')) document.getElementById('sAcwrCrit').value = al.acwrCrit ?? 1.5;
    if (document.getElementById('sMonoWarn')) document.getElementById('sMonoWarn').value = al.monotonyWarn ?? 2.0;
    if (S.data.weight?.[today()]) document.getElementById('qWeight').value = S.data.weight[today()];
    if (g.weightTarget) document.getElementById('sWeightSub').textContent = `doel: ${g.weightTarget}kg`;
    // Event & Planning
    const eDateEl = document.getElementById('event-date-input');
    const eNameEl = document.getElementById('event-name-input');
    if (eDateEl) eDateEl.value = g.eventDate || '';
    if (eNameEl) eNameEl.value = g.eventName || '';
    // PPL Pattern
    const pplPatterns = (S.data.patterns || []).filter(p => p.type === 'gym' && p.split);
    ['push', 'pull', 'legs'].forEach(split => {
      ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].forEach(day => {
        const el = document.getElementById(`ppl-${split}-${day}`);
        if (el) el.checked = pplPatterns.some(p => p.split === split && p.day === day);
      });
    });
    // Meal times
    const mt = cfg.mealTimes || {};
    const setMt = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    setMt('mtWdBreakfast', mt.weekdayBreakfast);
    setMt('mtWdSnack',     mt.weekdaySnack);
    setMt('mtWdLunch',     mt.weekdayLunch);
    setMt('mtWdDinner',    mt.weekdayDinner);
    setMt('mtWeBreakfast', mt.weekendBreakfast);
    setMt('mtWeSnack',     mt.weekendSnack);
    setMt('mtWeLunch',     mt.weekendLunch);
    setMt('mtWeDinner',    mt.weekendDinner);
  } catch(e) { console.error('[loadUserData]', e); }
}

async function loadHistSummary() {
  try {
    const h = await api('/api/strava/history-summary');
    S.histSummary = h;
    updateSyncBanner(h);
    renderHistSummary(h);
  } catch {}
}

async function syncFullHistory() {
  const btn = document.getElementById('btnSyncAll');
  btn.textContent = 'Bezig...'; btn.disabled = true;
  document.getElementById('syncInfo').textContent = 'Alle activiteiten ophalen, even geduld...';
  try {
    const r = await api('/api/strava/sync-all', { method: 'POST' });
    document.getElementById('syncInfo').textContent = `✓ ${r.total} activiteiten gesynchroniseerd (${r.new} nieuw)`;
    await loadHistSummary();
  } catch(e) {
    document.getElementById('syncInfo').textContent = 'Sync mislukt: ' + e.message;
  }
  btn.textContent = 'Sync alle activiteiten'; btn.disabled = false;
}

function updateSyncBanner(h) {
  if (h.total > 0) {
    S.lastSync = h.lastSync || null;
    const d = h.lastSync ? new Date(h.lastSync).toLocaleDateString('nl-NL') : '–';
    document.getElementById('syncInfo').textContent = `${h.total} activiteiten gesynchroniseerd · Laatste sync: ${d}`;
    document.getElementById('btnSyncAll').textContent = '↻ Sync nieuw';
  }
}

function updateMetrics(m) {
  if (!m) return;
  document.getElementById('sATL').textContent = m.atl;
  document.getElementById('sCTL').textContent = m.ctl;
  const tsb = m.tsb;
  const tsbEl = document.getElementById('sTSB');
  tsbEl.textContent = tsb > 0 ? `+${tsb}` : tsb;
  tsbEl.className = 'stat-val ' + (tsb < -20 ? 'c-red' : tsb > 10 ? 'c-blue' : 'c-green');
  document.getElementById('sTSBSub').textContent = tsb < -20 ? 'vermoeid' : tsb > 10 ? 'uitgerust' : 'optimaal';

  // ACWR
  if (m.acwr !== undefined) {
    const acwrEl = document.getElementById('sACWR');
    if (acwrEl) {
      acwrEl.textContent = m.acwr;
      acwrEl.className = 'stat-val ' + (m.acwr > 1.5 ? 'c-red' : m.acwr > 1.3 ? 'c-orange' : m.acwr < 0.8 ? 'c-blue' : 'c-green');
      document.getElementById('sACWRSub').textContent = m.acwr > 1.5 ? '⚠️ spike-zone' : m.acwr > 1.3 ? 'verhoogd' : m.acwr < 0.8 ? 'detraining' : 'optimaal';
    }
  }

  // Monotony
  if (m.monotony !== undefined) {
    const mEl = document.getElementById('sMono');
    if (mEl) {
      mEl.textContent = m.monotony;
      mEl.className = 'stat-val ' + (m.monotony > 2.5 ? 'c-red' : m.monotony > 2.0 ? 'c-orange' : 'c-purple');
      document.getElementById('sMonoSub').textContent = m.monotony > 2.5 ? 'te eentonig' : m.monotony > 2.0 ? 'verhoogd' : 'normaal';
    }
  }
}

async function loadFullState() {
  try {
    const s = await api('/api/state/full');
    S.fullState = s;

    // Readiness
    const r = s.readiness;
    document.getElementById('readinessVal').textContent = r.total;
    document.getElementById('readinessInterp').textContent = r.interpretation.charAt(0).toUpperCase() + r.interpretation.slice(1);
    const ring = document.getElementById('readinessRing');
    const offset = 289.0 - (r.total / 100) * 289.0;
    ring.setAttribute('stroke-dashoffset', offset);
    const cs = getComputedStyle(document.documentElement);
    const accent = cs.getPropertyValue('--accent').trim() || '#012296';
    const green = cs.getPropertyValue('--green').trim() || '#175a3b';
    const yellow = cs.getPropertyValue('--yellow').trim() || '#8a6315';
    const red = cs.getPropertyValue('--red').trim() || '#8a2615';
    const ringColor = r.total >= 80 ? green : r.total >= 65 ? accent : r.total >= 50 ? yellow : red;
    ring.setAttribute('stroke', ringColor);
    document.getElementById('readinessBreakdown').innerHTML =
      `<button class="pf-info-btn" data-tip="readiness_breakdown" aria-label="Uitleg subscores"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>TSB ${r.breakdown.tsb||0}/28 · ACWR ${r.breakdown.acwr||0}/16 · Monotony ${r.breakdown.monotony||0}/12<br>` +
      `Load slope ${r.breakdown.loadSlope||0}/8 · Voeding ${r.breakdown.nutrition||0}/8 · Kracht ${r.breakdown.strengthFatigue||0}/8 · Slaap ${r.breakdown.sleep||0}/20`;

    // Update all metrics
    updateMetrics(s.enduranceMetrics || s.metrics);

    // FTP
    if (s.ftpInfo) {
      document.getElementById('sFTP').textContent = s.ftpInfo.ftp + 'W';
    } else {
      document.getElementById('sFTP').textContent = '–';
    }

    // Weight
    if (s.currentWeight) {
      document.getElementById('sWeight').textContent = s.currentWeight + 'kg';
    }

    // FTP toelichting
    const ftpNoteEl = document.getElementById('sFTPNote');
    if (ftpNoteEl) {
      if (s.ftpInfo) {
        ftpNoteEl.textContent = `Berekeningen gebruiken rolling FTP (${s.ftpInfo.ftp}W)`;
      } else {
        const manualFtp = S.data.settings?.ftp || 280;
        ftpNoteEl.textContent = `Berekeningen gebruiken handmatige FTP (${manualFtp}W)`;
      }
    }

    // Training model
    const model = s.currentZoneModel;
    if (model) {
      const modelLabel = model.model === 'mixed/onbekend' ? 'Onvoldoende data' : model.model;
      document.getElementById('sModel').textContent = modelLabel;
      document.getElementById('sModelSub').textContent = `${model.lowPct}/${model.midPct}/${model.highPct}%`;
    }

    // Strength overview
    renderStrengthOverview(s);

    // Calibration
    if (s.calibration) renderCalibrationInfo(s.calibration);

    // Alerts
    renderAlerts(s);

    // Slaap
    renderSleepDebt(s);
    initSleepStars();
    api('/api/sleep/today').then(today => {
      if (today) {
        const el = document.getElementById('sleepHours');
        if (el) el.value = today.hours;
        _sleepQuality = today.quality || 0;
        initSleepStars();
      }
    }).catch(() => {});

    // Vandaag-tab: sessie, doelen-ringen, belasting-grafiek
    renderTodaySession(s);
    renderGoalRings(s);
    renderOverviewLoad(_overviewLoadDays);
  } catch(e) {
    console.warn('loadFullState failed', e);
  }
}

function _todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function _sessionTypeLabel(t) {
  return { Ride:'Wielrennen', VirtualRide:'Indoor rit', Run:'Hardlopen', WeightTraining:'Krachttraining', Gym:'Krachttraining', Rest:'Rust', rust:'Rust' }[t] || t || 'Sessie';
}

// Lucide bike-icoon (stroke 1.9, currentColor) + varianten voor run/strength/rest
function _sessionIconSvg(type) {
  const a = 'fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"';
  if (type === 'Run' || type === 'Running' || type === 'TrailRun')
    return '<svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="1" '+a+'/><path '+a+' d="M4 17l5-1 1.5-3.5L7 11l-1 3M10 12.5l3 1.5 1 5M13.5 14l3.5-1 1-3"/></svg>';
  if (type === 'WeightTraining' || type === 'Gym')
    return '<svg viewBox="0 0 24 24"><path '+a+' d="M14.4 14.4 9.6 9.6M18.657 21.485l1.414-1.414M3.929 3.929 2.515 5.343M6.343 6.343 4.93 7.757l2.828 2.829M17.657 13.657l-2.828-2.829M21.485 18.657l-1.414 1.414"/></svg>';
  if (type === 'Rest' || type === 'rust')
    return '<svg viewBox="0 0 24 24"><path '+a+' d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/></svg>';
  // Lucide "bike" (default cycling)
  return '<svg viewBox="0 0 24 24"><circle cx="18.5" cy="17.5" r="3.5" '+a+'/><circle cx="5.5" cy="17.5" r="3.5" '+a+'/><circle cx="15" cy="5" r="1" '+a+'/><path '+a+' d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>';
}

function _blokIntensity(zoneIdx) { return Math.max(0.18, Math.min(1, (zoneIdx + 1) / 5)); }

function renderTodaySession(s) {
  const body = document.getElementById('todaySessionBody');
  if (!body) return;
  const plan = (S.data && S.data.weekPlan) || {};
  const sessions = plan[_todayISO()] || [];
  const timeEl = document.getElementById('todaySessionTime');
  if (!sessions.length) {
    if (timeEl) timeEl.textContent = 'Vandaag';
    body.innerHTML = '<div class="pf-session-empty">Geen sessie gepland vandaag. Rust of vrije training.</div>';
    return;
  }
  const ses = sessions[0];
  const type = ses.type || (ses.split ? 'WeightTraining' : 'Ride');
  const title = ses.title || ses.description || (ses.split ? ('Kracht · ' + ses.split) : _sessionTypeLabel(type));
  const dur = ses.duration || ses.duur_min;
  const ftpPct = ses.ftpPct || (ses.IF ? Math.round(ses.IF * 100) : null);
  if (timeEl) timeEl.textContent = ses.time || 'Vandaag';

  // subtitel: bv "4×8 min @ 95% FTP · 75 min"
  const metaParts = [];
  if (ses.blokken && ses.blokken.length) {
    const main = ses.blokken.find(b => _zoneIdx(b.zone) >= 3) || ses.blokken[0];
    if (main && main.herhalingen > 1) metaParts.push(main.herhalingen + '×' + main.duration + ' min');
  }
  if (ftpPct) metaParts.push('@ ' + ftpPct + '% FTP');
  if (dur) metaParts.push(dur + ' min');
  const metaLine = metaParts.join(' · ');

  let barsHtml = '';
  const blokken = ses.blokken || [];
  if (blokken.length) {
    const segs = [];
    blokken.forEach(b => {
      const zi = _zoneIdx(b.zone);
      const reps = b.herhalingen > 1 ? b.herhalingen : 1;
      for (let i = 0; i < reps; i++) {
        segs.push({ h: _blokIntensity(zi), work: true });
        if (b.herstelBlok) segs.push({ h: _blokIntensity(_zoneIdx(b.herstelBlok.zone)), work: false });
      }
    });
    barsHtml = '<div class="pf-interval-bars">' + segs.map(sg =>
      '<div class="pf-interval-bar" style="height:' + Math.round(sg.h * 100) + '%;background:' +
      (sg.work ? '#2633bd' : '#1a1d92') + '"></div>').join('') + '</div>';
  }

  const stats = [];
  if (ses.targetWatts || ses.target_watts) stats.push({ v: (ses.targetWatts || ses.target_watts) + 'W', l: 'Target' });
  if (ses.targetTSS) stats.push({ v: ses.targetTSS, l: 'TSS' });
  if (ses.IF) stats.push({ v: ses.IF, l: 'IF' });
  if (ses.kj) stats.push({ v: ses.kj, l: 'kJ' });
  if (!stats.length && dur) stats.push({ v: dur + ' min', l: 'Duur' });
  const statsHtml = stats.length ? '<div class="pf-session-stats">' + stats.map(st =>
    '<div class="pf-session-stat"><div class="v">' + st.v + '</div><div class="l">' + st.l + '</div></div>').join('') + '</div>' : '';

  body.innerHTML =
    '<div class="pf-session-head">' +
      '<div class="pf-session-icon">' + _sessionIconSvg(type) + '</div>' +
      '<div><div class="pf-session-title">' + title + '</div>' +
      (metaLine ? '<div class="pf-session-meta">' + metaLine + '</div>' : '') + '</div>' +
    '</div>' + barsHtml + statsHtml;
}

function _setRing(id, fraction, circ) {
  const el = document.getElementById(id);
  if (!el) return;
  const C = circ || 263.9;
  el.setAttribute('stroke-dashoffset', C - Math.max(0, Math.min(1, fraction)) * C);
}

// Telt unieke actieve kalenderdagen in de laatste `windowDays` dagen uit S.recentActs (eerlijke data, geen verzinsel)
function _activeDaysLast(windowDays) {
  const acts = S.recentActs || [];
  if (!acts.length) return null;
  const cutoff = new Date(); cutoff.setHours(0,0,0,0); cutoff.setDate(cutoff.getDate() - (windowDays - 1));
  const days = new Set();
  acts.forEach(a => {
    if (!a.start_date) return;
    const d = new Date(a.start_date);
    if (d >= cutoff) days.add(a.start_date.split('T')[0]);
  });
  return days.size;
}

function _parseWeightTarget(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const nums = String(raw).match(/\d+(\.\d+)?/g);
  if (!nums) return null;
  if (nums.length >= 2) return (parseFloat(nums[0]) + parseFloat(nums[1])) / 2;
  return parseFloat(nums[0]);
}

function renderGoalRings(s) {
  // Gewicht
  const cur = s.currentWeight;
  const target = _parseWeightTarget(S.data?.goals?.weightTarget) ?? 91;
  if (cur != null) {
    const start = _parseWeightTarget(S.data?.goals?.weightStart) || (cur > target ? cur + 0.0001 : target + 8);
    const frac = start <= target ? 1 : Math.max(0, Math.min(1, (start - cur) / (start - target)));
    document.getElementById('goalWeightPct').textContent = Math.round(frac * 100) + '%';
    _setRing('goalWeightRing', frac);
    document.getElementById('goalWeightTitle').textContent = 'Naar ' + target + ' kg';
    document.getElementById('goalWeightSub').textContent = cur + ' / ' + target + ' kg';
  } else {
    document.getElementById('goalWeightPct').textContent = '–';
    document.getElementById('goalWeightSub').textContent = 'doel ' + target + ' kg';
  }

  // Event
  const tp = s.trainingPlan || {};
  if (tp.eventDate) {
    const ev = new Date(tp.eventDate);
    const days = Math.max(0, Math.ceil((ev - new Date()) / 86400000));
    document.getElementById('goalEventNum').textContent = days;
    const horizon = 84;
    _setRing('goalEventRing', (horizon - Math.min(days, horizon)) / horizon);
    document.getElementById('goalEventTitle').textContent = tp.eventName || 'Tot event';
    document.getElementById('goalEventSub').textContent = _phaseLabel(tp.phase) + (tp.eventDate ? ' · ' + fmtD(tp.eventDate) : '');
  } else {
    document.getElementById('goalEventNum').textContent = '–';
    document.getElementById('goalEventSub').textContent = 'geen event';
  }

  // Consistentie: unieke actieve dagen laatste 14d (uit recentActs)
  const active = _activeDaysLast(14);
  if (active != null) {
    document.getElementById('goalConsistencyNum').textContent = active;
    _setRing('goalConsistencyRing', active / 14);
    document.getElementById('goalConsistencySub').textContent = active + ' van laatste 14 dagen actief';
  } else {
    document.getElementById('goalConsistencyNum').textContent = '–';
    _setRing('goalConsistencyRing', 0);
    document.getElementById('goalConsistencySub').textContent = 'sync activiteiten';
  }
}

function _phaseLabel(p) {
  return { base:'Basis', build:'Opbouw', peak:'Piek', taper_week1:'Taper', taper:'Taper', race_week:'Raceweek' }[p] || (p || '–');
}

let _overviewLoadDays = 56;
let _overviewLoadChart = null;
function setOverviewLoadRange(days, btn) {
  _overviewLoadDays = days;
  document.querySelectorAll('.pf-load-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const lbl = document.getElementById('loadRangeLabel');
  if (lbl) lbl.textContent = days + ' dagen';
  renderOverviewLoad(days);
}

async function renderOverviewLoad(days) {
  days = days || _overviewLoadDays;
  try {
    const d = await api('/api/charts/data?days=' + days);
    const series = (d && d.loadSeries) || [];
    if (!series.length) return;
    const cs = getComputedStyle(document.documentElement);
    const muted = cs.getPropertyValue('--muted').trim() || '#4a5375';
    const border = cs.getPropertyValue('--border').trim() || '#d8d1bf';
    const labels = series.map(p => p.date);
    if (_overviewLoadChart) { _overviewLoadChart.destroy(); _overviewLoadChart = null; }
    _overviewLoadChart = makeChart('overviewLoadChart', {
      type: 'line',
      data: { labels, datasets: [
        { label: 'CTL', data: series.map(p => p.ctl), borderColor: '#012296', backgroundColor: 'rgba(1,34,150,0.10)', fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2.5 },
        { label: 'ATL', data: series.map(p => p.atl), borderColor: '#8a2615', backgroundColor: 'transparent', fill: false, tension: 0.35, pointRadius: 0, borderWidth: 1.5, borderDash: [4,3] }
      ]},
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, font: { size: 10, family: 'JetBrains Mono' }, color: muted, padding: 12 } } },
        scales: {
          x: { ticks: { maxTicksLimit: 5, font: { size: 9 }, color: muted }, grid: { display: false }, border: { color: border } },
          y: { ticks: { font: { size: 9 }, color: muted }, grid: { color: border }, border: { display: false } }
        }
      }
    });
  } catch (e) { console.warn('renderOverviewLoad failed', e); }
}

function renderAlerts(s) {
  const container = document.getElementById('alertsContainer');
  const alerts = [];
  const thr = s.alertThresholds || {};
  const tsbCrit = thr.tsbCrit ?? -30;
  const acwrCrit = thr.acwrCrit ?? 1.5;
  const acwrWarn = thr.acwrWarn ?? 1.3;
  const m = s.enduranceMetrics || s.metrics || {};

  const overreachingCoversAcwr = s.overreaching.level !== 'none' &&
    s.overreaching.flags.some(f => f.toLowerCase().includes('acwr'));

  if (s.overreaching.level === 'severe') {
    alerts.push({ type: 'error', icon: '🚨', title: 'Zwaar overreached',
      content: 'Meerdere overbelastingsindicatoren samen. Hersteldagen inplannen, geen zware sessies. Flags: ' + s.overreaching.flags.join(', ') });
  } else if (s.overreaching.level === 'moderate') {
    alerts.push({ type: 'warn', icon: '⚠️', title: 'Matig overreached',
      content: 'Meerdere risicofactoren actief. Volume verlagen, focus op herstel. ' + s.overreaching.flags.join(', ') });
  } else if (s.overreaching.level === 'mild') {
    alerts.push({ type: 'warn', icon: '⚠️', title: 'Lichte overbelasting',
      content: s.overreaching.flags.join(', ') });
  }

  if (s.plateaus && s.plateaus.length) {
    s.plateaus.slice(0, 3).forEach(p => {
      alerts.push({ type: 'info', icon: '📊', title: `Plateau gedetecteerd: ${p.domain}${p.exercise ? ' (' + p.exercise + ')' : ''}`, content: p.detail });
    });
  }

  if (m.acwr > acwrCrit && !overreachingCoversAcwr) {
    alerts.push({ type: 'error', icon: '⚡', title: 'ACWR spike',
      content: `Acute belasting ${m.acwr}× chronische — hoog blessurerisico volgens Gabbett (BJSM 2016). Verlaag volume.` });
  }

  if (alerts.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = alerts.map(a => {
    const cls = a.type === 'error' ? 'alert-error' : a.type === 'warn' ? 'alert-warn' : 'alert-info';
    return `<div class="alert ${cls}" style="margin:0;display:flex;gap:10px;align-items:flex-start">
      <span style="font-size:18px;flex-shrink:0">${a.icon}</span>
      <div style="flex:1"><div style="font-weight:600;margin-bottom:3px">${a.title}</div><div style="font-size:11px;opacity:0.85;line-height:1.5">${a.content}</div></div>
    </div>`;
  }).join('');
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderStats() {
  const w = S.data.weight?.[today()];
  if (w) { document.getElementById('sWeight').textContent = `${w}kg`; }
}

function actRow(a, detail=false) {
  const dist = a.distance > 0 ? `<div class="act-dist">${(a.distance/1000).toFixed(1)}km</div>` : '';
  const t = fmtT(a.moving_time);
  const watt = a.average_watts ? `<span class="act-watt">⚡${Math.round(a.average_watts)}W</span>` : '';
  const hr = a.average_heartrate ? `<span>♥ ${Math.round(a.average_heartrate)}bpm</span>` : '';
  const elev = a.total_elevation_gain > 0 ? `<span>⛰ ${a.total_elevation_gain}m</span>` : '';
  const suf = a.suffer_score ? `<span class="c-red">🔥 ${a.suffer_score}</span>` : '';
  const _CLICK_TYPES = new Set(['Ride','VirtualRide','Run','TrailRun']);
  const _detailAttr = _CLICK_TYPES.has(a.type) ? `onclick="navigateToActivity(${a.id})" data-strava-id="${a.id}" style="cursor:pointer"` : '';
  return `<div class="act-row" ${_detailAttr}>
    <div class="act-icon">${sEmoji(a.type)}</div>
    <div class="act-info"><div class="act-name">${a.name}</div><div class="act-date">${detail ? fmtD(a.start_date,true) : fmtD(a.start_date)}</div></div>
    <div class="act-right">${dist}<div class="act-time">${t}</div></div>
    ${watt}
  </div>${detail?`<div class="act-meta">${dist?`<span>📍 ${(a.distance/1000).toFixed(1)}km</span>`:''}<span>⏱ ${t}</span>${elev}${watt}${hr}${suf}</div>`:''}`;
}

function renderRecentActs() {
  document.getElementById('recentActs').innerHTML = S.recentActs.length
    ? [...S.recentActs].sort((a,b)=>new Date(b.start_date)-new Date(a.start_date)).slice(0,6).map(a=>actRow(a,false)).join('')
    : '<div class="empty"><div class="empty-icon">🏃</div><div class="empty-text">Geen recente activiteiten</div></div>';
  if (typeof renderActivityFeed === 'function') renderActivityFeed();
}

function renderHevy() {
  const el = document.getElementById('hevyList');
  if (!el) return;
  if (!S.hevyWorkouts.length) { el.innerHTML = '<div class="alert alert-info">Geen Hevy workouts gevonden. API key ingesteld?</div>'; return; }
  el.innerHTML = S.hevyWorkouts.map(w => {
    const exs = (w.exercises||[]).map(e => `<span style="background:var(--card2);border:1px solid var(--border2);border-radius:5px;padding:2px 7px;font-size:11px;color:var(--muted)">${e.title}</span>`).join('');
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:600">${w.name||'Workout'}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${fmtD(w.start_time,true)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">${exs}</div>
    </div>`;
  }).join('');
}

function renderHevyProgression() {
  const el = document.getElementById('hevyProgression');
  if (!el) return;
  if (!S.hevyWorkouts || !S.hevyWorkouts.length) {
    el.innerHTML = '<div class="alert alert-info">Geen workoutdata voor progressieanalyse.</div>';
    return;
  }
  // Build per-exercise history, sorted oldest→newest
  const hist = {};
  const sorted = [...S.hevyWorkouts].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  sorted.forEach(w => {
    (w.exercises || []).forEach(e => {
      if (!e.title) return;
      const validSets = (e.sets || []).filter(s => s.weight_kg > 0 && s.reps > 0);
      if (!validSets.length) return;
      // Best Epley 1RM this session: weight × (1 + reps/30)
      const best1RM = Math.max(...validSets.map(s => s.weight_kg * (1 + s.reps / 30)));
      const topSet = validSets.reduce((a, b) => a.weight_kg >= b.weight_kg ? a : b);
      if (!hist[e.title]) hist[e.title] = [];
      hist[e.title].push({ date: w.start_time, rm1: best1RM, topSet });
    });
  });
  const entries = Object.entries(hist).filter(([, s]) => s.length >= 2);
  if (!entries.length) {
    el.innerHTML = '<div class="alert alert-info">Minimaal 2 sessies per oefening nodig voor analyse.</div>';
    return;
  }
  // Sort by most recent session desc
  entries.sort((a, b) => new Date(b[1][b[1].length-1].date) - new Date(a[1][a[1].length-1].date));
  el.innerHTML = entries.map(([name, sessions]) => {
    const last5 = sessions.slice(-5);
    const firstRM = last5[0].rm1;
    const lastRM = last5[last5.length-1].rm1;
    const diff = lastRM - firstRM;
    const topSet = last5[last5.length-1].topSet;
    const nextKg = (Math.round((topSet.weight_kg + 2.5) * 2) / 2).toFixed(1);
    // Stagnation: 3+ recent sessions within 1 kg 1RM range
    const recent3 = last5.slice(-3);
    const stagnant = recent3.length >= 3 &&
      (Math.max(...recent3.map(s => s.rm1)) - Math.min(...recent3.map(s => s.rm1))) < 1;
    let arrow, color, suggestion;
    if (diff > 1) {
      arrow = '↑'; color = 'var(--green)'; suggestion = `Probeer ${nextKg} kg`;
    } else if (diff < -1) {
      arrow = '↓'; color = 'var(--red)'; suggestion = 'Volume verlagen, focus op herstel';
    } else {
      arrow = '—'; color = 'var(--accent)';
      suggestion = stagnant ? 'Andere rep range of techniekfocus' : `Probeer ${nextKg} kg`;
    }
    // Mini sparkline: dots scaled within session range
    const rms = last5.map(s => s.rm1);
    const minRM = Math.min(...rms), maxRM = Math.max(...rms), range = maxRM - minRM || 1;
    const dots = last5.map((s, i) => {
      const pct = (s.rm1 - minRM) / range; // 0=bottom, 1=top
      const y = Math.round((1 - pct) * 16); // invert: top=0px
      return `<div title="${s.rm1.toFixed(1)} kg" style="width:7px;height:7px;border-radius:50%;background:${color};opacity:${0.35 + i * 0.16};margin-top:${y}px;flex-shrink:0"></div>`;
    }).join('');
    return `<div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">1RM: ${firstRM.toFixed(1)} → <strong style="color:var(--text)">${lastRM.toFixed(1)} kg</strong></div>
        <div style="font-size:11px;color:var(--accent);margin-top:4px">💡 ${suggestion}</div>
      </div>
      <div style="display:flex;align-items:flex-end;gap:3px;flex-shrink:0;padding-top:4px">
        <div style="display:flex;align-items:flex-end;gap:3px;height:28px">${dots}</div>
        <span style="font-size:20px;color:${color};font-weight:700;line-height:1;margin-left:4px">${arrow}</span>
      </div>
    </div>`;
  }).join('');
}

function renderNutrHistory() {
  const days = Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return d.toISOString().split('T')[0];});
  const cards = days.map(k => {
    const n=S.data.nutrition?.[k], w=S.data.weight?.[k];
    const d=new Date(k+'T12:00:00');
    const wd=d.toLocaleDateString('nl-NL',{weekday:'short'});
    const ds=d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});
    const inner = n?.kcal
      ? `<div class="nutr-day-kcal">${n.kcal} kcal</div><div class="nutr-day-macros">${n.protein||'–'}g eiwit<br>${n.carbs||'–'}kh · ${n.fat||'–'}vet</div>`
      : `<div class="nutr-day-empty">–</div>`;
    const hasData = !!(n || w);
    const delBtn  = hasData ? `<button class="nutr-day-delete btn-danger" onclick="handleDayDelete('${k}',${!!n},${!!w})" title="Verwijderen">×</button>` : '';
    return `<div class="nutr-day-card">${delBtn}<div class="nutr-day-date">${wd}<br>${ds}</div>${inner}${w?`<div class="nutr-day-weight">${w} kg</div>`:''}</div>`;
  });
  document.getElementById('nutrHistory').innerHTML = `<div class="nutr-history-scroll"><div class="nutr-history-grid">${cards.join('')}</div></div>`;
}

function openConfirm({ title, message, actions }) {
  return new Promise(resolve => {
    function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '300';
    const btnHtml = actions.map(a =>
      `<button class="btn btn-sm${a.danger?' btn-del':' btn-secondary'}" data-value="${esc(a.value)}">${esc(a.label)}</button>`
    ).join('');
    overlay.innerHTML = `<div class="modal" onclick="event.stopPropagation()" style="max-width:340px"><div class="modal-title">${esc(title)}</div>${message?`<div style="font-size:13px;color:var(--muted);margin-bottom:14px">${esc(message)}</div>`:''}<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">${btnHtml}<button class="btn btn-secondary btn-sm" data-value="">Annuleren</button></div></div>`;
    document.body.appendChild(overlay);
    function done(val) { document.removeEventListener('keydown', onKey); document.body.removeChild(overlay); resolve(val || null); }
    overlay.addEventListener('click', e => { if (e.target === overlay) done(null); });
    overlay.querySelectorAll('button[data-value]').forEach(btn => btn.addEventListener('click', () => done(btn.dataset.value || null)));
    function onKey(e) { if (e.key === 'Escape') done(null); }
    document.addEventListener('keydown', onKey);
  });
}

async function handleDayDelete(date, hasNutr, hasWeight) {
  let actions;
  if (hasNutr && hasWeight) {
    actions = [
      { label: 'Voeding',  value: 'nutr' },
      { label: 'Gewicht',  value: 'weight' },
      { label: 'Beide',    value: 'both', danger: true },
    ];
  } else if (hasNutr) {
    actions = [{ label: 'Voeding verwijderen', value: 'nutr', danger: true }];
  } else {
    actions = [{ label: 'Gewicht verwijderen', value: 'weight', danger: true }];
  }
  const choice = await openConfirm({ title: 'Verwijderen', message: `Wat verwijderen op ${date}?`, actions });
  if (!choice) return;
  try {
    if (choice === 'nutr'   || choice === 'both') await api(`/api/nutrition/${date}`, { method: 'DELETE' });
    if (choice === 'weight' || choice === 'both') await api(`/api/weight/${date}`,    { method: 'DELETE' });
    await loadUserData();
  } catch (err) { console.error('Delete mislukt:', err); }
}

function renderPatterns() {
  const p = S.data.patterns||[];
  if (!p.length) { document.getElementById('patternsList').innerHTML = '<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">Geen patronen</div>'; return; }
  let html='';
  DAYS_NL.forEach(day => {
    const dp = p.filter(x=>x.day===day);
    if (!dp.length) return;
    html += `<div class="day-lbl">${day}</div>`;
    dp.forEach(x => {
      const idx=p.indexOf(x);
      html += `<div class="pattern-item"><div class="pattern-info"><div class="pattern-type">${x.type}</div>${x.description?`<div class="pattern-desc">${x.description}</div>`:''}</div><span style="color:var(--blue);font-size:12px">${x.duration}m</span><button class="btn-danger" onclick="removePattern(${idx})">×</button></div>`;
    });
  });
  document.getElementById('patternsList').innerHTML = html;
}

function renderHistSummary(h) {
  if (!h?.summary?.maandelijks?.length) return;
  const max = Math.max(...h.summary.maandelijks.map(m=>m.totaal_uur));
  const rows = h.summary.maandelijks.slice(-12).reverse().map(m => {
    const pct = max > 0 ? Math.round(m.totaal_uur/max*100) : 0;
    return `<div class="monthly-row">
      <span class="monthly-date">${m.month}</span>
      <div class="monthly-bar-wrap"><div class="monthly-bar" style="width:${pct}%"></div></div>
      <div class="monthly-stats"><span>${m.activiteiten}x</span><span>${m.totaal_uur}u</span><span>${m.totaal_km}km</span>${m.gem_watt?`<span class="c-orange">${m.gem_watt}W</span>`:''}</div>
    </div>`;
  });
  document.getElementById('histSummary').innerHTML = rows.join('');
}

// ── Week Planning ─────────────────────────────────────────────────────────────
function getWeekDates(offset=0) {
  const now = new Date();
  const dow = (now.getDay()+6)%7;
  const mon = new Date(now); mon.setDate(now.getDate()-dow+offset*7);
  return Array.from({length:7},(_,i)=>{const d=new Date(mon);d.setDate(mon.getDate()+i);return d.toISOString().split('T')[0];});
}

function _shiftISO(iso, delta){ const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + delta); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function _warnSvg(){ return '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'; }
// Beenproximiteit o.b.v. de werkelijke krachtsessies in het plan (niet data.patterns).
function _legsProximity(date) {
  const wp = S.data.weekPlan || {};
  const hasLegs = d => (wp[d] || []).some(s => s.type !== 'cycling' && (/legs/i.test(s.split || '') || /\bbeen|\bleg\b|squat|deadlift|lower/i.test(s.title || s.description || '')));
  if (hasLegs(date)) return 'legs_day';
  if (hasLegs(_shiftISO(date, -1))) return 'day_after_legs';
  if (hasLegs(_shiftISO(date, -2))) return 'two_days_after_legs';
  return 'no_restriction';
}

function renderWeekGrid() {
  const dates = getWeekDates(S.currentWeekOffset);
  const t = today();
  const wp = S.data.weekPlan || {};
  const fs = S.fullState || {};
  const restr = (fs.trainingPlan && fs.trainingPlan.cyclingRestrictions) || {};
  const dayNames = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const enNames  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
  const start = new Date(dates[0] + 'T12:00:00');
  const end   = new Date(dates[6] + 'T12:00:00');
  const fmt   = d => d.toLocaleDateString('nl-NL',{day:'numeric',month:'short'});

  const titleEl = document.getElementById('weekTitle');
  if (titleEl) titleEl.textContent = `${fmt(start)} – ${end.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})}`;
  const eb = document.getElementById('weekEyebrow');
  if (eb) eb.textContent = (`WEEK ${_isoWeekNum(start)} · ${fmt(start)} – ${fmt(end)}`).toUpperCase();
  const acc = document.getElementById('weekAccent');
  if (acc) acc.textContent = S.currentWeekOffset < 0 ? ' · voltooid' : S.currentWeekOffset > 0 ? ' · gepland' : ' · vooruit';

  const grid = document.getElementById('weekGrid');
  if (grid) grid.innerHTML = dates.map((date,i) => {
    const isToday = date === t, isPast = date < t;
    const dayNum  = new Date(date+'T12:00:00').getDate();
    const sessions = wp[date] || [];
    const restrDay = restr[enNames[i]];
    const sessHtml = sessions.map((s,si) => _renderDayCardSession(s, date, si, restrDay)).join('');
    const hasCycling = sessions.some(x => x.type === 'cycling');
    let availHtml = '';
    if (!isPast && !isToday && !hasCycling) {
      const avail = (S.weekAvailability && S.weekAvailability[date]) || {};
      const on = !!avail.cycling;
      availHtml = `<div class="pf-day-avail">
        <label class="pf-switch"><input type="checkbox" ${on?'checked':''} onchange="toggleAvailability('${date}',this.checked)"><span class="pf-switch-slider"></span></label>
        <span class="pf-day-avail-lbl">fiets vrij</span>
        ${on ? `<input class="pf-day-avail-dur" type="number" min="30" max="360" value="${avail.maxDuration||90}" onchange="setAvailDuration('${date}',this.value)" title="Max duur (min)">` : ''}
      </div>`;
    }
    return `<div class="pf-day ${isToday?'pf-day-today':''} ${isPast?'pf-day-past':''}">
      <div class="pf-day-head"><span class="pf-day-name">${dayNames[i]}</span><span class="pf-day-num">${dayNum}</span></div>
      ${sessHtml || '<div class="pf-day-empty">Rust</div>'}
      ${availHtml}
    </div>`;
  }).join('');

  _renderWeekTiles(dates);
  _renderWeekLoadChart(dates);
  _renderWeekZoneMix(dates);
}

function _renderDayCardSession(s, date, si, restrDay) {
  const isCycling = s.type === 'cycling' || s.type === 'Ride' || s.type === 'VirtualRide';
  const isRun = s.type === 'running' || s.type === 'Run';
  const isRest = s.type === 'rest' || /rust|mobilit|recover|herstel/i.test(s.title||s.titel||s.description||'');
  const iconType = isRest ? 'Rest' : isCycling ? 'Ride' : isRun ? 'Run'
    : (s.split || /gym|kracht|weight/i.test(s.type||'')) ? 'WeightTraining' : 'Ride';
  const icon = _sessionIconSvg(iconType);
  const title = s.title || s.titel || (s.split ? ('Kracht · ' + s.split) : (s.description || _sessionTypeLabel(s.type)));
  const dur = s.duration || s.duur_min;

  let sub = '';
  if (isCycling) {
    const parts = [];
    const blok = s.blokken || [];
    const main = blok.find(b => _zoneIdx(b.zone) >= 3) || blok[0];
    if (main && main.herhalingen > 1) parts.push(main.herhalingen + '×' + (main.duration||main.duur) + ' min');
    const ftp = s.ftpPct || (s.IF ? Math.round(s.IF*100) : null);
    if (ftp) parts.push('@' + ftp + '% FTP');
    if (!parts.length && dur) parts.push(dur + ' min');
    sub = parts.join(' · ');
  } else if (s.split) {
    sub = [s.sets ? s.sets + ' sets' : '', dur ? dur + ' min' : ''].filter(Boolean).join(' · ');
  } else {
    sub = dur ? dur + ' min' : '';
  }

  const completed = (s.completionScore !== undefined && !s.missed) || !!s.matchedActivityId;
  const tss = s.targetTSS || s.tss || s.actualTSS;
  let badge = '';
  if (s.missed) badge = `<span class="pf-badge pf-badge-missed">Gemist</span>`;
  else if (completed) badge = `<span class="pf-badge pf-badge-done">${_checkSvg()} Done</span>`;
  else if (isRest) badge = `<span class="pf-badge pf-badge-rest">Rust</span>`;
  else if (tss) badge = `<span class="pf-badge pf-badge-tss">${tss} TSS</span>`;

  let interf = '';
  if (isCycling) {
    const prox = _legsProximity(date);
    if (prox !== 'no_restriction') {
      const cap = prox === 'two_days_after_legs' ? 3 : 2;
      const blok = s.blokken || [];
      const sesMaxZone = blok.length ? Math.max(...blok.map(b => _zoneIdx(b.zone) + 1)) : 0;
      const lbl = { legs_day:'legs vandaag', day_after_legs:'dag na legs', two_days_after_legs:'2d na legs' }[prox];
      if (sesMaxZone > cap) {
        interf = `<span class="pf-day-interf pf-day-interf-warn" title="Concurrent-interferentie: ${lbl} vraagt max Z${cap}, maar deze sessie gaat naar Z${sesMaxZone} (Wilson 2012)">${_warnSvg()} Z${sesMaxZone} botst · ${lbl}</span>`;
      } else {
        interf = `<span class="pf-day-interf" title="Concurrent-interferentie: ${lbl}, fietsintensiteit gecapt op Z${cap} (Wilson 2012)">${_zapSvg()} Z${cap}-cap · ${lbl}</span>`;
      }
    }
  }

  const actStravaId = s.matchedActivityId || s.stravaId;
  const aiClickable = s.aiGenerated && s.blokken && s.blokken.length && !s.unplanned && !actStravaId;
  const clickAttr = actStravaId ? `onclick="navigateToActivity(${actStravaId})"` : aiClickable ? `onclick="openAiSession('${date}',${si})"` : '';
  const clickable = !!(actStravaId || aiClickable);

  return `<div class="pf-day-sess ${clickable?'pf-day-sess-click':''}" ${clickAttr}>
    <div class="pf-day-sess-top"><span class="pf-day-ico">${icon}</span>${badge}<button class="pf-day-x" onclick="event.stopPropagation();removeSession('${date}',${si})" title="Verwijderen">×</button></div>
    <div class="pf-day-sess-title">${_esc(title)}</div>
    ${sub ? `<div class="pf-day-sess-sub">${_esc(sub)}</div>` : ''}
    ${interf}
  </div>`;
}

function _renderWeekTiles(dates) {
  const wp = S.data.weekPlan || {};
  const fs = S.fullState || {};
  const setTxt = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };

  let planTSS=0, doneTSS=0, planned=0, done=0;
  dates.forEach(d => (wp[d]||[]).forEach(s => {
    planned++;
    const completed = (s.completionScore !== undefined && !s.missed) || !!s.matchedActivityId;
    const pTSS = s.targetTSS || s.tss || 0, aTSS = s.actualTSS || 0;
    if (completed) { done++; doneTSS += (aTSS || pTSS); }
    planTSS += (pTSS || aTSS);
  }));
  setTxt('wkDoneTSS', Math.round(doneTSS));
  const tp = fs.trainingPlan || {};
  const target = (typeof tp.weeklyTSSTarget === 'number' && tp.weeklyTSSTarget > 0) ? Math.round(tp.weeklyTSSTarget) : Math.round(planTSS);
  setTxt('wkPlanTSS', target);
  const pct = target > 0 ? Math.min(100, Math.round(doneTSS/target*100)) : 0;
  const fill = document.getElementById('wkProgressFill'); if (fill) fill.style.width = pct + '%';
  setTxt('wkSessSub', `${done} gedaan · ${planned} gepland`);

  const m = fs.enduranceMetrics || fs.metrics || {};
  const tsbEl = document.getElementById('wkTSB'), tsbSub = document.getElementById('wkTSBSub');
  if (tsbEl) {
    if (S.currentWeekOffset === 0 && typeof m.projectedWeekEndTSB === 'number') {
      const v = m.projectedWeekEndTSB;
      tsbEl.textContent = v > 0 ? '+' + v : v;
      tsbEl.className = 'pf-tile-big ' + (v < -25 ? 'c-red' : v < -10 ? 'c-orange' : v >= 5 ? 'c-blue' : 'c-green');
      const band = v >= 5 ? 'fris' : v >= -10 ? 'productief' : v >= -25 ? 'opbouw' : 'overbelast';
      if (tsbSub) tsbSub.textContent = `${band} · verwacht zo`;
    } else {
      tsbEl.textContent = '–'; tsbEl.className = 'pf-tile-big c-muted';
      if (tsbSub) tsbSub.textContent = 'alleen huidige week';
    }
  }

  const mix = computeWeekZoneMix(dates);
  const modelEl = document.getElementById('wkModel'), zoneEl = document.getElementById('wkZonePct');
  if (modelEl) {
    if (mix.total > 0) {
      modelEl.textContent = _modelLabel(classifyWeekModel(mix.low, mix.mid, mix.high));
      if (zoneEl) zoneEl.textContent = `Z2 ${Math.round(mix.low*100)}% · Z3 ${Math.round(mix.mid*100)}% · Z4+ ${Math.round(mix.high*100)}%`;
    } else { modelEl.textContent = '–'; if (zoneEl) zoneEl.textContent = 'geen fietsplan'; }
  }

  const sm = fs.strengthMetrics;
  const slEl = document.getElementById('wkStrengthLoad'), ssEl = document.getElementById('wkStrengthSub'), splitEl = document.getElementById('wkStrengthSplit');
  if (slEl) {
    if (S.currentWeekOffset === 0 && sm) {
      slEl.className = 'pf-tile-big';
      slEl.textContent = sm.weeklyLoad ? (Math.round(sm.weeklyLoad/100)/10) + 't' : '0';
      const avg = sm.avgWeeklyLoad4w || 0;
      let trend = 'stabiel';
      if (avg > 0) { const r = sm.weeklyLoad/avg; trend = r > 1.15 ? 'stijgend' : r < 0.85 ? 'dalend' : 'stabiel'; }
      if (ssEl) ssEl.textContent = (sm.daysSinceLastSession != null ? `${sm.daysSinceLastSession}d geleden` : 'geen data') + ' · ' + trend;
      const g = sm.muscleGroups || {};
      const parts = [['push',g.push],['pull',g.pull],['legs',g.lower_body]];
      const tot = parts.reduce((a,[,v]) => a + ((v && v.weeklyLoad) || 0), 0) || 1;
      if (splitEl) splitEl.innerHTML = parts.map(([lbl,v]) => {
        const load = (v && v.weeklyLoad) || 0;
        const w = Math.round(load / tot * 100);
        return `<div class="pf-split-seg" style="flex:${load || 0.001}" title="${lbl}: ${Math.round(load)}">${w >= 14 ? '<span>' + lbl + '</span>' : ''}</div>`;
      }).join('');
    } else {
      slEl.textContent = '–'; slEl.className = 'pf-tile-big c-muted';
      if (ssEl) ssEl.textContent = S.currentWeekOffset === 0 ? 'geen krachtdata' : 'alleen huidige week';
      if (splitEl) splitEl.innerHTML = '';
    }
  }
}

function computeWeekZoneMix(dates) {
  const wp = S.data.weekPlan || {};
  let low = 0, mid = 0, high = 0;
  const bucketOf = (zoneKey) => {
    if (zoneKey === 'SS') return 'mid';            // sweetspot = Z3/mid (76-90% FTP)
    const zi = _zoneIdx(zoneKey);
    return zi <= 1 ? 'low' : zi === 2 ? 'mid' : 'high';
  };
  dates.forEach(d => (wp[d] || []).forEach(s => {
    if (!(s.blokken && s.blokken.length)) return;
    const isSweetspot = /sweet ?spot/i.test(s.title || s.titel || ''); // fallback voor oude plannen zonder _tssZone
    s.blokken.forEach(b => {
      const reps = b.herhalingen > 1 ? b.herhalingen : 1;
      const work = (b.duration || b.duur || 0) * reps;
      let zoneKey = b._tssZone || b.zone;
      if (!b._tssZone && isSweetspot && b.type === 'work') zoneKey = 'SS';
      const bk = bucketOf(zoneKey);
      if (bk === 'low') low += work; else if (bk === 'mid') mid += work; else high += work;
      if (b.herstelBlok) {
        const rm = (b.herstelBlok.duration || b.herstelBlok.duur || 0) * reps;
        const rk = bucketOf(b.herstelBlok._tssZone || b.herstelBlok.zone);
        if (rk === 'low') low += rm; else if (rk === 'mid') mid += rm; else high += rm;
      }
    });
  }));
  const total = low + mid + high;
  return total > 0 ? { low: low/total, mid: mid/total, high: high/total, total } : { low: 0, mid: 0, high: 0, total: 0 };
}

// Spiegelt engine.js classifyTrainingModel 1-op-1. Houd in sync bij wijziging daar.
function classifyWeekModel(lowFrac, midFrac, highFrac) {
  if (lowFrac < 0.5) return 'mixed/onbekend';
  if (highFrac >= 0.12 && midFrac < 0.20 && lowFrac >= 0.65) return 'polarized';
  if (midFrac >= 0.25 || (midFrac + highFrac) >= 0.40) return 'threshold-heavy';
  if (lowFrac > midFrac && midFrac > highFrac && highFrac >= 0.05) return 'pyramidal';
  if (lowFrac >= 0.85 && highFrac < 0.05) return 'volume-only';
  return 'gemengd';
}
function _modelLabel(m){ return {pyramidal:'Pyramidaal','threshold-heavy':'Threshold',polarized:'Polarized','volume-only':'Volume',gemengd:'Gemengd','mixed/onbekend':'Gemengd'}[m] || 'Gemengd'; }

function _renderWeekLoadChart(dates) {
  const canvas = document.getElementById('weekLoadChart');
  if (!canvas) return;
  const wp = S.data.weekPlan || {};
  const strDaily = (S.fullState && S.fullState.strengthDailyETL) || {};
  const dayNames = ['Ma','Di','Wo','Do','Vr','Za','Zo'];

  // Fietsbelasting: plan-TSS, met actualTSS zodra de sessie voltooid is.
  const cyclingData = dates.map(d => {
    let tss = 0;
    (wp[d]||[]).forEach(s => {
      const completed = (s.completionScore !== undefined && !s.missed) || !!s.matchedActivityId;
      tss += completed ? (s.actualTSS || s.targetTSS || s.tss || 0) : (s.targetTSS || s.tss || 0);
    });
    return Math.round(tss);
  });
  // Krachtbelasting: gelogde ETL uit de engine (Hevy), additief gestapeld op de fietsbelasting.
  const strengthData = dates.map(d => Math.round(strDaily[d] || 0));

  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue('--accent').trim() || '#012296';
  const muted  = cs.getPropertyValue('--muted').trim() || '#4a5375';
  const border = cs.getPropertyValue('--border').trim() || '#d8d1bf';
  const txt    = cs.getPropertyValue('--text').trim() || muted;
  const strColor = _hexToRgba(muted, 0.4);

  makeChart('weekLoadChart', {
    type:'bar',
    data:{ labels:dayNames, datasets:[
      { label:'Fiets',  data:cyclingData,  backgroundColor:accent,   borderRadius:5, maxBarThickness:34, stack:'load' },
      { label:'Kracht', data:strengthData, backgroundColor:strColor, borderRadius:5, maxBarThickness:34, stack:'load' }
    ]},
    options:{ responsive:true, maintainAspectRatio:false,
      plugins:{
        legend:{ display:true, position:'top', align:'end', labels:{ boxWidth:10, boxHeight:10, font:{size:10,family:'JetBrains Mono'}, color:txt } },
        tooltip:{ callbacks:{ label:c => `${c.dataset.label}: ${c.parsed.y}` } }
      },
      scales:{ x:{ stacked:true, ticks:{ font:{size:10,family:'JetBrains Mono'}, color:muted }, grid:{display:false}, border:{color:border} },
               y:{ stacked:true, beginAtZero:true, ticks:{ font:{size:9}, color:muted }, grid:{color:border}, border:{display:false} } } }
  });
}

function _renderWeekZoneMix(dates) {
  const bar = document.getElementById('wkZoneBar'), leg = document.getElementById('wkZoneLegend');
  if (!bar) return;
  const mix = computeWeekZoneMix(dates);
  if (mix.total <= 0) { bar.innerHTML = ''; if (leg) leg.textContent = 'Geen fietsplan deze week.'; return; }
  const seg = (frac,cls,lbl) => frac > 0 ? `<div class="pf-zseg ${cls}" style="flex:${frac}"><span>${lbl} ${Math.round(frac*100)}%</span></div>` : '';
  bar.innerHTML = seg(mix.low,'pf-z-low','Z2') + seg(mix.mid,'pf-z-mid','Z3') + seg(mix.high,'pf-z-high','Z4+');
  if (leg) leg.innerHTML = `<span class="pf-zdot pf-z-low"></span>Z1-2 &nbsp; <span class="pf-zdot pf-z-mid"></span>Z3 &nbsp; <span class="pf-zdot pf-z-high"></span>Z4+`;
}

function openAddSessionChooser() {
  S.pendingSession = null;
  const dates = getWeekDates(S.currentWeekOffset);
  const dayNames = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  const modal = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body  = document.getElementById('modalBody');
  if (!modal || !title || !body) return;
  title.textContent = 'Sessie toevoegen';
  const dayOpts = dates.map((d,i) => `<option value="${d}">${dayNames[i]} ${new Date(d+'T12:00:00').getDate()}</option>`).join('');
  body.innerHTML = `
    <div class="fg" style="margin-bottom:12px"><label>Dag</label><select id="chDay">${dayOpts}</select></div>
    <div class="fg"><label>Type</label>
      <div class="pf-type-pick">
        <button type="button" onclick="openAddSession(document.getElementById('chDay').value,'gym')">${_sessionIconSvg('Gym')} Kracht</button>
        <button type="button" onclick="openAddSession(document.getElementById('chDay').value,'cycling')">${_sessionIconSvg('Ride')} Fiets</button>
        <button type="button" onclick="openAddSession(document.getElementById('chDay').value,'running')">${_sessionIconSvg('Run')} Hardlopen</button>
        <button type="button" onclick="openAddSession(document.getElementById('chDay').value,'custom')">${_sessionIconSvg('Rest')} Overig</button>
      </div>
    </div>`;
  modal.classList.remove('hidden');
}

function _checkSvg(){ return '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'; }
function _zapSvg(){ return '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/></svg>'; }
function _hexToRgba(hex, a){ const h = (hex||'').replace('#',''); if (h.length !== 6) return `rgba(74,83,117,${a})`; const n = parseInt(h,16); return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`; }
function _esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _isoWeekNum(d){ const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7); }

function changeWeek(dir) {
  S.currentWeekOffset += dir;
  renderWeekGrid();
}

// ── Week availability ─────────────────────────────────────────────────────────
async function loadWeekAvailability() {
  try { S.weekAvailability = await api('/api/week-availability'); } catch {}
}

async function toggleAvailability(date, checked) {
  if (date < today()) return;   // beschikbaarheid alleen vandaag en verder
  if (checked) {
    S.weekAvailability[date] = { cycling: true, maxDuration: S.weekAvailability[date]?.maxDuration || 90 };
  } else {
    delete S.weekAvailability[date];
  }
  renderWeekGrid();
  try { await api('/api/week-availability', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(S.weekAvailability) }); }
  catch(e) { console.warn('week-availability save failed:', e.message); }
}

async function setAvailDuration(date, val) {
  const dur = parseInt(val) || 90;
  if (!S.weekAvailability[date]) S.weekAvailability[date] = { cycling: true };
  S.weekAvailability[date].maxDuration = dur;
  try { await api('/api/week-availability', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(S.weekAvailability) }); }
  catch(e) { console.warn('week-availability save failed:', e.message); }
}

async function generateCyclingPlan() {
  const btn = document.getElementById('btnGenCycling');
  btn.textContent = '⏳ Genereren...'; btn.disabled = true;
  try {
    const result = await api('/api/weekplan/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    if (result.sessions && result.sessions.length) {
      result.sessions.forEach(s => {
        if (!s.date) return;
        const existing = (S.data.weekPlan[s.date] || []).filter(x => x.type !== 'cycling' || !x.aiGenerated);
        S.data.weekPlan[s.date] = [...existing, s];
      });
      renderWeekGrid();
      btn.textContent = `✓ ${result.sessions.length} sessie(s) gegenereerd`;
    } else {
      btn.textContent = result.message || 'Geen sessies gegenereerd';
    }
  } catch(e) {
    btn.textContent = 'Fout: ' + e.message;
  }
  setTimeout(() => { btn.textContent = '🤖 Genereer fietsplan'; btn.disabled = false; }, 3000);
}

// ── AI session modal ──────────────────────────────────────────────────────────
const ZONE_COLORS = { Z1:'#93C5FD', Z2:'#3B82F6', Z3:'#F59E0B', Z4:'#EF4444', Z5:'#7C3AED' };
const ZONE_TSS_PER_H = { Z1:30, Z2:50, Z3:70, Z4:90, Z5:110 };

function isNewFormatBlock(b) { return b.duration !== undefined || b.wattMin !== undefined; }

function blockTotalDuration(b) {
  const workDur = b.duration || b.duur || 0;
  const reps    = b.herhalingen || 1;
  const recovDur = b.herstelBlok?.duration || 0;
  return reps * (workDur + recovDur);
}

function calcSessionTSS(blocks) {
  return Math.round(blocks.reduce((sum, b) => {
    const dur = b.duur || b.duration || 0;
    return sum + (ZONE_TSS_PER_H[b.zone] || 50) * (dur / 60);
  }, 0));
}

function blockColor(zone) { return ZONE_COLORS[zone] || '#888888'; }

function renderAiModal() {
  const s = S.editingAiSession?.session;
  if (!s) return;
  const blocks = S.editingAiSession.blocks;
  const newFormat = blocks.length > 0 && isNewFormatBlock(blocks[0]);

  // Show/hide editor vs detail controls
  document.getElementById('aiEditorControls').style.display = newFormat ? 'none' : '';
  document.getElementById('aiDetailClose').style.display    = newFormat ? '' : 'none';

  if (newFormat) {
    // ── New-format detail view ────────────────────────────────────────────────
    const totalMin = blocks.reduce((sum, b) => sum + blockTotalDuration(b), 0);
    const tss  = s.targetTSS || s.tss || calcSessionTSS(blocks);
    const date = S.editingAiSession.date || '';

    document.getElementById('aiSessTitle').textContent = s.title || s.titel || 'Fietssessie';
    document.getElementById('aiSessMeta').textContent  =
      `${date ? fmtD(date, true) : ''} · ${totalMin}min · ~${tss} TSS`;
    document.getElementById('aiSessTotals').textContent = '';
    document.getElementById('aiSessReden').innerHTML = s.adjustedReason
      ? `<span class="adjusted-reason-banner">↻ Bijgestuurd: ${s.adjustedReason}</span>` : '';

    // Workout-profile timeline (height = intensity, width = duration, bars from bottom)
    const bar = document.getElementById('aiBlockBar');
    bar.className = 'cyc-timeline';

    const ZONE_PCT = { Z1:20, Z2:40, Z3:65, Z4:85, Z5:100 };

    // maxWatt across all blocks + herstelBlokken
    let maxWatt = 0;
    blocks.forEach(b => {
      const w = b.wattMax || b.wattMin || 0;
      if (w > maxWatt) maxWatt = w;
      if (b.herstelBlok) {
        const hw = b.herstelBlok.wattMax || b.herstelBlok.wattMin || 0;
        if (hw > maxWatt) maxWatt = hw;
      }
    });

    // Unroll herhalingen: werk · herstel · werk · herstel · werk (last herstel omitted)
    const flatBars = [];
    blocks.forEach(b => {
      const reps     = b.herhalingen || 1;
      const workDur  = b.duration || 0;
      const recovDur = b.herstelBlok?.duration || 0;
      for (let i = 0; i < reps; i++) {
        flatBars.push({ dur: workDur, zone: b.zone, wMin: b.wattMin, wMax: b.wattMax, label: b.type || 'werk', isRecov: false });
        if (b.herstelBlok && i < reps - 1) {
          const hb = b.herstelBlok;
          flatBars.push({ dur: recovDur, zone: hb.zone, wMin: hb.wattMin, wMax: hb.wattMax, label: 'herstel', isRecov: true });
        }
      }
    });

    const totalBarMin = flatBars.reduce((s, fb) => s + fb.dur, 0) || 1;

    function barHeight(fb) {
      if (maxWatt > 0 && (fb.wMin || fb.wMax)) {
        const avg = ((fb.wMin || 0) + (fb.wMax || fb.wMin || 0)) / 2;
        return Math.min(100, Math.max(10, Math.round(avg / maxWatt * 100)));
      }
      return ZONE_PCT[fb.zone] || 20;
    }

    bar.innerHTML = flatBars.map(fb => {
      const widthPct  = (fb.dur / totalBarMin * 100).toFixed(2);
      const heightPct = barHeight(fb);
      const col       = ZONE_COLORS[fb.zone] || '#888';
      const wattTip   = (fb.wMin && fb.wMax) ? ` · ${fb.wMin}–${fb.wMax}W` : '';
      const tooltip   = fb.isRecov
        ? `herstel · ${fb.zone} · ${fb.dur}min`
        : `${fb.zone}${wattTip} · ${fb.dur}min`;
      const showLabel = parseFloat(widthPct) > 8 && !fb.isRecov;
      const labelHtml = showLabel
        ? `<span class="cyc-bar-label">${fb.label} ${fb.dur}min</span>`
        : '';
      return `<div class="cyc-bar" style="width:${widthPct}%;height:${heightPct}%;background:${col}" title="${tooltip}">${labelHtml}</div>`;
    }).join('');

    // Detail list
    const list = document.getElementById('aiBlockList');
    list.innerHTML = blocks.map(b => {
      const workDur = b.duration || 0;
      const reps    = b.herhalingen || 1;
      const wattTxt = (b.wattMin && b.wattMax) ? ` · ${b.wattMin}–${b.wattMax}W` : '';
      const prefix  = reps > 1 ? `${reps}× ` : '';
      const col     = ZONE_COLORS[b.zone] || '#888';
      let html = `<div class="cyc-detail-row">
        <div class="cyc-dot" style="background:${col}"></div>
        <span><strong>${prefix}${b.type || 'blok'}</strong> · ${workDur}min · ${b.zone}${wattTxt}</span>
      </div>`;
      if (b.herstelBlok) {
        const hb   = b.herstelBlok;
        const hCol = ZONE_COLORS[hb.zone] || '#888';
        const hW   = (hb.wattMin && hb.wattMax) ? ` · ${hb.wattMin}–${hb.wattMax}W` : '';
        html += `<div class="cyc-detail-row cyc-detail-recovery">
          <div class="cyc-dot" style="background:${hCol}"></div>
          <span>↳ herstel · ${hb.duration}min · ${hb.zone}${hW}</span>
        </div>`;
      }
      return html;
    }).join('');

  } else {
    // ── Old-format editor ─────────────────────────────────────────────────────
    const totalMin = blocks.reduce((sum, b) => sum + (b.duur || 0), 0);
    const tss = calcSessionTSS(blocks);

    document.getElementById('aiSessTitle').textContent = s.titel || 'AI Sessie';
    document.getElementById('aiSessMeta').textContent  = `${s.zone||'–'} · ${totalMin}min · ~${tss} TSS`;
    document.getElementById('aiSessTotals').textContent = `Totaal: ${totalMin} min / ~${tss} TSS`;
    document.getElementById('aiSessReden').textContent  = s.reden ? `ℹ️ ${s.reden}` : '';

    const bar = document.getElementById('aiBlockBar');
    bar.className = 'block-bar';
    bar.innerHTML = blocks.map((b, bi) => {
      const pct = totalMin > 0 ? (b.duur / totalMin * 100).toFixed(1) : 0;
      const col = b.kleur || blockColor(b.zone);
      return `<div class="block-seg" style="width:${pct}%;background:${col}" title="${b.naam} (${b.duur}min, ${b.zone})" onclick="focusBlockEditor(${bi})">${pct > 8 ? b.naam : ''}</div>`;
    }).join('');

    const list = document.getElementById('aiBlockList');
    list.innerHTML = blocks.map((b, bi) => `
      <div class="block-editor" id="blk-${bi}">
        <div class="block-editor-row">
          <div style="width:12px;height:12px;border-radius:3px;background:${b.kleur||blockColor(b.zone)};flex-shrink:0"></div>
          <input style="flex:1;min-width:80px;font-size:12px;padding:4px 7px" value="${b.naam}" onchange="updateBlock(${bi},'naam',this.value)">
          <input type="number" min="1" max="180" style="width:52px;font-size:12px;padding:4px 6px" value="${b.duur}" onchange="updateBlock(${bi},'duur',+this.value)">
          <span style="font-size:11px;color:var(--muted)">min</span>
          <select style="font-size:12px;padding:4px 6px" onchange="updateBlock(${bi},'zone',this.value)">
            ${['Z1','Z2','Z3','Z4','Z5'].map(z=>`<option ${b.zone===z?'selected':''}>${z}</option>`).join('')}
          </select>
          <button class="btn btn-secondary btn-sm" style="padding:2px 7px;font-size:11px" onclick="duplicateBlock(${bi})" title="Dupliceren">×2</button>
          <button class="btn btn-danger" style="font-size:14px" onclick="removeBlock(${bi})" title="Verwijderen">×</button>
        </div>
      </div>`).join('');
  }
}

function focusBlockEditor(bi) {
  document.getElementById('blk-'+bi)?.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function updateBlock(bi, field, value) {
  S.editingAiSession.blocks[bi][field] = value;
  if (field === 'zone') S.editingAiSession.blocks[bi].kleur = blockColor(value);
  renderAiModal();
}

function duplicateBlock(bi) {
  const copy = { ...S.editingAiSession.blocks[bi] };
  S.editingAiSession.blocks.splice(bi + 1, 0, copy);
  renderAiModal();
}

function removeBlock(bi) {
  if (S.editingAiSession.blocks.length <= 1) return;
  S.editingAiSession.blocks.splice(bi, 1);
  renderAiModal();
}

function addAiBlock() {
  S.editingAiSession.blocks.push({ naam: 'Blok', duur: 10, zone: 'Z2', kleur: blockColor('Z2') });
  renderAiModal();
}

function openAiSession(date, idx) {
  const s = S.data.weekPlan?.[date]?.[idx];
  if (!s) return;
  const blocks = JSON.parse(JSON.stringify(s.blokken || []));
  S.editingAiSession = { date, idx, session: s, blocks, originalBlocks: JSON.parse(JSON.stringify(blocks)) };
  document.getElementById('aiSessionOverlay').classList.remove('hidden');
  renderAiModal();
}

async function saveAiSession() {
  const { date, idx, session, blocks } = S.editingAiSession;
  const updated = { ...session, blokken: blocks, duur_min: blocks.reduce((s,b)=>s+(b.duur||b.duration||0),0), tss: calcSessionTSS(blocks) };
  const weekPlan = { ...(S.data.weekPlan||{}) };
  const daySessions = [...(weekPlan[date]||[])];
  daySessions[idx] = updated;
  weekPlan[date] = daySessions;
  await saveDataPartial({ weekPlan });
  S.data.weekPlan = weekPlan;
  renderWeekGrid();
  document.getElementById('aiSessionOverlay').classList.add('hidden');
  S.editingAiSession = null;
}

function resetAiSession() {
  S.editingAiSession.blocks = JSON.parse(JSON.stringify(S.editingAiSession.originalBlocks));
  renderAiModal();
}

function closeAiSession(e) {
  if (e && e.target !== document.getElementById('aiSessionOverlay')) return;
  document.getElementById('aiSessionOverlay').classList.add('hidden');
  S.editingAiSession = null;
}

function openAddSession(date, type) {
  S.pendingSession = { date, type };
  const modal = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const body = document.getElementById('modalBody');

  const typeLabels = { gym:'🏋️ Gym toevoegen', cycling:'🚴 Wielrennen toevoegen', running:'🏃 Hardlopen toevoegen', custom:'✏️ Overig toevoegen' };
  title.textContent = typeLabels[type]||'Sessie toevoegen';

  let html = '';
  if (type === 'gym') {
    html = `<div class="fg" style="margin-bottom:10px">
      <label>Spiergroep (PPL split)</label>
      <select id="mSplit"><option value="Push">Push (borst, schouders, triceps)</option><option value="Pull">Pull (rug, biceps)</option><option value="Legs">Legs (benen, billen)</option><option value="Full Body">Full Body</option></select>
    </div>`;
  } else if (type === 'custom') {
    html = `<div class="fg" style="margin-bottom:10px"><label>Omschrijving</label><input type="text" id="mDesc" placeholder="Bijv. Zwemmen, Yoga, Roeien..."></div>`;
  }
  html += `<div class="fg"><label>Beschikbare tijd (minuten)</label><input type="number" id="mDur" value="${type==='cycling'?90:type==='running'?45:60}" min="10" max="360"></div>`;
  body.innerHTML = html;
  modal.classList.remove('hidden');
}

async function confirmSession() {
  if (!S.pendingSession) return;
  const { date, type } = S.pendingSession;
  const dur = parseInt(document.getElementById('mDur').value)||60;
  const session = { type, duration: dur };

  if (type === 'gym') session.split = document.getElementById('mSplit')?.value||'Push';
  if (type === 'custom') session.description = document.getElementById('mDesc')?.value||'';

  const weekPlan = { ...(S.data.weekPlan||{}) };
  weekPlan[date] = [...(weekPlan[date]||[]), session];
  await saveDataPartial({ weekPlan });
  S.data.weekPlan = weekPlan;
  renderWeekGrid();
  closeModal();
}

async function removeSession(date, idx) {
  const s = S.data.weekPlan?.[date]?.[idx];
  if (!s) return;
  const desc = s.title || s.titel || (s.split ? s.type + ' – ' + s.split : s.description || s.type);
  const dur  = s.duration || s.duur_min;
  const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'short' });
  const choice = await openConfirm({
    title:   'Sessie verwijderen',
    message: `${dayLabel}${dur ? ' · ' + dur + ' min' : ''}: ${desc}`,
    actions: [{ label: 'Verwijderen', value: 'delete', danger: true }],
  });
  if (!choice) return;
  try {
    await api(`/api/weekplan/${date}/${idx}`, { method: 'DELETE' });
    await loadUserData();
  } catch (err) { console.error('removeSession mislukt:', err); }
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.add('hidden');
  S.pendingSession = null;
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function saveDataPartial(partial) {
  await api('/api/data', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(partial) });
  S.data = { ...S.data, ...partial };
}

// ── Slaap invoer ─────────────────────────────────────────────────────────────

let _sleepQuality = 0;

function initSleepStars() {
  const el = document.getElementById('sleepStars');
  if (!el) return;
  el.innerHTML = '';
  for (let i = 1; i <= 5; i++) {
    const s = document.createElement('span');
    s.textContent = i <= _sleepQuality ? '★' : '☆';
    s.style.cursor = 'pointer';
    s.style.color = i <= _sleepQuality ? 'var(--color-accent,#f97316)' : 'var(--muted)';
    s.onclick = () => { _sleepQuality = i; initSleepStars(); };
    el.appendChild(s);
  }
}

(function() {
  const btn = document.getElementById('sleepQualityInfo');
  const tip = document.getElementById('sleepQualityTooltip');
  if (!btn || !tip) return;
  btn.addEventListener('click', e => {
    e.stopPropagation();
    if (tip.style.display === 'none') {
      const r = btn.getBoundingClientRect();
      tip.style.left = Math.min(r.left, window.innerWidth - 296) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
      tip.style.display = 'block';
    } else {
      tip.style.display = 'none';
    }
  });
  document.addEventListener('click', () => {
    if (tip) tip.style.display = 'none';
  });
})();

async function saveSleep() {
  const hours = parseFloat(document.getElementById('sleepHours')?.value);
  if (isNaN(hours) || hours < 0 || hours > 14) return;
  const quality = _sleepQuality || 3;
  const today = new Date().toISOString().split('T')[0];
  await api('/api/sleep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today, hours, quality }) });
  await loadFullState();
}

function renderSleepDebt(state) {
  const el = document.getElementById('sleepDebtDisplay');
  if (!el) return;
  const sm = state?.sleepMetrics;
  if (!sm) { el.textContent = ''; return; }
  const catColors = { optimal: '#4ade80', low: '#a3e635', moderate: '#fb923c', high: '#f87171' };
  const catLabels = { optimal: 'Optimaal', low: 'Laag', moderate: 'Matig', high: 'Hoog' };
  el.innerHTML =
    'Slaapschuld (14d): <strong style="color:' + catColors[sm.debtCategory] + '">' +
    sm.sleepDebt.toFixed(1) + 'u · ' + catLabels[sm.debtCategory] + '</strong>' +
    ' &nbsp;·&nbsp; Slaapbehoefte: ' + sm.sleepNeed + 'u' +
    (sm.reliable ? '' : ' <span style="color:var(--muted)">(default, te weinig data)</span>');
}

async function saveQuick() {
  const w = document.getElementById('qWeight').value;
  const note = document.getElementById('qNote').value;
  const updates = {};
  if (w) {
    updates.weight = { ...(S.data.weight||{}), [today()]: w };
    document.getElementById('sWeight').textContent = `${w}kg`;
  }
  if (Object.keys(updates).length) await saveDataPartial(updates);
  if (note) document.getElementById('analyseNote').value = note;
  const b = document.getElementById('btnQSave');
  b.textContent='✓ Opgeslagen'; b.className='btn btn-success';
  setTimeout(()=>{b.textContent='Opslaan';b.className='btn btn-primary';},2000);
}

async function saveManualNutr() {
  const nutr = { kcal:document.getElementById('mKcal').value, protein:document.getElementById('mProt').value, carbs:document.getElementById('mCarb').value, fat:document.getElementById('mFat').value };
  await api('/api/nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today(), nutr }) });
  S.data.nutrition = { ...(S.data.nutrition || {}), [today()]: nutr };
  const b = document.getElementById('btnManualNutr');
  b.textContent='✓ Opgeslagen'; b.className='btn btn-success mt-3';
  setTimeout(()=>{b.textContent='Opslaan voor vandaag';b.className='btn btn-primary mt-3';},2000);
  renderNutrHistory();
}

async function saveGoals() {
  const goals = { mode:document.getElementById('gMode').value, primary:document.getElementById('gPrimary').value, weightTarget:document.getElementById('gWeight').value, timeline:document.getElementById('gTimeline').value, notes:document.getElementById('gNotes').value };
  await saveDataPartial({ goals });
  if (goals.weightTarget) document.getElementById('sWeightSub').textContent = `doel: ${goals.weightTarget}kg`;
  const b = document.getElementById('btnGoals');
  b.textContent='✓ Opgeslagen'; b.className='btn btn-success mt-3';
  setTimeout(()=>{b.textContent='Doelen opslaan';b.className='btn btn-primary mt-3';},2000);
}

async function saveSettings() {
  const existing = S.data.settings || {};
  const lthrRaw = document.getElementById('setting-lthr')?.value;
  const settings = { ...existing, unreliablePowerStart:document.getElementById('sPwrStart').value, unreliablePowerEnd:document.getElementById('sPwrEnd').value, ftp:parseInt(document.getElementById('sFtp').value)||280, lthr: lthrRaw ? parseInt(lthrRaw) : null };
  await saveDataPartial({ settings });
  showSaved('btnSettings', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
}

async function saveSettingsZones() {
  const existing = S.data.settings || {};
  const zones = { z1: parseInt(document.getElementById('sZ1').value)||55, z2: parseInt(document.getElementById('sZ2').value)||75, z3: parseInt(document.getElementById('sZ3').value)||90, z4: parseInt(document.getElementById('sZ4').value)||105 };
  const settings = { ...existing, zones };
  await saveDataPartial({ settings });
  showSaved('btnSaveZones', 'Zones opslaan', 'btn btn-primary mt-3 btn-sm');
}

async function saveSettingsFysiologie() {
  const existing = S.data.settings || {};
  const hrZones = ['sHrZ1','sHrZ2','sHrZ3','sHrZ4']
    .map((id, i) => parseInt(document.getElementById(id)?.value) || [60,70,80,90][i]);
  const settings = { ...existing, hrMax: parseInt(document.getElementById('sHrMax').value)||185, targetWeightLossPerWeek: parseFloat(document.getElementById('sWeightLoss').value)||0.3, hrZones };
  await saveDataPartial({ settings });
  window._admSettings = { ...(window._admSettings || {}), ...settings };
  showSaved('btnSaveFys', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
}

async function saveSettingsKracht() {
  const existing = S.data.settings || {};
  const settings = { ...existing, defaultRPE: parseFloat(document.getElementById('sDefaultRPE').value)||7.5 };
  await saveDataPartial({ settings });
  showSaved('btnSaveKracht', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
}

async function saveSettingsAlerts() {
  const existing = S.data.settings || {};
  const alerts = { tsbWarn: parseInt(document.getElementById('sTsbWarn').value)||-20, tsbCrit: parseInt(document.getElementById('sTsbCrit').value)||-30, acwrWarn: parseFloat(document.getElementById('sAcwrWarn').value)||1.3, acwrCrit: parseFloat(document.getElementById('sAcwrCrit').value)||1.5, monotonyWarn: parseFloat(document.getElementById('sMonoWarn').value)||2.0 };
  const settings = { ...existing, alerts };
  await saveDataPartial({ settings });
  showSaved('btnSaveAlerts', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
}

function showSaved(btnId, origText, origClass) {
  const b = document.getElementById(btnId);
  if (!b) return;
  b.textContent = '✓ Opgeslagen'; b.className = 'btn btn-success mt-3 btn-sm';
  setTimeout(() => { b.textContent = origText; b.className = origClass; }, 2000);
}

async function recalibrate() {
  const btn = document.getElementById('btnRecalibrate');
  btn.textContent = 'Bezig...'; btn.disabled = true;
  try {
    const r = await api('/api/calibration/recompute', { method: 'POST' });
    renderCalibrationInfo(r);
  } catch(e) {
    document.getElementById('calibrationInfo').textContent = 'Mislukt: ' + e.message;
  }
  btn.textContent = '↻ Herbereken kalibratie'; btn.disabled = false;
}

function renderCalibrationInfo(r) {
  const el = document.getElementById('calibrationInfo');
  if (!el || !r) return;
  const rel = r.reliable ? '<span style="color:var(--green)">betrouwbaar</span>' : '<span style="color:var(--accent)">onvoldoende data</span>';
  el.innerHTML = `Factor: <strong style="color:var(--text)">${r.factor}</strong> &nbsp;·&nbsp; ${r.count} ritten &nbsp;·&nbsp; ${rel}`;
}

function renderStrengthOverview(state) {
  const sm = state.strengthMetrics;
  const el = document.getElementById('strengthOverview');
  if (!el) return;
  if (!sm) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const mg = sm.muscleGroups || {};
  const days = sm.daysSinceLastSession ?? '–';
  const avg = sm.avgWeeklyLoad4w ? sm.avgWeeklyLoad4w.toFixed(0) : '–';
  const groups = [
    { key: 'lower_body', label: 'Benen' },
    { key: 'push', label: 'Push' },
    { key: 'pull', label: 'Pull' },
    { key: 'core', label: 'Core' },
  ];
  const rows = groups.map(g => {
    const grpData = mg[g.key];
    const load = grpData?.weeklyLoad ?? 0;
    return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px"><span style="color:var(--muted)">${g.label}</span><span style="font-weight:600">${load > 0 ? load.toFixed(0) + ' kg·reps/w' : '–'}</span></div>`;
  }).join('');
  document.getElementById('strengthOverviewContent').innerHTML =
    `<div style="display:flex;gap:16px;margin-bottom:10px;font-size:12px">
      <span style="color:var(--muted)">Laatste sessie: <strong style="color:var(--text)">${days === '–' ? '–' : days + 'd geleden'}</strong></span>
      <span style="color:var(--muted)">Gem. 4w volume: <strong style="color:var(--text)">${avg} kg·reps/w</strong></span>
    </div>${rows}`;
}

function togglePatternForm() { document.getElementById('patternForm').classList.toggle('hidden'); }

async function addPattern() {
  const p = { day:document.getElementById('npDay').value, type:document.getElementById('npType').value, description:document.getElementById('npDesc').value, duration:parseInt(document.getElementById('npDur').value)||60 };
  const patterns = [...(S.data.patterns||[]), p];
  await saveDataPartial({ patterns });
  document.getElementById('patternForm').classList.add('hidden');
  document.getElementById('npDesc').value = '';
  renderPatterns();
}

async function removePattern(idx) {
  const patterns = (S.data.patterns||[]).filter((_,i)=>i!==idx);
  await saveDataPartial({ patterns });
  renderPatterns();
}

// ── Yazio upload ──────────────────────────────────────────────────────────────
const uz = document.getElementById('uploadZone');
uz.addEventListener('dragover', e=>{e.preventDefault();uz.classList.add('over');});
uz.addEventListener('dragleave', ()=>uz.classList.remove('over'));
uz.addEventListener('drop', e=>{e.preventDefault();uz.classList.remove('over');handleFile(e.dataTransfer.files[0]);});

async function handleFile(file) {
  if(!file) return;
  const msg = document.getElementById('parseMsg');
  msg.className='alert alert-info mt-2'; msg.textContent='📸 Verwerken...';
  document.getElementById('parsedPreview').classList.add('hidden');
  const fd = new FormData(); fd.append('screenshot',file);
  try {
    const nutr = await fetch('/api/nutrition/parse-screenshot',{method:'POST',body:fd}).then(r=>r.json());
    if(nutr.error) throw new Error(nutr.error);
    S.parsedNutr = nutr;
    msg.className='alert alert-success mt-2'; msg.textContent='✓ Macros herkend — controleer en sla op';
    document.getElementById('parsedVals').innerHTML = [
      {num:nutr.kcal,lbl:'kcal',c:'var(--accent)'},{num:nutr.protein,lbl:'eiwit (g)',c:'var(--text)'},
      {num:nutr.carbs,lbl:'kh (g)',c:'var(--text)'},{num:nutr.fat,lbl:'vet (g)',c:'var(--text)'}
    ].map(v=>`<div class="parsed-val"><div class="parsed-num" style="color:${v.c}">${v.num}</div><div class="parsed-lbl">${v.lbl}</div></div>`).join('');
    document.getElementById('parsedPreview').classList.remove('hidden');
  } catch(e) { msg.className='alert alert-error mt-2'; msg.textContent='✗ Mislukt: '+e.message; }
}

async function confirmNutr() {
  if(!S.parsedNutr) return;
  const nutr = S.parsedNutr;
  await api('/api/nutrition', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: today(), nutr }) });
  S.data.nutrition = { ...(S.data.nutrition || {}), [today()]: nutr };
  document.getElementById('parsedPreview').classList.add('hidden');
  document.getElementById('parseMsg').className='alert alert-success mt-2';
  document.getElementById('parseMsg').textContent='✓ Opgeslagen voor vandaag';
  S.parsedNutr=null; renderNutrHistory();
  document.getElementById('mKcal').value=nutr.kcal||'';
  document.getElementById('mProt').value=nutr.protein||'';
  document.getElementById('mCarb').value=nutr.carbs||'';
  document.getElementById('mFat').value=nutr.fat||'';
}

function cancelNutr() { S.parsedNutr=null; document.getElementById('parsedPreview').classList.add('hidden'); }

// ── Analysis ──────────────────────────────────────────────────────────────────
async function runAnalysis() {
  const btn = document.getElementById('btnAnalyse');
  btn.textContent='Analyse genereren...'; btn.disabled=true;
  document.getElementById('analysisResult').classList.add('hidden');
  document.getElementById('analyseEmpty').classList.remove('hidden');
  try {
    const r = await api('/api/analyse', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        hevyWorkouts: S.hevyWorkouts,
        goals: S.data.goals, patterns: S.data.patterns,
        nutrition: S.data.nutrition, weight: S.data.weight,
        weekPlan: S.data.weekPlan,
        todayNote: document.getElementById('analyseNote').value || document.getElementById('qNote').value,
        athlete: S.athlete,
        settings: S.data.settings,
      })
    });
    document.getElementById('analysisText').textContent = r.analysis;
    document.getElementById('analysisResult').classList.remove('hidden');
    document.getElementById('analyseEmpty').classList.add('hidden');
  } catch(e) {
    document.getElementById('analyseEmpty').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
  btn.textContent='⚡ Genereer analyse'; btn.disabled=false;
}

// ── Tabs ──────────────────────────────────────────────────────────────────────
let currentTab = 'overview';

const TAB_INSIGHTS = {
  overview:    ['vandaag', 'integratie'],
  activiteiten:['activiteiten'],
  nutrition:   ['voeding'],
  week:        ['week', 'weekplanning'],
  voortgang:   ['trends', 'voorspelling'],
};

const TAB_SLUGS = {
  overview: '', week: 'week', activiteiten: 'activiteiten', nutrition: 'voeding',
  analyse: 'coach', planning: 'doelen', voortgang: 'trends', instellingen: 'instellingen'
};
const TAB_TITLES = {
  overview: 'Vandaag', week: 'Week', activiteiten: 'Activiteiten', nutrition: 'Voeding',
  analyse: 'Coach', planning: 'Doelen', voortgang: 'Trends', instellingen: 'Instellingen'
};
const SLUG_TABS = Object.fromEntries(Object.entries(TAB_SLUGS).map(([k, v]) => [v, k]));
function tabPath(name) { return '/' + (TAB_SLUGS[name] || ''); }
function tabFromPath(pathname) {
  const slug = (pathname || '/').replace(/^\/+|\/+$/g, '');
  const name = SLUG_TABS[slug];
  return (name && document.getElementById('tab-' + name)) ? name : null;
}

let _suppressUrlPush = false;

function showTab(name, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(el=>el.classList.add('hidden'));
  document.querySelectorAll('.nav-item, .nav-item-small, .nav-sm, .bn-item').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+name).classList.remove('hidden');
  // Sync actief-status op tabnaam zodat sidebar EN bottom-nav correct oplichten
  document.querySelectorAll('[data-tab="'+name+'"]').forEach(el=>el.classList.add('active'));
  currentTab = name;
  const _p = tabPath(name);
  if (!_suppressUrlPush && location.pathname !== _p) history.pushState(null, '', _p);
  document.title = TAB_TITLES[name] ? TAB_TITLES[name] + ' — PeakForm' : 'PeakForm';
  if (name === 'activiteiten') renderActivitiesTab();
  if (name === 'instellingen') renderSourcesStatus();
  if (name === 'week') renderWeekGrid();
  if (name !== 'analyse') {
    _coachReturnContext = null;
  } else {
    const tabEl = document.getElementById('tab-analyse');
    const existing = tabEl.querySelector('.ap-back-btn');
    if (existing) existing.remove();
    if (_coachReturnContext) {
      const backBtn = document.createElement('button');
      backBtn.className = 'ap-back-btn';
      backBtn.style.cssText = 'margin-bottom:12px;display:block';
      backBtn.textContent = '← Terug naar ' + _coachReturnContext.label;
      backBtn.onclick = () => { const ctx = _coachReturnContext; _coachReturnContext = null; ctx.action(); };
      tabEl.insertBefore(backBtn, tabEl.firstChild);
    }
  }
  // Auto-load trends charts when Trends tab is opened
  if (name === 'voortgang' && !S._chartsLoaded) {
    S._chartsLoaded = true;
    loadCharts();
  }

  // Load AI insights for this tab (once per session unless forced)
  const pages = TAB_INSIGHTS[name] || [];
  pages.forEach(p => { if (!S.insightLoaded[p]) loadInsight(p); });
}

function showTabFromUrl(name) {
  _suppressUrlPush = true;
  try { showTab(name); } finally { _suppressUrlPush = false; }
}

async function loadInsight(page, force = false) {
  const textEl = document.getElementById('insight-text-' + page);
  const metaEl = document.getElementById('insight-meta-' + page);
  if (!textEl) return;
  const cached = !force && S.data && S.data.aiInsights && S.data.aiInsights[page];
  if (cached && cached.text) {
    if (page === 'vandaag' && cached.briefing) {
      renderHeroBriefing(textEl, cached.briefing);
    } else {
      textEl.innerHTML = renderMarkdown(cached.text);
    }
    if (metaEl) metaEl.textContent = 'Gecached · vernieuwen...';
  } else {
    textEl.innerHTML = '<div class="insight-loading">AI-inzicht laden...</div>';
    if (metaEl) metaEl.textContent = '';
  }
  try {
    const result = await api('/api/insights/' + page, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });

    // Vandaag: gestructureerde hero-briefing (kop + accent + body met accentwoorden)
    if (page === 'vandaag') {
      if (result.empty) {
        textEl.textContent = result.text;
        textEl.style.color = 'var(--muted)';
      } else if (result.briefing) {
        renderHeroBriefing(textEl, result.briefing);
      } else {
        textEl.textContent = result.text;
        textEl.style.color = '';
      }
      if (metaEl && !result.empty) metaEl.textContent = result.cached
        ? `Gecached · ${new Date(result.cachedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`
        : 'Zojuist gegenereerd';
      if (!result.empty) S.insightLoaded[page] = true;
      return;
    }

    if (result.empty) {
      textEl.textContent = result.text;
      textEl.style.color = 'var(--muted)';
      if (metaEl) metaEl.textContent = '';
    } else {
      textEl.innerHTML = renderMarkdown(result.text);
      textEl.style.color = '';
      const coachBtn = document.createElement('button');
      coachBtn.className = 'ap-coach-link';
      coachBtn.textContent = 'Verdiep in Coach →';
      coachBtn.onclick = () => {
        _coachReturnContext = { label: 'Vandaag', action: () => showTab('vandaag', document.querySelector('.nav-item[onclick*="vandaag"]')) };
        showTab('analyse', document.querySelector('.nav-item[onclick*="analyse"]'));
      };
      textEl.parentElement.appendChild(coachBtn);
      if (metaEl) metaEl.textContent = result.cached
        ? `Gecached · ${new Date(result.cachedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`
        : 'Zojuist gegenereerd';
      S.insightLoaded[page] = true;
    }
  } catch(e) {
    textEl.textContent = 'Briefing laden mislukt: ' + e.message;
    textEl.style.color = 'var(--muted)';
  }
}

// Zet een veilige markdown-subset om naar HTML. Escapet eerst alle HTML-tekens,
// zodat AI-tekst nooit rauwe HTML/script kan injecteren (zelfde XSS-principe als renderHeroBriefing).
function renderMarkdown(raw) {
  if (!raw) return '';
  const esc = String(raw)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const lines = esc.split('\n');
  const out = [];
  let inList = false;
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };

  for (let line of lines) {
    const t = line.trim();
    if (t === '') { closeList(); continue; }

    // Koppen
    let m;
    if ((m = t.match(/^###\s+(.*)$/))) { closeList(); out.push('<h4>' + inline(m[1]) + '</h4>'); continue; }
    if ((m = t.match(/^##\s+(.*)$/)))  { closeList(); out.push('<h3>' + inline(m[1]) + '</h3>'); continue; }
    if ((m = t.match(/^#\s+(.*)$/)))   { closeList(); out.push('<h3>' + inline(m[1]) + '</h3>'); continue; }

    // Lijst-items
    if ((m = t.match(/^[-*]\s+(.*)$/))) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + inline(m[1]) + '</li>');
      continue;
    }

    // Gewone alinea-regel
    closeList();
    out.push('<p>' + inline(t) + '</p>');
  }
  closeList();
  return out.join('');

  // Inline-opmaak binnen een regel: vet en cursief. Input is al HTML-geëscaped.
  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }
}

// Rendert de hero-briefing veilig: kop (Inter Tight) + kopAccent (serif italic), body met geaccentueerde fragmenten.
// Gebruikt uitsluitend DOM-API's (createTextNode / span), nooit innerHTML met AI-tekst — geen XSS-vector.
function renderHeroBriefing(el, b) {
  el.style.color = '';
  el.textContent = '';
  // Kop + serif-accent
  el.appendChild(document.createTextNode(b.kop ? b.kop + ' ' : ''));
  if (b.kopAccent) {
    const acc = document.createElement('span');
    acc.className = 'hero-kop-accent';
    acc.textContent = b.kopAccent;
    el.appendChild(acc);
    el.appendChild(document.createTextNode('.'));
  }
  // Body met geaccentueerde fragmenten
  const body = document.createElement('span');
  body.className = 'hero-body';
  const accents = Array.isArray(b.accents) ? b.accents.filter(a => a && b.body.includes(a)) : [];
  if (!accents.length) {
    body.textContent = b.body || '';
  } else {
    // Splits body op de accent-fragmenten, behoud volgorde, injecteer spans veilig
    let rest = b.body || '';
    // bouw een gecombineerde zoekstrategie: herhaal tot geen accent meer voorkomt
    const pieces = [];
    let guard = 0;
    while (rest.length && guard < 200) {
      guard++;
      // vind het vroegst voorkomende accent in rest
      let bestIdx = -1, bestAcc = null;
      for (const a of accents) {
        const idx = rest.indexOf(a);
        if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) { bestIdx = idx; bestAcc = a; }
      }
      if (bestIdx === -1) { pieces.push({ t: rest, acc: false }); break; }
      if (bestIdx > 0) pieces.push({ t: rest.slice(0, bestIdx), acc: false });
      pieces.push({ t: bestAcc, acc: true });
      rest = rest.slice(bestIdx + bestAcc.length);
    }
    pieces.forEach(p => {
      if (p.acc) {
        const s = document.createElement('span');
        s.className = 'hero-accent';
        s.textContent = p.t;
        body.appendChild(s);
      } else {
        body.appendChild(document.createTextNode(p.t));
      }
    });
  }
  el.appendChild(body);
}

async function saveSettingsMeals() {
  const btn = document.getElementById('btnSaveMeals');
  btn.textContent = 'Opslaan...'; btn.disabled = true;
  try {
    const mealTimes = {
      weekdayBreakfast: document.getElementById('mtWdBreakfast').value,
      weekdaySnack:     document.getElementById('mtWdSnack').value,
      weekdayLunch:     document.getElementById('mtWdLunch').value,
      weekdayDinner:    document.getElementById('mtWdDinner').value,
      weekendBreakfast: document.getElementById('mtWeBreakfast').value,
      weekendSnack:     document.getElementById('mtWeSnack').value,
      weekendLunch:     document.getElementById('mtWeLunch').value,
      weekendDinner:    document.getElementById('mtWeDinner').value,
    };
    await saveDataPartial({ settings: { mealTimes } });
    btn.textContent = '✓ Opgeslagen'; btn.disabled = false;
    setTimeout(() => { btn.textContent = 'Opslaan'; }, 2000);
  } catch(e) {
    btn.textContent = 'Fout: ' + e.message; btn.disabled = false;
  }
}

async function saveEventPlanning() {
  const eventDate = document.getElementById('event-date-input').value;
  const eventName = document.getElementById('event-name-input').value;
  try {
    await api('/api/goals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventDate, eventName }) });
    S.data.goals = { ...(S.data.goals || {}), eventDate, eventName };
    showSaved('btnSaveEvent', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
  } catch(e) {
    const b = document.getElementById('btnSaveEvent');
    if (b) { b.textContent = 'Fout: ' + e.message; }
  }
}

async function savePplPattern() {
  const splits = ['push', 'pull', 'legs'];
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const pplPatterns = [];
  splits.forEach(split => {
    days.forEach(day => {
      if (document.getElementById(`ppl-${split}-${day}`)?.checked) {
        pplPatterns.push({ day, type: 'gym', split });
      }
    });
  });
  try {
    const existing = (S.data.patterns || []).filter(p => !(p.type === 'gym' && p.split));
    const patterns = [...existing, ...pplPatterns];
    await saveDataPartial({ patterns });
    showSaved('btnSavePpl', 'Opslaan', 'btn btn-primary mt-3 btn-sm');
  } catch(e) {
    const b = document.getElementById('btnSavePpl');
    if (b) { b.textContent = 'Fout: ' + e.message; }
  }
}

// ── Help modal ────────────────────────────────────────────────────────────────
const HELP_TEXTS = {
  overview: { title: 'Vandaag — Help', content: `<strong>Readiness score (0–100)</strong><br>Samengesteld uit TSB, ACWR, monotony, voedingsstatus en krachtstatus.<br><br><strong>ATL</strong> — Acute Training Load: gemiddelde belasting afgelopen 7 dagen.<br><strong>CTL</strong> — Chronic Training Load: gemiddelde belasting afgelopen 42 dagen.<br><strong>TSB</strong> — Training Stress Balance: CTL − ATL. Positief = uitgerust, negatief = vermoeid.<br><strong>ACWR</strong> — Acute:Chronic Workload Ratio. Boven 1.5 = verhoogd blessurerisico.<br><strong>Monotony</strong> — Maat voor trainingsafwisseling. Boven 2.0 = te eentonig.` },
  week: { title: 'Week — Help', content: `<strong>Weekplanning</strong><br>Plan trainingen door op de + knoppen te klikken.<br><br><strong>Sessietypen</strong><br>🏋️ Gym — kracht (Push / Pull / Legs / Full Body)<br>🚴 Wielrennen — duur of intervaltraining<br>🏃 Hardlopen — easy run of intervallen<br>✏️ Overig — zwemmen, yoga, etc.<br><br>Gebruik de pijlen om naar andere weken te navigeren.` },
  activiteiten: { title: 'Activiteiten — Help', content: `<strong>Filter</strong><br>Gebruik de filterknopen om activiteiten te filteren:<br>• <strong>Alles</strong> — Strava-activiteiten én Hevy gym workouts<br>• <strong>Fietsen</strong> — alleen wielrenactiviteiten (buiten + trainer)<br>• <strong>Lopen</strong> — alleen hardloopactiviteiten<br>• <strong>Gym</strong> — alleen Hevy workouts met progressie-analyse<br><br><strong>Progressie-analyse</strong><br>Toont 1RM-trend per oefening via Epley-formule (minimaal 2 sessies nodig).` },
  nutrition: { title: 'Voeding — Help', content: `<strong>Voeding bijhouden</strong><br>Importeer een Yazio screenshot of voer macros handmatig in.<br><br><strong>Macros</strong><br>• Calorieën (kcal) — totale energie-inname<br>• Eiwit (g) — spieronderhoud en groei<br>• Koolhydraten (g) — primaire energiebron<br>• Vet (g) — hormonen en vetoplosbare vitaminen<br><br><strong>14-dagenkaart</strong><br>Overzicht van de afgelopen 14 dagen inclusief gewicht per dag.` },
  analyse: { title: 'Coach — Help', content: `<strong>AI Coach</strong><br>Genereert gepersonaliseerd trainingsadvies op basis van al je data.<br><br><strong>Wat wordt meegenomen</strong><br>• Trainingsgeschiedenis (Strava)<br>• Gym workouts (Hevy)<br>• Voeding en gewicht<br>• Doelen en weekpatronen<br>• Literatuur (wetenschappelijke context)<br><br><strong>Tip</strong><br>Voeg een notitie toe voor specifieke vragen of aanvullingen (blessures, afwijkingen).` },
  planning: { title: 'Doelen — Help', content: `<strong>Doelen instellen</strong><br>Stel je primaire trainingsdoel in. Dit wordt meegenomen in de AI-analyse.<br><br><strong>Velden</strong><br>• Primair doel — wat wil je bereiken?<br>• Doelgewicht — streefgewicht in kg<br>• Tijdlijn — wanneer bereikt?<br>• Extra context — blessures, events, beperkingen<br><br><strong>Vaste patronen</strong><br>Wekelijks terugkerende trainingen als basis voor weekplanning en analyse.` },
  voortgang: { title: 'Trends — Help', content: `<strong>Grafieken</strong><br>Visualiseer je trainingsdata over tijd.<br><br><strong>Beschikbare grafieken</strong><br>• <strong>Gewicht</strong> — trend over de geselecteerde periode<br>• <strong>ATL / CTL / TSB</strong> — trainingsbelasting (volgt periodeselectie)<br>• <strong>Wekelijks volume</strong> — uren en sessies per week<br>• <strong>Voeding</strong> — calorieën en eiwit per dag<br>• <strong>Vermogen</strong> — gemiddeld wattage per maand<br><br>Selecteer een periode en klik op Laden.` },
  instellingen: { title: 'Settings — Help', content: `<strong>Instellingen</strong><br>Configureer je dashboard en trainingszones.<br><br><strong>Secties</strong><br>• Trainingszones — FTP-percentages per zone<br>• Fysiologie — max hartslag, gewichtsverlies doel<br>• Krachttraining — standaard RPE<br>• Alertdrempels — wanneer worden waarschuwingen getoond?<br>• Powermeter & FTP — onbetrouwbare periode en handmatige FTP<br>• Gewicht importeren — Garmin CSV import<br>• Literatuur — wetenschappelijke bronnen voor AI-analyse` },
};

function openHelp() {
  const h = HELP_TEXTS[currentTab] || { title: 'Help', content: 'Geen helptekst beschikbaar voor deze pagina.' };
  document.getElementById('helpTitle').textContent = h.title;
  document.getElementById('helpContent').innerHTML = h.content;
  document.getElementById('helpOverlay').classList.remove('hidden');
}

function closeHelp(e) {
  if (e && e.target !== document.getElementById('helpOverlay')) return;
  document.getElementById('helpOverlay').classList.add('hidden');
}

// ── Activiteiten-tab (strikte uitvoeringspagina) ──────────────────────────────
let currentActivityFilter = 'alles';
let activityWindowDays = 21; // 0 = alles
function setActivityWindow(days) {
  activityWindowDays = days;
  document.querySelectorAll('#actWindowSeg .pf-win-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.days) === days);
  });
  renderActivityFeed();
}

function _last7Cut() { return Date.now() - 7 * 86400000; }
function _hevyDurMin(w) {
  if (w.end_time && w.start_time) {
    const d = Math.round((new Date(w.end_time) - new Date(w.start_time)) / 60000);
    return (d > 0 && d < 600) ? d : null;
  }
  return null;
}
function _hevySetCount(w) {
  return (w.exercises || []).reduce((n, e) => n + (e.sets || []).filter(s => s.reps != null).length, 0);
}

const PF_SPORT_ICONS = {
  bike: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/></svg>',
  run:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/><path d="M16 17h4"/><path d="M4 13h4"/></svg>',
  gym:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z"/><path d="m2.5 21.5 1.4-1.4"/><path d="m20.1 3.9 1.4-1.4"/><path d="M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z"/><path d="m9.6 14.4 4.8-4.8"/></svg>',
};
function _sportIcon(type, kind) {
  if (kind === 'gym') return PF_SPORT_ICONS.gym;
  if (type === 'Run' || type === 'TrailRun') return PF_SPORT_ICONS.run;
  return PF_SPORT_ICONS.bike;
}

// 90-dagen-best badge: afgeleid uit dezelfde /api/state/mmp-curve aggregatie als Trends
function _nearestSample(arr, targetDur) {
  if (!arr || !arr.length) return null;
  let best = null, bestDiff = Infinity;
  for (const p of arr) {
    if (p.watts == null) continue;
    const diff = Math.abs(p.dur - targetDur);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return (best && bestDiff <= Math.max(2, targetDur * 0.15)) ? best : null;
}
function buildMmpBadgeMap(curve) {
  const map = {};
  if (!curve) return map;
  const targets = [{ s: 1200, l: '20-min' }, { s: 300, l: '5-min' }, { s: 60, l: '1-min' }, { s: 5, l: '5-sec' }];
  for (const t of targets) {
    const r = _nearestSample(curve.recent, t.s);
    const p = _nearestSample(curve.previous, t.s);
    let holder = null, w = 0;
    if (r) { holder = r.activityId; w = r.watts; }
    if (p && p.watts > w) { holder = p.activityId; w = p.watts; }
    if (holder != null && w > 0) {
      const key = String(holder);
      const cur = map[key];
      if (!cur || t.s > cur.rank) map[key] = { label: t.l, watts: Math.round(w), rank: t.s };
    }
  }
  return map;
}
async function ensureMmpCurve() {
  if (S._mmpBadgeMap !== undefined) return;
  S._mmpBadgeMap = null; // 'in behandeling', voorkomt dubbele fetch
  try {
    const d = await api('/api/state/mmp-curve');
    S._mmpBadgeMap = buildMmpBadgeMap(d);
  } catch (e) {
    S._mmpBadgeMap = {};
  }
}

function _unifiedFeed() {
  const items = [];
  (S.recentActs || []).forEach(a => items.push({ kind: 'strava', date: a.start_date, a }));
  (S.hevyWorkouts || []).forEach(w => items.push({ kind: 'gym', date: w.start_time, w }));
  items.sort((x, y) => new Date(y.date) - new Date(x.date));
  return items;
}
function _filterFeed(items, type) {
  if (type === 'fietsen') return items.filter(i => i.kind === 'strava' && (i.a.type === 'Ride' || i.a.type === 'VirtualRide'));
  if (type === 'lopen')   return items.filter(i => i.kind === 'strava' && (i.a.type === 'Run' || i.a.type === 'TrailRun'));
  if (type === 'gym')     return items.filter(i => i.kind === 'gym');
  return items;
}

function feedRow(item) {
  const badgeMap = S._mmpBadgeMap || {};
  let icon, name, dateStr, primary, secondary = '', clickAttr = '', badge = '';
  if (item.kind === 'gym') {
    const w = item.w;
    icon = _sportIcon(null, 'gym');
    name = w.name || 'Workout';
    dateStr = fmtD(w.start_time);
    const sets = _hevySetCount(w);
    const dur = _hevyDurMin(w);
    primary = sets ? `${sets} sets` : '–';
    secondary = dur ? `${dur} min` : '';
    if (w.id) clickAttr = `onclick="navigateToWorkout('${w.id}')"`;
  } else {
    const a = item.a;
    const isCyc = a.type === 'Ride' || a.type === 'VirtualRide';
    const isRun = a.type === 'Run' || a.type === 'TrailRun';
    icon = _sportIcon(a.type, 'strava');
    name = a.name || 'Activiteit';
    dateStr = fmtD(a.start_date);
    primary = a.distance > 0 ? `${(a.distance / 1000).toFixed(1)} km` : fmtT(a.moving_time);
    const bits = [];
    if (a.distance > 0) bits.push(fmtT(a.moving_time));
    if (isCyc && a.average_watts) bits.push(`${Math.round(a.average_watts)}W`);
    if (isRun && a.distance > 0 && a.moving_time) {
      const sec = a.moving_time / (a.distance / 1000);
      bits.push(`${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}/km`);
    }
    secondary = bits.join(' · ');
    const _CLICK = new Set(['Ride', 'VirtualRide', 'Run', 'TrailRun']);
    if (_CLICK.has(a.type)) clickAttr = `onclick="navigateToActivity(${a.id})" data-strava-id="${a.id}"`;
    if (isCyc) {
      const b = badgeMap[String(a.id)];
      if (b) badge = `<div class="pf-feed-badge">★ beste ${b.label} · 90d</div>`;
    }
  }
  return `<div class="pf-feed-row${clickAttr ? ' clickable' : ''}" ${clickAttr}>     <div class="pf-feed-icon">${icon}</div>     <div class="pf-feed-main"><div class="pf-feed-name">${name}</div><div class="pf-feed-date">${dateStr}</div>${badge}</div>     <div class="pf-feed-right"><div class="pf-feed-primary">${primary}</div>${secondary ? `<div class="pf-feed-secondary">${secondary}</div>` : ''}</div>

  </div>`;
}
function filterActivities(type) {
  currentActivityFilter = type;
  ['alles', 'fietsen', 'lopen', 'gym'].forEach(t => {
    const btn = document.getElementById('filter' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.className = 'pf-pill' + (t === type ? ' active' : '');
  });
  renderActivityFeed();
}
function renderActivityFeed() {
  const el = document.getElementById('allActs');
  if (!el) return;
  let items = _filterFeed(_unifiedFeed(), currentActivityFilter);
  if (activityWindowDays > 0) {
    const cutoff = Date.now() - activityWindowDays * 86400000;
    items = items.filter(i => new Date(i.date).getTime() >= cutoff);
  }
  el.innerHTML = items.length
    ? items.map(feedRow).join('')
    : '<div class="empty"><div class="empty-text">Geen activiteiten in dit venster</div></div>';
}

function renderActKpis() {
  const cut = _last7Cut();
  const acts = (S.recentActs || []).filter(a => new Date(a.start_date).getTime() >= cut);
  const gym = (S.hevyWorkouts || []).filter(w => new Date(w.start_time).getTime() >= cut);
  const distM = acts.reduce((s, a) => s + (a.distance || 0), 0);
  let timeSec = acts.reduce((s, a) => s + (a.moving_time || 0), 0);
  gym.forEach(w => { const d = _hevyDurMin(w); if (d) timeSec += d * 60; });
  // Belasting (TSS) 7d uit deterministische dagelijkse ETL — niet uit losse activiteiten geschat
  let tss = null;
  const etl = S.fullState?.dailyETL;
  if (etl) {
    tss = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.toISOString().split('T')[0];
      if (etl[k] != null) tss += etl[k];
    }
    tss = Math.round(tss);
  }
  const setTxt = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
  setTxt('actKpiDist', (distM / 1000).toFixed(1) + ' km');
  setTxt('actKpiTime', fmtT(timeSec));
  setTxt('actKpiLoad', tss != null ? tss : '–');
  setTxt('actKpiSessions', acts.length + gym.length);
}

function renderSportSplit() {
  const el = document.getElementById('actSportSplit');
  if (!el) return;
  const cut = _last7Cut();
  const acts = (S.recentActs || []).filter(a => new Date(a.start_date).getTime() >= cut);
  const gym = (S.hevyWorkouts || []).filter(w => new Date(w.start_time).getTime() >= cut);
  let cyc = 0, run = 0, gy = 0;
  acts.forEach(a => {
    if (a.type === 'Ride' || a.type === 'VirtualRide') cyc += a.moving_time || 0;
    else if (a.type === 'Run' || a.type === 'TrailRun') run += a.moving_time || 0;
  });
  gym.forEach(w => { const d = _hevyDurMin(w); gy += (d ? d * 60 : 0); });
  const total = cyc + run + gy;
  if (!total) { el.innerHTML = '<div style="color:var(--muted);font-size:13px">Geen activiteiten in de afgelopen 7 dagen.</div>'; return; }
  const rows = [
    { name: 'Fietsen', sec: cyc, color: 'var(--accent)' },
    { name: 'Gym', sec: gy, color: 'var(--purple)' },
    { name: 'Lopen', sec: run, color: 'var(--green)' },
  ].filter(r => r.sec > 0);
  el.innerHTML = rows.map(r => {
    const pct = Math.round(r.sec / total * 100);
    return `<div class="pf-bar-row"><div class="pf-bar-head"><span class="pf-bar-name">${r.name}<span class="pf-bar-sub">${fmtT(r.sec)}</span></span><span class="pf-bar-pct">${pct}%</span></div><div class="pf-bar-track"><div class="pf-bar-fill" style="width:${pct}%;background:${r.color}"></div></div></div>`;
  }).join('');
}

function renderActIntensity() {
  const el = document.getElementById('actIntensity');
  if (!el) return;
  const z = S.fullState?.currentZoneModel;
  if (!z || !z.totalMin) { el.innerHTML = '<div style="color:var(--muted);font-size:13px">Nog geen fiets- of looptraining deze week.</div>'; return; }
  const segs = [
    { name: 'Laag (Z1–Z2)', pct: z.lowPct, min: z.lowMin, color: 'var(--accent)' },
    { name: 'Midden (Z3)', pct: z.midPct, min: z.midMin, color: 'var(--yellow)' },
    { name: 'Hoog (Z4–Z5)', pct: z.highPct, min: z.highMin, color: 'var(--red)' },
  ].filter(s => s.pct > 0);
  const bar = segs.map(s => `<span style="width:${s.pct}%;background:${s.color}"></span>`).join('');
  const legend = segs.map(s => `<div class="pf-seg-item"><span class="pf-seg-dot" style="background:${s.color}"></span>${s.name} · <strong style="color:var(--text)">${s.pct}%</strong> <span style="opacity:.7">(${s.min}m)</span></div>`).join('');
  el.innerHTML = `<div class="pf-seg">${bar}</div><div class="pf-seg-legend">${legend}</div>`;
}

function renderActivitiesTab() {
  renderActKpis();
  renderSportSplit();
  renderActIntensity();
  renderActivityFeed();
  ensureMmpCurve().then(() => renderActivityFeed());
}


// ── Gewicht CSV import ────────────────────────────────────────────────────────
wuz = document.getElementById('weightUploadZone');
wuz.addEventListener('dragover', e=>{e.preventDefault();wuz.classList.add('over');});
wuz.addEventListener('dragleave', ()=>wuz.classList.remove('over'));
wuz.addEventListener('drop', e=>{e.preventDefault();wuz.classList.remove('over');handleWeightImport(e.dataTransfer.files[0]);});

async function handleWeightImport(file) {
  if (!file) return;
  const msg = document.getElementById('weightImportMsg');
  msg.className = 'alert alert-info mt-2';
  msg.textContent = '⚖️ Bestand verwerken...';

  const fd = new FormData();
  fd.append('csvfile', file);
  try {
    const r = await fetch('/api/weight/import', { method: 'POST', body: fd }).then(res => res.json());
    if (r.error) throw new Error(r.error);
    msg.className = 'alert alert-success mt-2';
    msg.innerHTML = `✓ <strong>${r.imported} metingen geïmporteerd</strong> (${r.unit})<br>
      Periode: ${r.oldest} t/m ${r.newest}<br>
      Totaal in log: ${r.total} datums${r.skipped > 0 ? ` · ${r.skipped} regels overgeslagen` : ''}`;
    // Reload data to reflect new weight log
    await loadUserData();
  } catch(e) {
    msg.className = 'alert alert-error mt-2';
    msg.textContent = '✗ Import mislukt: ' + e.message;
  }
}

// ── Literatuur ────────────────────────────────────────────────────────────────
async function loadLiterature() {
  try {
    const lit = await api('/api/literature');
    renderLiterature(lit);
  } catch {}
}

function renderLiterature(lit) {
  const el = document.getElementById('litList');
  document.getElementById('litCount').textContent = lit.length ? `${lit.length} bron${lit.length > 1 ? 'nen' : ''}` : '';
  if (!lit.length) { el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:12px 0">Geen literatuur toegevoegd.</div>'; return; }
  el.innerHTML = lit.map(l => `
    <div style="padding:12px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px">
        <div>
          <div style="font-weight:600;font-size:13px">${l.title}</div>
          <div style="font-size:11px;color:var(--muted)">${l.addedDate}${l.source ? ' · ' + l.source : ''}</div>
        </div>
        <button onclick="deleteLit('${l.id}')" style="background:none;border:none;color:var(--subtle);cursor:pointer;font-size:18px;flex-shrink:0;line-height:1" title="Verwijderen">×</button>
      </div>
      <div style="font-size:12px;color:var(--muted);line-height:1.6;max-height:80px;overflow:hidden;position:relative" id="litBody-${l.id}">${l.content.substring(0, 300)}${l.content.length > 300 ? '...' : ''}</div>
      ${l.content.length > 300 ? `<button onclick="toggleLitExpand('${l.id}', ${JSON.stringify(l.content).replace(/'/g,"\\'")})" style="background:none;border:none;color:var(--accent);font-size:11px;cursor:pointer;padding:4px 0;font-family:inherit">Meer tonen</button>` : ''}
    </div>`).join('');
}

function toggleLitExpand(id, content) {
  const el = document.getElementById('litBody-' + id);
  const btn = el.nextElementSibling;
  if (el.style.maxHeight === 'none') {
    el.style.maxHeight = '80px'; el.textContent = content.substring(0, 300) + '...';
    btn.textContent = 'Meer tonen';
  } else {
    el.style.maxHeight = 'none'; el.textContent = content;
    btn.textContent = 'Minder tonen';
  }
}

async function deleteLit(id) {
  try {
    await api('/api/literature/' + id, { method: 'DELETE' });
    await loadLiterature();
  } catch(e) { alert('Verwijderen mislukt: ' + e.message); }
}

async function saveLitPaste() {
  const title = document.getElementById('litPasteTitle').value.trim();
  const content = document.getElementById('litPasteContent').value.trim();
  if (!title || !content) { alert('Vul een titel en inhoud in'); return; }
  const btn = document.getElementById('btnLitPaste');
  btn.textContent = 'Opslaan...'; btn.disabled = true;
  try {
    await api('/api/literature', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content }) });
    document.getElementById('litPasteTitle').value = '';
    document.getElementById('litPasteContent').value = '';
    await loadLiterature();
    btn.textContent = '✓ Toegevoegd'; btn.className = 'btn btn-success btn-sm';
    setTimeout(() => { btn.textContent = 'Toevoegen'; btn.className = 'btn btn-primary btn-sm'; btn.disabled = false; }, 2000);
  } catch(e) {
    btn.textContent = 'Toevoegen'; btn.disabled = false;
    alert('Mislukt: ' + e.message);
  }
}

const luz = document.getElementById('litUploadZone');
luz.addEventListener('dragover', e => { e.preventDefault(); luz.classList.add('over'); });
luz.addEventListener('dragleave', () => luz.classList.remove('over'));
luz.addEventListener('drop', e => { e.preventDefault(); luz.classList.remove('over'); handleLitUpload(e.dataTransfer.files[0]); });

async function handleLitUpload(file) {
  if (!file) return;
  const title = document.getElementById('litUploadTitle').value.trim();
  if (!title) { alert('Vul eerst een titel in'); return; }
  const msg = document.getElementById('litUploadMsg');
  msg.className = 'alert alert-info mt-2';
  msg.textContent = file.type === 'application/pdf' ? '📄 PDF verwerken via AI...' : '📄 Bestand inlezen...';
  const fd = new FormData(); fd.append('file', file); fd.append('title', title);
  try {
    await fetch('/api/literature/upload', { method: 'POST', body: fd }).then(r => r.json().then(d => { if (!r.ok) throw new Error(d.error); return d; }));
    document.getElementById('litUploadTitle').value = '';
    msg.className = 'alert alert-success mt-2';
    msg.textContent = '✓ Toegevoegd' + (file.type === 'application/pdf' ? ' (PDF samengevat)' : '');
    await loadLiterature();
  } catch(e) { msg.className = 'alert alert-error mt-2'; msg.textContent = '✗ ' + e.message; }
}

// ── Charts ────────────────────────────────────────────────────────────────────
let chartInstances = {};

// Theme-aware chart-tokens: leest de live CSS-variabelen uit theme.css zodat
// grafieken correct renderen in light (crème) én dark mode. Vervangt de
// hardcoded rgba(255,255,255,0.06)/#666-waarden die in light mode onzichtbaar zijn.
function _chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const gridColor = cs.getPropertyValue('--border').trim() || '#d8d1bf';
  const tickColor = cs.getPropertyValue('--muted').trim() || '#4a5375';
  const textColor = cs.getPropertyValue('--text').trim() || tickColor;
  return { gridColor, tickColor, textColor };
}

function _baseChartOpts() {
  const { gridColor, tickColor, textColor } = _chartTheme();
  return {
    responsive: true,
    plugins: { legend: { labels: { color: textColor, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } }
    }
  };
}

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function makeChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  chartInstances[id] = new Chart(ctx, config);
}

// ── Mockup-chrome: rechts-uitgelijnde trend-chip + legenda-rijtje ──────────────
function _trendChip(text) {
  return '<span class="pf-trend-chip">' + text + '</span>';
}

function _setHeaderChip(canvasId, text) {
  const canvas = document.getElementById(canvasId);
  const label = canvas?.closest('.card')?.querySelector('.card-label');
  if (!label) return;
  label.style.display = 'flex';
  label.style.justifyContent = 'space-between';
  label.style.alignItems = 'center';
  const existing = label.querySelector('.pf-trend-chip');
  if (existing) existing.outerHTML = _trendChip(text);
  else label.insertAdjacentHTML('beforeend', _trendChip(text));
}

function _legendRow(canvasId, items) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const existing = canvas.parentElement.querySelector('.pf-legend-row[data-for="' + canvasId + '"]');
  if (existing) existing.remove();
  const row = document.createElement('div');
  row.className = 'pf-legend-row';
  row.dataset.for = canvasId;
  row.innerHTML = items.map(it =>
    '<span class="pf-legend-item"><span class="pf-legend-swatch" style="background:' + it.color + '"></span>' + it.label + '</span>'
  ).join('');
  canvas.insertAdjacentElement('afterend', row);
}

function filterByDays(series, days, dateKey = 'date') {
  if (days >= 9999) return series;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return series.filter(d => new Date(d[dateKey] + (d[dateKey].length === 7 ? '-01' : '')) >= cutoff);
}

async function switchTrendSeg(seg){
  S._trendSeg = seg;
  document.querySelectorAll('#trendNav .pf-trend-pill').forEach(b=>b.classList.toggle('active', b.dataset.seg===seg));
  document.querySelectorAll('#chartsContainer .pf-trendseg').forEach(p=>{p.style.display=(p.dataset.seg===seg)?'':'none';});
  if (S._chartsData) await _renderTrendSeg(seg);
}
function _applyTrendSeg(){ return switchTrendSeg(S._trendSeg||'vermogen'); }

async function _renderTrendSeg(seg){
  if (S._trendRendered && S._trendRendered[seg]) return;
  const segEl = document.querySelector('#chartsContainer .pf-trendseg[data-seg="'+seg+'"]');
  if (segEl) segEl.classList.add('pf-seg-loading');
  try {
    _buildTrendCanvases(seg);
    if (seg === 'vermogen') {
      await Promise.allSettled([renderPowerTrends(), renderMmpCurve(), renderPowerProfile(), renderAllTimePRs()]);
      renderAerobicEfficiency();
    } else if (seg === 'belasting') {
      await renderZoneTrend();
    } else if (seg === 'kracht') {
      await renderStrengthTrends();
    } else if (seg === 'herstel') {
      await Promise.allSettled([renderSleepTrend(), renderCompliance()]);
    }
    // 'lichaam' heeft alleen canvas-charts, geen aparte panelrenders.
    (S._trendRendered = S._trendRendered || {})[seg] = true;
  } finally {
    if (segEl) segEl.classList.remove('pf-seg-loading');
  }
}

function _buildTrendCanvases(seg){
  const d = S._chartsData;
  if (!d) return;
  const days = parseInt(document.getElementById('chartPeriod').value);
  const { gridColor, tickColor } = _chartTheme();
  const baseOpts = _baseChartOpts();

  if (seg === 'lichaam') {
    // ── Gewicht ───────────────────────────────────────────────────────────────
    const wData = filterByDays(d.weightSeries.length > 60 ? d.weightMonthly.map(m => ({date: m.month, kg: m.avg})) : d.weightSeries, days);
    if (wData.length) {
      const weightXY = wData.map(p => ({ x: new Date(p.date + 'T12:00:00').getTime(), y: p.kg }));
      makeChart('chartWeight', {
        type: 'line',
        data: {
          datasets: [{
            label: 'Gewicht (kg)', data: weightXY,
            borderColor: '#012296', backgroundColor: '#01229618',
            borderWidth: 2, pointRadius: wData.length > 60 ? 3 : 4, fill: true, tension: 0.3
          }]
        },
        options: {
          ...baseOpts,
          plugins: {
            ...baseOpts.plugins,
            annotation: {},
            tooltip: {
              callbacks: {
                title: function(items) {
                  const ts = items[0].parsed.x;
                  return new Date(ts).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
                }
              }
            }
          },
          scales: {
            ...baseOpts.scales,
            x: {
              type: 'linear',
              grid: { color: gridColor },
              ticks: {
                callback: function(value) {
                  const d = new Date(value);
                  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: '2-digit' });
                },
                maxTicksLimit: 10,
                autoSkip: true,
                color: tickColor,
                font: { size: 10 }
              },
              min: Math.min(...weightXY.map(p => p.x)),
              max: Math.max(...weightXY.map(p => p.x))
            }
          }
        }
      });
      const wFirst = wData[0].kg, wLast = wData[wData.length - 1].kg;
      const wDelta = +(wLast - wFirst).toFixed(1);
      _setHeaderChip('chartWeight', (wDelta > 0 ? '+' : '') + wDelta + ' kg');
    }

    // ── Voeding ───────────────────────────────────────────────────────────────
    const nData = filterByDays(d.nutritionSeries, Math.min(days, 60));
    if (nData.length) {
      makeChart('chartNutr', {
        type: 'bar',
        data: {
          labels: nData.map(v => v.date),
          datasets: [
            { label: 'Calorieën (kcal)', data: nData.map(v => v.kcal), backgroundColor: '#01229644', borderColor: '#012296', borderWidth: 1, yAxisID: 'y' },
            { label: 'Eiwit (g)', data: nData.map(v => v.protein), type: 'line', borderColor: '#2633bd', borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: 'y2' },
          ]
        },
        options: {
          ...baseOpts,
          scales: {
            x: baseOpts.scales.x,
            y: { ...baseOpts.scales.y, title: { display: true, text: 'kcal', color: tickColor, font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: 'eiwit (g)', color: tickColor, font: { size: 10 } } }
          }
        }
      });
    }
  }
  if (seg === 'belasting') {
    // ── ATL/CTL/TSB ───────────────────────────────────────────────────────────
    const lData = filterByDays(d.loadSeries, days);
    if (lData.length) {
      makeChart('chartLoad', {
        type: 'line',
        data: {
          labels: lData.map(v => v.date),
          datasets: [
            { label: 'CTL (fitness)', data: lData.map(v => v.ctl), borderColor: '#012296', borderWidth: 2, pointRadius: 0, tension: 0.4 },
            { label: 'ATL (vermoeidheid)', data: lData.map(v => v.atl), borderColor: '#2633bd', borderWidth: 2, pointRadius: 0, tension: 0.4 },
            { label: 'TSB (form)', data: lData.map(v => v.tsb), borderColor: '#175a3b', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3] },
          ]
        },
        options: {
          ...baseOpts,
          plugins: { ...baseOpts.plugins, legend: { display: false } },
          scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.2)' : gridColor } } }
        }
      });
      const lLast = lData[lData.length - 1];
      _setHeaderChip('chartLoad', 'CTL ' + Math.round(lLast.ctl) + ' · ATL ' + Math.round(lLast.atl) + ' · TSB ' + (lLast.tsb > 0 ? '+' : '') + Math.round(lLast.tsb));
      _legendRow('chartLoad', [
        { color: '#012296', label: 'CTL' },
        { color: '#2633bd', label: 'ATL' },
        { color: '#175a3b', label: 'TSB' },
      ]);
    }

    // ── Wekelijks volume ──────────────────────────────────────────────────────
    const vData = filterByDays(d.weeklyVolume, days, 'week');
    if (vData.length) {
      makeChart('chartVolume', {
        type: 'bar',
        data: {
          labels: vData.map(v => v.week),
          datasets: [
            { label: 'Uren', data: vData.map(v => v.hours), backgroundColor: '#01229666', borderColor: '#012296', borderWidth: 1, yAxisID: 'y' },
            { label: 'Sessies', data: vData.map(v => v.sessions), type: 'line', borderColor: '#2633bd', borderWidth: 2, pointRadius: 2, tension: 0.3, yAxisID: 'y2' },
          ]
        },
        options: {
          ...baseOpts,
          scales: {
            x: baseOpts.scales.x,
            y: { ...baseOpts.scales.y, title: { display: true, text: 'Uren', color: tickColor, font: { size: 10 } } },
            y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: 'Sessies', color: tickColor, font: { size: 10 } } }
          }
        }
      });
    }

    if (vData.length) {
      makeChart('chartDiscipline', {
        type: 'bar',
        data: {
          labels: vData.map(v => v.week),
          datasets: [
            { label: 'Fiets',     data: vData.map(v => v.cycling),  backgroundColor: '#c3c8e4', stack: 'd' },
            { label: 'Hardlopen', data: vData.map(v => v.running),  backgroundColor: '#8f9ad0', stack: 'd' },
            { label: 'Kracht',    data: vData.map(v => v.strength), backgroundColor: '#5560bd', stack: 'd' },
            { label: 'Overig',    data: vData.map(v => v.other),    backgroundColor: '#2633bd', stack: 'd' },
          ]
        },
        options: {
          ...baseOpts,
          plugins: { ...baseOpts.plugins, legend: { display: false } },
          scales: {
            x: { ...baseOpts.scales.x, stacked: true },
            y: { ...baseOpts.scales.y, stacked: true, title: { display: true, text: 'Uren', color: tickColor, font: { size: 10 } } }
          }
        }
      });
      _legendRow('chartDiscipline', [
        { color: '#c3c8e4', label: 'Fiets' },
        { color: '#8f9ad0', label: 'Hardlopen' },
        { color: '#5560bd', label: 'Kracht' },
        { color: '#2633bd', label: 'Overig' },
      ]);
    }
  }
  if (seg === 'vermogen') {
    // ── Vermogen ──────────────────────────────────────────────────────────────
    const pData = filterByDays(d.powerTrend, days, 'month');
    if (pData.length) {
      makeChart('chartPower', {
        type: 'line',
        data: {
          labels: pData.map(v => v.month),
          datasets: [{
            label: 'Gem. vermogen (W)', data: pData.map(v => v.avgWatt),
            borderColor: '#012296', backgroundColor: '#01229618',
            borderWidth: 2, pointRadius: 4, fill: true, tension: 0.3
          }]
        },
        options: baseOpts
      });
      const pFirst = pData[0].avgWatt, pLast = pData[pData.length - 1].avgWatt;
      const pDelta = Math.round(pLast - pFirst);
      _setHeaderChip('chartPower', (pDelta > 0 ? '+' : '') + pDelta + ' W');
    } else if (!d.powerTrend?.length) {
      document.getElementById('chartPower').parentElement.innerHTML += '<div class="alert alert-info mt-2" style="font-size:11px">Geen vermogensdata beschikbaar. Sync eerst je volledige history.</div>';
    }
  }
}

async function loadCharts() {
  const msg = document.getElementById('chartsMsg');
  msg.className = 'alert alert-info'; msg.textContent = 'Grafieken laden...';
  document.getElementById('chartsContainer').classList.remove('hidden');
  S._trendRendered = {};
  try {
    const days = parseInt(document.getElementById('chartPeriod').value);
    S._chartsData = await api('/api/charts/data?days=' + days);
    msg.className = 'hidden';
  } catch(e) {
    msg.className = 'alert alert-error';
    msg.textContent = 'Laden mislukt: ' + e.message;
    return;
  }
  await switchTrendSeg(S._trendSeg || 'vermogen');
}

function renderAerobicEfficiency() {
  const el = document.getElementById('aeroEff');
  if (!el) return;
  const aet = S.fullState?.aerobicEfficiencyTrend;
  const hasPower = (aet?.powerSeries?.length || 0) >= 3;
  const hasSpeed = (aet?.speedSeries?.length || 0) >= 3;

  if (!aet || (!hasPower && !hasSpeed)) {
    el.innerHTML = '<div class="alert alert-info" style="font-size:12px">Onvoldoende data — minimaal 3 ritten van 45+ minuten vereist.</div>';
    return;
  }

  function trendBadge(trend) {
    if (!trend || trend.trendDirection === 'insufficient_data')
      return '<span style="background:var(--card2);color:var(--muted);padding:2px 9px;border-radius:99px;font-size:11px">Onvoldoende data</span>';
    if (trend.trendDirection === 'improving')
      return '<span style="background:#175a3b22;color:#175a3b;padding:2px 9px;border-radius:99px;font-size:11px">↑ Verbeterend</span>';
    if (trend.trendDirection === 'declining')
      return '<span style="background:#8a261522;color:#8a2615;padding:2px 9px;border-radius:99px;font-size:11px">↓ Dalend</span>';
    return '<span style="background:var(--card2);color:var(--muted);padding:2px 9px;border-radius:99px;font-size:11px">→ Stabiel</span>';
  }

  let html = '';
  if (hasPower) {
    html += `<div style="margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:12px;color:var(--text)">Vermogen / hartslag (W/bpm)</span>
        ${trendBadge(aet.powerTrend)}
      </div>
      <canvas id="chartAerobicPower" height="80"></canvas>
    </div>`;
  }
  if (hasSpeed) {
    html += `<div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <span style="font-size:12px;color:var(--text)">Snelheid / hartslag (km·h⁻¹/bpm)</span>
        ${trendBadge(aet.speedTrend)}
      </div>
      <canvas id="chartAerobicSpeed" height="80"></canvas>
    </div>`;
  }
  el.innerHTML = html;

  const baseOpts = _baseChartOpts();

  if (hasPower) {
    makeChart('chartAerobicPower', {
      type: 'line',
      data: {
        labels: aet.powerSeries.map(p => p.date),
        datasets: [
          { label: 'EI (W/bpm)', data: aet.powerSeries.map(p => p.ei),
            borderWidth: 0, pointRadius: 3, pointBackgroundColor: '#012296', showLine: false },
          { label: '28d gem.', data: aet.powerSeries.map(p => p.rollingEI),
            borderColor: '#2633bd', backgroundColor: '#2633bd18',
            borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }
        ]
      },
      options: baseOpts
    });
  }
  if (hasSpeed) {
    makeChart('chartAerobicSpeed', {
      type: 'line',
      data: {
        labels: aet.speedSeries.map(p => p.date),
        datasets: [
          { label: 'EI (km/h/bpm)', data: aet.speedSeries.map(p => p.ei),
            borderWidth: 0, pointRadius: 3, pointBackgroundColor: '#012296', showLine: false },
          { label: '28d gem.', data: aet.speedSeries.map(p => p.rollingEI),
            borderColor: '#2633bd', backgroundColor: '#2633bd18',
            borderWidth: 2, pointRadius: 0, tension: 0.4, fill: true }
        ]
      },
      options: baseOpts
    });
  }
}

// ── MMP curve ────────────────────────────────────────────────────────────────

function formatDur(s) {
  if (s < 60) return s + 's';
  if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return m + 'm' + (r ? String(r).padStart(2,'0') + 's' : ''); }
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h + 'u' + (m ? m + 'm' : '');
}

async function renderPowerTrends() {
  const ftpBox = document.getElementById('ftpTrendContainer');
  const cpBox  = document.getElementById('cpTrendContainer');
  if (!ftpBox || !cpBox) return;
  try {
    const d = await api('/api/charts/power-trends');
    const { gridColor, tickColor, textColor } = _chartTheme();

    // FTP-verloop
    if (!d.ftpSeries || !d.ftpSeries.length) {
      ftpBox.innerHTML = '<div style="color:var(--muted);font-size:12px">Nog geen activiteiten om FTP over te sampelen.</div>';
    } else {
      ftpBox.innerHTML = '<canvas id="chartFtpTrend" height="80"></canvas>';
      makeChart('chartFtpTrend', {
        type: 'line',
        data: {
          labels: d.ftpSeries.map(p => p.date),
          datasets: [
            { label: 'FTP (W)', data: d.ftpSeries.map(p => p.ftp), yAxisID: 'y',
              borderColor: '#012296', backgroundColor: '#01229612',
              borderWidth: 2, pointRadius: 0, pointHitRadius: 8, tension: 0.2, fill: true },
            { label: 'W/kg', data: d.ftpSeries.map(p => p.wkg), yAxisID: 'yWkg',
              borderColor: '#2633bd', backgroundColor: 'transparent',
              borderWidth: 1.5, pointRadius: 0, pointHitRadius: 8, tension: 0.2,
              borderDash: [4, 4], spanGaps: false }
          ]
        },
        options: {
          responsive: true,
          onClick: (evt, elements, chart) => {
            const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
            if (!els.length) return;
            const p = d.ftpSeries[els[0].index];
            if (p?.activityId) navigateToActivity(p.activityId);
          },
          onHover: (evt, els, chart) => { chart.canvas.style.cursor = els.length ? 'pointer' : 'default'; },
          plugins: {
            legend: { labels: { color: textColor, font: { size: 11 } } },
            tooltip: { mode: 'index', intersect: false, callbacks: {
              afterBody: (items) => {
                const p = items.length ? d.ftpSeries[items[0].dataIndex] : null;
                return p?.activityName ? 'Bepalende rit: ' + p.activityName : '';
              }
            } }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 } },
            y: { position: 'left', grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'FTP (W)', color: tickColor, font: { size: 10 } } },
            yWkg: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'W/kg', color: tickColor, font: { size: 10 } } }
          }
        }
      });
    }

    // CP/W'-evolutie
    const cpReal = (d.cpSeries || []).filter(p => p.cp != null);
    if (!cpReal.length) {
      cpBox.innerHTML = '<div style="color:var(--muted);font-size:12px">Onvoldoende meetpunten voor een CP/W\'-fit. Bereken eerst de MMP-history.</div>';
    } else {
      cpBox.innerHTML = '<canvas id="chartCpTrend" height="80"></canvas>';
      makeChart('chartCpTrend', {
        type: 'line',
        data: {
          labels: d.cpSeries.map(p => p.date),
          datasets: [
            { label: 'CP (W)', data: d.cpSeries.map(p => p.cp), yAxisID: 'yCp',
              borderColor: '#012296', backgroundColor: '#01229612',
              borderWidth: 2, pointRadius: 0, tension: 0.2, spanGaps: false },
            { label: "W' (kJ)", data: d.cpSeries.map(p => p.wPrime != null ? +(p.wPrime / 1000).toFixed(1) : null), yAxisID: 'yW',
              borderColor: '#2633bd', borderWidth: 1.5, pointRadius: 0,
              tension: 0.2, borderDash: [4, 4], spanGaps: false }
          ]
        },
        options: {
          responsive: true,
          plugins: { legend: { labels: { color: textColor, font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 } },
            yCp: { position: 'left', grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'CP (W)', color: tickColor, font: { size: 10 } } },
            yW:  { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: "W' (kJ)", color: tickColor, font: { size: 10 } } }
          }
        }
      });
    }
  } catch (e) {
    if (ftpBox) ftpBox.innerHTML = `<div style="color:var(--muted);font-size:12px">Vermogenstrends laden mislukt: ${e.message}</div>`;
  }
}

async function renderStrengthTrends() {
  const muscleBox = document.getElementById('strengthMuscleContainer');
  const e1rmBox   = document.getElementById('strengthE1rmContainer');
  if (!muscleBox && !e1rmBox) return;
  try {
    const d = await api('/api/charts/strength-trends');
    const { gridColor, tickColor } = _chartTheme();

    // ── Spiergroep-tonnage (gestapeld, absoluut) ──
    const hasMuscle = (d.muscleSeries || []).some(w => w.lower_body || w.push || w.pull || w.core || w.other);
    if (muscleBox && !hasMuscle) {
      muscleBox.innerHTML = '<div style="color:var(--muted);font-size:12px">Nog geen krachttrainingen in de laatste 26 weken.</div>';
    } else if (muscleBox) {
      muscleBox.innerHTML = '<canvas id="chartMuscleVolume" height="80"></canvas>';
      const GROUPS = [
        { key: 'lower_body', label: 'Onderlichaam', color: '#c3c8e4' },
        { key: 'push',       label: 'Push',         color: '#8f9ad0' },
        { key: 'pull',       label: 'Pull',         color: '#5560bd' },
        { key: 'core',       label: 'Core',         color: '#2633bd' },
        { key: 'other',      label: 'Overig',       color: '#012296' },
      ];
      makeChart('chartMuscleVolume', {
        type: 'bar',
        data: {
          labels: d.muscleSeries.map(w => w.week),
          datasets: GROUPS.map(g => ({
            label: g.label,
            data: d.muscleSeries.map(w => w[g.key] || 0),
            backgroundColor: g.color,
            borderWidth: 0,
            stack: 'vol',
          })),
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { mode: 'index', intersect: false, callbacks: {
              footer: (items) => 'Totaal: ' + items.reduce((s, i) => s + (i.raw || 0), 0).toLocaleString('nl-NL') + ' kg',
            } },
          },
          scales: {
            x: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9 }, maxTicksLimit: 13 } },
            y: { stacked: true, grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'Tonnage (kg)', color: tickColor, font: { size: 10 } } },
          },
        },
      });
      _legendRow('chartMuscleVolume', GROUPS.map(g => ({ color: g.color, label: g.label })));
    }

    // ── e1RM-progressie (multiline, per oefening toggelbaar) ──
    if (!e1rmBox) return;
    const lifts = (d.e1rmSeries || []);
    const enoughLifts = lifts.filter(l => l.enough);
    if (!enoughLifts.length) {
      const near = lifts.filter(l => !l.enough && l.sessions.length);
      e1rmBox.innerHTML = '<div style="color:var(--muted);font-size:12px">Onvoldoende data voor een e1RM-trend (minimaal ' + (d.minSessions || 3) + ' sessies per oefening in 26 weken).'
        + (near.length ? ' Bijna: ' + near.map(l => l.exercise + ' (' + l.sessions.length + ')').join(', ') + '.' : '')
        + '</div>';
      return;
    }

    const PALETTE = ['#c3c8e4', '#8f9ad0', '#5560bd', '#2633bd', '#012296', '#1a1d92'];
    const dateSet = new Set();
    enoughLifts.forEach(l => l.sessions.forEach(s => dateSet.add(s.date)));
    const labels = [...dateSet].sort();
    // Standaard zichtbaar: de compound/multi-joint liften (waar 1RM-tracking betekenis
    // heeft), gecapt op zes en gesorteerd op sessie-aantal (enoughLifts is al zo gesorteerd).
    // Terugval: geen enkele compound => toon de vier drukste liften.
    const compoundIdx = enoughLifts.map((l, i) => (l.compound ? i : -1)).filter(i => i >= 0);
    const visibleIdx = new Set(
      compoundIdx.length ? compoundIdx.slice(0, 6) : enoughLifts.map((_, i) => i).slice(0, 4)
    );
    const datasets = enoughLifts.map((l, i) => {
      const byDate = Object.fromEntries(l.sessions.map(s => [s.date, s.e1rm]));
      return {
        label: l.exercise,
        data: labels.map(dt => (dt in byDate ? byDate[dt] : null)),
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 3, pointHitRadius: 8, tension: 0.2, spanGaps: true,
        hidden: !visibleIdx.has(i),
      };
    });

    e1rmBox.innerHTML = '<div id="e1rmChips" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px"></div>'
      + '<canvas id="chartE1rm" height="80"></canvas>';
    makeChart('chartE1rm', {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 9 }, maxTicksLimit: 12 } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'e1RM (kg)', color: tickColor, font: { size: 10 } } },
        },
      },
    });

    const chipBox = document.getElementById('e1rmChips');
    chipBox.innerHTML = enoughLifts.map((l, i) =>
      '<button type="button" class="e1rm-chip" data-idx="' + i + '" style="border:1px solid ' + PALETTE[i % PALETTE.length] + ';color:' + PALETTE[i % PALETTE.length] + ';background:transparent;border-radius:14px;padding:3px 10px;font-size:11px;cursor:pointer;opacity:' + (visibleIdx.has(i) ? '1' : '0.35') + '">' + l.exercise + '</button>'
    ).join('');
    chipBox.querySelectorAll('.e1rm-chip').forEach(btn => {
      btn.onclick = () => {
        const ch = chartInstances['chartE1rm'];
        if (!ch) return;
        const idx = +btn.dataset.idx;
        const visible = ch.isDatasetVisible(idx);
        if (visible) ch.hide(idx); else ch.show(idx);
        btn.style.opacity = visible ? '0.35' : '1';
      };
    });

  } catch (e) {
    const box = document.getElementById('strengthMuscleContainer');
    if (box) box.innerHTML = `<div style="color:var(--muted);font-size:12px">Krachttrends laden mislukt: ${e.message}</div>`;
  }
}

async function renderMmpCurve() {
  const container = document.getElementById('mmpCurveContainer');
  if (!container) return;
  try {
    const d = await api('/api/state/mmp-curve');
    if (d.recentCount === 0) {
      container.innerHTML = `<div style="color:var(--muted);font-size:12px">Nog geen data — druk op Berekenen om te starten (${d.totalActivities} activiteiten in cache).</div>`;
      return;
    }
    container.innerHTML = '<canvas id="chartMmp" height="90"></canvas><div id="mmpMeta" style="font-size:11px;color:var(--muted);margin-top:6px"></div>';

    const recentPts = d.recent;
    const prevPts   = d.previous;
    const labels    = recentPts.map(p => formatDur(p.dur));
    const { gridColor, tickColor, textColor } = _chartTheme();

    makeChart('chartMmp', {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Laatste 30 dagen', data: recentPts.map(p => p.watts),
            borderColor: '#012296', backgroundColor: '#01229612',
            borderWidth: 2, pointRadius: 0, tension: 0.2, fill: true, spanGaps: true },
          { label: '31–90 dagen', data: prevPts.map(p => p.watts),
            borderColor: '#555', borderWidth: 1.5, pointRadius: 0,
            tension: 0.2, borderDash: [4,4], spanGaps: true }
        ]
      },
      options: {
        responsive: true,
        onClick: (evt, elements, chart) => {
          const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
          if (!els.length) return;
          const idx = els[0].index, dsIdx = els[0].datasetIndex;
          const pts = dsIdx === 0 ? recentPts : prevPts;
          const p = pts[idx];
          if (p?.activityId) navigateToActivity(p.activityId);
        },
        onHover: (evt, elements) => {
          if (evt.native?.target) evt.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        },
        plugins: {
          legend: { labels: { color: textColor, font: { size: 11 } } },
          tooltip: {
            mode: 'index', intersect: false,
            callbacks: {
              title: ctx => formatDur(recentPts[ctx[0]?.dataIndex]?.dur || prevPts[ctx[0]?.dataIndex]?.dur || 0),
              label: ctx => {
                const pts = ctx.datasetIndex === 0 ? recentPts : prevPts;
                const p = pts[ctx.dataIndex];
                if (!p?.watts) return null;
                const lines = [ctx.dataset.label + ': ' + p.watts + 'W'];
                if (p.name) lines.push('📍 ' + p.name + ' (' + p.date + ')');
                return lines;
              }
            }
          }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 } },
          y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, title: { display: true, text: 'Watt', color: tickColor, font: { size: 10 } } }
        }
      }
    });
    document.getElementById('mmpMeta').textContent = `${d.recentCount} ritten (recent) · ${d.previousCount} ritten (vorige periode)`;
  } catch(e) {
    if (container) container.innerHTML = `<div style="color:var(--muted);font-size:12px">Curve laden mislukt: ${e.message}</div>`;
  }
}

async function renderCompliance() {
  const box = document.getElementById('complianceContainer');
  if (!box) return;
  try {
    const d = await api('/api/charts/compliance?weeks=26');
    if (!d.sufficient) {
      box.innerHTML = `<div style="color:var(--muted);font-size:12px">Nog te weinig vastgelegde sessies (${d.totalPlanned} voorgeschreven) voor een betrouwbaar compliancebeeld. De grafiek verschijnt zodra de planner meer sessies heeft afgestemd.</div>`;
      return;
    }
    box.innerHTML = '<canvas id="chartCompliance" height="80"></canvas>';
    const s = d.series;
    const { tickColor } = _chartTheme();
    const baseOpts = _baseChartOpts();
    makeChart('chartCompliance', {
      type: 'bar',
      data: {
        labels: s.map(w => w.week),
        datasets: [
          { label: 'Voltooid',      data: s.map(w => w.completed),   backgroundColor: '#c3c8e4', stack: 'c', yAxisID: 'y' },
          { label: 'Gemist',        data: s.map(w => w.missed),      backgroundColor: '#8f9ad0', stack: 'c', yAxisID: 'y' },
          { label: 'Ongepland',     data: s.map(w => w.unplanned),   backgroundColor: '#5560bd', stack: 'c', yAxisID: 'y' },
          { label: 'TSS-afwijking', type: 'line', data: s.map(w => w.avgTssDelta), borderColor: '#2633bd', borderWidth: 2, pointRadius: 2, tension: 0.3, spanGaps: true, yAxisID: 'y2' },
        ]
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: {
          x: { ...baseOpts.scales.x, stacked: true },
          y: { ...baseOpts.scales.y, stacked: true, title: { display: true, text: 'Sessies', color: tickColor, font: { size: 10 } } },
          y2: { position: 'right', grid: { drawOnChartArea: false }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: 'ΔTSS', color: tickColor, font: { size: 10 } } }
        }
      }
    });
    _legendRow('chartCompliance', [
      { color: '#c3c8e4', label: 'Voltooid' },
      { color: '#8f9ad0', label: 'Gemist' },
      { color: '#5560bd', label: 'Ongepland' },
      { color: '#2633bd', label: 'TSS-afwijking' },
    ]);
  } catch (e) { box.innerHTML = `<div style="color:var(--muted);font-size:12px">Compliance laden mislukt: ${e.message}</div>`; }
}

async function renderSleepTrend() {
  const canvas = document.getElementById('chartSleep');
  if (!canvas) return;
  try {
    const days = parseInt(document.getElementById('chartPeriod').value) || 180;
    const d = await api('/api/charts/sleep-trend?days=' + Math.min(days, 365));
    const s = d.series || [];
    if (!s.length) { destroyChart('chartSleep'); return; }
    const roll = s.map((_, i) => {
      const win = s.slice(Math.max(0, i - 6), i + 1).map(p => p.hours).filter(h => h != null);
      return win.length ? +(win.reduce((a, b) => a + b, 0) / win.length).toFixed(2) : null;
    });
    const { tickColor } = _chartTheme();
    const baseOpts = _baseChartOpts();
    makeChart('chartSleep', {
      type: 'bar',
      data: {
        labels: s.map(p => p.date),
        datasets: [
          { label: 'Uren', data: s.map(p => p.hours), backgroundColor: '#01229633', borderColor: '#01229655', borderWidth: 1, order: 2 },
          { label: '7-daags gem.', type: 'line', data: roll, borderColor: '#012296', borderWidth: 2, pointRadius: 0, tension: 0.3, spanGaps: true, order: 1 },
        ]
      },
      options: {
        ...baseOpts,
        scales: {
          x: baseOpts.scales.x,
          y: { ...baseOpts.scales.y, suggestedMin: 4, suggestedMax: 10, title: { display: true, text: 'Uren', color: tickColor, font: { size: 10 } } }
        }
      }
    });
  } catch (e) { /* stil falen, kaart blijft leeg */ }
}

const PR_LABEL = { '5s':'5 sec','15s':'15 sec','30s':'30 sec','1min':'1 min','5min':'5 min','20min':'20 min','60min':'60 min' };

async function renderAllTimePRs() {
  const box = document.getElementById('allTimePrContainer');
  if (!box) return;
  try {
    const d = await api('/api/state/mmp-curve');
    const prs = (d.allTimePRs || []).filter(p => p.best);
    if (!prs.length) {
      box.innerHTML = '<div style="color:var(--muted);font-size:12px">Nog geen gemeten-vermogen-records. Bereken eerst de MMP-history.</div>';
      return;
    }
    box.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">' + prs.map(p => {
      const b = p.best;
      const wkg = b.wkg != null ? b.wkg.toFixed(2) + ' W/kg' : '—';
      return `<div onclick="navigateToActivity('${b.activityId}')" title="${b.name || ''}" style="cursor:pointer;border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:var(--surface)">
        <div style="font-family:'JetBrains Mono',monospace;font-size:10.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.04em">${PR_LABEL[p.key] || p.key}</div>
        <div style="font-family:'Inter Tight',sans-serif;font-weight:800;font-size:22px;color:var(--text);margin-top:3px">${b.watts}<span style="font-size:12px;font-weight:600;color:var(--muted)"> W</span></div>
        <div style="font-size:12px;font-weight:700;color:var(--accent);margin-top:1px">${wkg}</div>
        <div style="display:flex;justify-content:flex-end;align-items:center;gap:4px;margin-top:6px">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="var(--muted)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
          <span style="font-size:10px;color:var(--muted)">${b.date || ''}</span>
        </div>
      </div>`;
    }).join('') + '</div>';
  } catch (e) {
    box.innerHTML = `<div style="color:var(--muted);font-size:12px">Records laden mislukt: ${e.message}</div>`;
  }
}

// ── Power profile radar (Coggan-categorieën, alleen gemeten vermogen) ─────────

const MODEL_META = {
  'polarized':       { c: '#012296', label: 'Polarized',  desc: 'veel Z1–Z2, weinig Z3, pittige Z4–Z5' },
  'pyramidal':       { c: '#2633bd', label: 'Pyramidaal', desc: 'aflopend Z1>Z2>Z3>Z4>Z5' },
  'threshold-heavy': { c: '#8f9ad0', label: 'Threshold',  desc: 'nadruk op Z3–Z4 drempelwerk' },
  'volume-only':     { c: '#5560bd', label: 'Volume',     desc: 'vooral laagintensief volume' },
  'gemengd':         { c: '#bdb6a3', label: 'Gemengd',    desc: 'geen uitgesproken model' },
};
const normModel = (m) => (MODEL_META[m] ? m : 'gemengd');

async function renderZoneTrend() {
  const mixCanvas = document.getElementById('chartZoneMix');
  const modelCanvas = document.getElementById('chartZoneModel');
  if (!mixCanvas || !modelCanvas) return;
  try {
    const d = await api('/api/state/zones');
    const wk = (d.weekly || []).filter(w => w.totalMin > 0);
    if (!wk.length) { destroyChart('chartZoneMix'); destroyChart('chartZoneModel'); return; }
    const { tickColor } = _chartTheme();
    const baseOpts = _baseChartOpts();
    const labels = wk.map(w => w.week);

    makeChart('chartZoneMix', {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Laag (Z1–Z2)',                data: wk.map(w => w.lowPct),  backgroundColor: '#c3c8e4', stack: 'z' },
          { label: 'Midden (Z3, incl. sweetspot)', data: wk.map(w => w.midPct),  backgroundColor: '#8f9ad0', stack: 'z' },
          { label: 'Hoog (Z4+)',                  data: wk.map(w => w.highPct), backgroundColor: '#5560bd', stack: 'z' },
        ]
      },
      options: {
        ...baseOpts,
        plugins: { ...baseOpts.plugins, legend: { display: false } },
        scales: {
          x: { ...baseOpts.scales.x, stacked: true },
          y: { ...baseOpts.scales.y, stacked: true, min: 0, max: 100, title: { display: true, text: '% tijd', color: tickColor, font: { size: 10 } } }
        }
      }
    });
    _legendRow('chartZoneMix', [
      { color: '#c3c8e4', label: 'Laag (Z1–Z2)' },
      { color: '#8f9ad0', label: 'Midden (Z3)' },
      { color: '#5560bd', label: 'Hoog (Z4+)' },
    ]);

    _renderSeilerBand(document.getElementById('chartZoneModel'), wk);
  } catch (e) { /* stil falen, kaarten blijven leeg */ }
}

function _renderSeilerBand(el, wk) {
  if (!el) return;
  const SW = 1180, SH = 30, PL = 34, PR = 10;
  const plotW = SW - PL - PR;
  const n = wk.length;
  const bw = plotW / n;
  const cells = wk.map((w, i) => {
    const meta = MODEL_META[normModel(w.model)];
    const x = PL + i * bw + 1;
    return `<rect data-i="${i}" x="${x.toFixed(2)}" y="4" width="${Math.max(0, bw - 2).toFixed(2)}" height="${SH - 8}" rx="3" fill="${meta.c}" style="cursor:pointer;transition:opacity .15s"></rect>`;
  }).join('');
  el.outerHTML = `<svg id="chartZoneModel" viewBox="0 0 ${SW} ${SH}" width="100%" height="30" style="display:block;overflow:visible">${cells}</svg>`;

  const svg = document.getElementById('chartZoneModel');
  let tip = document.getElementById('seilerBandTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'seilerBandTip';
    tip.className = 'pf-info-tip';
    document.body.appendChild(tip);
  }
  const rects = svg.querySelectorAll('rect');
  rects.forEach(rect => {
    rect.addEventListener('mouseenter', () => {
      rects.forEach(r => { r.style.opacity = (r === rect) ? '1' : '0.55'; });
      const w = wk[+rect.dataset.i];
      const meta = MODEL_META[normModel(w.model)];
      tip.innerHTML = `<strong>WEEK ${w.week}</strong><div>${meta.label}</div><div style="color:var(--muted);margin-top:2px">${meta.desc}</div>`;
      const r2 = rect.getBoundingClientRect();
      tip.style.top = (r2.bottom + 8) + 'px';
      tip.style.left = Math.max(8, Math.min(r2.left, window.innerWidth - 266)) + 'px';
      tip.classList.add('is-open');
    });
    rect.addEventListener('mouseleave', () => {
      rects.forEach(r => { r.style.opacity = '1'; });
      tip.classList.remove('is-open');
    });
  });
}

const PP_AXES = [
  { key: '5s',    label: ['5 sec', 'Sprint']      },
  { key: '1min',  label: ['1 min', 'Anaeroob']    },
  { key: '5min',  label: ['5 min', 'VO₂max']      },
  { key: '20min', label: ['FTP', 'Drempelkracht'] },
];

const PP_CAT_NL = {
  'Untrained':   'Ongetraind',
  'Fair':        'Beginner',
  'Moderate':    'Amateur',
  'Good':        'Gevorderd',
  'Very Good':   'Wedstrijdklasse',
  'Excellent':   'Elite',
  'Exceptional': 'Top amateur',
  'World Class': 'Wereldklasse',
};

async function renderPowerProfile() {
  const container = document.getElementById('powerProfileContainer');
  if (!container) return;

  try {
    const d = await api('/api/state/power-profile');

    if (d.measuredCount === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px">Geen ritten met vermogensmeter gevonden. Power profile vergelijkt alleen gemeten vermogen, geen schattingen.</div>';
      return;
    }

    const byKey = {};
    for (const dur of d.durations) byKey[dur.key] = dur;

    const recentLevels = PP_AXES.map(a => byKey[a.key]?.recent?.level ?? null);
    const prevLevels   = PP_AXES.map(a => byKey[a.key]?.previous?.level ?? null);

    if (!recentLevels.some(l => l !== null) && !prevLevels.some(l => l !== null)) {
      container.innerHTML = '<div style="color:var(--muted);font-size:12px">Onvoldoende gemeten data met gewicht in de afgelopen 12 maanden. W/kg-vergelijking vereist gewichtsdata; oudere inspanningen zonder gewicht worden uitgesloten.</div>';
      return;
    }

    const rt = d.riderType || {};
    const typeBlock = rt.type
      ? `<div style="text-align:center;margin-bottom:16px">
           <div style="font-family:var(--font-display,inherit);font-size:20px;font-weight:800;color:var(--accent,#012296)">${rt.type}</div>
           <div style="font-size:12px;color:var(--muted);max-width:440px;margin:6px auto 0;line-height:1.6">${rt.description || ''}</div>
         </div>`
      : `<div style="text-align:center;margin-bottom:16px;font-size:12px;color:var(--muted)">${rt.description || ''}</div>`;

    const MAXLVL = 8;
    const W = 360, H = 300;
    const cx = W / 2, cy = H / 2 + 6, R = Math.min(W, H) / 2 - 46;
    const n = PP_AXES.length;
    const axisAngle = i => -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const axisPt = (i, r) => [cx + r * Math.cos(axisAngle(i)), cy + r * Math.sin(axisAngle(i))];

    const gridPolys = [0.25, 0.5, 0.75, 1.0].map(g => {
      const pts = PP_AXES.map((_, i) => axisPt(i, g * R).join(',')).join(' ');
      return `<polygon points="${pts}" fill="none" stroke="var(--divider)" stroke-width="1"/>`;
    }).join('');

    const axisLines = PP_AXES.map((_, i) => {
      const [x, y] = axisPt(i, R);
      return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--divider)" stroke-width="1"/>`;
    }).join('');

    const polyPoints = levels => levels
      .map((lvl, i) => (lvl == null ? null : axisPt(i, (lvl / MAXLVL) * R)))
      .filter(Boolean)
      .map(([x, y]) => `${x},${y}`)
      .join(' ');

    const prevPts = polyPoints(prevLevels);
    const recentPts = polyPoints(recentLevels);

    const prevPoly = prevPts
      ? `<polygon points="${prevPts}" fill="#8f9ad030" stroke="#8f9ad0" stroke-width="2" stroke-dasharray="4 3"/>`
      : '';
    const recentPoly = recentPts
      ? `<polygon points="${recentPts}" fill="#01229622" stroke="#012296" stroke-width="2.4"/>`
      : '';

    const recentDots = recentLevels.map((lvl, i) => {
      if (lvl == null) return '';
      const [x, y] = axisPt(i, (lvl / MAXLVL) * R);
      return `<circle cx="${x}" cy="${y}" r="3.4" fill="#012296"/>`;
    }).join('');

    const axisLabels = PP_AXES.map((a, i) => {
      const [x, y] = axisPt(i, R + 22);
      const c = Math.cos(axisAngle(i));
      const anchor = Math.abs(c) < 0.3 ? 'middle' : (c > 0 ? 'start' : 'end');
      const name = Array.isArray(a.label) ? a.label[0] : a.label;
      const wkg = byKey[a.key]?.recent?.wkg;
      return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="'JetBrains Mono',monospace" font-size="9.5" font-weight="700" fill="var(--text)">${name}</text>` +
             `<text x="${x}" y="${y + 9}" text-anchor="${anchor}" font-family="Inter,sans-serif" font-size="9" font-weight="600" fill="var(--muted)">${wkg != null ? wkg + ' W/kg' : '—'}</text>`;
    }).join('');

    container.innerHTML = `
      ${typeBlock}
      <div style="max-width:480px;margin:0 auto">
        <svg id="chartPowerProfile" viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block;overflow:visible">
          ${gridPolys}
          ${axisLines}
          ${prevPoly}
          ${recentPoly}
          ${recentDots}
          ${axisLabels}
        </svg>
        <div style="display:flex;justify-content:center;gap:16px;margin-top:10px">
          <span style="display:inline-flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted)"><span style="width:14px;border-top:2px solid #012296;display:inline-block"></span>Laatste 90d</span>
          <span style="display:inline-flex;align-items:center;gap:6px;font-family:'JetBrains Mono',monospace;font-size:10.5px;color:var(--muted)"><span style="width:14px;border-top:2px dashed #8f9ad0;display:inline-block"></span>Vorige 9 mnd</span>
        </div>
      </div>
      <div id="powerProfileMeta" style="font-size:11px;color:var(--muted);margin-top:12px;line-height:1.8;text-align:center"></div>`;

    const parts = PP_AXES.map(a => {
      const slot = byKey[a.key]?.recent;
      const label = Array.isArray(a.label) ? a.label[0] : a.label;
      const catNl = slot?.category ? (PP_CAT_NL[slot.category] || slot.category) : null;
      return slot && slot.wkg != null ? `${label}: ${slot.wkg} W/kg · ${catNl}` : `${label}: —`;
    });
    const fromNote = d.weightDataFrom ? `  |  W/kg vanaf ${d.weightDataFrom} (gewichtsdata)` : '';
    document.getElementById('powerProfileMeta').textContent =
      'Laatste 90 dagen — ' + parts.join('  ·  ') + `  |  ${d.measuredCount} ritten met meter` + fromNote;

  } catch (e) {
    if (container) container.innerHTML = `<div style="color:var(--muted);font-size:12px">Profiel laden mislukt: ${e.message}</div>`;
  }
}

async function runMmpBatch() {
  const btn = document.getElementById('btnMmpBatch');
  const status = document.getElementById('mmpBatchStatus');
  btn.disabled = true; btn.textContent = 'Bezig...';
  status.textContent = '';
  let totalProcessed = 0;
  const MAX_ROUNDS = 100;
  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      const result = await api('/api/strava/mmp-batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 25 }) });
      totalProcessed += result.processed;
      status.textContent = `Verwerkt: ${totalProcessed}, resterend: ${result.remaining}`;
      if (result.rateLimited) {
        status.textContent = `Rate limit bereikt na ${totalProcessed} verwerkt. Klik opnieuw over enkele minuten om verder te gaan (reeds opgeslagen).`;
        break;
      }
      if (result.remaining <= 0) break;
    }
    if (totalProcessed > 0) await renderMmpCurve();
    if (status.textContent === '' || status.textContent.startsWith('Verwerkt') && !status.textContent.includes('Rate limit')) {
      const msg = totalProcessed > 0 ? `Klaar — ${totalProcessed} MMP-curven berekend.` : 'Alles al berekend.';
      status.textContent = msg;
    }
  } catch(e) {
    status.textContent = 'Fout: ' + e.message;
  } finally {
    btn.disabled = false; btn.textContent = 'MMP berekenen (volledige history)';
  }
}

// ── Activity detail modal ─────────────────────────────────────────────────────

const ADM_ZONE_COLORS = ['#93C5FD','#3B82F6','#F59E0B','#EF4444','#7C3AED'];

function _zoneIdx(z) {
  if (typeof z === 'number') return Math.max(0, Math.min(4, z - 1));
  const n = parseInt(String(z).replace(/[^\d]/g, ''));
  return isNaN(n) ? 0 : Math.max(0, Math.min(4, n - 1));
}

function admSvgLine(pts, xS, yS, color, width) {
  if (!pts || pts.length < 2) return '';
  return '<polyline points="' + pts.map(p => xS(p[0]) + ',' + yS(p[1])).join(' ') +
    '" fill="none" stroke="' + color + '" stroke-width="' + width + '" ' +
    'stroke-linejoin="round"/>';
}

function admDrawHistogram(svgId, data, color, labelKey, valueKey, unitLabel) {
  const svg = document.getElementById(svgId);
  if (!svg || !data || !data.length) return;
  const W = svg.getBoundingClientRect().width || 300;
  const H = 100;
  const pad = { top: 8, right: 8, bottom: 20, left: 36 };
  const maxVal = Math.max(...data.map(d => d[valueKey]));
  const barW = Math.max(1, (W - pad.left - pad.right) / data.length - 1);
  const yS = v => H - pad.bottom - (v / (maxVal || 1)) * (H - pad.top - pad.bottom);

  let html = '';
  data.forEach((d, i) => {
    const x = pad.left + i * (barW + 1);
    const y = yS(d[valueKey]);
    const h = H - pad.bottom - y;
    html += '<rect x="' + x + '" y="' + y + '" width="' + barW +
            '" height="' + h + '" fill="' + color + '" opacity="0.8"/>';
  });

  const step = Math.max(1, Math.ceil(data.length / 6));
  data.forEach((d, i) => {
    if (i % step !== 0) return;
    const x = pad.left + i * (barW + 1) + barW / 2;
    html += '<text x="' + x + '" y="' + (H - 5) +
            '" fill="#4A5568" font-size="8" text-anchor="middle">' +
            d[labelKey] + '</text>';
  });

  html += '<text x="' + (pad.left - 4) + '" y="' + (H - pad.bottom) +
          '" fill="#4A5568" font-size="8" text-anchor="end">' +
          Math.round(maxVal*10)/10 + 'm</text>';

  svg.innerHTML = html;

  svg.querySelectorAll('rect').forEach((rect, i) => {
    if (i >= data.length) return;
    const dp = data[i];
    rect.style.cursor = 'pointer';
    rect.addEventListener('mouseenter', e => {
      const tip = document.getElementById('adm-tooltip');
      if (!tip) return;
      tip.innerHTML = '<div class="adm-tooltip-row"><span class="adm-tooltip-dot" style="background:' +
        color + '"></span>' + dp[labelKey] + unitLabel + ': <strong>' +
        Math.round(dp[valueKey]*10)/10 + ' min</strong></div>';
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY - 40) + 'px';
    });
    rect.addEventListener('mousemove', e => {
      const tip = document.getElementById('adm-tooltip');
      if (tip) { tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY - 40) + 'px'; }
    });
    rect.addEventListener('mouseleave', () => {
      const tip = document.getElementById('adm-tooltip');
      if (tip) tip.style.display = 'none';
    });
  });
}

const ADM_SERIES = [
  { key:'power',    label:'Vermogen', color:'#3B82F6', dataKey:'powerTimeline',    valueKey:'w',   unit:'W',    axisPosition:'left',  yDomain: (data, ftp) => [0, Math.max(...data.map(p=>p.w), (ftp||280)*1.1)] },
  { key:'hr',       label:'Hartslag', color:'#EF4444', dataKey:'hrTimeline',       valueKey:'hr',  unit:'bpm',  axisPosition:'right', yDomain: (data) => [Math.min(...data.map(p=>p.hr))-5, Math.max(...data.map(p=>p.hr))+5] },
  { key:'speed',    label:'Snelheid', color:'#10B981', dataKey:'velocityTimeline', valueKey:'v',   unit:'km/u', axisPosition:'right', yDomain: (data) => [0, Math.max(...data.map(p=>p.v))*1.1] },
  { key:'cadence',  label:'Cadans',   color:'#F59E0B', dataKey:'cadenceTimeline',  valueKey:'c',   unit:'rpm',  axisPosition:'right', yDomain: (data) => [Math.min(...data.map(p=>p.c))-5, Math.max(...data.map(p=>p.c))+5] },
  { key:'gradient',     label:'Helling',  color:'#8B5CF6', dataKey:'gradientTimeline',     valueKey:'g', unit:'%',   axisPosition:'right', yDomain: (data) => [Math.min(...data.map(p=>p.g))-1, Math.max(...data.map(p=>p.g))+1] },
  { key:'rollingpower', label:'Gem. 30s', color:'#FBBF24', dataKey:'rollingPowerTimeline', valueKey:'w', unit:'W',   axisPosition:'left',  yDomain: (data, ftp) => [0, Math.max(...data.map(p=>p.w), (ftp||280)*1.1)] },
];

function admSwitchTab() { /* no-op: activity page uses grid layout instead of tabs */ }

let admSeriesVisible = {};
let admZoomState = { active: false, tStart: null, tEnd: null };
let admLeafletMap = null;
let admRouteLayer = null;
let admSegmentLayer = null;
let admCursorMarker = null;

function nearestGpsPoint(gpsTrack, tCurrent) {
  if (!gpsTrack?.length) return null;
  let best = gpsTrack[0], bestDiff = Math.abs(gpsTrack[0].t - tCurrent);
  for (const p of gpsTrack) {
    const diff = Math.abs(p.t - tCurrent);
    if (diff < bestDiff) { best = p; bestDiff = diff; }
    if (p.t > tCurrent + 10) break;
  }
  return best;
}

function renderSample(pts, maxPts) {
  if (!pts || pts.length <= maxPts) return pts || [];
  const step = Math.ceil(pts.length / maxPts);
  return pts.filter((_, i) => i % step === 0);
}

function admRenderMainChart(d, FTP) {
  const svg = document.getElementById('adm-main-svg');
  if (!svg) return;

  const W = svg.getBoundingClientRect().width || 600;
  const H = 200;
  const pad = { top: 14, right: 55, bottom: 26, left: 48 };
  const drawW = W - pad.left - pad.right;
  const drawH = H - pad.top - pad.bottom;

  // Bepaal tijdsbereik op basis van zoom
  const activeList = ADM_SERIES.filter(s => admSeriesVisible[s.key] && d[s.dataKey]?.length > 1);
  const altData = d.altitudeTimeline;

  // Bepaal maxT uit alle beschikbare data
  const allT = [];
  ADM_SERIES.forEach(s => { if (d[s.dataKey]?.length) allT.push(d[s.dataKey][d[s.dataKey].length-1].t); });
  if (altData?.length) allT.push(altData[altData.length-1].t);
  const fullMaxT = allT.length ? Math.max(...allT) : 1;

  const tMin = admZoomState.active ? admZoomState.tStart : 0;
  const tMax = admZoomState.active ? admZoomState.tEnd : fullMaxT;
  const tRange = tMax - tMin || 1;

  const xS = t => pad.left + ((t - tMin) / tRange) * drawW;

  // Filter helper: clip data to current time window
  function clip(pts) {
    if (!pts?.length) return [];
    return pts.filter(p => p.t >= tMin - 1 && p.t <= tMax + 1);
  }

  let svgHtml = '';

  // Hoogte als gevulde achtergrond (altijd, niet togglebaar)
  const altClipped = clip(altData);
  const altRender = renderSample(altClipped, Math.max(drawW, 300));
  if (altClipped.length > 1) {
    const altH = Math.round(drawH * 0.3);
    const minAlt = Math.min(...altClipped.map(p => p.alt));
    const maxAlt = Math.max(...altClipped.map(p => p.alt));
    const altRange = maxAlt - minAlt || 1;
    const altYfn = v => H - pad.bottom - (v - minAlt) / altRange * altH;
    const altBase = H - pad.bottom;
    const pts = altRender.map(p => xS(p.t) + ',' + altYfn(p.alt));
    pts.unshift(xS(altRender[0].t) + ',' + altBase);
    pts.push(xS(altRender[altRender.length-1].t) + ',' + altBase);
    svgHtml += '<polygon points="' + pts.join(' ') + '" fill="#6B7280" opacity="0.2"/>';
  }

  // Power zone-bands als achtergrond (context)
  const powerData = clip(d.powerTimeline);
  if (powerData.length > 1) {
    const maxP = Math.max(...powerData.map(p => p.w), FTP * 1.1) || 1;
    const powYfn = w => pad.top + (1 - w / maxP) * drawH;
    [[0,0.55],[0.55,0.75],[0.75,0.90],[0.90,1.05],[1.05,1.5]].forEach(([lo,hi], i) => {
      const y1 = powYfn(Math.min(hi * FTP, maxP));
      const y2 = powYfn(lo * FTP);
      svgHtml += '<rect x="' + pad.left + '" y="' + y1 + '" width="' + drawW +
        '" height="' + (y2-y1) + '" fill="' + ADM_ZONE_COLORS[i] + '" opacity="0.07"/>';
    });
  }

  // Tijdgrid
  const rawDuration = tRange;
  const interval = rawDuration > 7200 ? 1800 : rawDuration > 3600 ? 900 :
                   rawDuration > 1800 ? 600 : rawDuration > 600 ? 300 :
                   rawDuration > 300 ? 60 : 30;
  const firstTick = Math.ceil(tMin / interval) * interval;
  for (let t = firstTick; t <= tMax; t += interval) {
    const x = xS(t);
    const absT = t;
    const hh = Math.floor(absT/3600), mm = Math.floor((absT%3600)/60), ss = absT%60;
    const label = hh>0 ? hh+'u'+String(mm).padStart(2,'0') :
                  rawDuration > 300 ? mm+'min' :
                  mm+'m'+String(ss).padStart(2,'0')+'s';
    svgHtml += '<line x1="'+x+'" y1="'+pad.top+'" x2="'+x+'" y2="'+(H-pad.bottom)+
      '" stroke="#374151" stroke-width="0.5" opacity="0.4"/>';
    svgHtml += '<text x="'+x+'" y="'+(H-pad.bottom+12)+
      '" fill="#4A5568" font-size="8" text-anchor="middle">'+label+'</text>';
  }

  // FTP-lijn
  if (admSeriesVisible['power'] && powerData.length > 1) {
    const maxP = Math.max(...powerData.map(p => p.w), FTP * 1.1) || 1;
    const powYfn = w => pad.top + (1 - w / maxP) * drawH;
    const ftpY = powYfn(FTP);
    svgHtml += '<line x1="'+pad.left+'" y1="'+ftpY+'" x2="'+(pad.left+drawW)+'" y2="'+ftpY+
      '" stroke="#EF4444" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>';
    svgHtml += '<text x="'+(pad.left+4)+'" y="'+(ftpY-3)+'" fill="#EF4444" font-size="9">FTP '+FTP+'W</text>';
  }

  // Actieve series
  let leftAxisDone = false, rightAxisDone = false;
  activeList.forEach(s => {
    const clipped = clip(d[s.dataKey]);
    const data = renderSample(clipped, Math.max(drawW, 300));
    if (data.length < 2) return;
    const [yMin, yMax] = s.yDomain(data, FTP);
    const yRange = yMax - yMin || 1;
    const yFn = v => pad.top + (1 - (v - yMin) / yRange) * drawH;
    svgHtml += '<polyline points="' + data.map(p => xS(p.t)+','+yFn(p[s.valueKey])).join(' ') +
      '" fill="none" stroke="'+s.color+'" stroke-width="1.5" stroke-linejoin="round" id="adm-line-'+s.key+'"/>';
    if (s.axisPosition === 'left' && !leftAxisDone) {
      leftAxisDone = true;
      [yMin, (yMin+yMax)/2, yMax].forEach(v => {
        svgHtml += '<text x="'+(pad.left-4)+'" y="'+(yFn(v)+3)+
          '" fill="#4A5568" font-size="8" text-anchor="end">'+Math.round(v)+'</text>';
      });
    } else if (s.axisPosition === 'right' && !rightAxisDone) {
      rightAxisDone = true;
      [yMin, (yMin+yMax)/2, yMax].forEach(v => {
        svgHtml += '<text x="'+(pad.left+drawW+4)+'" y="'+(yFn(v)+3)+
          '" fill="#4A5568" font-size="8">'+Math.round(v)+'</text>';
      });
    }
  });

  svg.innerHTML = svgHtml;

  // Zoom-info tonen
  const zoomInfoEl = document.getElementById('adm-zoom-info');
  if (zoomInfoEl) {
    if (admZoomState.active) {
      const dur = tMax - tMin;
      const hh = Math.floor(dur/3600), mm = Math.floor((dur%3600)/60), ss = Math.round(dur%60);
      const durStr = hh>0 ? hh+'u'+String(mm).padStart(2,'0')+'m' :
                     mm>0 ? mm+'m'+String(ss).padStart(2,'0')+'s' : ss+'s';
      let distStr = '';
      if (d.distanceTimeline?.length) {
        function nearestD(t) {
          let best = d.distanceTimeline[0];
          for (const p of d.distanceTimeline) if (Math.abs(p.t-t)<Math.abs(best.t-t)) best = p;
          return best.d;
        }
        const km = Math.abs(nearestD(tMax) - nearestD(tMin));
        distStr = ' · ' + km.toFixed(2) + ' km';
      }
      let avgStr = '';
      const avgs = window._admZoomAverages || {};
      Object.values(avgs).forEach(a => {
        avgStr += ' · <span style="color:' + a.color + '">' +
                  a.label + ': <strong>' + a.avg + ' ' + a.unit + '</strong></span>';
      });
      zoomInfoEl.innerHTML = '🔍 <strong>' + durStr + distStr + '</strong>' + avgStr +
        ' <span style="opacity:0.5;font-size:11px">— dubbelklik om te resetten</span>';
      zoomInfoEl.style.display = 'block';
    } else {
      zoomInfoEl.style.display = 'none';
    }
  }

  // Tooltip
  let admTooltip = document.getElementById('adm-tooltip');
  if (!admTooltip) {
    admTooltip = document.createElement('div');
    admTooltip.id = 'adm-tooltip';
    admTooltip.className = 'adm-tooltip';
    document.body.appendChild(admTooltip);
  }

  // Crosshair
  const crosshair = document.createElementNS('http://www.w3.org/2000/svg','line');
  crosshair.setAttribute('y1', pad.top); crosshair.setAttribute('y2', H - pad.bottom);
  crosshair.setAttribute('stroke','rgba(255,255,255,0.4)');
  crosshair.setAttribute('stroke-width','1');
  crosshair.setAttribute('stroke-dasharray','3,3');
  crosshair.style.display = 'none';
  svg.appendChild(crosshair);

  // Selectierechthoek voor drag-zoom
  const selRect = document.createElementNS('http://www.w3.org/2000/svg','rect');
  selRect.setAttribute('y', pad.top);
  selRect.setAttribute('height', drawH);
  selRect.setAttribute('fill','rgba(255,255,255,0.12)');
  selRect.setAttribute('stroke','rgba(255,255,255,0.5)');
  selRect.setAttribute('stroke-width','1');
  selRect.style.display = 'none';
  selRect.style.pointerEvents = 'none';
  svg.appendChild(selRect);

  // Overlay voor muisgebeurtenissen
  const overlay = document.createElementNS('http://www.w3.org/2000/svg','rect');
  overlay.setAttribute('x', pad.left); overlay.setAttribute('y', pad.top);
  overlay.setAttribute('width', drawW); overlay.setAttribute('height', drawH);
  overlay.setAttribute('fill','transparent');
  overlay.style.cursor = 'crosshair';
  svg.appendChild(overlay);

  svg._admParams = { pad, W, H, drawW, tMin, tMax, tRange, d, FTP, activeList };

  let dragStartX = null;
  let isDragging = false;

  function nearest(pts, vKey, tCurrent) {
    if (!pts?.length) return null;
    let best = pts[0], bestDist = Math.abs(pts[0].t - tCurrent);
    for (const p of pts) {
      const dist = Math.abs(p.t - tCurrent);
      if (dist < bestDist) { best = p; bestDist = dist; }
    }
    return best[vKey];
  }

  overlay.addEventListener('mousedown', function(e) {
    const rect = svg.getBoundingClientRect();
    dragStartX = e.clientX - rect.left;
    isDragging = false;
    e.preventDefault();
  });

  overlay.addEventListener('mousemove', function(e) {
    const params = svg._admParams;
    if (!params) return;
    const svgRect = svg.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;

    if (dragStartX !== null) {
      const dx = Math.abs(mouseX - dragStartX);
      if (dx > 4) {
        isDragging = true;
        crosshair.style.display = 'none';
        admTooltip.style.display = 'none';
        const x1 = Math.min(dragStartX, mouseX);
        const x2 = Math.max(dragStartX, mouseX);
        selRect.setAttribute('x', x1);
        selRect.setAttribute('width', x2 - x1);
        selRect.style.display = '';
      }
      return;
    }

    // Tooltip
    const { pad: p, drawW: dw, tMin: tm, tRange: tr, d: dd, activeList: al } = params;
    if (mouseX < p.left || mouseX > p.left + dw) return;
    const tCurrent = tm + ((mouseX - p.left) / dw) * tr;
    const gpsPoint = nearestGpsPoint(dd.gpsTrack, tCurrent);
    if (gpsPoint && admLeafletMap) {
      if (!admCursorMarker) {
        admCursorMarker = L.circleMarker([gpsPoint.lat, gpsPoint.lng], {
          radius: 8, color: '#ffffff', fillColor: '#3B82F6',
          fillOpacity: 1, weight: 2
        }).addTo(admLeafletMap);
      } else {
        admCursorMarker.setLatLng([gpsPoint.lat, gpsPoint.lng]);
      }
    }
    const hh = Math.floor(tCurrent/3600), mm = Math.floor((tCurrent%3600)/60), ss = Math.round(tCurrent%60);
    const timeStr = hh>0 ? hh+'u'+String(mm).padStart(2,'0') :
                    tr > 300 ? mm+'min' : mm+'m'+String(ss).padStart(2,'0')+'s';
    let html = '<div class="adm-tooltip-time">'+timeStr+'</div>';
    al.forEach(s => {
      const data = clip(dd[s.dataKey]);
      const val = nearest(data, s.valueKey, tCurrent);
      if (val !== null && val !== undefined)
        html += '<div class="adm-tooltip-row"><span class="adm-tooltip-dot" style="background:'+s.color+'"></span>'+
          s.label+': <strong>'+val+' '+s.unit+'</strong></div>';
    });
    admTooltip.innerHTML = html;
    admTooltip.style.display = 'block';
    const tipW = 150;
    let tipX = e.clientX + 14;
    if (tipX + tipW > window.innerWidth) tipX = e.clientX - tipW - 14;
    admTooltip.style.left = tipX + 'px';
    admTooltip.style.top = (e.clientY - 60) + 'px';
    crosshair.setAttribute('x1', mouseX); crosshair.setAttribute('x2', mouseX);
    crosshair.style.display = '';
  });

  overlay.addEventListener('mouseup', function(e) {
    selRect.style.display = 'none';
    if (!isDragging || dragStartX === null) { dragStartX = null; isDragging = false; return; }
    const svgRect = svg.getBoundingClientRect();
    const mouseX = e.clientX - svgRect.left;
    const params = svg._admParams;
    const { pad: p, drawW: dw, tMin: tm, tRange: tr } = params;
    const x1 = Math.min(dragStartX, mouseX);
    const x2 = Math.max(dragStartX, mouseX);
    if (x2 - x1 < 8) { dragStartX = null; isDragging = false; return; }
    const newTStart = tm + Math.max(0, (x1 - p.left) / dw) * tr;
    const newTEnd   = tm + Math.min(1, (x2 - p.left) / dw) * tr;
    dragStartX = null; isDragging = false;
    admZoomState = { active: true, tStart: newTStart, tEnd: newTEnd };
    const _d = window._admCurrentDetail;
    const zoomAverages = {};
    ADM_SERIES.forEach(s => {
      if (!admSeriesVisible[s.key]) return;
      const pts = (_d[s.dataKey] || []).filter(p => p.t >= newTStart && p.t <= newTEnd);
      if (pts.length < 2) return;
      const sum = pts.reduce((acc, p) => acc + p[s.valueKey], 0);
      zoomAverages[s.key] = { avg: Math.round(sum / pts.length * 10) / 10,
                              label: s.label, unit: s.unit, color: s.color };
    });
    window._admZoomAverages = zoomAverages;
    admRenderMainChart(window._admCurrentDetail, window._admCurrentFTP);
    admUpdateMapZoom(newTStart, newTEnd, window._admCurrentDetail?.gpsTrack);
  });

  overlay.addEventListener('mouseleave', function() {
    if (!isDragging) {
      admTooltip.style.display = 'none';
      crosshair.style.display = 'none';
      if (admCursorMarker) {
        admCursorMarker.remove();
        admCursorMarker = null;
      }
    }
  });

  overlay.addEventListener('dblclick', function() {
    admZoomState = { active: false, tStart: null, tEnd: null };
    window._admZoomAverages = {};
    admRenderMainChart(window._admCurrentDetail, window._admCurrentFTP);
    admUpdateMapZoom(null, null, window._admCurrentDetail?.gpsTrack);
  });

  overlay.addEventListener('touchstart', function(e) {
    e.preventDefault();
  }, { passive: false });

  overlay.addEventListener('touchmove', function(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const svgRect = svg.getBoundingClientRect();
    const mouseX = touch.clientX - svgRect.left;
    const params = svg._admParams;
    if (!params) return;
    const { pad: p, drawW: dw, tMin: tm, tRange: tr, d: dd, activeList: al } = params;
    if (mouseX < p.left || mouseX > p.left + dw) return;
    const tCurrent = tm + ((mouseX - p.left) / dw) * tr;

    const gpsPoint = nearestGpsPoint(dd.gpsTrack, tCurrent);
    if (gpsPoint && admLeafletMap) {
      if (!admCursorMarker) {
        admCursorMarker = L.circleMarker([gpsPoint.lat, gpsPoint.lng], {
          radius: 8, color: '#ffffff', fillColor: '#3B82F6',
          fillOpacity: 1, weight: 2
        }).addTo(admLeafletMap);
      } else {
        admCursorMarker.setLatLng([gpsPoint.lat, gpsPoint.lng]);
      }
    }

    crosshair.setAttribute('x1', mouseX);
    crosshair.setAttribute('x2', mouseX);
    crosshair.style.display = '';
  }, { passive: false });

  overlay.addEventListener('touchend', function() {
    crosshair.style.display = 'none';
    if (admCursorMarker) { admCursorMarker.remove(); admCursorMarker = null; }
  });
}

function admToggleSeries(key) {
  admSeriesVisible[key] = !admSeriesVisible[key];
  const d = window._admCurrentDetail;
  const FTP = window._admCurrentFTP;
  const legendEl = document.getElementById('adm-chart-legend');
  if (legendEl && d) {
    legendEl.innerHTML = ADM_SERIES.filter(s => d[s.dataKey]?.length > 1).map(s => {
      const active = admSeriesVisible[s.key];
      return '<span class="adm-legend-pill ' + (active ? 'active' : 'inactive') + '" ' +
        'onclick="admToggleSeries(\'' + s.key + '\')" ' +
        'style="--pill-color:' + s.color + '">' +
        '<span class="adm-pill-dot"></span>' + s.label + '</span>';
    }).join('');
  }
  if (d && FTP) admRenderMainChart(d, FTP);
}

function admInitMap(gpsTrack) {
  const section = document.getElementById('adm-map-section');
  const container = document.getElementById('adm-map');
  if (!container || !gpsTrack?.length || !window.L) {
    if (section) section.style.display = 'none';
    return;
  }
  section.style.display = 'block';

  if (admLeafletMap) {
    admLeafletMap.remove();
    admLeafletMap = null;
    admRouteLayer = null;
    admSegmentLayer = null;
    admCursorMarker = null;
  }

  admLeafletMap = L.map('adm-map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
    maxZoom: 19
  }).addTo(admLeafletMap);

  const latlngs = gpsTrack.map(p => [p.lat, p.lng]);
  admRouteLayer = L.polyline(latlngs, {
    color: '#3B82F6', weight: 3, opacity: 0.85
  }).addTo(admLeafletMap);
  admLeafletMap.fitBounds(admRouteLayer.getBounds(), { padding: [20, 20] });
}

function admUpdateMapZoom(tStart, tEnd, gpsTrack) {
  if (!admLeafletMap || !gpsTrack?.length) return;
  if (admSegmentLayer) {
    admLeafletMap.removeLayer(admSegmentLayer);
    admSegmentLayer = null;
  }
  if (tStart === null || tEnd === null) {
    if (admRouteLayer) admLeafletMap.fitBounds(admRouteLayer.getBounds(), { padding: [20,20] });
    return;
  }
  const segment = gpsTrack.filter(p => p.t >= tStart && p.t <= tEnd);
  if (segment.length < 2) return;
  const latlngs = segment.map(p => [p.lat, p.lng]);
  admSegmentLayer = L.polyline(latlngs, {
    color: '#F59E0B', weight: 6, opacity: 0.95
  }).addTo(admLeafletMap);
  admLeafletMap.fitBounds(admSegmentLayer.getBounds(), { padding: [30,30] });
}

// ── Activity page routing ─────────────────────────────────────────────────────

function navigateToActivity(id) {
  // Volledige navigatie: de server serveert de nieuwe React-detailpagina
  // (/activity/:id → activity-detail/dist). Geen client-side render meer.
  window.location.href = '/activity/' + id;
}

function navigateToWorkout(hevyId) {
  window.location.href = '/workout/' + hevyId;
}

function renderActivityBack() {
  if (window.history.length > 1) {
    history.back();
  } else {
    const page = document.getElementById('activity-page');
    if (page) page.style.display = 'none';
    const appLayout = document.querySelector('.app-layout');
    const header = document.querySelector('.header');
    if (appLayout) appLayout.style.display = '';
    if (header) header.style.display = '';
    showTab('activiteiten', document.querySelector('.nav-item[onclick*="activiteiten"]'));
  }
}

window.addEventListener('popstate', () => {
  const actMatch = window.location.pathname.match(/^\/activity\/(\d+)$/);
  const wktMatch = window.location.pathname.match(/^\/workout\/([0-9a-zA-Z-]+)$/);
  if (actMatch) {
    renderActivityPage(actMatch[1]);
  } else if (wktMatch) {
    renderWorkoutPage(wktMatch[1]);
  } else {
    const page = document.getElementById('activity-page');
    if (page) page.style.display = 'none';
    const appLayout = document.querySelector('.app-layout');
    const header = document.querySelector('.header');
    if (appLayout) appLayout.style.display = '';
    if (header) header.style.display = '';
    const name = tabFromPath(location.pathname) || 'overview';
    if (name !== currentTab) showTabFromUrl(name);
  }
});

async function renderActivityPage(id) {
  const appLayout = document.querySelector('.app-layout');
  const header = document.querySelector('.header');
  if (appLayout) appLayout.style.display = 'none';
  if (header) header.style.display = 'none';

  let page = document.getElementById('activity-page');
  if (!page) {
    page = document.createElement('div');
    page.id = 'activity-page';
    document.body.appendChild(page);
  }
  page.style.display = 'block';
  page.innerHTML = `
    <div class="activity-header">
      <button class="ap-back-btn" onclick="renderActivityBack()">← Activiteiten</button>
      <div class="activity-header-center"><h2 class="ap-title">Laden...</h2></div>
      <button class="ap-close-btn" onclick="renderActivityBack()">×</button>
    </div>
    <div class="ap-body"><div style="padding:40px;text-align:center;color:var(--muted)">Activiteit laden...</div></div>
  `;

  if (admLeafletMap) { admLeafletMap.remove(); admLeafletMap = null; admRouteLayer = null; admSegmentLayer = null; }
  if (admCursorMarker) admCursorMarker = null;
  window._admZoomAverages = {};
  admZoomState = { active: false, tStart: null, tEnd: null };
  admSeriesVisible = {};

  let d;
  try {
    const resp = await fetch('/api/activity/' + id + '/detail');
    if (!resp.ok) throw new Error(await resp.text());
    d = await resp.json();
  } catch(e) {
    page.querySelector('.ap-body').innerHTML =
      `<div class="alert alert-error" style="margin:16px">Fout bij laden: ${e.message}</div>`;
    return;
  }

  const a = d.activity;
  const FTP = d.ftp || 280;
  window._admCurrentDetail = d;
  window._admCurrentFTP = FTP;

  if (d.powerTimeline?.length) {
    const WIN = 30;
    d.rollingPowerTimeline = d.powerTimeline.map((p, i) => {
      let sum = 0, cnt = 0, j = i;
      while (j >= 0 && p.t - d.powerTimeline[j].t < WIN) { sum += d.powerTimeline[j].w; cnt++; j--; }
      return { t: p.t, w: cnt ? Math.round(sum / cnt) : p.w };
    });
  }
  window._admComputedMetrics = {};
  if (d.powerTimeline?.length) {
    const pts = d.powerTimeline;
    window._admComputedMetrics.avgPower = Math.round(pts.reduce((s, p) => s + p.w, 0) / pts.length);
    window._admComputedMetrics.maxPower = Math.max(...pts.map(p => p.w));
  }
  if (d.hrTimeline?.length) {
    const pts = d.hrTimeline;
    window._admComputedMetrics.avgHR = Math.round(pts.reduce((s, p) => s + p.hr, 0) / pts.length);
    window._admComputedMetrics.maxHR = Math.max(...pts.map(p => p.hr));
  }
  if (d.rollingPowerTimeline?.length) {
    window._admComputedMetrics.maxRolling30 = Math.max(...d.rollingPowerTimeline.map(p => p.w));
  }

  const avgSpeed = a.distance_km && a.duration_min
    ? +(a.distance_km / a.duration_min * 60).toFixed(1) : null;
  const metricsHtml = [
    a.distance_km  ? `<div class="metric-card"><div class="metric-card-val">${a.distance_km}&nbsp;km</div><div class="metric-card-lbl">Afstand</div></div>` : '',
    `<div class="metric-card"><div class="metric-card-val">${a.duration_str}</div><div class="metric-card-lbl">Tijd</div></div>`,
    `<div class="metric-card"><div class="metric-card-val">${a.tss}</div><div class="metric-card-lbl">TSS<button class="pf-info-btn" data-tip="activity_tss" aria-label="Uitleg TSS"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></div></div>`,
    a.np           ? `<div class="metric-card"><div class="metric-card-val">${a.np}&nbsp;W</div><div class="metric-card-lbl">Norm. Vermogen<button class="pf-info-btn" data-tip="normalized_power" aria-label="Uitleg Norm. Vermogen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></div></div>` : '',
    a.avg_watts    ? `<div class="metric-card"><div class="metric-card-val">${a.avg_watts}&nbsp;W</div><div class="metric-card-lbl">Gem. Vermogen</div></div>` : '',
    d.hrSummary?.avgHR ? `<div class="metric-card"><div class="metric-card-val">${d.hrSummary.avgHR}</div><div class="metric-card-lbl">Gem. HR</div></div>` : '',
    a.elevation_m  ? `<div class="metric-card"><div class="metric-card-val">${a.elevation_m}&nbsp;m</div><div class="metric-card-lbl">Stijging</div></div>` : '',
    avgSpeed       ? `<div class="metric-card"><div class="metric-card-val">${avgSpeed}</div><div class="metric-card-lbl">km/u</div></div>` : '',
  ].join('');

  const derived = [];
  if (d.vi) derived.push([d.vi, 'VI<button class="pf-info-btn" data-tip="vi" aria-label="Uitleg VI"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button>', d.vi < 1.05 ? 'Stabiel tempo' : d.vi < 1.10 ? 'Licht variabel' : 'Variabel']);
  if (d.ef) derived.push([d.ef, 'EF', 'NP/gem.HR']);
  if (d.aerobicDecoupling) {
    const dc = d.aerobicDecoupling;
    const pct = Math.round(dc.decoupling * 1000) / 10;
    derived.push([pct + '%', 'Koppeling', dc.status === 'goed' ? '✓ Goed (<5%)' : '⚠ Drift (>5%)']);
  }
  const derivedHtml = derived.length
    ? `<div id="adm-derived-metrics" class="adm-derived-row">${derived.map(([v,l,sub]) =>
        `<div class="adm-derived-metric"><span class="adm-derived-val">${v}</span><span class="adm-derived-label">${l}</span><span class="adm-derived-sub">${sub}</span></div>`).join('')}</div>`
    : `<div id="adm-derived-metrics" style="display:none"></div>`;

  page.innerHTML = `
    <div class="activity-header">
      <button class="ap-back-btn" onclick="renderActivityBack()">← Activiteiten</button>
      <div class="activity-header-center">
        <h2 id="adm-title" class="ap-title">${a.name}</h2>
        <span id="adm-meta" class="ap-meta">${a.date} · ${a.type}</span>
      </div>
      <button class="ap-close-btn" onclick="renderActivityBack()">×</button>
    </div>

    <div class="ap-body">
      <div class="activity-metrics-strip">${metricsHtml}</div>
      ${derivedHtml}

      <details class="ap-accordion-section" open>
        <summary>Ritprofiel</summary>
        <div class="activity-main-grid">
          <div class="activity-left-col">
            <div id="adm-map-section" class="ap-section" style="display:none">
              <div id="adm-map" style="height:320px;max-height:420px;border-radius:8px;overflow:hidden"></div>
            </div>
            <div id="adm-main-chart-section" class="ap-section" style="display:none">
              <div class="adm-chart-legend" id="adm-chart-legend"></div>
              <div id="adm-zoom-info" class="adm-zoom-info" style="display:none"></div>
              <svg id="adm-main-svg" width="100%" height="200" style="display:block;overflow:visible"></svg>
            </div>
          </div>
          <div class="activity-right-col">
            <div class="ap-section">
              <h3 class="adm-section-title">Zoneverdeling</h3>
              <div id="adm-zone-bar" style="display:none"></div>
              <div id="adm-zone-labels" style="display:none"></div>
              <div id="adm-planned-comparison" style="display:none">
                <p style="font-size:11px;opacity:0.5;margin:8px 0 4px">Gepland vs werkelijk</p>
                <div id="adm-planned-bar"></div>
              </div>
            </div>
            <div id="adm-mmp-section" class="ap-section">
              <h3 class="adm-section-title">Mean Maximal Power<button class="pf-info-btn" data-tip="mmp" aria-label="Uitleg MMP"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></h3>
              <p class="adm-section-sub">Deze rit vs 90-dagen best</p>
              <div id="admMmpChart" style="margin-top:8px"></div>
            </div>
            <div id="adm-decoupling-section" class="ap-section" style="display:none">
              <h3 class="adm-section-title">Aerobe koppeling</h3>
              <div id="adm-decoupling-content"></div>
            </div>
            <div id="adm-planned-section" class="ap-section" style="display:none">
              <h3 class="adm-section-title">Geplande sessie</h3>
              <div id="adm-planned-blocks"></div>
            </div>
            <div id="adm-hr-row" class="ap-section" style="display:none">
              <span id="adm-hr-text" style="font-size:13px"></span>
            </div>
          </div>
        </div>
      </details>

      <details class="ap-accordion-section">
        <summary>Distributies</summary>
        <div class="activity-distributions-grid">
          <div id="adm-sect-power-hist"><h3 class="adm-section-title">Vermogen</h3><svg id="adm-power-hist" width="100%" height="130" style="display:block"></svg></div>
          <div id="adm-sect-hr-hist"><h3 class="adm-section-title">Hartslag</h3><svg id="adm-hr-hist" width="100%" height="130" style="display:block"></svg></div>
          <div id="adm-sect-cad-hist"><h3 class="adm-section-title">Cadans</h3><svg id="adm-dist-cadence-svg" width="100%" height="130" style="display:block"></svg></div>
          <div id="adm-sect-spd-hist"><h3 class="adm-section-title">Snelheid</h3><svg id="adm-dist-speed-svg" width="100%" height="130" style="display:block"></svg></div>
          <p id="adm-dist-nodata" class="adm-no-data" style="display:none;grid-column:1/-1">Geen distributies beschikbaar.</p>
        </div>
      </details>

      <details class="ap-accordion-section">
        <summary>Analyse</summary>
        <div class="activity-analysis-grid">
          <div id="adm-sect-scatter" class="ap-section"><h3 class="adm-section-title">Vermogen–Hartslag scatter</h3><canvas id="adm-scatter-canvas" height="200" style="width:100%;display:block"></canvas></div>
          <div id="adm-sect-drift" class="ap-section"><h3 class="adm-section-title">HR drift</h3><svg id="adm-drift-svg" width="100%" height="120" style="display:block;overflow:visible"></svg></div>
          <div id="adm-sect-quadrant" class="ap-section"><h3 class="adm-section-title">Vermogenskwadranten (vermogen × cadans)<button class="pf-info-btn" data-tip="power_quadrants" aria-label="Uitleg vermogenskwadranten"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></button></h3><canvas id="adm-quadrant-canvas" height="200" style="width:100%;display:block"></canvas></div>
          <p id="adm-analyse-nodata" class="adm-no-data" style="display:none;grid-column:1/-1">Geen analysedata beschikbaar.</p>
        </div>
      </details>

      <details class="ap-accordion-section">
        <summary>AI</summary>
        <div class="activity-ai-block ap-section">
          <h3 class="adm-section-title">AI-analyse</h3>
          <div id="adm-ai-content"><span style="font-size:13px;opacity:0.6">Analyseren...</span></div>
        </div>
      </details>
    </div>
  `;

  loadActivityAnalysis(id);

  // Force all accordion sections open on desktop
  if (window.innerWidth >= 601) {
    document.querySelectorAll('details.ap-accordion-section').forEach(el => { el.open = true; });
  }
  window.addEventListener('resize', function _apResize() {
    if (!document.getElementById('activity-page') || document.getElementById('activity-page').style.display === 'none') {
      window.removeEventListener('resize', _apResize); return;
    }
    if (window.innerWidth >= 601) {
      document.querySelectorAll('details.ap-accordion-section').forEach(el => { el.open = true; });
    }
  });

  // Main chart
  const hasAnyChart = ADM_SERIES.some(s => d[s.dataKey]?.length > 1);
  if (hasAnyChart) {
    ADM_SERIES.forEach(s => {
      admSeriesVisible[s.key] = d[s.dataKey]?.length > 1 ? ['power','hr'].includes(s.key) : false;
    });
    document.getElementById('adm-main-chart-section').style.display = 'block';
    document.getElementById('adm-chart-legend').innerHTML =
      ADM_SERIES.filter(s => d[s.dataKey]?.length > 1).map(s => {
        const active = admSeriesVisible[s.key];
        return '<span class="adm-legend-pill ' + (active ? 'active' : 'inactive') + '" ' +
          'onclick="admToggleSeries(\'' + s.key + '\')" ' +
          'style="--pill-color:' + s.color + '">' +
          '<span class="adm-pill-dot"></span>' + s.label + '</span>';
      }).join('');
    admRenderMainChart(d, FTP);
  }

  // Zone breakdown
  if (d.zoneBreakdown && !d.zoneBreakdown.estimated) {
    const zb = d.zoneBreakdown;
    const mins = [zb.z1Min,zb.z2Min,zb.z3Min,zb.z4Min,zb.z5Min];
    const tot = mins.reduce((s,v)=>s+v,0);
    const zBar = document.getElementById('adm-zone-bar');
    zBar.style.display = 'flex';
    zBar.innerHTML = mins.map((m,i) => {
      const pct = tot>0?(m/tot*100).toFixed(1):0;
      return '<div style="width:'+pct+'%;background:'+ADM_ZONE_COLORS[i]+
        ';height:24px;min-width:'+(pct>0?'2px':'0')+
        '" title="Z'+(i+1)+': '+m+'min ('+pct+'%)"></div>';
    }).join('');
    const zLabels = document.getElementById('adm-zone-labels');
    zLabels.style.display = 'flex';
    zLabels.innerHTML = mins.map((m,i)=>
      '<div class="adm-zone-label" style="color:'+ADM_ZONE_COLORS[i]+'">Z'+(i+1)+'<br>'+m+'min</div>'
    ).join('');
    if (d.plannedSession?.blokken?.length) {
      const pz = [0,0,0,0,0];
      d.plannedSession.blokken.forEach(b => {
        const reps=b.herhalingen||1, zi=_zoneIdx(b.zone);
        pz[zi]+=(b.duration||0)*reps;
        if(b.herstelBlok){pz[_zoneIdx(b.herstelBlok.zone)]+=(b.herstelBlok.duration||0)*reps;}
      });
      const pTot=pz.reduce((s,v)=>s+v,0);
      if(pTot>0){
        const comp=document.getElementById('adm-planned-comparison');
        comp.style.display='block';
        const mkBar=(vals,t)=>'<div style="display:flex;height:16px;border-radius:3px;overflow:hidden">'+
          vals.map((m,i)=>{const p=t>0?(m/t*100).toFixed(1):0;
            return '<div style="width:'+p+'%;background:'+ADM_ZONE_COLORS[i]+
              ';min-width:'+(p>0?'2px':'0')+'" title="Z'+(i+1)+': '+m+'min"></div>';
          }).join('')+'</div>';
        document.getElementById('adm-planned-bar').innerHTML=
          '<div class="adm-compare-row"><span>Gepland</span>'+mkBar(pz,pTot)+'</div>'+
          '<div class="adm-compare-row"><span>Werkelijk</span>'+mkBar(mins,tot)+'</div>';
      }
    }
  }

  // MMP vergelijkingscurve
  renderActivityMmpChart(d);

  // HR + cadence
  if (d.hrSummary?.avgHR) {
    document.getElementById('adm-hr-row').style.display='block';
    let txt='Hartslag: gem. '+d.hrSummary.avgHR+' bpm  max '+d.hrSummary.maxHR+' bpm';
    if (d.avgCadence) txt+='  ·  Cadans: '+d.avgCadence+' rpm';
    document.getElementById('adm-hr-text').textContent=txt;
  }

  // Aerobic decoupling
  if (d.aerobicDecoupling) {
    const dc=d.aerobicDecoupling;
    document.getElementById('adm-decoupling-section').style.display='block';
    const pct=Math.round(dc.decoupling*1000)/10;
    const kleur=dc.status==='goed'?'#10B981':'#F59E0B';
    document.getElementById('adm-decoupling-content').innerHTML=
      '<div class="adm-decoupling-row">'+
      '<div class="adm-dc-block"><span class="adm-dc-val">'+Math.round(dc.ef1*100)/100+'</span><span class="adm-dc-label">EF eerste helft</span></div>'+
      '<div class="adm-dc-block"><span class="adm-dc-val">'+Math.round(dc.ef2*100)/100+'</span><span class="adm-dc-label">EF tweede helft</span></div>'+
      '<div class="adm-dc-block"><span class="adm-dc-val" style="color:'+kleur+'">'+pct+'%</span><span class="adm-dc-label">Koppeling</span></div>'+
      '<div class="adm-dc-desc">'+(dc.status==='goed'
        ?'Goede aerobe koppeling — cardiovasculair systeem stabiel gedurende de rit.'
        :'HR-drift gedetecteerd — mogelijke oorzaak: glycogeenuitputting, dehydratie of te hoge intensiteit voor aerobe basis (Friel / Allen & Coggan).')+
      '</div></div>';
  }

  // Planned session blocks
  if (d.plannedSession) {
    document.getElementById('adm-planned-section').style.display='block';
    document.getElementById('adm-planned-blocks').innerHTML=
      '<p style="margin:0 0 6px;font-size:12px;opacity:0.6">'+
      (d.plannedSession.title||'–')+' — target '+d.plannedSession.targetTSS+' TSS</p>'+
      (d.plannedSession.blokken||[]).map(b=>{
        const zi=_zoneIdx(b.zone);
        const reps=b.herhalingen>1?b.herhalingen+'× ':'';
        const watt=(b.wattMin&&b.wattMax)?' · '+b.wattMin+'–'+b.wattMax+'W':'';
        let txt=reps+(b.type||'blok')+' '+b.duration+'min · Z'+(zi+1)+watt;
        if(b.herstelBlok)txt+=' | herstel '+b.herstelBlok.duration+'min Z'+(_zoneIdx(b.herstelBlok.zone)+1);
        return '<div class="adm-block-row" style="border-left:3px solid '+ADM_ZONE_COLORS[zi]+'">'+txt+'</div>';
      }).join('');
  }

  // GPS map + distributions + analysis (deferred for layout settling)
  setTimeout(() => admInitMap(d.gpsTrack), 50);
  setTimeout(() => {
    admRenderDistributies(d, FTP);
    admRenderAnalyse(d, FTP);
  }, 100);
}

// ── Workout page (Hevy strength detail) ──────────────────────────────────────

async function renderWorkoutPage(hevyId) {
  const appLayout = document.querySelector('.app-layout');
  const header = document.querySelector('.header');
  if (appLayout) appLayout.style.display = 'none';
  if (header) header.style.display = 'none';

  let page = document.getElementById('activity-page');
  if (!page) {
    page = document.createElement('div');
    page.id = 'activity-page';
    document.body.appendChild(page);
  }
  page.style.display = 'block';
  page.innerHTML = `
    <div class="activity-header">
      <button class="ap-back-btn" onclick="renderActivityBack()">← Activiteiten</button>
      <div class="activity-header-center"><h2 class="ap-title">Laden...</h2></div>
      <button class="ap-close-btn" onclick="renderActivityBack()">×</button>
    </div>
    <div class="ap-body"><div style="padding:40px;text-align:center;color:var(--muted)">Workout laden...</div></div>
  `;

  let summary;
  try {
    const resp = await fetch('/api/hevy/workout/' + hevyId + '/summary');
    if (!resp.ok) throw new Error(await resp.text());
    summary = await resp.json();
  } catch(e) {
    page.querySelector('.ap-body').innerHTML =
      `<div class="alert alert-error" style="margin:16px">Fout bij laden: ${e.message}</div>`;
    return;
  }

  const workoutName = summary.workoutName || 'Workout';
  const workoutDate = summary.workoutDate ? fmtD(summary.workoutDate, true) : '';
  const splitLabel  = summary.workoutDescription || 'Krachttraining';

  const metricsHtml = [
    `<div class="metric-card"><div class="metric-card-val">${summary.workingSets}</div><div class="metric-card-lbl">Werksets</div></div>`,
    `<div class="metric-card"><div class="metric-card-val">${summary.tonnage}&nbsp;kg</div><div class="metric-card-lbl">Tonnage</div></div>`,
    summary.durationMin ? `<div class="metric-card"><div class="metric-card-val">${summary.durationMin}&nbsp;min</div><div class="metric-card-lbl">Duur</div></div>` : '',
    summary.avgRPE != null ? `<div class="metric-card"><div class="metric-card-val">${summary.avgRPE}</div><div class="metric-card-lbl">Gem. RPE</div></div>` : '',
    summary.topE1rm ? `<div class="metric-card"><div class="metric-card-val">${summary.topE1rm.e1rm}&nbsp;kg</div><div class="metric-card-lbl">${summary.topE1rm.exercise}</div></div>` : '',
  ].join('');

  const exercisesHtml = (summary.perExercise || []).map(ex => {
    const rows = ex.sets.map((s, i) => {
      const e1rmCell = s.e1rm != null
        ? (s.lowConfidence ? `<span class="ws-e1rm-low">~${s.e1rm} kg</span>` : `${s.e1rm} kg`)
        : '–';
      return `<tr>
        <td>${i + 1}</td>
        <td>${s.weight ? s.weight + ' kg' : '–'}</td>
        <td>${s.reps || '–'}</td>
        <td>${s.rpe != null ? s.rpe : '–'}</td>
        <td>${e1rmCell}</td>
      </tr>`;
    }).join('');
    const bestBadge = ex.bestE1rm
      ? `<span class="ws-exercise-best">${ex.bestE1rm} kg e1RM</span>` : '';
    return `
      <div class="ws-exercise-block">
        <div class="ws-exercise-name">${ex.name}${bestBadge}</div>
        <table class="ws-set-table">
          <thead><tr><th>#</th><th>Gewicht</th><th>Reps</th><th>RPE</th><th>e1RM</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join('') || '<div style="color:var(--muted);font-size:13px">Geen oefeningen gevonden.</div>';

  const e1RMTrends = S.fullState?.strengthMetrics?.e1RMTrends || [];
  const thisNames  = new Set((summary.perExercise || []).map(e => e.name));
  const relevant   = e1RMTrends.filter(t => thisNames.has(t.exercise) && t.sessions.length >= 2);
  const progressieHtml = relevant.length > 0
    ? relevant.map(t => {
        const last  = t.sessions[t.sessions.length - 1];
        const prev  = t.sessions[t.sessions.length - 2];
        const delta = Math.round((last.e1rm - prev.e1rm) * 10) / 10;
        const sign  = delta >= 0 ? '+' : '';
        const col   = delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--muted)';
        const recent = t.sessions.slice(-4);
        const maxE   = Math.max(...recent.map(s => s.e1rm)) || 1;
        const bars   = recent.map(s => {
          const h = Math.round(s.e1rm / maxE * 40);
          return `<div style="width:18px;height:${h}px;background:var(--accent);border-radius:2px 2px 0 0;margin-right:2px" title="${s.date}: ${s.e1rm} kg"></div>`;
        }).join('');
        return `
          <div class="ws-prog-block">
            <div class="ws-prog-name">${t.exercise}</div>
            <div class="ws-prog-row">
              <div style="display:flex;align-items:flex-end;height:44px;margin-right:10px">${bars}</div>
              <div>
                <div style="font-size:15px;font-weight:700;font-family:'Inter Tight',sans-serif">${last.e1rm} kg</div>
                <div style="font-size:11px;color:${col}">${sign}${delta} kg vs vorige sessie</div>
              </div>
            </div>
          </div>`;
      }).join('')
    : '<div style="color:var(--muted);font-size:13px;padding:8px 0">Nog geen trenddata voor oefeningen in deze sessie.</div>';

  page.innerHTML = `
    <div class="activity-header">
      <button class="ap-back-btn" onclick="renderActivityBack()">← Activiteiten</button>
      <div class="activity-header-center">
        <h2 class="ap-title">${workoutName}</h2>
        <span class="ap-meta">${workoutDate} · Hevy <span class="pf-badge pf-badge-tss" style="font-size:9px;margin-left:4px">${splitLabel}</span></span>
      </div>
      <button class="ap-close-btn" onclick="renderActivityBack()">×</button>
    </div>
    <div class="ap-body">
      <div class="activity-metrics-strip">${metricsHtml}</div>

      <details class="ap-accordion-section" open>
        <summary>Spiergroepen</summary>
        <div class="ap-section">
          <div id="ws-muscle-body" style="color:var(--muted);font-size:13px">Wordt geladen...</div>
        </div>
      </details>

      <details class="ap-accordion-section" open>
        <summary>Oefeningen</summary>
        <div class="ap-section">${exercisesHtml}</div>
      </details>

      <details class="ap-accordion-section" open>
        <summary>Progressie</summary>
        <div class="ap-section">${progressieHtml}</div>
      </details>

      <details class="ap-accordion-section" open>
        <summary>Coach-analyse</summary>
        <div class="activity-ai-block ap-section">
          <h3 class="adm-section-title">COACH-ANALYSE</h3>
          <div id="ws-ai-content"><span style="font-size:13px;opacity:0.6">Analyseren...</span></div>
        </div>
      </details>
    </div>
  `;

  if (window.innerWidth >= 601) {
    document.querySelectorAll('details.ap-accordion-section').forEach(el => { el.open = true; });
  }
  window.addEventListener('resize', function _wpResize() {
    if (!document.getElementById('activity-page') || document.getElementById('activity-page').style.display === 'none') {
      window.removeEventListener('resize', _wpResize); return;
    }
    if (window.innerWidth >= 601) {
      document.querySelectorAll('details.ap-accordion-section').forEach(el => { el.open = true; });
    }
  });

  loadWorkoutAnalysis(hevyId);
  loadWorkoutMuscles(hevyId);
}

async function loadWorkoutAnalysis(hevyId) {
  const container = document.getElementById('ws-ai-content');
  if (!container) return;
  container.innerHTML = '<span style="font-size:13px;opacity:0.6">Analyseren...</span>';
  try {
    const resp = await fetch('/api/hevy/workout/' + hevyId + '/analyse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    const d = await resp.json();
    const c = document.getElementById('ws-ai-content');
    if (!c) return;
    c.innerHTML = '<div class="adm-ai-text">' + (d.text || 'Analyse niet beschikbaar.') + '</div>';
  } catch(e) {
    const c = document.getElementById('ws-ai-content');
    if (c) c.innerHTML = '<span style="font-size:13px;opacity:0.6">Fout bij laden.</span>';
  }
}

// ── Muscle body visualization ──────────────────────────────────────────────

const _WS_MUSCLE_NL = {
  abdominals: 'Buikspieren', adductors: 'Adductoren', biceps: 'Biceps',
  calves: 'Kuiten', chest: 'Borst', forearms: 'Onderarmen',
  glutes: 'Bilspieren', hamstrings: 'Hamstrings', lats: 'Latissimus',
  lower_back: 'Lage rug', quadriceps: 'Quadriceps', shoulders: 'Schouders',
  triceps: 'Triceps', upper_back: 'Bovenrug'
};

// Hevy muscle label → body-highlighter slug(s)
// Values are arrays; one label may light up multiple SVG regions.
// SVG anatomy note: package "trapezius" draws the upper-back triangle,
// "upper-back" draws the broad lateral slab (functionally the lats zone).
const _WS_HEVY_TO_SLUG = {
  chest:       ['chest'],
  abdominals:  ['abs', 'obliques'],
  biceps:      ['biceps'],
  triceps:     ['triceps'],
  shoulders:   ['deltoids'],
  forearms:    ['forearm'],
  quadriceps:  ['quadriceps'],
  adductors:   ['adductors'],
  calves:      ['calves'],
  glutes:      ['gluteal'],
  hamstrings:  ['hamstring'],
  lower_back:  ['lower-back'],
  upper_back:  ['trapezius'],
  lats:        ['upper-back'],
};

// Inverse: slug → [hevy labels]
const _WS_SLUG_TO_HEVY = {};
Object.entries(_WS_HEVY_TO_SLUG).forEach(([hevy, slugs]) => {
  slugs.forEach(slug => {
    if (!_WS_SLUG_TO_HEVY[slug]) _WS_SLUG_TO_HEVY[slug] = [];
    _WS_SLUG_TO_HEVY[slug].push(hevy);
  });
});

// Dutch label for slug (used in panel title when a slug maps to multiple Hevy labels)
const _WS_SLUG_NL = {
  'chest':       'Borst',
  'abs':         'Buikspieren',
  'biceps':      'Biceps',
  'calves':      'Kuiten',
  'forearm':     'Onderarmen',
  'gluteal':     'Bilspieren',
  'hamstring':   'Hamstrings',
  'quadriceps':  'Quadriceps',
  'deltoids':    'Schouders',
  'triceps':     'Triceps',
  'lower-back':  'Lage rug',
  'upper-back':  'Latissimus',
  'trapezius':   'Bovenrug',
  'obliques':    'Buikspieren',
  'adductors':   'Adductoren',
};

async function loadWorkoutMuscles(hevyId) {
  const container = document.getElementById('ws-muscle-body');
  if (!container) return;

  let data;
  try {
    const resp = await fetch('/api/hevy/workout/' + hevyId + '/muscles');
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    container.style.cssText = '';
    container.innerHTML = '<span style="font-size:13px;color:var(--muted)">Spierdata niet beschikbaar.</span>';
    return;
  }

  const dist     = data.distribution || {};
  const byMuscle = data.byMuscle    || {};
  const unmapped = data.unmapped    || [];
  const maxVal   = Math.max(0.001, ...Object.values(dist));

  container.style.cssText = '';
  container.innerHTML =
    '<div class="ws-mb-layout">' +
      '<div class="ws-mb-svg-box">' + _buildMuscleSvg(dist, maxVal) + '</div>' +
      '<div class="ws-mb-panel-box"><div id="ws-mb-panel" class="ws-mb-panel">' +
        _buildMuscleDefault(dist, maxVal) +
      '</div></div>' +
    '</div>' +
    (unmapped.length
      ? '<p class="ws-mb-unmapped">Niet toegewezen aan een spiergroep: ' + unmapped.join(', ') + '</p>'
      : '');

  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  svgEl.addEventListener('click', function (e) {
    const region     = e.target.closest('[data-muscle]');
    const panel      = document.getElementById('ws-mb-panel');
    const allRegions = svgEl.querySelectorAll('[data-muscle]');
    if (!panel) return;

    if (!region) {
      allRegions.forEach(el => el.classList.remove('ws-mb-selected'));
      panel.innerHTML = _buildMuscleDefault(dist, maxVal);
      return;
    }

    const slug       = region.dataset.muscle;
    const isSelected = region.classList.contains('ws-mb-selected');
    allRegions.forEach(el => el.classList.remove('ws-mb-selected'));

    if (!isSelected) {
      svgEl.querySelectorAll('[data-muscle="' + slug + '"]')
           .forEach(el => el.classList.add('ws-mb-selected'));
      panel.innerHTML = _buildMuscleDetail(slug, dist, byMuscle);
    } else {
      panel.innerHTML = _buildMuscleDefault(dist, maxVal);
    }
  });
}

function _buildMuscleSvg(dist, maxVal) {
  // Per-slug combined load (sum all Hevy labels that map to this slug)
  function slugLoad(slug) {
    const hevyLabels = _WS_SLUG_TO_HEVY[slug] || [];
    return hevyLabels.reduce((sum, h) => sum + (dist[h] || 0), 0);
  }

  // Unmapped slugs (no Hevy label maps to them) render as neutral background
  const NEUTRAL_SLUGS = new Set([
    'head', 'hair', 'neck', 'hands', 'feet', 'ankles', 'knees', 'tibialis'
  ]);

  function pathAttrs(slug) {
    if (NEUTRAL_SLUGS.has(slug)) {
      return 'fill="var(--surface2)" stroke="var(--border)" stroke-width="0.8" style="cursor:default"';
    }
    const load = slugLoad(slug);
    const f = load > 0 ? Math.min(1, load / maxVal) : 0;
    if (f <= 0) {
      return 'data-muscle="' + slug + '" class="ws-mb-region ws-mb-inactive" ' +
        'fill="var(--border)" fill-opacity="1" stroke="var(--border2)" stroke-width="0.8"';
    }
    const fo = +(0.18 + f * 0.77).toFixed(2);
    return 'data-muscle="' + slug + '" class="ws-mb-region ws-mb-active" ' +
      'fill="var(--accent)" fill-opacity="' + fo + '" stroke="var(--accent2)" stroke-width="0.8"';
  }

  const bodyFront = (typeof window !== 'undefined' ? window.BODY_FRONT : []) || [];
  const bodyBack  = (typeof window !== 'undefined' ? window.BODY_BACK  : []) || [];

  let paths = '';
  bodyFront.forEach(muscle => {
    const attrs = pathAttrs(muscle.slug);
    muscle.paths.forEach(d => {
      paths += '<path ' + attrs + ' d="' + d + '"/>';
    });
  });
  bodyBack.forEach(muscle => {
    const attrs = pathAttrs(muscle.slug);
    muscle.paths.forEach(d => {
      paths += '<path ' + attrs + ' d="' + d + '"/>';
    });
  });

  return '<svg viewBox="0 0 1448 1448" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;display:block">' +
    '<text x="362" y="28" text-anchor="middle" font-size="28" font-family="JetBrains Mono,monospace" font-weight="700" letter-spacing="4" fill="var(--muted)">VOOR</text>' +
    '<text x="1086" y="28" text-anchor="middle" font-size="28" font-family="JetBrains Mono,monospace" font-weight="700" letter-spacing="4" fill="var(--muted)">ACHTER</text>' +
    paths +
    '</svg>';
}

function _buildMuscleDefault(dist, maxVal) {
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (!sorted.length) {
    return '<p style="color:var(--muted);font-size:13px">Geen spierdata voor deze sessie.</p>';
  }
  return '<div class="ws-mb-ptitle">MEEST BELAST</div>' +
    sorted.map(([m, v], i) => {
      const pct = Math.round(v / maxVal * 100);
      return '<div class="ws-mb-top-item">' +
        '<div class="ws-mb-top-hd">' +
          '<span class="ws-mb-top-rank">' + (i + 1) + '</span>' +
          '<span class="ws-mb-top-name">' + (_WS_MUSCLE_NL[m] || m) + '</span>' +
          '<span class="ws-mb-top-val">' + v.toFixed(1) + '</span>' +
        '</div>' +
        '<div class="ws-mb-bar-wrap"><div class="ws-mb-bar-fill" style="width:' + pct + '%"></div></div>' +
      '</div>';
    }).join('') +
    '<p class="ws-mb-hint">Klik een spierregio voor details</p>';
}

function _buildMuscleDetail(slug, dist, byMuscle) {
  const hevyLabels = _WS_SLUG_TO_HEVY[slug] || [];
  const title = _WS_SLUG_NL[slug] || slug;

  // Combine all Hevy labels that map to this slug
  const total = hevyLabels.reduce((s, h) => s + (dist[h] || 0), 0);

  let sections = '';
  hevyLabels.forEach((hevyLabel, idx) => {
    const labelTotal = dist[hevyLabel] || 0;
    if (!labelTotal && !(byMuscle[hevyLabel] || []).length) return;

    const exs = [...(byMuscle[hevyLabel] || [])].sort((a, b) =>
      a.role !== b.role ? (a.role === 'primary' ? -1 : 1) : b.workingSets - a.workingSets
    );

    // If the slug covers more than one Hevy label, show a sub-heading per label
    if (hevyLabels.length > 1) {
      const sepStyle = idx === 0 ? '' : 'border-top:1px solid var(--divider);margin-top:10px;padding-top:8px;';
      sections += '<div class="ws-mb-role-hd" style="' + sepStyle + '">' +
        (_WS_MUSCLE_NL[hevyLabel] || hevyLabel).toUpperCase() +
        '<span style="font-weight:400;margin-left:4px;color:var(--muted)">(' + labelTotal.toFixed(1) + ' pts)</span>' +
        '</div>';
    }

    let lastRole = null, firstRow = true;
    sections += exs.map(ex => {
      let hd = '';
      if (ex.role !== lastRole) {
        lastRole = ex.role;
        const sep = firstRow ? '' : 'border-top:1px solid var(--divider);margin-top:8px;padding-top:6px;';
        firstRow = false;
        hd = '<div class="ws-mb-role-hd" style="' + sep + '">' + (ex.role === 'primary' ? 'Primair' : 'Secundair') + '</div>';
      }
      return hd +
        '<div class="ws-mb-ex-row">' +
          '<span class="ws-mb-ex-name">' + ex.exercise + '</span>' +
          '<span class="ws-mb-ex-meta">' + ex.workingSets + '× · ' + ex.contribution.toFixed(1) + ' pts</span>' +
        '</div>';
    }).join('');
  });

  return '<div class="ws-mb-ptitle">' + title.toUpperCase() + '</div>' +
    '<div class="ws-mb-total">Gewogen sets: <strong>' + total.toFixed(1) + '</strong></div>' +
    '<div class="ws-mb-ex-list">' + (sections || '<span style="color:var(--muted);font-size:12px">Geen oefeningen.</span>') + '</div>';
}

function renderActivityMmpChart(detail) {
  const el = document.getElementById('admMmpChart');
  if (!el) return;
  const actPts  = detail.activityMmpCurve;
  const bestPts = detail.bestMmpCurve;
  if (!actPts?.length) {
    el.innerHTML = '<div style="color:var(--muted);font-size:12px">Geen vermogensdata beschikbaar voor curve.</div>';
    return;
  }
  el.innerHTML = '<canvas id="chartAdmMmp" height="100"></canvas><div id="admMmpMeta" style="font-size:10px;color:var(--muted);margin-top:4px"></div>';
  const gridColor = 'rgba(255,255,255,0.06)', tickColor = '#666';
  makeChart('chartAdmMmp', {
    type: 'line',
    data: {
      labels: actPts.map(p => formatDur(p.dur)),
      datasets: [
        { label: 'Deze rit', data: actPts.map(p => p.watts),
          borderColor: '#f97316', backgroundColor: '#f9731612',
          borderWidth: 2, pointRadius: 0, tension: 0.2, fill: true, spanGaps: true },
        { label: '90d best', data: (bestPts||[]).map(p => p.watts),
          borderColor: '#555', borderWidth: 1.5, pointRadius: 0,
          tension: 0.2, borderDash: [4,4], spanGaps: true }
      ]
    },
    options: {
      responsive: true,
      onClick: (evt, elements, chart) => {
        const els = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: false }, true);
        if (!els.length || els[0].datasetIndex !== 1) return;
        const p = bestPts?.[els[0].index];
        if (p?.activityId) navigateToActivity(p.activityId);
      },
      onHover: (evt, els) => {
        if (evt.native?.target) evt.native.target.style.cursor = els.length ? 'pointer' : 'default';
      },
      plugins: {
        legend: { labels: { color: '#aaa', font: { size: 10 } } },
        tooltip: {
          mode: 'index', intersect: false,
          callbacks: {
            title: ctx => formatDur(actPts[ctx[0]?.dataIndex]?.dur || 0),
            label: ctx => {
              if (ctx.datasetIndex === 0) return 'Deze rit: ' + (ctx.parsed.y ?? '–') + 'W';
              const p = bestPts?.[ctx.dataIndex];
              const lines = ['90d best: ' + (p?.watts ?? '–') + 'W'];
              if (p?.name) lines.push('📍 ' + p.name + ' (' + p.date + ')');
              return lines;
            }
          }
        }
      },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 10 } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 } }, title: { display: true, text: 'Watt', color: tickColor, font: { size: 10 } } }
      }
    }
  });
  if (document.getElementById('admMmpMeta') && bestPts?.length) {
    const bestCount = bestPts.filter(p => p.watts).length;
    document.getElementById('admMmpMeta').textContent = bestCount > 0 ? '90-dagen best beschikbaar · klik op grijze lijn om te navigeren' : '90-dagen best: nog geen data (druk Berekenen op Trends-tab)';
  }
}

// (openActivityDetail replaced by renderActivityPage above)
// Kept as no-op for any external references
function openActivityDetail(stravaId) { navigateToActivity(stravaId); }


function admDrawHistBar(svgEl, bins, colorFn, labelFn) {
  const W = svgEl.getBoundingClientRect().width || svgEl.parentElement?.offsetWidth || 320;
  const H = 130;
  svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svgEl.innerHTML = '';
  const maxVal = Math.max(...bins.map(b => b.count), 1);
  const padL = 6, padR = 6, padT = 6, padB = 22;
  const dW = W - padL - padR;
  const dH = H - padT - padB;
  const bw = dW / bins.length;
  bins.forEach((bin, i) => {
    const barH = (bin.count / maxVal) * dH;
    const x = padL + i * bw;
    const y = padT + dH - barH;
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x + 1); rect.setAttribute('y', y);
    rect.setAttribute('width', Math.max(bw - 2, 1)); rect.setAttribute('height', barH);
    rect.setAttribute('fill', colorFn(bin, i)); rect.setAttribute('rx', 2);
    svgEl.appendChild(rect);
    if (bin.secs !== undefined && barH >= 8) {
      const tl = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tl.setAttribute('x', x + bw / 2); tl.setAttribute('y', y - 3);
      tl.setAttribute('text-anchor', 'middle'); tl.setAttribute('font-size', '9');
      tl.setAttribute('fill', 'rgba(255,255,255,0.6)'); tl.textContent = admFmtSecs(bin.secs);
      svgEl.appendChild(tl);
    }
    if (i % Math.max(1, Math.ceil(bins.length / 6)) === 0 || i === bins.length - 1) {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x + bw / 2); t.setAttribute('y', H - 4);
      t.setAttribute('text-anchor', 'middle'); t.setAttribute('font-size', '9');
      t.setAttribute('fill', '#6B7280'); t.textContent = labelFn(bin, i);
      svgEl.appendChild(t);
    }
  });
}

function admFmtSecs(s) {
  if (s < 60) return Math.round(s) + 's';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return sec > 0 ? m + 'm' + String(sec).padStart(2, '0') + 's' : m + 'min';
}

function admZoneLegend(svgId, zones, unit, pctPerZone) {
  const el = document.getElementById(svgId);
  if (!el) return;
  const existing = el.nextElementSibling;
  if (existing?.classList.contains('adm-zone-legend-row')) existing.remove();
  const row = document.createElement('div');
  row.className = 'adm-zone-legend-row';
  zones.forEach((z, i) => {
    const hiStr = z.hi !== null ? z.hi : '∞';
    const pct = pctPerZone ? ' · ' + pctPerZone[i] + '%' : '';
    const span = document.createElement('span');
    span.className = 'adm-zone-legend-item';
    span.innerHTML = '<span class="adm-pill-dot" style="--pill-color:' +
      z.color + '"></span>' + z.label + ' ' + z.lo + '–' + hiStr + unit + pct;
    row.appendChild(span);
  });
  el.after(row);
}

function admRenderDistributies(d, FTP) {
  const ftp = FTP || 280;
  const hasPower = d.powerTimeline?.length > 1;
  const hasHR    = d.hrTimeline?.length > 1;
  const hasCad   = d.cadenceTimeline?.length > 1;
  const hasSpd   = d.velocityTimeline?.length > 1;

  document.getElementById('adm-sect-power-hist').style.display = hasPower ? '' : 'none';
  document.getElementById('adm-sect-hr-hist').style.display    = hasHR    ? '' : 'none';
  document.getElementById('adm-sect-cad-hist').style.display   = hasCad   ? '' : 'none';
  document.getElementById('adm-sect-spd-hist').style.display   = hasSpd   ? '' : 'none';

  const noData = document.getElementById('adm-dist-nodata');
  if (noData) noData.style.display = (!hasPower && !hasHR && !hasCad && !hasSpd) ? '' : 'none';
  if (!hasPower && !hasHR && !hasCad && !hasSpd) return;

  const z = window._admSettings?.zones || {};
  const pZ = [
    (z.z1 || 55) / 100,
    (z.z2 || 75) / 100,
    (z.z3 || 90) / 100,
    (z.z4 || 105) / 100,
  ];
  const pwrZones = [
    { label:'Z1', lo:0,                     hi:Math.round(pZ[0]*ftp), color:ADM_ZONE_COLORS[0] },
    { label:'Z2', lo:Math.round(pZ[0]*ftp), hi:Math.round(pZ[1]*ftp), color:ADM_ZONE_COLORS[1] },
    { label:'Z3', lo:Math.round(pZ[1]*ftp), hi:Math.round(pZ[2]*ftp), color:ADM_ZONE_COLORS[2] },
    { label:'Z4', lo:Math.round(pZ[2]*ftp), hi:Math.round(pZ[3]*ftp), color:ADM_ZONE_COLORS[3] },
    { label:'Z5', lo:Math.round(pZ[3]*ftp), hi:null,                  color:ADM_ZONE_COLORS[4] },
  ];
  const hrMax = window._admSettings?.hrMax || 197;
  const hZ = window._admSettings?.hrZones || [60, 70, 80, 90];
  const hrZones = [
    { label:'Z1', lo:0,                           hi:Math.round(hZ[0]/100*hrMax), color:ADM_ZONE_COLORS[0] },
    { label:'Z2', lo:Math.round(hZ[0]/100*hrMax), hi:Math.round(hZ[1]/100*hrMax), color:ADM_ZONE_COLORS[1] },
    { label:'Z3', lo:Math.round(hZ[1]/100*hrMax), hi:Math.round(hZ[2]/100*hrMax), color:ADM_ZONE_COLORS[2] },
    { label:'Z4', lo:Math.round(hZ[2]/100*hrMax), hi:Math.round(hZ[3]/100*hrMax), color:ADM_ZONE_COLORS[3] },
    { label:'Z5', lo:Math.round(hZ[3]/100*hrMax), hi:null,                        color:ADM_ZONE_COLORS[4] },
  ];
  const zonePctThresh = pZ;

  if (hasPower) {
    const powerSvg = document.getElementById('adm-power-hist');
    const counts = [0, 0, 0, 0, 0];
    d.powerTimeline.forEach(p => {
      const r = p.w / ftp;
      const zi = r < zonePctThresh[0] ? 0 : r < zonePctThresh[1] ? 1 : r < zonePctThresh[2] ? 2 : r < zonePctThresh[3] ? 3 : 4;
      counts[zi]++;
    });
    const total = counts.reduce((s, c) => s + c, 0) || 1;
    const powerZonePct = counts.map(c => Math.round(c / total * 1000) / 10);
    admDrawHistBar(powerSvg, counts.map((c, i) => ({ count: c, label: 'Z' + (i + 1), secs: c * 1 })),
      (_, i) => ADM_ZONE_COLORS[i], b => b.label);
    admZoneLegend('adm-power-hist', pwrZones, 'W', powerZonePct);
  }

  if (hasHR) {
    const hrSvg = document.getElementById('adm-hr-hist');
    const hrThresh = hZ.map(v => v / 100);
    const counts = [0, 0, 0, 0, 0];
    d.hrTimeline.forEach(p => {
      const r = p.hr / hrMax;
      const zi = r < hrThresh[0] ? 0 : r < hrThresh[1] ? 1 : r < hrThresh[2] ? 2 : r < hrThresh[3] ? 3 : 4;
      counts[zi]++;
    });
    const total = counts.reduce((s, c) => s + c, 0) || 1;
    const hrZonePct = counts.map(c => Math.round(c / total * 1000) / 10);
    admDrawHistBar(hrSvg, counts.map((c, i) => ({ count: c, label: 'Z' + (i + 1), secs: c * 5 })),
      (_, i) => ADM_ZONE_COLORS[i], b => b.label);
    admZoneLegend('adm-hr-hist', hrZones, 'bpm', hrZonePct);
  }

  if (hasCad) {
    const cadSvg = document.getElementById('adm-dist-cadence-svg');
    const vals = d.cadenceTimeline.map(p => p.c).filter(c => c > 20 && c < 200);
    if (vals.length) {
      const lo = Math.floor(Math.min(...vals) / 5) * 5;
      const hi = Math.ceil(Math.max(...vals) / 5) * 5;
      const n = Math.max(1, Math.min(20, Math.ceil((hi - lo) / 5)));
      const step = (hi - lo) / n || 1;
      const bins = Array.from({ length: n }, (_, i) => ({ lo: lo + i * step, count: 0 }));
      vals.forEach(v => { const i = Math.min(n - 1, Math.floor((v - lo) / step)); if (i >= 0) bins[i].count++; });
      bins.forEach(b => { b.secs = b.count * 5; });
      admDrawHistBar(cadSvg, bins, () => '#F59E0B', b => Math.round(b.lo));
    }
  }

  if (hasSpd) {
    const spdSvg = document.getElementById('adm-dist-speed-svg');
    const vals = d.velocityTimeline.map(p => p.v).filter(v => v > 0);
    if (vals.length) {
      const lo = Math.floor(Math.min(...vals));
      const hi = Math.ceil(Math.max(...vals));
      const n = Math.max(1, Math.min(20, hi - lo + 1));
      const step = (hi - lo) / n || 1;
      const bins = Array.from({ length: n }, (_, i) => ({ lo: lo + i * step, count: 0 }));
      vals.forEach(v => { const i = Math.min(n - 1, Math.floor((v - lo) / step)); if (i >= 0) bins[i].count++; });
      bins.forEach(b => { b.secs = b.count * 1; });
      admDrawHistBar(spdSvg, bins, () => '#10B981', b => Math.round(b.lo));
    }
  }
}

function admRenderAnalyse(d, FTP) {
  const ftp = FTP || 280;

  const hasScatter  = d.powerTimeline?.length > 1 && d.hrTimeline?.length > 1;
  const hasDrift    = d.powerTimeline?.length > 1 && d.hrTimeline?.length > 1;
  const hasQuadrant = d.powerTimeline?.length > 1 && d.cadenceTimeline?.length > 1;

  document.getElementById('adm-sect-scatter').style.display  = hasScatter  ? '' : 'none';
  document.getElementById('adm-sect-drift').style.display    = hasDrift    ? '' : 'none';
  document.getElementById('adm-sect-quadrant').style.display = hasQuadrant ? '' : 'none';

  const noData2 = document.getElementById('adm-analyse-nodata');
  if (noData2) noData2.style.display = (!hasScatter && !hasDrift && !hasQuadrant) ? '' : 'none';
  if (!hasScatter && !hasDrift && !hasQuadrant) return;

  // Power–HR scatter
  const scatterCanvas = document.getElementById('adm-scatter-canvas');
  if (scatterCanvas && d.powerTimeline?.length && d.hrTimeline?.length) {
    const cw = scatterCanvas.clientWidth || 400;
    scatterCanvas.width = cw; scatterCanvas.height = 200;
    const ctx = scatterCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, 200);
    const pL = 36, pR = 16, pT = 12, pB = 28;
    const dW = cw - pL - pR, dH = 200 - pT - pB;
    const pairs = [];
    let j = 0;
    for (const p of d.powerTimeline) {
      while (j + 1 < d.hrTimeline.length && Math.abs(d.hrTimeline[j + 1].t - p.t) <= Math.abs(d.hrTimeline[j].t - p.t)) j++;
      if (d.hrTimeline[j] && Math.abs(d.hrTimeline[j].t - p.t) < 60) pairs.push({ w: p.w, hr: d.hrTimeline[j].hr });
    }
    if (pairs.length) {
      const maxW = Math.max(...pairs.map(p => p.w), ftp * 1.1);
      const minHR = Math.min(...pairs.map(p => p.hr)) - 5;
      const maxHR = Math.max(...pairs.map(p => p.hr)) + 5;
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = pT + (i / 4) * dH;
        ctx.beginPath(); ctx.moveTo(pL, y); ctx.lineTo(pL + dW, y); ctx.stroke();
        ctx.fillStyle = '#6B7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
        ctx.fillText(Math.round(maxHR - (i / 4) * (maxHR - minHR)), pL - 2, y + 3);
      }
      const ftpX = pL + (ftp / maxW) * dW;
      ctx.strokeStyle = 'rgba(239,68,68,0.3)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(ftpX, pT); ctx.lineTo(ftpX, pT + dH); ctx.stroke();
      ctx.setLineDash([]);
      pairs.forEach(p => {
        const x = pL + (p.w / maxW) * dW;
        const y = pT + ((maxHR - p.hr) / (maxHR - minHR)) * dH;
        const r = p.w / ftp;
        const zi = r < 0.55 ? 0 : r < 0.75 ? 1 : r < 0.90 ? 2 : r < 1.05 ? 3 : 4;
        ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fillStyle = ADM_ZONE_COLORS[zi] + '99'; ctx.fill();
      });
      ctx.fillStyle = '#6B7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      [0, 0.25, 0.5, 0.75, 1.0].forEach(pct => {
        ctx.fillText(Math.round(pct * maxW) + 'W', pL + pct * dW, pT + dH + 14);
      });
    }
  }

  // HR drift
  const driftSvg = document.getElementById('adm-drift-svg');
  if (driftSvg && d.hrTimeline?.length > 10) {
    const W = driftSvg.getBoundingClientRect().width || driftSvg.parentElement?.offsetWidth || 400;
    const H = 120;
    driftSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    driftSvg.innerHTML = '';
    const pts = d.hrTimeline;
    const minHR = Math.min(...pts.map(p => p.hr));
    const maxHR = Math.max(...pts.map(p => p.hr));
    const maxT = pts[pts.length - 1].t;
    const pL = 32, pR = 8, pT = 8, pB = 20;
    const dW = W - pL - pR, dH = H - pT - pB;
    const toX = t => pL + (t / maxT) * dW;
    const toY = hr => pT + ((maxHR - hr) / Math.max(maxHR - minHR, 1)) * dH;
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    poly.setAttribute('points', renderSample(pts, dW).map(p => toX(p.t) + ',' + toY(p.hr)).join(' '));
    poly.setAttribute('fill', 'none'); poly.setAttribute('stroke', '#EF4444');
    poly.setAttribute('stroke-width', '1.5'); poly.setAttribute('opacity', '0.8');
    driftSvg.appendChild(poly);
    const half = Math.floor(pts.length / 2);
    const avgF = Math.round(pts.slice(0, half).reduce((s, p) => s + p.hr, 0) / half);
    const avgS = Math.round(pts.slice(half).reduce((s, p) => s + p.hr, 0) / (pts.length - half));
    const tl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    tl.setAttribute('x1', toX(0)); tl.setAttribute('y1', toY(avgF));
    tl.setAttribute('x2', toX(maxT)); tl.setAttribute('y2', toY(avgS));
    tl.setAttribute('stroke', 'rgba(239,68,68,0.4)'); tl.setAttribute('stroke-width', '1');
    tl.setAttribute('stroke-dasharray', '4,4');
    driftSvg.appendChild(tl);
    const lbl = (txt, x, y, anchor) => {
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('x', x); t.setAttribute('y', y);
      t.setAttribute('text-anchor', anchor || 'start');
      t.setAttribute('font-size', '9'); t.setAttribute('fill', '#9CA3AF');
      t.textContent = txt; driftSvg.appendChild(t);
    };
    lbl(avgF + ' bpm', pL + 2, toY(avgF) - 3);
    lbl(avgS + ' bpm', W - pR - 2, toY(avgS) - 3, 'end');
    lbl(maxHR + '', pL - 2, pT + 8, 'end');
    lbl(minHR + '', pL - 2, pT + dH, 'end');
  }

  // Power × cadence density heatmap
  const quadCanvas = document.getElementById('adm-quadrant-canvas');
  if (quadCanvas && d.powerTimeline?.length && d.cadenceTimeline?.length) {
    const cw = quadCanvas.clientWidth || 400;
    quadCanvas.width = cw; quadCanvas.height = 200;
    const ctx = quadCanvas.getContext('2d');
    ctx.clearRect(0, 0, cw, 200);
    const pL = 36, pR = 16, pT = 12, pB = 28;
    const dW = cw - pL - pR, dH = 200 - pT - pB;
    const pairs = [];
    let j = 0;
    for (const p of d.powerTimeline) {
      while (j + 1 < d.cadenceTimeline.length && Math.abs(d.cadenceTimeline[j + 1].t - p.t) <= Math.abs(d.cadenceTimeline[j].t - p.t)) j++;
      if (d.cadenceTimeline[j] && Math.abs(d.cadenceTimeline[j].t - p.t) < 60) pairs.push({ w: p.w, c: d.cadenceTimeline[j].c });
    }
    const valid = pairs.filter(p => p.c > 20 && p.c < 200);
    if (valid.length) {
      const maxW = Math.max(...valid.map(p => p.w), ftp * 1.1);
      const minC = Math.min(...valid.map(p => p.c));
      const maxC = Math.max(...valid.map(p => p.c));
      const GRID = 20;
      const density = Array.from({ length: GRID }, () => new Array(GRID).fill(0));
      valid.forEach(p => {
        const xi = Math.min(GRID - 1, Math.floor((p.w / maxW) * GRID));
        const yi = Math.min(GRID - 1, Math.floor(((maxC - p.c) / Math.max(maxC - minC, 1)) * GRID));
        density[yi][xi]++;
      });
      const maxD = Math.max(...density.flat(), 1);
      const cw2 = dW / GRID, ch2 = dH / GRID;
      density.forEach((row, yi) => row.forEach((val, xi) => {
        if (!val) return;
        ctx.fillStyle = `rgba(59,130,246,${Math.min(0.9, val / maxD)})`;
        ctx.fillRect(pL + xi * cw2, pT + yi * ch2, cw2, ch2);
      }));
      const ftpX = pL + (ftp / maxW) * dW;
      ctx.strokeStyle = 'rgba(239,68,68,0.5)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(ftpX, pT); ctx.lineTo(ftpX, pT + dH); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#6B7280'; ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
      [0, 0.5, 1.0].forEach(pct => ctx.fillText(Math.round(pct * maxW) + 'W', pL + pct * dW, pT + dH + 14));
      ctx.textAlign = 'right';
      ctx.fillText(maxC + ' rpm', pL - 2, pT + 10);
      ctx.fillText(minC + ' rpm', pL - 2, pT + dH);
    }
  }
}

async function loadActivityAnalysis(stravaId) {
  const container = document.getElementById('adm-ai-content');
  if (!container) return;
  container.innerHTML = '<span style="font-size:13px;opacity:0.6">Analyseren...</span>';
  try {
    const resp = await fetch('/api/activity/' + stravaId + '/analyse', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ computed: window._admComputedMetrics || {} })
    });
    const d    = await resp.json();
    const aiContainer = document.getElementById('adm-ai-content');
    if (!aiContainer) return;
    aiContainer.innerHTML = '<div class="adm-ai-text">' + (d.text || 'Analyse niet beschikbaar.') + '</div>';
    if (d.text) {
      const coachBtn = document.createElement('button');
      coachBtn.className = 'ap-coach-link';
      coachBtn.textContent = 'Verdiep in Coach →';
      coachBtn.onclick = () => {
        const actId = stravaId;
        _coachReturnContext = { label: 'Activiteit', action: () => navigateToActivity(actId) };
        renderActivityBack();
        setTimeout(() => showTab('analyse', document.querySelector('.nav-item[onclick*="analyse"]')), 50);
      };
      aiContainer.appendChild(coachBtn);
    }
  } catch(e) {
    const aiContainer = document.getElementById('adm-ai-content');
    if (aiContainer) aiContainer.innerHTML = '<span style="font-size:13px;opacity:0.6">Fout bij laden.</span>';
  }
}

// ── Greeting ──────────────────────────────────────────────────────────────────
function renderGreeting() {
  const now = new Date();
  const h = now.getHours();
  const groet = h < 6 ? 'Goedenacht' : h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  const naam = (S.athlete && S.athlete.firstname) ? S.athlete.firstname : 'Pieter';
  const titleEl = document.getElementById('greetingTitle');
  if (titleEl) titleEl.innerHTML = `${groet}<em>, ${naam}</em>`;
  const dateEl = document.getElementById('greetingDate');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ── Theme & branding ──────────────────────────────────────────────────────────
function toggleTheme() {
  const root = document.documentElement;
  const isDark = root.getAttribute('data-theme') === 'dark';
  if (isDark) { root.removeAttribute('data-theme'); try { localStorage.setItem('pf-theme', 'light'); } catch(e){} }
  else { root.setAttribute('data-theme', 'dark'); try { localStorage.setItem('pf-theme', 'dark'); } catch(e){} }
  const icon = document.getElementById('themeToggleIcon');
  if (icon) icon.textContent = root.getAttribute('data-theme') === 'dark' ? '☀' : '☾';
  if (typeof Chart !== 'undefined' && S._chartsLoaded) { S._chartsLoaded = false; if (currentTab === 'voortgang') { S._chartsLoaded = true; loadCharts(); } }
}

function renderSourcesStatus() {
  const el = document.getElementById('sourcesStatus');
  if (!el) return;
  const stravaOk = !!(S.athlete && S.athlete.firstname);
  const lastSync = S.lastSync ? fmtD(S.lastSync, true) : (S.recentActs && S.recentActs.length ? 'gesynchroniseerd' : 'onbekend');
  const sources = [
    { name: 'Strava', ok: stravaOk, detail: stravaOk ? ('Laatste sync: ' + lastSync) : 'Profiel niet bereikbaar — activiteiten mogelijk wel gesynced' },
    { name: 'Hevy', ok: !!(S.hevyWorkouts && S.hevyWorkouts.length), detail: (S.hevyWorkouts && S.hevyWorkouts.length ? S.hevyWorkouts.length + ' workouts' : 'Geen data') },
    { name: 'Voeding', ok: true, detail: 'Handmatig / Yazio-upload' },
  ];
  el.innerHTML = sources.map(s => `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:11px 13px;background:var(--surface2);border:1px solid var(--border);border-radius:10px">
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--text)">${s.name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;display:flex;align-items:center;gap:5px">
          <span style="width:6px;height:6px;border-radius:50%;background:${s.ok ? 'var(--green)' : 'var(--subtle)'};flex-shrink:0"></span>${s.detail}
        </div>
      </div>
    </div>`).join('');
}

// ── PMC-metric tooltips ───────────────────────────────────────────────────────
const PF_TIPS = {
  tsb: `<strong>TSB — Training Stress Balance</strong>
CTL minus ATL. Hoe fris je bent ten opzichte van je fitnessniveau. Een negatieve TSB is normaal tijdens trainingsblokken; een positieve TSB geeft aan dat je uitgerust bent.
<div class="pf-tip-bands">
  <span>&gt; +10</span><span>uitgerust — race form</span>
  <span>0 tot −10</span><span>optimale trainingstoestand</span>
  <span>−10 tot −30</span><span>productief belastingsblok</span>
  <span>&lt; −30</span><span>risico chronische vermoeidheid</span>
</div>`,
  ctl: `<strong>CTL — Chronic Training Load</strong>
42-dagen gewogen gemiddelde van dagelijkse TSS. Maat voor je opgebouwde aerobe basis. Groeit langzaam; daalt bij detraining met een halfwaardetijd van ~42 dagen.
<div class="pf-tip-bands">
  <span>40–80</span><span>recreatief serieus</span>
  <span>70–100</span><span>gevorderd amateur</span>
  <span>100–140</span><span>semi-professioneel</span>
</div>`,
  atl: `<strong>ATL — Acute Training Load</strong>
7-dagen gewogen gemiddelde van dagelijkse TSS. Reageert snel op belasting — stijgt binnen dagen bij intensieve blokken. Normaal 15–40 punten boven CTL tijdens opbouw.`,
  acwr: `<strong>ACWR — Acute:Chronic Workload Ratio</strong>
ATL gedeeld door CTL. Maat voor hoe snel de belasting stijgt ten opzichte van je gewende niveau.
<div class="pf-tip-bands">
  <span>&lt; 0.8</span><span>te weinig prikkel</span>
  <span>0.8–1.3</span><span>veilige trainingszone</span>
  <span>1.3–1.5</span><span>verhoogd risico (Gabbett)</span>
  <span>&gt; 1.5</span><span>gevaarzone blessure</span>
</div>`,
  mono: `<strong>Monotony — Foster</strong>
Gemiddelde dagbelasting gedeeld door standaarddeviatie over 7 dagen. Een hoge monotony betekent weinig afwisseling in trainingsintensiteit. Boven 2.0 remt het trainingsrespons.`,
  readiness: `<strong>Readiness</strong>
Een samengestelde score van 0 tot 100 die zeven signalen weegt: TSB (28), ACWR (16), monotony (12), load slope (8), voeding (8), krachtherstel (8) en slaap (20). Het is een relatieve dagscore die richting geeft aan je trainingskeuze, geen absolute gezondheidsmaat.
<div class="pf-tip-bands">
  <span>&ge; 80</span><span>uitgerust</span>
  <span>65–79</span><span>goed</span>
  <span>50–64</span><span>matig</span>
  <span>35–49</span><span>vermoeid</span>
  <span>&lt; 35</span><span>overbelast</span>
</div>`,
  readiness_breakdown: `<strong>Subscores readiness</strong>
De gewogen bijdragen aan de totaalscore; elk onderdeel draagt maximaal het tweede getal bij en een lage deelscore trekt het totaal omlaag. Slaap (20) en TSB (28) wegen het zwaarst. Load slope is geen aparte meting maar een extra rem die meeloopt met ACWR: vol onder ACWR 1.25, halverend daarboven, vrijwel weg boven 1.4.`,
  load_slope: `<strong>Load slope</strong>
Een extra rem op een te snelle belastingsopbouw. De subscore staat vol zolang je ACWR onder 1.25 blijft, halveert daarboven en valt vrijwel weg boven 1.4. Werkt samen met de ACWR-component als dubbele waarschuwing wanneer je acute belasting hard oploopt ten opzichte van je chronische basis.`,
  training_model: `<strong>Trainingsmodel</strong>
Het patroon dat je de afgelopen weken werkelijk hebt gereden, afgeleid uit de tijd-in-zone van je voltooide sessies. Mogelijke uitkomsten: polarized (veel Z1-Z2 plus wat Z4-Z5, weinig Z3), pyramidaal (aflopend van laag naar hoog), threshold-heavy (veel Z3-Z4) of volume-only. "Gemengd" verschijnt bij geen duidelijk profiel of onvoldoende gesynchroniseerde sessies.`,
  rolling_ftp: `<strong>Rolling FTP</strong>
Een doorlopende FTP-schatting uit de mediaan van je drie zwaarste NP-inspanningen van de afgelopen 60 dagen, maal 0.95. Volgt je vorm zonder geprotocolleerde test, maar reageert pas als je daadwerkelijk hard rijdt; voor een harde ijkwaarde doe je een geïsoleerde 20-minutentest. Alle TSS-berekeningen draaien op deze waarde.`,
  sleep_debt: `<strong>Slaapschuld (14d)</strong>
Het cumulatieve tekort ten opzichte van je persoonlijke slaapbehoefte over de afgelopen 14 nachten. De behoefte wordt geschat uit het gemiddelde van je drie langste nachten (default 8u tot er genoeg data is); nachten boven je behoefte lossen schuld maar half af. De schuld drukt rechtstreeks op de slaap-subscore van je readiness.
<div class="pf-tip-bands">
  <span>&lt; 0.5u</span><span>optimaal</span>
  <span>0.5–1.5u</span><span>laag</span>
  <span>1.5–3u</span><span>matig</span>
  <span>&gt; 3u</span><span>hoog</span>
</div>`,
  etl: `<strong>Krachtvolume (4w)</strong>
Dit getal is je wekelijkse krachtvolume in tonnage (gewicht maal reps, gesommeerd over alle sets), gemiddeld over vier weken. Let op: dit is niet de ETL die je vermoeidheidscurve voedt; die wordt session-RPE-gebaseerd berekend. Tonnage en fietsbelasting (TSS) zijn fysiologisch onvergelijkbaar en lopen daarom als gescheiden kanalen die alleen koppelen bij readiness en interferentieplanning.`,
  weekly_tss_target: `<strong>Wekelijks TSS-doel</strong>
Verankerd op je huidige CTL maal zeven, plus een opbouwincrement dat afhangt van je trainingsdoel. In herstelweken wordt het teruggeschaald (ongeveer 55 procent), in taper- en racweken nog verder. Daarom verschilt het doel per week: opbouwweken liggen hoger dan herstelweken.`,
  week_model: `<strong>Weekmodel</strong>
De intensiteitsverdeling die de planner voor deze week voorschrijft, geclassificeerd op de geplande zone-mix. Labels: Polarized (veel laag plus wat hoog, weinig Z3), Pyramidaal (aflopend), Threshold (Z3-Z4-nadruk) of Volume. Sweetspot-blokken tellen mee als Z3. De tegel is pas gevuld zodra er een actief fietsplan staat.`,
  strength_trend: `<strong>Krachttrend</strong>
Vergelijkt het krachtvolume van deze week met je 4-weeks gemiddelde (stijgend boven 1.15, dalend onder 0.85). Een dalende kracht-load verlaagt de interferentie met je fietsadaptatie, wat in een fietsgericht blok gunstig kan zijn; structureel dalen betekent verlies van krachtstimulus.`,
  interference: `<strong>Concurrent-interferentie</strong>
Gelijktijdige kracht- en duurtraining onderdrukt aerobe adaptatie via gedeelde herstel- en signaalroutes (Wilson 2012). Daarom capt de planner je fietsintensiteit op Z2 op een beendag en de dag erna, en op Z3 twee dagen na de beensessie; daarna geen beperking. Push- en pulldagen leggen geen cap op. Het is een risicosignaal, geen harde blokkade.`,
  activity_tss: `<strong>TSS — Training Stress Score</strong>
TSS voor één rit is IF in het kwadraat maal de duur in uren maal 100, waarbij IF de verhouding NP tot FTP is. Honderd TSS staat ongeveer gelijk aan een uur op FTP-intensiteit. Met vermogensmeter is dit nauwkeurig; zonder power wordt hrTSS geschat uit hartslag ten opzichte van je drempelhartslag, wat ruwer is.`,
  vi: `<strong>VI — Variability Index</strong>
NP gedeeld door je gemiddeld vermogen. 1.0 betekent perfect constante output; boven 1.05 wordt de rit grilliger, boven 1.15 is typisch voor criteriums of intervaltraining. Bij gelijk gemiddeld vermogen kost een hogere VI fysiologisch meer, omdat de pieken zwaarder doorwegen.`,
  normalized_power: `<strong>Genormaliseerd vermogen</strong>
Een gewogen gemiddelde dat de hogere metabole kost van wisselende intensiteit modelleert, waardoor het bij variabele ritten boven je gemiddeld vermogen ligt. Bij een vlakke, constante rit liggen NP en gemiddeld vermogen dicht bij elkaar. TSS en IF rekenen met NP, niet met je gemiddeld vermogen.`,
  mmp: `<strong>Mean Maximal Power</strong>
Het hoogste gemiddelde vermogen dat je over een bepaalde duur hebt gehaald, berekend per duurvenster van 5 seconden tot een uur. De stippellijn is je beste curve over de afgelopen 90 dagen als benchmark. Zit deze rit erboven, dan heb je een persoonlijk beste van die periode neergezet; eronder is normaal voor een niet-maximale rit.`,
  power_quadrants: `<strong>Vermogenskwadranten</strong>
Elk punt is een moment uit de rit, uitgezet als vermogen tegen cadans. De stippellijnen zijn je FTP (verticaal) en je optimale cadans (horizontaal). Rechtsboven hoog vermogen en hoge cadans (neuromusculair), rechtsonder hoog vermogen en lage cadans (krachtuithouding), linksboven laag vermogen en hoge cadans (aerobe capaciteit), linksonder actief herstel.`,
  aerobic_efficiency: `<strong>Aerobe efficiëntie</strong>
Hoeveel vermogen of snelheid je levert per hartslagslag; hoger is beter en wijst op cardiale adaptatie. De lijn is een 28-daags voortschrijdend gemiddelde, de trendrichting komt uit een regressie over 56 dagen. De meting beweegt traag en wordt verstoord door hitte, vermoeidheid en cafeïne, dus lees de trend, niet losse punten.`,
  monthly_avg_power: `<strong>Gem. vermogen per maand</strong>
"Onbetrouwbare periode uitgesloten" betekent dat maanden met te weinig of sterk afwijkende powerdata uit het gemiddelde worden gefilterd, zodat een paar vreemde ritten het beeld niet vertekenen. Gemiddeld maandvermogen blijft een grove indicator: terrein, parcours en het doel van de ritten beïnvloeden het sterker dan je werkelijke vorm.`,
  training_mode: `<strong>Trainingsdoel</strong>
Bepaalt het schema dat de planner genereert. Automatisch laat de planner kiezen op basis van CTL, TSB en een eventueel event; de overige modi (FTP-opbouw, VO2max-piek, vetverbranding, basisuithoudingsvermogen, onderhoud, evenementvoorbereiding) sturen elk de wekelijkse TSS-doelen, de intensiteitsverdeling en de prioriteit van sessietypes anders aan.`,
  weekly_patterns: `<strong>Vaste wekelijkse patronen</strong>
Vaste beschikbaarheidsmomenten die de planner structureel meeneemt bij het genereren van elk weekplan. Ze verschillen van de beschikbaarheidstoggle op de Week-tab: patronen zijn permanent en gelden elke week, een toggle is eenmalig voor die ene week.`,
};

function initInfoTooltips() {
  let tip = document.getElementById('pfInfoTip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'pfInfoTip';
    tip.className = 'pf-info-tip';
    document.body.appendChild(tip);
  }
  if (document._pfTipBound) return;
  document._pfTipBound = true;
  document.addEventListener('click', e => {
    const t = document.getElementById('pfInfoTip');
    if (!t) return;
    const btn = e.target.closest('.pf-info-btn');
    if (!btn) { t.classList.remove('is-open'); return; }
    e.stopPropagation();
    const key = btn.dataset.tip;
    if (!PF_TIPS[key]) return;
    if (t.classList.contains('is-open') && t._src === btn) { t.classList.remove('is-open'); return; }
    t.innerHTML = PF_TIPS[key];
    t._src = btn;
    const r = btn.getBoundingClientRect();
    t.style.top = (r.bottom + 8) + 'px';
    t.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 266)) + 'px';
    t.classList.add('is-open');
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
const _activityPageMatch = window.location.pathname.match(/^\/activity\/(\d+)$/);
const _workoutPageMatch  = window.location.pathname.match(/^\/workout\/([0-9a-zA-Z-]+)$/);
if (_activityPageMatch) {
  loadUserData(); // load settings (needed for zone colors etc.)
  renderActivityPage(_activityPageMatch[1]);
} else if (_workoutPageMatch) {
  loadUserData(); // load S.fullState (e1RMTrends) en S.hevyWorkouts
  renderWorkoutPage(_workoutPageMatch[1]);
} else {
  syncAll();
  showTabFromUrl(tabFromPath(location.pathname) || 'overview');
}
initInfoTooltips();
