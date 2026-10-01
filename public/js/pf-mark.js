// PeakForm logo-animatie "punt beklimt de piek" (BR1). Gedeeld door de app (index.html) en de landing (/welkom).
// Verwacht de mark-SVG met .pf-mark-tile, .pf-mark-base, .pf-mark-trace, .pf-mark-l, .pf-mark-r en .pf-mark-dot.
(function () {
  const L = 48;              // dashoffset waarbij een flank (46,86 lang, dasharray 47.5 200) volledig onzichtbaar is
  const ONCE_MS = 1500;
  const LOOP_MS = 1400;
  const LOOP_REST = 0.84;    // fractie van een loopcyclus waarop de punt geland is en het logo compleet staat
  const E = {
    pop: 'cubic-bezier(.2,.9,.3,1.4)',
    climb: 'cubic-bezier(.45,.05,.25,1)',
    grav: 'cubic-bezier(.55,0,1,.45)',
    desc: 'cubic-bezier(.55,0,.8,.35)',
    soft: 'cubic-bezier(.2,.8,.2,1)',
  };
  // Punt staat statisch op (48,74); transform-origin van de circle is 48px 74px in view-box-coördinaten.
  const T = (x, y, sx = 1, sy = sx) => `translate(${x - 48}px, ${y - 74}px) scale(${sx}, ${sy})`;
  const px = v => `${v}px`;

  function canAnimate() {
    if (typeof Element === 'undefined' || !('animate' in Element.prototype)) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function parts(svg) {
    const q = c => svg.querySelector(c);
    const p = { tile: q('.pf-mark-tile'), base: q('.pf-mark-base'), trace: q('.pf-mark-trace'), l: q('.pf-mark-l'), r: q('.pf-mark-r'), dot: q('.pf-mark-dot') };
    return Object.values(p).every(Boolean) ? p : null;
  }

  // Eenmalige animatie (splash en intro). Resolvet als alles klaar is; laat daarna de statische markup achter.
  function play(svg, opts = {}) {
    if (!svg || !canAnimate()) return Promise.resolve();
    const p = parts(svg);
    if (!p) return Promise.resolve();
    const o = { duration: ONCE_MS, fill: 'both' };
    const list = [
      p.tile.animate([{ opacity: 0, transform: 'scale(.86)', easing: E.soft }, { opacity: 1, transform: 'scale(1)' }], { duration: 300, fill: 'both' }),
      p.base.animate([{ strokeOpacity: 0 }, { strokeOpacity: 0 }], o),
      p.dot.animate([
        { offset: 0, transform: T(18, 64, 0) },
        { offset: 0.133, transform: T(18, 64, 0), easing: E.pop },
        { offset: 0.213, transform: T(18, 64), easing: E.climb },
        { offset: 0.653, transform: T(48, 28), easing: 'ease-out' },
        { offset: 0.70, transform: T(48, 28, 1.35), easing: 'ease-in-out' },
        { offset: 0.747, transform: T(48, 28), easing: E.grav },
        { offset: 0.907, transform: T(48, 74, 1.28, 0.7), easing: 'ease-out' },
        { offset: 0.953, transform: T(48, 71.5, 0.94, 1.06), easing: 'ease-in-out' },
        { offset: 1, transform: T(48, 74) },
      ], o),
      p.l.animate([
        { offset: 0, strokeDashoffset: px(L) },
        { offset: 0.213, strokeDashoffset: px(L), easing: E.climb },
        { offset: 0.653, strokeDashoffset: '0px' },
        { offset: 1, strokeDashoffset: '0px' },
      ], o),
      p.r.animate([
        { offset: 0, strokeDashoffset: px(L) },
        { offset: 0.70, strokeDashoffset: px(L), easing: E.desc },
        { offset: 0.84, strokeDashoffset: '0px' },
        { offset: 1, strokeDashoffset: '0px' },
      ], o),
    ];
    const wm = opts.wordmark;
    if (wm) {
      const peak = wm.querySelector('.pf-wm-peak');
      const form = wm.querySelector('em');
      if (peak) list.push(peak.animate([
        { opacity: 0, clipPath: 'inset(-20% 100% -30% -5%)', transform: 'translateX(-10px)', easing: E.soft },
        { opacity: 1, clipPath: 'inset(-20% -5% -30% -5%)', transform: 'translateX(0)' },
      ], { duration: 450, delay: 1250, fill: 'both' }));
      if (form) list.push(form.animate([
        { opacity: 0, transform: 'translateY(6px)', easing: E.soft },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: 450, delay: 1420, fill: 'both' }));
    }
    return Promise.all(list.map(a => a.finished)).then(() => list.forEach(a => a.cancel()), () => {});
  }

  // Oneindige loop (sync-loader). De basischevron dimt naar 0.3, de traces tekenen er overheen.
  function loop(svg) {
    if (!svg || !canAnimate()) return;
    const st = svg._pfLoop;
    if (st) {
      if (st.stopping) { st.list.forEach(a => a.effect.updateTiming({ iterations: Infinity })); st.stopping = false; }
      return;
    }
    const p = parts(svg);
    if (!p) return;
    const o = { duration: LOOP_MS, iterations: Infinity, fill: 'forwards' };
    const list = [
      p.dot.animate([
        { offset: 0, transform: T(18, 64, 0), easing: E.pop },
        { offset: 0.08, transform: T(18, 64), easing: E.climb },
        { offset: 0.46, transform: T(48, 28), easing: 'ease-out' },
        { offset: 0.51, transform: T(48, 28, 1.3), easing: 'ease-in-out' },
        { offset: 0.56, transform: T(48, 28), easing: E.grav },
        { offset: 0.72, transform: T(48, 74, 1.25, 0.72), easing: 'ease-out' },
        { offset: 0.78, transform: T(48, 72, 0.95, 1.05), easing: 'ease-in-out' },
        { offset: 0.84, transform: T(48, 74) },
        { offset: 0.92, transform: T(48, 74), easing: 'ease-in' },
        { offset: 1, transform: T(48, 74, 0) },
      ], o),
      p.l.animate([
        { offset: 0, strokeDashoffset: px(L) },
        { offset: 0.08, strokeDashoffset: px(L), easing: E.climb },
        { offset: 0.46, strokeDashoffset: '0px' },
        { offset: 1, strokeDashoffset: '0px' },
      ], o),
      p.r.animate([
        { offset: 0, strokeDashoffset: px(L) },
        { offset: 0.51, strokeDashoffset: px(L), easing: E.desc },
        { offset: 0.64, strokeDashoffset: '0px' },
        { offset: 1, strokeDashoffset: '0px' },
      ], o),
      p.trace.animate([
        { offset: 0, opacity: 1 },
        { offset: 0.86, opacity: 1, easing: 'ease-in' },
        { offset: 1, opacity: 0 },
      ], o),
    ];
    const t0 = document.timeline.currentTime;
    list.forEach(a => { a.startTime = t0; });
    const dim = p.base.animate([{ strokeOpacity: 1 }, { strokeOpacity: 0.3 }], { duration: 200, fill: 'forwards' });
    svg._pfLoop = { list, dim, stopping: false };
  }

  // Laat de lopende cyclus uitlopen tot de punt geland is (LOOP_REST), zodat de loader op het complete logo eindigt.
  function stop(svg) {
    const st = svg && svg._pfLoop;
    if (!st) return Promise.resolve();
    st.stopping = true;
    const ref = st.list[0];
    const pos = (ref.currentTime || 0) / LOOP_MS;
    let target = Math.floor(pos) + LOOP_REST;
    if (target <= pos) target += 1;
    st.list.forEach(a => a.effect.updateTiming({ iterations: target }));
    return ref.finished.then(() => {
      if (!st.stopping) return;
      st.list.forEach(a => a.cancel());
      st.dim.cancel();
      svg._pfLoop = null;
    }, () => {});
  }

  window.PFMark = { play, loop, stop };
})();
