import { useEffect, useRef } from 'react';

/* Mount: React 18, default export. Render <DitherLight /> in a box.
   Register this piece's inter-var.woff2 as family "Inter Var", weight 100 900.
   Bayer 8×8. Cell side 2·round(2·dpr) device px, dpr capped at 2.
   Light spring stiffness 170, damping 22, mass 1. Guide 1400ms
   cubic-bezier(0.45, 0, 0.55, 1), then lx = 0.6·cos over 8000ms.
   Press cross-fades 4px and 2px cells over 240ms / 320ms.
   Each copy keeps its own canvas, WebGL context, and listeners. */

const P = {
  rest: [0.35, -0.45], guideLx: 0.6, guideLy: -0.35,
  k: 170, c: 22, m: 1, clampLen: 1.2,
  swiftResponse: 0.48, swiftDamping: 0.84,
  composeDamping: 0.84, composeStiffness: 170,
  pressIn: 240, pressOut: 320, brightMs: 600, stageFade: 160,
  titleDelay: 120, titleMs: 300, titleRise: 4,
  guide: 1400, driftPeriod: 8000, hold: 2000, ret: 600,
  easePress: [0.2, 0.8, 0.2, 1],
  easeRelease: [0.4, 0, 0.2, 1],
  easeBright: [0.2, 0.8, 0.2, 1],
  easeGuide: [0.45, 0, 0.55, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  specCut: 0.55, specPow: 40, lz: 0.9
};
const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec2 uRadius;
uniform vec2 uLight;
uniform vec2 uCell;
uniform float uMix;
uniform float uBright;
out vec4 o;
const float BAYER[64] = float[64](
  0.0,32.0,8.0,40.0,2.0,34.0,10.0,42.0,
  48.0,16.0,56.0,24.0,50.0,18.0,58.0,26.0,
  12.0,44.0,4.0,36.0,14.0,46.0,6.0,38.0,
  60.0,28.0,52.0,20.0,62.0,30.0,54.0,22.0,
  3.0,35.0,11.0,43.0,1.0,33.0,9.0,41.0,
  51.0,19.0,59.0,27.0,49.0,17.0,57.0,25.0,
  15.0,47.0,7.0,39.0,13.0,45.0,5.0,37.0,
  63.0,31.0,55.0,23.0,61.0,29.0,53.0,21.0
);
float thresh(vec2 idx){
  int ix = int(mod(idx.x, 8.0));
  int iy = int(mod(idx.y, 8.0));
  if (ix < 0) ix = 0; if (ix > 7) ix = 7;
  if (iy < 0) iy = 0; if (iy > 7) iy = 7;
  return (BAYER[iy * 8 + ix] + 0.5) / 64.0;
}
vec3 ink(float cell){
  vec3 bg = vec3(11.0/255.0, 11.0/255.0, 12.0/255.0);
  float side = max(2.0, floor(cell + 0.5));
  vec2 idx = floor(gl_FragCoord.xy / side);
  vec2 mid = (idx + 0.5) * side;
  vec2 down = vec2(mid.x, uRes.y - mid.y);
  vec2 p = (down - uCenter) / max(uRadius, vec2(1.0));
  if (dot(p, p) > 1.0) return bg;
  vec3 N = vec3(p, sqrt(max(0.0, 1.0 - dot(p, p))));
  vec3 L = normalize(vec3(uLight, 0.9));
  float ndl = dot(N, L);
  float lum = (0.06 + 0.94 * max(ndl, 0.0) * smoothstep(-0.05, 0.25, ndl)) * uBright;
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float spec = pow(max(dot(N, H), 0.0), 40.0);
  if (lum <= thresh(idx)) return bg;
  if (spec > 0.55) return vec3(1.0, 181.0/255.0, 71.0/255.0);
  return vec3(232.0/255.0, 230.0/255.0, 225.0/255.0);
}
void main(){
  o = vec4(mix(ink(uCell.x), ink(uCell.y), clamp(uMix, 0.0, 1.0)), 1.0);
}`;
const VS = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t;
  const Y = (t) => ((ay * t + by) * t + cy) * t;
  const dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = X(t) - x, d = dX(t);
      if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    if (t < 0 || t > 1) {
      let a = 0, b = 1; t = x;
      for (let i = 0; i < 30; i++) { const v = X(t); if (v < x) a = t; else b = t; t = (a + b) / 2; }
    }
    return Y(Math.min(1, Math.max(0, t)));
  };
}
const easePress = bez(...P.easePress);
const easeRelease = bez(...P.easeRelease);
const easeBright = bez(...P.easeBright);
const easeGuide = bez(...P.easeGuide);
const easeInOut = bez(...P.easeInOut);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function spring(pos, vel, target, dt, k, c, m) {
  if (!(dt > 0)) return [pos, vel];
  const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
  for (let s = 0; s < n; s++) {
    vel += ((-k * (pos - target) - c * vel) / m) * h;
    pos += vel * h;
  }
  return [pos, vel];
}
function cellsFor(raw) {
  const dpr = Math.min(raw > 0 ? raw : 1, 2);
  let rest = 2 * Math.round(2 * dpr);
  let press = 2 * Math.round(dpr);
  if (rest < 2) rest = 2;
  if (press < 2) press = 2;
  if ((press & 1) === 1) press -= 1;
  if ((rest & 1) === 1) rest += 1;
  if (press >= rest) press = Math.max(2, rest - 2);
  return { dpr, rest, press };
}
function angles(lx, ly) {
  const theta = Math.atan2(lx, P.lz) * 180 / Math.PI;
  const phi = Math.atan2(-ly, Math.hypot(lx, P.lz)) * 180 / Math.PI;
  return [Math.round(theta), Math.round(phi)];
}

function mount(el) {
  const canvas = el.querySelector('canvas');
  const head = el.querySelector('[data-head]');
  const read = el.querySelector('[data-read]');
  const tn = el.querySelector('[data-tn]');
  const ts = el.querySelector('[data-ts]');
  const pn = el.querySelector('[data-pn]');
  const ps = el.querySelector('[data-ps]');
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fineMq = matchMedia('(hover: hover) and (pointer: fine)');
  let reduced = reduceMq.matches;
  let fine = !reduced && fineMq.matches;
  let phase = 'rest';
  let lx = P.rest[0], ly = P.rest[1], vx = 0, vy = 0;
  let targetX = lx, targetY = ly;
  let pressU = 0, pressFrom = 0, pressTo = 0, pressT0 = 0, pressDur = P.pressIn, pressing = false;
  let bright = reduced ? 1 : 0;
  let t0 = 0, guideT0 = 0, driftT0 = 0, holdT0 = 0, returnT0 = 0, last = 0;
  let returnFromX = 0, returnFromY = 0, returnToX = P.guideLx, returnToY = P.guideLy;
  let raf = 0, wake = 0, ready = false, alive = true, pointerId = null;
  let viewW = 1, viewH = 1, viewDpr = 1;
  let shownTh = null, shownPh = null;
  const trace = [];
  let gl = null, prog = null, locs = null;
  const onReduce = () => {
    reduced = reduceMq.matches;
    if (!ready) return;
    reset(performance.now());
    kick();
  };
  const onFine = () => {
    if (reduced || !ready) return;
    fine = fineMq.matches;
    if (fine) { phase = 'rest'; targetX = P.rest[0]; targetY = P.rest[1]; }
    else { phase = 'guide'; guideT0 = performance.now(); }
    clearTimeout(wake); wake = 0;
    kick();
  };
  reduceMq.addEventListener('change', onReduce);
  fineMq.addEventListener('change', onFine);

  function reset(now) {
    t0 = now; last = 0; vx = 0; vy = 0;
    clearTimeout(wake); wake = 0;
    if (reduced) {
      phase = 'rest'; fine = false;
      lx = P.rest[0]; ly = P.rest[1]; targetX = lx; targetY = ly; bright = 1;
      pressU = pressing ? 1 : 0; pressFrom = pressU; pressTo = pressU;
      return;
    }
    bright = 0;
    fine = fineMq.matches;
    if (fine) {
      phase = 'rest'; lx = P.rest[0]; ly = P.rest[1]; targetX = lx; targetY = ly;
    } else {
      phase = 'guide'; guideT0 = now; driftT0 = 0;
      lx = 0; ly = P.guideLy; targetX = lx; targetY = ly;
    }
  }
  function trackable(e) { return e.pointerType === 'mouse' || e.pointerType === 'pen'; }
  function mapPointer(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const radius = Math.max(1, Math.min(600, rect.height * 0.62, rect.width * 0.84) / 2);
    let x = (clientX - (rect.left + rect.width / 2)) / radius;
    let y = (clientY - (rect.top + rect.height / 2)) / radius;
    const len = Math.hypot(x, y);
    if (len > P.clampLen) { const s = P.clampLen / len; x *= s; y *= s; }
    return [x, y];
  }
  function springTo(dt) {
    [lx, vx] = spring(lx, vx, targetX, dt, P.k, P.c, P.m);
    [ly, vy] = spring(ly, vy, targetY, dt, P.k, P.c, P.m);
    if (Math.abs(lx - targetX) < 1e-4 && Math.abs(ly - targetY) < 1e-4 && Math.abs(vx) < 1e-4 && Math.abs(vy) < 1e-4) {
      lx = targetX; ly = targetY; vx = 0; vy = 0; return true;
    }
    return false;
  }
  function cruiseX(elapse) {
    if (!(elapse > 0)) return 0;
    if (elapse >= P.guide) {
      const w = ((elapse - P.guide) / P.driftPeriod) * Math.PI * 2;
      return P.guideLx * Math.cos(w);
    }
    return easeGuide(elapse / P.guide) * P.guideLx;
  }
  function applyGuide(elapse, dt) {
    const prev = lx;
    lx = cruiseX(elapse);
    ly = P.guideLy;
    vx = dt > 0 ? (lx - prev) / dt : 0; vy = 0;
  }
  function applyDrift(now, dt) {
    const prev = lx;
    const w = ((now - driftT0) / P.driftPeriod) * Math.PI * 2;
    lx = P.guideLx * Math.cos(w); ly = P.guideLy;
    vx = dt > 0 ? (lx - prev) / dt : 0; vy = 0;
  }
  function beginReturn(now) {
    phase = 'return'; returnT0 = now;
    returnFromX = lx; returnFromY = ly;
    returnToX = lx >= 0 ? P.guideLx : -P.guideLx; returnToY = P.guideLy;
  }
  function step(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (reduced) {
      bright = 1; lx = P.rest[0]; ly = P.rest[1]; vx = 0; vy = 0;
      targetX = lx; targetY = ly; phase = 'rest';
      pressU = pressing ? 1 : 0; pressFrom = pressU; pressTo = pressU;
      return now - t0 < P.stageFade;
    }
    bright = easeBright(clamp((now - t0) / P.brightMs, 0, 1));
    if (pressFrom !== pressTo) {
      const u = clamp((now - pressT0) / pressDur, 0, 1);
      const e = pressTo > pressFrom ? easePress(u) : easeRelease(u);
      pressU = pressFrom + (pressTo - pressFrom) * e;
      if (u >= 1) { pressU = pressTo; pressFrom = pressTo; }
    }
    let cont = (now - t0) < P.brightMs || Math.abs(pressU - pressTo) > 0.0008;
    if (phase === 'guide') {
      const elapse = now - guideT0;
      if (elapse >= P.guide) { driftT0 = guideT0 + P.guide; phase = 'drift'; }
      applyGuide(elapse, dt);
      cont = true;
    } else if (phase === 'drift') { applyDrift(now, dt); cont = true; }
    else if (phase === 'return') {
      const u = clamp((now - returnT0) / P.ret, 0, 1);
      const e = easeInOut(u);
      const prev = lx;
      lx = returnFromX + (returnToX - returnFromX) * e;
      ly = returnFromY + (returnToY - returnFromY) * e;
      vx = dt > 0 ? (lx - prev) / dt : 0; vy = 0;
      if (u >= 1) {
        lx = returnToX; ly = returnToY; vx = 0; vy = 0; phase = 'drift';
        driftT0 = returnToX > 0 ? now : now - P.driftPeriod / 2;
      }
      cont = true;
    } else if (phase === 'hold') {
      const settled = springTo(dt);
      if (now - holdT0 >= P.hold) { beginReturn(now); cont = true; }
      else if (!settled) cont = true;
      else {
        const remain = P.hold - (now - holdT0);
        clearTimeout(wake);
        wake = setTimeout(() => { wake = 0; kick(); }, Math.max(0, remain));
      }
    } else if (!springTo(dt)) cont = true;
    if (now - t0 < Math.max(P.stageFade, P.titleDelay + P.titleMs)) cont = true;
    return cont;
  }
  function follow(x, y) {
    targetX = x; targetY = y; phase = 'follow';
    clearTimeout(wake); wake = 0; kick();
  }
  function onMove(e) {
    if (!alive || reduced) return;
    if (!trackable(e)) {
      if (!(pressing && pointerId === e.pointerId && !fine)) return;
      const [x, y] = mapPointer(e.clientX, e.clientY); follow(x, y); return;
    }
    if (!fine) fine = true;
    const [x, y] = mapPointer(e.clientX, e.clientY); follow(x, y);
  }
  function onDown(e) {
    if (!alive) return;
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    pointerId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pressing = true;
    if (reduced) { pressU = 1; pressFrom = 1; pressTo = 1; draw(); return; }
    pressFrom = pressU; pressTo = 1; pressT0 = performance.now(); pressDur = P.pressIn;
    if (trackable(e)) fine = true;
    const [x, y] = mapPointer(e.clientX, e.clientY);
    follow(x, y);
    e.preventDefault();
  }
  function onUp(e) {
    if (!alive) return;
    if (pointerId !== null && e.pointerId !== pointerId) return;
    const was = pressing; pressing = false; pointerId = null;
    if (reduced) { pressU = 0; pressFrom = 0; pressTo = 0; draw(); return; }
    if (was) { pressFrom = pressU; pressTo = 0; pressT0 = performance.now(); pressDur = P.pressOut; }
    if (!fine && was && phase === 'follow') { phase = 'hold'; holdT0 = performance.now(); }
    kick();
  }
  function paintChrome(now) {
    const fade = clamp((now - t0) / P.stageFade, 0, 1);
    canvas.style.opacity = String(fade);
    read.style.opacity = String(fade);
    if (reduced) { head.style.opacity = String(fade); head.style.transform = 'none'; }
    else {
      const u = clamp((now - t0 - P.titleDelay) / P.titleMs, 0, 1);
      const e = easeBright(u);
      head.style.opacity = String(e);
      head.style.transform = `translateY(${(P.titleRise * (1 - e)).toFixed(3)}px)`;
    }
    const pair = angles(lx, ly);
    if (pair[0] !== shownTh) { shownTh = pair[0]; tn.textContent = String(Math.abs(shownTh)); ts.textContent = shownTh < 0 ? '-' : ''; }
    if (pair[1] !== shownPh) { shownPh = pair[1]; pn.textContent = String(Math.abs(shownPh)); ps.textContent = shownPh < 0 ? '-' : ''; }
  }
  function resize() {
    const rect = el.getBoundingClientRect();
    viewW = Math.max(1, rect.width);
    viewH = Math.max(1, rect.height);
    viewDpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(viewW * viewDpr));
    const h = Math.max(1, Math.round(viewH * viewDpr));
    viewW = w / viewDpr;
    viewH = h / viewDpr;
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (gl) { gl.viewport(0, 0, canvas.width, canvas.height); if (ready) draw(); }
  }
  function draw() {
    if (!gl || !locs || !alive) return;
    const cells = cellsFor(viewDpr);
    const cssR = Math.max(1, Math.min(600, viewH * 0.62, viewW * 0.84) / 2);
    const rad = Math.max(1, Math.round(cssR * (canvas.width / viewW)));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(prog);
    gl.uniform2f(locs.res, canvas.width, canvas.height);
    gl.uniform2f(locs.center, canvas.width / 2, canvas.height / 2);
    gl.uniform2f(locs.radius, rad, rad);
    gl.uniform2f(locs.light, lx, ly);
    gl.uniform2f(locs.cell, cells.rest, cells.press);
    gl.uniform1f(locs.mix, pressU);
    gl.uniform1f(locs.bright, bright);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    el.dataset.phase = phase;
    el.dataset.lx = lx.toFixed(5);
    el.dataset.ly = ly.toFixed(5);
    el.dataset.press = pressU.toFixed(4);
    el.dataset.bright = bright.toFixed(4);
    el.dataset.cellA = String(cells.rest);
    el.dataset.cellB = String(cells.press);
    el.dataset.fine = fine ? '1' : '0';
    el.dataset.reduced = reduced ? '1' : '0';
    el.dataset.ready = ready ? '1' : '0';
    el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
    trace.push({ t: last || t0, lx, ly, phase, press: pressU, bright });
    if (trace.length > 900) trace.splice(0, trace.length - 900);
  }
  function frame() {
    raf = 0;
    if (!alive) return;
    const now = performance.now();
    const more = step(now);
    draw();
    paintChrome(now);
    if (more && alive) raf = requestAnimationFrame(frame);
  }
  function kick() {
    if (!ready || !alive) return;
    if (!raf) raf = requestAnimationFrame(frame);
  }
  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) { gl.deleteShader(sh); return null; }
    return sh;
  }
  function initGL() {
    gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true, failIfMajorPerformanceCaveat: false
    });
    if (!gl) return false;
    if ('drawingBufferColorSpace' in gl) gl.drawingBufferColorSpace = 'srgb';
    const vs = compile(gl.VERTEX_SHADER, VS);
    const fs = compile(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    locs = {
      res: gl.getUniformLocation(prog, 'uRes'),
      center: gl.getUniformLocation(prog, 'uCenter'),
      radius: gl.getUniformLocation(prog, 'uRadius'),
      light: gl.getUniformLocation(prog, 'uLight'),
      cell: gl.getUniformLocation(prog, 'uCell'),
      mix: gl.getUniformLocation(prog, 'uMix'),
      bright: gl.getUniformLocation(prog, 'uBright')
    };
    gl.disable(gl.BLEND); gl.disable(gl.DITHER);
    return true;
  }
  el.addEventListener('pointermove', onMove, { passive: true });
  el.addEventListener('pointerdown', onDown, { passive: false });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  const ro = new ResizeObserver(() => { resize(); if (ready) kick(); });
  ro.observe(el);
  resize();
  if (initGL()) {
    reset(performance.now());
    step(performance.now());
    draw();
    requestAnimationFrame(() => {
      if (!alive) return;
      reset(performance.now());
      step(performance.now());
      draw();
      const shown = performance.now();
      reset(shown);
      step(shown);
      paintChrome(shown);
      ready = true;
      el.dataset.ready = '1';
      el.style.visibility = 'visible';
      kick();
    });
  } else el.dataset.error = 'gl';
  el.__light = {
    trace,
    state: () => ({ phase, lx, ly, pressU, bright, fine, reduced, ready, cellA: cellsFor(viewDpr).rest, cellB: cellsFor(viewDpr).press, t0, guideT0 })
  };
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearTimeout(wake);
    ro.disconnect();
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    reduceMq.removeEventListener('change', onReduce);
    fineMq.removeEventListener('change', onFine);
    if (gl) {
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    }
    el.dataset.lost = '1';
  };
}

export default function DitherLight() {
  const root = useRef(null);
  useEffect(() => mount(root.current), []);
  return (
    <div ref={root} data-fw="dither" style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520, overflow: 'hidden', background: '#0B0B0C', color: '#E8E6E1', fontFamily: '"Inter Var", Inter, ui-sans-serif, system-ui, sans-serif', touchAction: 'none', userSelect: 'none', visibility: 'hidden' }}>
      <canvas style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block', opacity: 0, imageRendering: 'pixelated' }} aria-hidden="true" />
      <header data-head style={{ position: 'absolute', top: 28, left: 28, opacity: 0, pointerEvents: 'none' }}>
        <h1 style={{ margin: 0, fontWeight: 500, fontSize: 'clamp(28px, 4vw, 40px)', letterSpacing: '-0.035em', lineHeight: 1 }}>Dither Light</h1>
        <p style={{ margin: '8px 0 0', color: '#8A8A8A', fontSize: 13 }}>One light, one bit.</p>
      </header>
      <p data-read style={{ position: 'absolute', right: 24, bottom: 22, margin: 0, opacity: 0, color: '#8A8A8A', fontSize: 13, lineHeight: 1, fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum" 1', display: 'flex', alignItems: 'baseline', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
        <span style={{ marginRight: '.35em' }}>θ</span>
        <span data-ts style={{ display: 'inline-block', width: '.7ch', textAlign: 'center' }} />
        <span data-tn style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>21</span>
        <span style={{ marginLeft: '.08em' }}>°</span>
        <span style={{ display: 'inline-block', width: '.85em' }} />
        <span style={{ marginRight: '.35em' }}>φ</span>
        <span data-ps style={{ display: 'inline-block', width: '.7ch', textAlign: 'center' }} />
        <span data-pn style={{ display: 'inline-block', width: '2ch', textAlign: 'right' }}>25</span>
        <span style={{ marginLeft: '.08em' }}>°</span>
      </p>
    </div>
  );
}
