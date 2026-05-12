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
  await Promise.allSettled([loadAthlete(), loadRecentActs(), loadHevy(), loadUserData(), loadHistSummary(), loadLiterature(), loadWeekAvailability()]);
  renderWeekGrid(); // re-render now that weekAvailability is guaranteed loaded
  await loadFullState();
  document.querySelectorAll('[onclick="syncAll()"]').forEach(b => b.textContent = '↻ Sync');
}

async function loadAthlete() {
  try {
    S.athlete = await api('/api/strava/athlete');
    const a = S.athlete;
    document.getElementById('athName').textContent = `${a.firstname} ${a.lastname}`;
    document.getElementById('athSub').textContent = `${a.city||'Strava'} · ${a.country||''}`;
    document.getElementById('avatarInit').textContent = a.firstname?.[0]||'P';
    if (a.profile_medium) document.getElementById('avatarWrap').innerHTML = `<img class="avatar" src="${a.profile_medium}" alt="">`;
  } catch { document.getElementById('athName').textContent = 'Strava niet verbonden'; }
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
    document.getElementById('hevyList').innerHTML = '<div class="alert alert-info">Hevy niet verbonden</div>';
    return;
  }
  renderHevy();
  try { renderHevyProgression(); } catch(e) {
    document.getElementById('hevyProgression').innerHTML = '<div class="alert alert-info">Progressieanalyse niet beschikbaar.</div>';
  }
}

async function loadUserData() {
  try {
    S.data = await api('/api/data');
    renderNutrHistory(); renderPatterns(); renderWeekGrid(); renderStats();
    // Fill forms
    const g = S.data.goals||{};
    document.getElementById('gPrimary').value = g.primary||'';
    document.getElementById('gWeight').value = g.weightTarget||'90-92';
    document.getElementById('gTimeline').value = g.timeline||'';
    document.getElementById('gNotes').value = g.notes||'';
    const cfg = S.data.settings||{};
    document.getElementById('sPwrStart').value = cfg.unreliablePowerStart||'2020-01-01';
    document.getElementById('sPwrEnd').value = cfg.unreliablePowerEnd||'2020-12-31';
    document.getElementById('sFtp').value = cfg.ftp||280;
    const z = cfg.zones||{};
    if (document.getElementById('sZ1')) document.getElementById('sZ1').value = z.z1||55;
    if (document.getElementById('sZ2')) document.getElementById('sZ2').value = z.z2||75;
    if (document.getElementById('sZ3')) document.getElementById('sZ3').value = z.z3||90;
    if (document.getElementById('sZ4')) document.getElementById('sZ4').value = z.z4||105;
    if (document.getElementById('sHrMax')) document.getElementById('sHrMax').value = cfg.hrMax||'';
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
    updateMetrics(h.metrics);
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
    const offset = 251.2 - (r.total / 100) * 251.2;
    ring.setAttribute('stroke-dashoffset', offset);
    const ringColor = r.total >= 80 ? '#4ade80' : r.total >= 65 ? '#a3e635' : r.total >= 50 ? '#facc15' : r.total >= 35 ? '#fb923c' : '#f87171';
    ring.setAttribute('stroke', ringColor);
    document.getElementById('readinessBreakdown').innerHTML =
      `TSB ${r.breakdown.tsb||0}/35 · ACWR ${r.breakdown.acwr||0}/20 · Monotony ${r.breakdown.monotony||0}/15<br>` +
      `Load slope ${r.breakdown.loadSlope||0}/10 · Voeding ${r.breakdown.nutrition||0}/10 · Kracht ${r.breakdown.strengthFatigue||0}/10`;

    // Update all metrics
    updateMetrics(s.enduranceMetrics || s.metrics);

    // FTP
    if (s.ftpInfo) {
      document.getElementById('sFTP').textContent = s.ftpInfo.ftp + 'W';
    } else {
      document.getElementById('sFTP').textContent = '–';
    }

    // Training model
    const model = s.currentZoneModel;
    if (model) {
      document.getElementById('sModel').textContent = model.model;
      document.getElementById('sModelSub').textContent = `${model.lowPct}/${model.midPct}/${model.highPct}%`;
    }

    // Strength overview
    renderStrengthOverview(s);

    // Calibration
    if (s.calibration) renderCalibrationInfo(s.calibration);

    // Alerts
    renderAlerts(s);
  } catch(e) {
    console.warn('loadFullState failed', e);
  }
}

function renderAlerts(s) {
  const container = document.getElementById('alertsContainer');
  const alerts = [];
  const thr = s.alertThresholds || {};
  const tsbCrit = thr.tsbCrit ?? -30;
  const acwrCrit = thr.acwrCrit ?? 1.5;
  const acwrWarn = thr.acwrWarn ?? 1.3;
  const m = s.enduranceMetrics || s.metrics || {};

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

  if (m.acwr > acwrCrit) {
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
  return `<div class="act-row">
    <div class="act-icon">${sEmoji(a.type)}</div>
    <div class="act-info"><div class="act-name">${a.name}</div><div class="act-date">${detail ? fmtD(a.start_date,true) : fmtD(a.start_date)}</div></div>
    <div class="act-right">${dist}<div class="act-time">${t}</div></div>
    ${watt}
  </div>${detail?`<div class="act-meta">${dist?`<span>📍 ${(a.distance/1000).toFixed(1)}km</span>`:''}<span>⏱ ${t}</span>${elev}${watt}${hr}${suf}</div>`:''}`;
}

function renderRecentActs() {
  document.getElementById('recentActs').innerHTML = S.recentActs.length
    ? S.recentActs.slice(0,6).map(a=>actRow(a,false)).join('')
    : '<div class="empty"><div class="empty-icon">🏃</div><div class="empty-text">Geen recente activiteiten</div></div>';
  document.getElementById('allActs').innerHTML = S.recentActs.length
    ? S.recentActs.map(a=>actRow(a,true)).join('')
    : '<div class="empty"><div class="empty-text">Geen activiteiten gevonden</div></div>';
}

function renderHevy() {
  const el = document.getElementById('hevyList');
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
    return `<div class="nutr-day-card"><div class="nutr-day-date">${wd}<br>${ds}</div>${inner}${w?`<div class="nutr-day-weight">${w} kg</div>`:''}</div>`;
  });
  document.getElementById('nutrHistory').innerHTML = `<div class="nutr-history-scroll"><div class="nutr-history-grid">${cards.join('')}</div></div>`;
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

function renderWeekGrid() {
  const dates = getWeekDates(S.currentWeekOffset);
  const t = today();
  const start = new Date(dates[0]);
  const end = new Date(dates[6]);
  document.getElementById('weekTitle').textContent = `${start.toLocaleDateString('nl-NL',{day:'numeric',month:'short'})} – ${end.toLocaleDateString('nl-NL',{day:'numeric',month:'short',year:'numeric'})}`;

  const grid = document.getElementById('weekGrid');
  const dayNames = ['Ma','Di','Wo','Do','Vr','Za','Zo'];
  grid.innerHTML = dates.map((date,i) => {
    const isToday = date===t;
    const sessions = (S.data.weekPlan?.[date]||[]);
    const dayNum = new Date(date+'T12:00:00').getDate();
    const avail = S.weekAvailability[date] || {};
    const availActive = !!avail.cycling;
    const maxDur = avail.maxDuration || 90;

    const sessHtml = sessions.map((s,si) => {
      if (s.type === 'cycling') {
        const title = s.title || s.titel || 'Fietssessie';
        const dur   = s.duration || s.duur_min || '?';
        const tss   = s.targetTSS || s.tss;
        const tssLabel = tss ? ` · ~${tss} TSS` : '';
        const aiClass  = s.aiGenerated ? ' ai-session' : '';
        const aiIcon   = s.aiGenerated ? '<span class="ai-badge">✨</span>' : '';
        const clickable = s.aiGenerated && s.blokken?.length;
        const clickAttr = clickable ? `onclick="openAiSession('${date}',${si})"` : '';
        let scoreBadge = '';
        if (s.missed) {
          scoreBadge = `<span class="session-score-badge" style="background:#6b7280">✗</span>`;
        } else if (s.completionScore !== undefined) {
          const cls = s.completionScore >= 8 ? 'score-good' : s.completionScore >= 6 ? 'score-ok' : 'score-poor';
          scoreBadge = `<span class="session-score-badge ${cls}">${s.completionScore}</span>`;
        }
        return `<div class="planned-session session-cycling${aiClass}" ${clickAttr} style="padding:6px 8px${clickable ? ';cursor:pointer' : ''}">
          <span class="ps-icon">🚴</span>
          <div class="ps-info" style="flex:1;min-width:0">
            <div class="ps-name" style="font-size:11px">${title}</div>
            <div class="ai-tss">${dur}min${tssLabel}</div>
          </div>
          ${aiIcon}
          <button class="ps-remove" onclick="event.stopPropagation();removeSession('${date}',${si})">×</button>
          ${scoreBadge}
        </div>`;
      }
      return `<div class="planned-session">
        <span class="ps-icon">${sEmoji(s.type)}</span>
        <div class="ps-info">
          <div class="ps-name">${s.split ? s.type+' ('+s.split+')' : (s.description||s.type)}</div>
          <div class="ps-sub">${s.duration||s.duur_min||'?'}min</div>
        </div>
        <button class="ps-remove" onclick="removeSession('${date}',${si})">×</button>
      </div>`;
    }).join('');

    const availToggle = `<div class="avail-toggle">
      <label class="avail-switch">
        <input type="checkbox" ${availActive?'checked':''} onchange="toggleAvailability('${date}',this.checked)">
        <span class="avail-slider"></span>
      </label>
      <span class="avail-label">🚴 Beschikbaar</span>
      ${availActive ? `<input class="avail-dur" type="number" min="30" max="360" value="${maxDur}" onchange="setAvailDuration('${date}',this.value)" title="Max duur (min)">` : ''}
    </div>`;

    return `<div class="day-card ${isToday?'today':''}">
      <div class="day-card-head ${isToday?'today-lbl':''}">${dayNames[i]}</div>
      <div class="day-num">${dayNum}</div>
      ${sessHtml}
      <div class="add-session-btns">
        <button class="add-btn" onclick="openAddSession('${date}','gym')">🏋️</button>
        <button class="add-btn" onclick="openAddSession('${date}','cycling')">🚴</button>
        <button class="add-btn" onclick="openAddSession('${date}','running')">🏃</button>
        <button class="add-btn" onclick="openAddSession('${date}','custom')">✏️</button>
      </div>
      ${availToggle}
    </div>`;
  }).join('');

  // Show week summary if sessions planned
  const totalSessions = dates.reduce((sum,d)=>sum+(S.data.weekPlan?.[d]?.length||0),0);
  const ws = document.getElementById('weekSummary');
  if (totalSessions > 0) {
    ws.style.display='block';
    const lines = dates.flatMap(d => (S.data.weekPlan?.[d]||[]).map(s=>`<span style="margin-right:6px">${sEmoji(s.type)} ${s.split?s.split+' - ':''}${(s.duration||s.duur_min||'?')}min ${s.description?'('+s.description+')':''} <span style="color:var(--muted)">${new Date(d+'T12:00:00').toLocaleDateString('nl-NL',{weekday:'short',day:'numeric'})}</span></span>`));
    document.getElementById('weekSummaryContent').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:6px;font-size:12px">${lines.join('')}</div>`;
  } else { ws.style.display='none'; }
}

function changeWeek(dir) {
  S.currentWeekOffset += dir;
  renderWeekGrid();
}

// ── Week availability ─────────────────────────────────────────────────────────
async function loadWeekAvailability() {
  try { S.weekAvailability = await api('/api/week-availability'); } catch {}
}

async function toggleAvailability(date, checked) {
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
    document.getElementById('aiSessReden').textContent  = '';

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
  const weekPlan = { ...(S.data.weekPlan||{}) };
  weekPlan[date] = (weekPlan[date]||[]).filter((_,i)=>i!==idx);
  if (!weekPlan[date].length) delete weekPlan[date];
  await saveDataPartial({ weekPlan });
  S.data.weekPlan = weekPlan;
  renderWeekGrid();
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
  const updated = { ...(S.data.nutrition||{}), [today()]: nutr };
  await saveDataPartial({ nutrition: updated });
  const b = document.getElementById('btnManualNutr');
  b.textContent='✓ Opgeslagen'; b.className='btn btn-success mt-3';
  setTimeout(()=>{b.textContent='Opslaan voor vandaag';b.className='btn btn-primary mt-3';},2000);
  renderNutrHistory();
}

async function saveGoals() {
  const goals = { primary:document.getElementById('gPrimary').value, weightTarget:document.getElementById('gWeight').value, timeline:document.getElementById('gTimeline').value, notes:document.getElementById('gNotes').value };
  await saveDataPartial({ goals });
  if (goals.weightTarget) document.getElementById('sWeightSub').textContent = `doel: ${goals.weightTarget}kg`;
  const b = document.getElementById('btnGoals');
  b.textContent='✓ Opgeslagen'; b.className='btn btn-success mt-3';
  setTimeout(()=>{b.textContent='Doelen opslaan';b.className='btn btn-primary mt-3';},2000);
}

async function saveSettings() {
  const existing = S.data.settings || {};
  const settings = { ...existing, unreliablePowerStart:document.getElementById('sPwrStart').value, unreliablePowerEnd:document.getElementById('sPwrEnd').value, ftp:parseInt(document.getElementById('sFtp').value)||280 };
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
  const settings = { ...existing, hrMax: parseInt(document.getElementById('sHrMax').value)||185, targetWeightLossPerWeek: parseFloat(document.getElementById('sWeightLoss').value)||0.3 };
  await saveDataPartial({ settings });
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
    const r = await api('/api/calibration');
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
      <span style="color:var(--muted)">Gem. 4w load: <strong style="color:var(--text)">${avg} ETL/w</strong></span>
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
  const updated = {...(S.data.nutrition||{}),[today()]:S.parsedNutr};
  await saveDataPartial({nutrition:updated});
  document.getElementById('parsedPreview').classList.add('hidden');
  document.getElementById('parseMsg').className='alert alert-success mt-2';
  document.getElementById('parseMsg').textContent='✓ Opgeslagen voor vandaag';
  S.parsedNutr=null; renderNutrHistory();
  document.getElementById('mKcal').value=updated[today()].kcal||'';
  document.getElementById('mProt').value=updated[today()].protein||'';
  document.getElementById('mCarb').value=updated[today()].carbs||'';
  document.getElementById('mFat').value=updated[today()].fat||'';
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

function showTab(name, btn) {
  document.querySelectorAll('[id^="tab-"]').forEach(el=>el.classList.add('hidden'));
  document.querySelectorAll('.nav-item, .nav-item-small').forEach(el=>el.classList.remove('active'));
  document.getElementById('tab-'+name).classList.remove('hidden');
  if (btn) btn.classList.add('active');
  currentTab = name;
  // Load AI insights for this tab (once per session unless forced)
  const pages = TAB_INSIGHTS[name] || [];
  pages.forEach(p => { if (!S.insightLoaded[p]) loadInsight(p); });
}

async function loadInsight(page, force = false) {
  const textEl = document.getElementById('insight-text-' + page);
  const metaEl = document.getElementById('insight-meta-' + page);
  if (!textEl) return;
  textEl.innerHTML = '<div class="insight-loading">AI-inzicht laden...</div>';
  if (metaEl) metaEl.textContent = '';
  try {
    const result = await api('/api/insights/' + page, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force })
    });
    if (result.empty) {
      textEl.textContent = result.text;
      textEl.style.color = 'var(--muted)';
      if (metaEl) metaEl.textContent = '';
    } else {
      textEl.textContent = result.text;
      textEl.style.color = '';
      if (metaEl) metaEl.textContent = result.cached
        ? `Gecached · ${new Date(result.cachedAt).toLocaleTimeString('nl-NL',{hour:'2-digit',minute:'2-digit'})}`
        : 'Zojuist gegenereerd';
      S.insightLoaded[page] = true;
    }
  } catch(e) {
    textEl.textContent = 'Inzicht laden mislukt: ' + e.message;
    textEl.style.color = 'var(--red)';
  }
}

async function saveSettingsMeals() {
  const btn = document.getElementById('btnSaveMeals');
  btn.textContent = 'Opslaan...'; btn.disabled = true;
  try {
    const data = await api('/api/data');
    if (!data.settings) data.settings = {};
    data.settings.mealTimes = {
      weekdayBreakfast: document.getElementById('mtWdBreakfast').value,
      weekdaySnack:     document.getElementById('mtWdSnack').value,
      weekdayLunch:     document.getElementById('mtWdLunch').value,
      weekdayDinner:    document.getElementById('mtWdDinner').value,
      weekendBreakfast: document.getElementById('mtWeBreakfast').value,
      weekendSnack:     document.getElementById('mtWeSnack').value,
      weekendLunch:     document.getElementById('mtWeLunch').value,
      weekendDinner:    document.getElementById('mtWeDinner').value,
    };
    await api('/api/data', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
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
    const data = await api('/api/data');
    const existing = (data.patterns || []).filter(p => !(p.type === 'gym' && p.split));
    data.patterns = [...existing, ...pplPatterns];
    await api('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    S.data.patterns = data.patterns;
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
  voortgang: { title: 'Trends — Help', content: `<strong>Grafieken</strong><br>Visualiseer je trainingsdata over tijd.<br><br><strong>Beschikbare grafieken</strong><br>• <strong>Gewicht</strong> — trend over de geselecteerde periode<br>• <strong>ATL / CTL / TSB</strong> — trainingsbelasting (120 dagen)<br>• <strong>Wekelijks volume</strong> — uren en sessies per week<br>• <strong>Voeding</strong> — calorieën en eiwit per dag<br>• <strong>Vermogen</strong> — gemiddeld wattage per maand<br><br>Selecteer een periode en klik op Laden.` },
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

// ── Activiteiten filter ───────────────────────────────────────────────────────
let currentActivityFilter = 'alles';

function filterActivities(type) {
  currentActivityFilter = type;
  ['alles','fietsen','lopen','gym'].forEach(t => {
    const btn = document.getElementById('filter' + t.charAt(0).toUpperCase() + t.slice(1));
    if (btn) btn.className = 'btn btn-sm ' + (t === type ? 'btn-primary' : 'btn-secondary');
  });
  const stravaSection = document.getElementById('actStravaSection');
  const hevySection = document.getElementById('actHevySection');
  if (type === 'gym') {
    stravaSection.classList.add('hidden');
    hevySection.classList.remove('hidden');
  } else if (type === 'alles') {
    stravaSection.classList.remove('hidden');
    hevySection.classList.remove('hidden');
    renderFilteredActs(null);
  } else {
    stravaSection.classList.remove('hidden');
    hevySection.classList.add('hidden');
    const typeMap = { fietsen: ['Ride','VirtualRide'], lopen: ['Run'] };
    renderFilteredActs(typeMap[type]);
  }
}

function renderFilteredActs(typeFilter) {
  const acts = typeFilter ? S.recentActs.filter(a => typeFilter.includes(a.type)) : S.recentActs;
  document.getElementById('allActs').innerHTML = acts.length
    ? acts.map(a => actRow(a, true)).join('')
    : '<div class="empty"><div class="empty-text">Geen activiteiten gevonden voor dit filter</div></div>';
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

function destroyChart(id) {
  if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id]; }
}

function makeChart(id, config) {
  destroyChart(id);
  const ctx = document.getElementById(id).getContext('2d');
  chartInstances[id] = new Chart(ctx, config);
}

function filterByDays(series, days, dateKey = 'date') {
  if (days >= 9999) return series;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days);
  return series.filter(d => new Date(d[dateKey] + (d[dateKey].length === 7 ? '-01' : '')) >= cutoff);
}

async function loadCharts() {
  const msg = document.getElementById('chartsMsg');
  msg.className = 'alert alert-info'; msg.textContent = 'Grafieken laden...';
  document.getElementById('chartsContainer').classList.remove('hidden');

  try {
    const d = await api('/api/charts/data');
    const days = parseInt(document.getElementById('chartPeriod').value);

    const gridColor = 'rgba(255,255,255,0.06)';
    const tickColor = '#666';
    const baseOpts = {
      responsive: true,
      plugins: { legend: { labels: { color: '#aaa', font: { size: 11 } } }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 10 }, maxTicksLimit: 12 } },
        y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } }
      }
    };

    // ── Gewicht ───────────────────────────────────────────────────────────────
    const wData = filterByDays(d.weightSeries.length > 60 ? d.weightMonthly.map(m => ({date: m.month, kg: m.avg})) : d.weightSeries, days);
    if (wData.length) {
      makeChart('chartWeight', {
        type: 'line',
        data: {
          labels: wData.map(v => v.date),
          datasets: [{
            label: 'Gewicht (kg)', data: wData.map(v => v.kg),
            borderColor: '#4ade80', backgroundColor: '#4ade8018',
            borderWidth: 2, pointRadius: wData.length > 60 ? 3 : 4, fill: true, tension: 0.3
          }]
        },
        options: { ...baseOpts, plugins: { ...baseOpts.plugins, annotation: {} } }
      });
    }

    // ── ATL/CTL/TSB ───────────────────────────────────────────────────────────
    const lData = filterByDays(d.loadSeries, Math.min(days, 120));
    if (lData.length) {
      makeChart('chartLoad', {
        type: 'line',
        data: {
          labels: lData.map(v => v.date),
          datasets: [
            { label: 'CTL (fitness)', data: lData.map(v => v.ctl), borderColor: '#38bdf8', borderWidth: 2, pointRadius: 0, tension: 0.4 },
            { label: 'ATL (vermoeidheid)', data: lData.map(v => v.atl), borderColor: '#f87171', borderWidth: 2, pointRadius: 0, tension: 0.4 },
            { label: 'TSB (form)', data: lData.map(v => v.tsb), borderColor: '#a78bfa', borderWidth: 1.5, pointRadius: 0, tension: 0.4, borderDash: [4, 3] },
          ]
        },
        options: {
          ...baseOpts,
          scales: { ...baseOpts.scales, y: { ...baseOpts.scales.y, grid: { color: (ctx) => ctx.tick.value === 0 ? 'rgba(255,255,255,0.2)' : gridColor } } }
        }
      });
    }

    // ── Wekelijks volume ──────────────────────────────────────────────────────
    const vData = filterByDays(d.weeklyVolume, days, 'week');
    if (vData.length) {
      makeChart('chartVolume', {
        type: 'bar',
        data: {
          labels: vData.map(v => v.week),
          datasets: [
            { label: 'Uren', data: vData.map(v => v.hours), backgroundColor: '#f9731666', borderColor: '#f97316', borderWidth: 1, yAxisID: 'y' },
            { label: 'Sessies', data: vData.map(v => v.sessions), type: 'line', borderColor: '#38bdf8', borderWidth: 2, pointRadius: 2, tension: 0.3, yAxisID: 'y2' },
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

    // ── Voeding ───────────────────────────────────────────────────────────────
    const nData = filterByDays(d.nutritionSeries, Math.min(days, 60));
    if (nData.length) {
      makeChart('chartNutr', {
        type: 'bar',
        data: {
          labels: nData.map(v => v.date),
          datasets: [
            { label: 'Calorieën (kcal)', data: nData.map(v => v.kcal), backgroundColor: '#f9731644', borderColor: '#f97316', borderWidth: 1, yAxisID: 'y' },
            { label: 'Eiwit (g)', data: nData.map(v => v.protein), type: 'line', borderColor: '#4ade80', borderWidth: 2, pointRadius: 3, tension: 0.3, yAxisID: 'y2' },
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

    // ── Vermogen ──────────────────────────────────────────────────────────────
    const pData = filterByDays(d.powerTrend, days, 'month');
    if (pData.length) {
      makeChart('chartPower', {
        type: 'line',
        data: {
          labels: pData.map(v => v.month),
          datasets: [{
            label: 'Gem. vermogen (W)', data: pData.map(v => v.avgWatt),
            borderColor: '#f97316', backgroundColor: '#f9731618',
            borderWidth: 2, pointRadius: 4, fill: true, tension: 0.3
          }]
        },
        options: baseOpts
      });
    } else if (!d.powerTrend?.length) {
      document.getElementById('chartPower').parentElement.innerHTML += '<div class="alert alert-info mt-2" style="font-size:11px">Geen vermogensdata beschikbaar. Sync eerst je volledige history.</div>';
    }

    msg.className = 'hidden';
  } catch(e) {
    msg.className = 'alert alert-error';
    msg.textContent = 'Laden mislukt: ' + e.message;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────
syncAll();
(TAB_INSIGHTS['overview'] || []).forEach(p => loadInsight(p));
