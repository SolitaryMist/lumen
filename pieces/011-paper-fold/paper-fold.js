// Lumen 011 · Paper Fold
// A printed paper card folded as a 4-panel accordion. DOM + CSS 3D.
// Every frame only writes transform and opacity. Layout is read on resize only.

export const P = {
  bg: '#0B0B0C',
  paper: '#ECE8E1',
  ink: '#1A1A1C',
  small: '#8A8780',
  amber: '#FFB547',

  // layout
  wMax: 720, wVw: 0.72, wVh: 1.28,     // landscape: W = min(720px, 72vw, 128vh)
  portraitVw: 0.86, portraitCy: 0.46,  // portrait: W = 86vw, centre at 46% height
  panels: 4,
  typeR: 0.14, typeTracking: -0.03,
  metaSize: 11, metaTracking: 0.08,
  insetR: 0.05,
  grainSize: 128, grainAlpha: 0.03,

  // geometry
  maxDeg: 72,
  perspective: 1400,
  overlap: 0.5,

  // shading, identical on every surface
  leftShade: 0.10,
  rightShade: 0.42,
  valleyPx: 24, valleyAlpha: 0.18,
  peakAlpha: 0.5,
  amberPx: 2, amberLo: 0.15, amberHi: 0.6,
  shadowW: 0.9, shadowBlur: 24, shadowY: 18, shadowA0: 0.18, shadowA1: 0.22, shadowH: 0.14,

  // states
  rest: 0.45,
  hoverLo: 0.15, hoverSpan: 0.7,
  tiltDeg: 12,
  follow: { k: 170, c: 22 },   // SwiftUI response 0.48 / dampingFraction 0.84
  press: { k: 280, c: 28, f: 0.96 }, // SwiftUI 0.32 / 0.82
  mass: 1,
  introFade: 160,
  introMs: 900,
  introEase: [0.22, 1, 0.36, 1],
  guide: [{ to: 0.85, ms: 760 }, { to: 0.2, ms: 640 }],
  guideEase: [0.42, 0, 0.58, 1],
  driftMid: 0.5, driftAmp: 0.3, driftMs: 8000,
  dragGain: 0.7,
  dprCap: 3
};

export function bez(x1, y1, x2, y2) {
  const cx = (t) => 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
  const cy = (t) => 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 40; i++) {
      const v = cx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return cy(t);
  };
}

export function spring(pos, vel, target, dt, k, c, m = 1) {
  const n = Math.max(1, Math.ceil(dt * 240));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    vel += ((-k * (pos - target) - c * vel) / m) * h;
    pos += vel * h;
  }
  return [pos, vel];
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const introEase = bez(...P.introEase);
const guideEase = bez(...P.guideEase);

export function drift(ms) {
  return P.driftMid - P.driftAmp * Math.cos((2 * Math.PI * ms) / P.driftMs);
}
function driftVel(ms) { // per second
  return P.driftAmp * Math.sin((2 * Math.PI * ms) / P.driftMs) * (2 * Math.PI / P.driftMs) * 1000;
}

/** Panel placement for fold amount f: left edge (x, z) in card units of panel width p, and rotateY. */
export function panelPose(f, p) {
  const th = (f * P.maxDeg * Math.PI) / 180;
  const c = Math.cos(th), s = Math.sin(th);
  // outer edges and the peak stay on z = 0, so the projected width is exactly W·cosθ
  return [
    { x: -2 * p * c, z: 0, a: th },
    { x: -p * c, z: -p * s, a: -th },
    { x: 0, z: 0, a: th },
    { x: p * c, z: -p * s, a: -th }
  ];
}

let styleRefs = 0;
let styleEl = null;
function injectStyles(grainUrl) {
  if (styleRefs++ > 0) return;
  styleEl = document.createElement('style');
  styleEl.textContent = `
.pf-stage{position:relative;width:100%;height:100%;overflow:hidden;background:${P.bg};visibility:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.pf-stage.on{visibility:visible}
.pf-wrap{position:absolute;left:50%;top:50%;opacity:0}
.pf-shadow{position:absolute;left:0;top:0;border-radius:50%;background:#000;filter:blur(${P.shadowBlur}px);opacity:0;will-change:transform,opacity}
.pf-cam{position:absolute;left:0;top:0;perspective:${P.perspective}px;perspective-origin:50% 50%}
.pf-card{position:absolute;inset:0;transform-style:preserve-3d;will-change:transform}
.pf-panel{position:absolute;top:0;height:100%;overflow:hidden;transform-origin:0 50%;backface-visibility:hidden;-webkit-backface-visibility:hidden;will-change:transform}
.pf-print{position:absolute;top:0;height:100%;background:${P.paper}}
.pf-print::before{content:"";position:absolute;inset:0;background-image:url("${grainUrl}");background-size:${P.grainSize}px ${P.grainSize}px;opacity:${P.grainAlpha}}
.pf-title{position:absolute;left:0;width:100%;text-align:center;white-space:pre;line-height:1em;font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-weight:600;color:${P.ink};font-kerning:normal}
.pf-meta{position:absolute;white-space:pre;font:400 ${P.metaSize}px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:${P.metaTracking}em;color:${P.small}}
.pf-shade{position:absolute;inset:0;background:#000;opacity:0}
.pf-valley{position:absolute;top:0;height:100%;width:${P.valleyPx}px;opacity:0}
.pf-line{position:absolute;left:0;top:0;transform-origin:0 0;opacity:0;will-change:transform,opacity}
`;
  document.head.appendChild(styleEl);
}
function removeStyles() {
  if (--styleRefs > 0) return;
  if (styleEl) styleEl.remove();
  styleEl = null;
}

function div(cls, parent) {
  const e = document.createElement('div');
  e.className = cls;
  parent.appendChild(e);
  return e;
}

export function mountPaperFold(root, opts = {}) {
  const grainUrl = opts.grainUrl || new URL('./grain.png', import.meta.url).href;
  injectStyles(grainUrl);

  const stage = div('pf-stage', root);
  stage.setAttribute('role', 'img');
  stage.setAttribute('aria-label', 'Paper Fold: a printed card folded in four panels. Hover to fold it, press to fold it shut.');
  const wrap = div('pf-wrap', stage);
  const shadow = div('pf-shadow', wrap);
  const cam = div('pf-cam', wrap);
  const card = div('pf-card', cam);

  const panels = [];
  for (let i = 0; i < P.panels; i++) {
    const el = div('pf-panel', card);
    const print = div('pf-print', el);
    const title = div('pf-title', print);
    title.textContent = 'PAPER FOLD';
    const lumen = div('pf-meta', print);
    lumen.textContent = 'LUMEN';
    const no = div('pf-meta', print);
    no.textContent = 'Nº 011';
    const shade = div('pf-shade', el);
    const valley = div('pf-valley', el);
    // panels 0 and 2 face right (darker), 1 and 3 face left; valleys sit at 1/4 and 3/4
    const facesRight = i % 2 === 0;
    valley.style.background = facesRight
      ? 'linear-gradient(to right, rgba(0,0,0,0), rgba(0,0,0,' + P.valleyAlpha + '))'
      : 'linear-gradient(to left, rgba(0,0,0,0), rgba(0,0,0,' + P.valleyAlpha + '))';
    panels.push({ el, print, title, lumen, no, shade, valley, facesRight });
  }
  const peak = div('pf-line', stage);
  peak.style.background = `rgba(255,255,255,${P.peakAlpha})`;
  const amberLine = div('pf-line', stage);
  amberLine.style.background = P.amber;

  const reducedQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fineQ = window.matchMedia('(hover: hover) and (pointer: fine)');
  let reduced = reducedQ.matches;
  let pointerMode = fineQ.matches;

  // ---------- layout ----------
  let geo = null;
  let stageRect = { left: 0, top: 0, width: 1, height: 1 };

  function layout() {
    const Wv = root.clientWidth, Hv = root.clientHeight;
    if (!Wv || !Hv) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, P.dprCap);
    const portrait = Hv > Wv;
    let W = portrait ? P.portraitVw * Wv : Math.min(P.wMax, P.wVw * Wv, P.wVh * Hv);
    // W in a multiple of 8 device px, so W/2, W/4 and the centre are even device px
    let Wd = Math.max(8, Math.floor((W * dpr) / 8) * 8);
    W = Wd / dpr;
    const H = W / 2, p = W / 4;
    const cy = portrait ? P.portraitCy : 0.5;
    const px = (v) => `${v}px`;

    wrap.style.top = `${cy * 100}%`;
    wrap.style.width = px(W);
    wrap.style.height = px(H);
    wrap.style.transform = `translate(${-W / 2}px, ${-H / 2}px)`;
    const r0 = wrap.getBoundingClientRect();
    const snap = (v) => (Math.round((v * dpr) / 2) * 2 - v * dpr) / dpr;
    const sx = snap(r0.left), sy = snap(r0.top);
    wrap.style.transform = `translate(${-W / 2 + sx}px, ${-H / 2 + sy}px)`;
    const sr = stage.getBoundingClientRect();
    const r = wrap.getBoundingClientRect();
    stageRect = { left: sr.left, top: sr.top, width: sr.width, height: sr.height };

    cam.style.width = card.style.width = px(W);
    cam.style.height = card.style.height = px(H);
    const inset = Math.round(P.insetR * W);
    const fs = P.typeR * W;
    panels.forEach((pn, i) => {
      const s = pn.el.style;
      s.left = px(W / 2);
      s.width = px(p + (pn.facesRight ? P.overlap : 0)); // 0.5px tuck under the next panel at each valley
      pn.print.style.width = px(W);
      pn.print.style.left = px(-i * p);
      const t = pn.title.style;
      t.fontSize = px(fs);
      t.letterSpacing = `${P.typeTracking}em`;
      t.top = px(H / 2 - fs / 2); // line-height 1em: Geist cap middle lands on H/2
      t.transform = `translateX(${(-P.typeTracking * fs) / 2}px)`; // trailing tracking correction
      pn.lumen.style.left = px(inset);
      pn.lumen.style.top = px(inset);
      pn.no.style.right = px(inset);
      pn.no.style.top = px(inset);
      const v = pn.valley.style;
      if (pn.facesRight) { v.left = px(p - P.valleyPx); } else { v.left = '0px'; }
    });
    shadow.style.width = px(W);
    shadow.style.height = px(P.shadowH * H);
    // amber and peak lines live in stage space, outside the 3D context
    const cxDev = Math.round((r.left - sr.left + W / 2) * dpr);
    const amberDev = Math.round(P.amberPx * dpr);
    const amberLeftDev = Math.round((cxDev - amberDev / 2) / 2) * 2;
    const peakDev = Math.max(1, Math.round(dpr));
    const peakLeftDev = Math.round(cxDev - peakDev / 2);
    amberLine.style.width = px(amberDev / dpr);
    amberLine.style.height = px(H);
    peak.style.width = px(peakDev / dpr);
    peak.style.height = px(H);
    geo = {
      dpr, W, H, p, portrait, cy,
      cardLeft: r.left - sr.left, cardTop: r.top - sr.top,
      cx: cxDev / dpr, cyPx: r.top - sr.top + H / 2,
      amberLeft: amberLeftDev / dpr, peakLeft: peakLeftDev / dpr
    };
    return true;
  }

  // ---------- state ----------
  let raf = 0, t0 = null, now = 0, last = null, destroyed = false;
  let f = 0, vf = 0, rx = 0, vrx = 0;
  let introDone = false;
  let mode = 'rest';          // fine pointer: rest | hover | press   no fine pointer: guide | drift | drag | settle
  let target = P.rest, targetRx = 0;
  let ptr = { x: 0.5, y: 0.5 };
  let drag = null;            // { id, x0, f0 }
  let settleE = 0, settleV = 0;
  const introEnd = P.introFade + P.introMs;
  const driftStart = introEnd + P.guide[0].ms + P.guide[1].ms;

  function introF(t) {
    if (t <= P.introFade) return 0;
    return P.rest * introEase((t - P.introFade) / P.introMs);
  }
  function guideF(t) {
    const g = t - introEnd;
    if (g <= P.guide[0].ms) return P.rest + (P.guide[0].to - P.rest) * guideEase(g / P.guide[0].ms);
    const g2 = g - P.guide[0].ms;
    return P.guide[0].to + (P.guide[1].to - P.guide[0].to) * guideEase(g2 / P.guide[1].ms);
  }

  // leave the scripted intro early when input arrives, keeping position and speed
  function endIntro() {
    if (introDone) return;
    introDone = true;
    const a = introF(now), b = introF(now + 1);
    f = a; vf = (b - a) * 1000;
    if (pointerMode) mode = 'rest';
    else mode = now < driftStart ? 'guide' : 'drift';
  }

  function hoverTarget() { return P.hoverLo + P.hoverSpan * clamp(ptr.x, 0, 1); }

  function step(dt) {
    if (reduced) { f = P.rest; vf = 0; rx = 0; vrx = 0; return; }
    if (!introDone) {
      if (now < introEnd) { f = introF(now); rx = 0; return; }
      introDone = true;
      vf = 0;
      mode = pointerMode ? 'rest' : 'guide';
    }
    if (mode === 'guide') {
      if (now < driftStart) { f = guideF(now); vf = (guideF(now + 1) - f) * 1000; }
      else mode = 'drift';
    }
    if (mode === 'drift') { f = drift(now - driftStart); vf = driftVel(now - driftStart); }
    if (mode === 'settle') {
      [settleE, settleV] = spring(settleE, settleV, 0, dt, P.follow.k, P.follow.c, P.mass);
      f = drift(now - driftStart) + settleE;
      vf = driftVel(now - driftStart) + settleV;
      if (Math.abs(settleE) < 1e-4 && Math.abs(settleV) < 1e-3) mode = 'drift';
    }
    if (mode === 'rest' || mode === 'hover' || mode === 'press' || mode === 'drag') {
      const sp = mode === 'press' ? P.press : P.follow;
      const tgt = mode === 'press' ? P.press.f : target;
      [f, vf] = spring(f, vf, tgt, dt, sp.k, sp.c, P.mass);
    }
    [rx, vrx] = spring(rx, vrx, targetRx, dt, P.follow.k, P.follow.c, P.mass);
  }

  // ---------- render ----------
  const fmt = (v) => (Math.abs(v) < 1e-6 ? 0 : v).toFixed(4);
  function render() {
    if (!geo) return;
    const { W, H, p, cx, cyPx } = geo;
    const ff = clamp(f, 0, 1);
    const pose = panelPose(ff, p);
    card.style.transform = `rotateX(${fmt(rx)}deg)`;
    panels.forEach((pn, i) => {
      const q = pose[i];
      pn.el.style.transform = `translate3d(${fmt(q.x)}px,0,${fmt(q.z)}px) rotateY(${fmt((q.a * 180) / Math.PI)}deg)`;
      pn.shade.style.opacity = fmt((pn.facesRight ? P.rightShade : P.leftShade) * ff);
      pn.valley.style.opacity = fmt(ff);
    });
    // shadow: ellipse 0.9 × projected width, 18px under the card
    const th = (ff * P.maxDeg * Math.PI) / 180;
    const sh = P.shadowH * H;
    shadow.style.transform = `translate(0px, ${H + P.shadowY - sh / 2}px) scaleX(${fmt(P.shadowW * Math.cos(th))})`;
    shadow.style.transformOrigin = '50% 50%';
    shadow.style.opacity = fmt(P.shadowA0 + P.shadowA1 * ff);
    // the centre crease (x = 0, z = 0) after rotateX, through the same 1400px camera
    const a = (rx * Math.PI) / 180;
    const proj = (y) => { const yy = y * Math.cos(a), zz = y * Math.sin(a); return (yy * P.perspective) / (P.perspective - zz); };
    const top = cyPx + proj(-H / 2), bottom = cyPx + proj(H / 2);
    const k = (bottom - top) / H;
    amberLine.style.transform = `translate(${geo.amberLeft}px, ${fmt(top)}px) scaleY(${fmt(k)})`;
    peak.style.transform = `translate(${geo.peakLeft}px, ${fmt(top)}px) scaleY(${fmt(k)})`;
    const amberA = smoothstep(P.amberLo, P.amberHi, ff);
    amberLine.style.opacity = fmt(amberA);
    peak.style.opacity = fmt(ff);
  }

  function frame(ts) {
    raf = 0;
    if (destroyed) return;
    if (t0 === null) { t0 = ts; last = ts; }
    now = ts - t0;
    const dt = Math.min(1 / 30, Math.max(0, (ts - last) / 1000));
    last = ts;
    wrap.style.opacity = fmt(clamp(now / P.introFade, 0, 1));
    step(dt);
    render();
    if (!stage.classList.contains('on')) stage.classList.add('on');
    raf = requestAnimationFrame(frame);
  }

  // ---------- input ----------
  function local(e) {
    return { x: (e.clientX - stageRect.left) / stageRect.width, y: (e.clientY - stageRect.top) / stageRect.height };
  }
  function onMove(e) {
    if (reduced || t0 === null) return;
    if (e.pointerType === 'touch') {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = (e.clientX - drag.x0) / stageRect.width;
      target = clamp(drag.f0 + P.dragGain * dx, 0, 1);
      return;
    }
    // a real hover means a fine pointer is here, whatever the media query said
    pointerMode = true;
    endIntro();
    ptr = local(e);
    if (mode !== 'press') mode = 'hover';
    target = hoverTarget();
    targetRx = (0.5 - clamp(ptr.y, 0, 1)) * P.tiltDeg;
  }
  function onLeave(e) {
    if (reduced || e.pointerType === 'touch' || mode === 'press') return;
    if (!pointerMode) return;
    mode = 'rest';
    target = P.rest;
    targetRx = 0;
  }
  function onDown(e) {
    if (reduced || t0 === null) return;
    if (e.pointerType === 'touch') {
      endIntro();
      drag = { id: e.pointerId, x0: e.clientX, f0: clamp(f, 0, 1) };
      target = drag.f0;
      mode = 'drag';
      return;
    }
    if (e.button !== 0) return;
    pointerMode = true;
    endIntro();
    ptr = local(e);
    targetRx = (0.5 - clamp(ptr.y, 0, 1)) * P.tiltDeg;
    mode = 'press';
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  }
  function onUp(e) {
    if (e.pointerType === 'touch') {
      if (!drag || drag.id !== e.pointerId) return;
      drag = null;
      if (pointerMode) { mode = 'rest'; target = P.rest; return; }
      // spring the offset from the drift back to zero, carrying the release speed
      settleE = f - drift(now - driftStart);
      settleV = vf - driftVel(now - driftStart);
      mode = 'settle';
      return;
    }
    if (mode !== 'press') return;
    // back to the pointer-derived fold; vf is untouched so the release speed carries
    ptr = local(e);
    const inside = ptr.x >= 0 && ptr.x <= 1 && ptr.y >= 0 && ptr.y <= 1;
    mode = inside ? 'hover' : 'rest';
    target = inside ? hoverTarget() : P.rest;
    if (!inside) targetRx = 0;
  }

  const onReduced = () => { reduced = reducedQ.matches; };
  const onFine = () => { if (fineQ.matches) pointerMode = true; };
  const listen = (q, fn) => (q.addEventListener ? q.addEventListener('change', fn) : q.addListener(fn));
  const unlisten = (q, fn) => (q.removeEventListener ? q.removeEventListener('change', fn) : q.removeListener(fn));

  stage.addEventListener('pointermove', onMove);
  stage.addEventListener('pointerleave', onLeave);
  stage.addEventListener('pointerdown', onDown);
  stage.addEventListener('pointerup', onUp);
  stage.addEventListener('pointercancel', onUp);
  listen(reducedQ, onReduced);
  listen(fineQ, onFine);
  const relayout = () => { layout(); render(); };
  const ro = new ResizeObserver(relayout);
  ro.observe(root);
  window.addEventListener('resize', relayout);
  let dprQ = null;
  const onDpr = () => { if (dprQ) unlisten(dprQ, onDpr); watchDpr(); relayout(); };
  function watchDpr() { dprQ = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`); listen(dprQ, onDpr); }
  watchDpr();

  const fontsReady = (opts.fonts || Promise.all([
    document.fonts.load('600 64px Geist', 'PAPER FOLD'),
    document.fonts.load(`400 ${P.metaSize}px "JetBrains Mono"`, 'LUMEN Nº 011')
  ])).catch(() => {}).then(() => document.fonts.ready).then(() => {
    if (destroyed) return;
    // shown only once fonts are in and the size is measured
    const go = () => { if (layout()) raf = requestAnimationFrame(frame); else requestAnimationFrame(go); };
    go();
  });

  return {
    stage,
    fontsReady,
    state() {
      return {
        started: t0 !== null, now, f, vf, rx, mode, introDone, pointerMode, reduced,
        amber: smoothstep(P.amberLo, P.amberHi, clamp(f, 0, 1)), geo, driftStart
      };
    },
    destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      stage.removeEventListener('pointermove', onMove);
      stage.removeEventListener('pointerleave', onLeave);
      stage.removeEventListener('pointerdown', onDown);
      stage.removeEventListener('pointerup', onUp);
      stage.removeEventListener('pointercancel', onUp);
      unlisten(reducedQ, onReduced);
      unlisten(fineQ, onFine);
      if (dprQ) unlisten(dprQ, onDpr);
      ro.disconnect();
      window.removeEventListener('resize', relayout);
      stage.remove();
      removeStyles();
    }
  };
}
