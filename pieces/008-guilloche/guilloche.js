/* Guilloché — Lumen 008
   Same numbers on the web page, React, and Vue. SwiftUI and Compose
   repeat them (360 samples, 12 buckets, ring fade instead of a stroke draw).

   CARD     Width min(640px, 86vw), aspect 1.586. Face #121214,
            1px line rgba(255,255,255,.06), radius 20. Page #0B0B0C.
   INK      Dark #2A2A2A, lit #E8E6E1, core #FFB547 only where b > 0.9.
            Secondary #8A8A8A. Grain tile at 3% over the lines.
   RINGS    36. Centre (0.68W, 0.5H). Ring i radius H·(0.10+0.012i).
            p(t) = c + (r + 0.035H·sin(12t+0.18i)) · (1.35 cos t, sin t),
            t in [0, 2π]. 720 segments here. Points snap to device pixels.
            Stroke is 1 CSS px. Device pixel ratio is capped at 2.
   LIGHT    b = |cos(φ−θ)|^k · (0.35+0.65·exp(−d²/(2σ²)))
            φ is the segment tangent. θ = lx·70°. lx is the light’s x
            on the card mapped to [−1, 1]. d is the distance from the
            segment to the light point. σ = 0.35W. k rests at 8.
            Colour mixes #2A2A2A toward #E8E6E1 by b, then, when b > 0.9,
            toward #FFB547 by (b−0.9)/0.1. 24 brightness buckets.
            Lighting is rebuilt only after the light point moves more
            than 0.002, or k does.
   REST     Light point (0.35, 0.40). lx = 2·0.35−1 = −0.30.
            θ = −21°, which is −20° to the nearest ten degrees.
   SPRING   Light: stiffness 170, damping 22, mass 1.
            Press: stiffness 280, damping 28, mass 1. k travels 8 → 24
            and back, keeping its velocity on release.
            a = (−k(x−target) − c v) / m, in 1/240 s steps.
            SwiftUI light .spring(response: 0.48, dampingFraction: 0.84)
            SwiftUI press .spring(response: 0.32, dampingFraction: 0.82)
   GUIDE    No fine pointer. θ runs −60° → +50° in 760ms, then
            +50° → −30° in 640ms. Each leg is cubic-bezier(0.65, 0, 0.35, 1).
            Those angles are the listed lx −0.86, +0.71, −0.43.
            Then θ = 10° − 40°·cos(2πt/8000ms), t measured from the same
            clock, so the join is −30° with velocity 0. Light y stays 0.45.
   ENTER    Hidden until the font is ready and the card has been measured,
            and until one frame has been drawn. Card opacity 160ms linear.
            Rings draw 900ms, cubic-bezier(0.22, 1, 0.36, 1), stagger 40ms
            from the inner ring. Type fades 300ms and rises 4px only after
            the outer ring finishes (35·40+900 = 2300ms).
   REDUCED  Rest pose, 200ms fade, no stroke draw, no drift.
   ================================================================= */

export const P = {
  rings: 36,
  segments: 720,
  buckets: 24,
  aspect: 1.586,
  restUv: [0.35, 0.40],
  thetaScale: 70,
  kRest: 8,
  kPress: 24,
  lightK: 170,
  lightC: 22,
  lightM: 1,
  pressK: 280,
  pressC: 28,
  pressM: 1,
  swiftLight: [0.48, 0.84],
  swiftPress: [0.32, 0.82],
  sigma: 0.35,
  guideMs: [760, 640],
  guideTheta: [-60, 50, -30],
  driftBias: 10,
  driftAmp: 40,
  driftPeriod: 8000,
  driftY: 0.45,
  easeGuide: [0.65, 0, 0.35, 1],
  easeDraw: [0.22, 1, 0.36, 1],
  cardFade: 160,
  reducedFade: 200,
  drawMs: 900,
  stagger: 40,
  typeMs: 300,
  typeRise: 4,
  moveEps: 0.002,
  dprCap: 2,
  centerX: 0.68,
  ringA: 0.10,
  ringB: 0.012,
  lobe: 12,
  lobeAmp: 0.035,
  lobePhase: 0.18,
  ellipseX: 1.35
};

export function bez(x1, y1, x2, y2) {
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
      let a = 0, b = 1;
      t = x;
      for (let i = 0; i < 30; i++) {
        const v = X(t);
        if (v < x) a = t;
        else b = t;
        t = (a + b) / 2;
      }
    }
    return Y(Math.min(1, Math.max(0, t)));
  };
}

export const easeGuide = bez(...P.easeGuide);
export const easeDraw = bez(...P.easeDraw);

export function spring(pos, vel, target, dt, k, c, m) {
  if (!(dt > 0)) return [pos, vel];
  const n = Math.max(1, Math.round(dt * 240));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    vel += ((-k * (pos - target) - c * vel) / m) * h;
    pos += vel * h;
  }
  return [pos, vel];
}

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

/** θ in degrees from one clock. Guide legs and the drift are the same function. */
export function thetaAt(elapsed) {
  const el = elapsed > 0 ? elapsed : 0;
  const a = P.guideMs[0];
  const end = a + P.guideMs[1];
  const [t0, t1, t2] = P.guideTheta;
  if (el < a) return t0 + (t1 - t0) * easeGuide(el / a);
  if (el < end) return t1 + (t2 - t1) * easeGuide((el - a) / P.guideMs[1]);
  const w = ((el - end) / P.driftPeriod) * Math.PI * 2;
  return P.driftBias - P.driftAmp * Math.cos(w);
}

export function lxFromUv(u) {
  return u * 2 - 1;
}

export function uvFromLx(lx) {
  return (lx + 1) * 0.5;
}

export function colorOf(b) {
  const t = clamp(b, 0, 1);
  let r = 0x2a + (0xe8 - 0x2a) * t;
  let g = 0x2a + (0xe6 - 0x2a) * t;
  let bl = 0x2a + (0xe1 - 0x2a) * t;
  if (t > 0.9) {
    const u = (t - 0.9) / 0.1;
    r += (0xff - r) * u;
    g += (0xb5 - g) * u;
    bl += (0x47 - bl) * u;
  }
  return [r, g, bl];
}

export function bucketIndex(b, n) {
  if (b >= 1) return n - 1;
  if (b <= 0) return 0;
  return Math.min(n - 1, Math.floor(b * n));
}

export function bucketValue(i, n) {
  if (i >= n - 1) return 1;
  return (i + 0.5) / n;
}

export function ringPoint(i, t, W, H) {
  const cx = P.centerX * W;
  const cy = 0.5 * H;
  const base = H * (P.ringA + P.ringB * i);
  const rad = base + P.lobeAmp * H * Math.sin(P.lobe * t + P.lobePhase * i);
  return [cx + rad * P.ellipseX * Math.cos(t), cy + rad * Math.sin(t)];
}

export function segmentDistance(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const ab2 = abx * abx + aby * aby;
  let u = ab2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / ab2 : 0;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const dx = ax + abx * u - px;
  const dy = ay + aby * u - py;
  return Math.hypot(dx, dy);
}

let styleEl = null;
let alive = 0;

function grainHref() {
  try {
    return new URL('./grain.png', import.meta.url).href;
  } catch {
    return 'grain.png';
  }
}

function ensureStyle() {
  if (styleEl && styleEl.isConnected) return;
  const style = document.createElement('style');
  styleEl = style;
  const grain = grainHref();
  style.textContent = `
.g-stage{position:absolute;inset:0;display:grid;place-items:center;background:#0B0B0C;visibility:hidden;overflow:hidden;
  user-select:none;-webkit-user-select:none;overscroll-behavior:none}
.g-stage.on{visibility:visible}
.g-card{position:relative;width:min(640px,86vw);aspect-ratio:1.586;background:#121214;border:1px solid rgba(255,255,255,.06);
  border-radius:20px;box-sizing:border-box;overflow:hidden;opacity:0}
.g-card canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.g-grain{position:absolute;inset:0;pointer-events:none;opacity:.03;background:url("${grain}") repeat;background-size:128px 128px}
.g-brand,.g-title,.g-num{margin:0;opacity:0;font-family:"Inter Var",Inter,ui-sans-serif,system-ui,sans-serif;
  -webkit-font-smoothing:antialiased}
.g-brand{position:absolute;top:26px;left:28px;font-size:11px;font-weight:600;letter-spacing:.12em;line-height:1;color:#8A8A8A}
.g-foot{position:absolute;left:28px;right:28px;bottom:24px;display:flex;align-items:baseline;justify-content:space-between;pointer-events:none}
.g-title{font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1;color:#E8E6E1}
.g-num{font-size:13px;font-weight:500;line-height:1;color:#8A8A8A;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
@media (prefers-reduced-motion:reduce){
  .g-brand,.g-title,.g-num{transform:none}
}`;
  document.head.appendChild(style);
}

function buildRings(W, H, segments) {
  const rings = new Array(P.rings);
  for (let i = 0; i < P.rings; i++) {
    const pts = new Float64Array((segments + 1) * 2);
    for (let s = 0; s <= segments; s++) {
      const t = (s / segments) * Math.PI * 2;
      const p = ringPoint(i, t, W, H);
      pts[s * 2] = p[0];
      pts[s * 2 + 1] = p[1];
    }
    rings[i] = pts;
  }
  return rings;
}

function lightBuckets(rings, W, H, lx, ly, k, segments, buckets) {
  const theta = lx * P.thetaScale * Math.PI / 180;
  const lightX = uvFromLx(lx) * W;
  const lightY = ly * H;
  const sigma = P.sigma * W;
  const ids = new Array(P.rings);
  for (let i = 0; i < P.rings; i++) {
    const pts = rings[i];
    const row = new Uint8Array(segments);
    for (let s = 0; s < segments; s++) {
      const ax = pts[s * 2], ay = pts[s * 2 + 1];
      const bx = pts[(s + 1) * 2], by = pts[(s + 1) * 2 + 1];
      const phi = Math.atan2(by - ay, bx - ax);
      const d = segmentDistance(lightX, lightY, ax, ay, bx, by);
      const align = Math.abs(Math.cos(phi - theta)) ** k;
      const fall = 0.35 + 0.65 * Math.exp(-(d * d) / (2 * sigma * sigma));
      row[s] = bucketIndex(align * fall, buckets);
    }
    ids[i] = row;
  }
  return ids;
}

/**
 * Mount one card inside root. The host supplies a box with a height.
 * Returns a handle; call destroy() on unmount.
 */
export function mountGuilloche(root) {
  if (!root) throw new Error('mountGuilloche needs a host');
  ensureStyle();
  alive += 1;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';

  const stage = document.createElement('main');
  stage.className = 'g-stage';
  stage.setAttribute('aria-label', 'Guilloché. Engraved lines that catch the light.');
  const card = document.createElement('article');
  card.className = 'g-card';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const grain = document.createElement('div');
  grain.className = 'g-grain';
  grain.setAttribute('aria-hidden', 'true');
  const brand = document.createElement('p');
  brand.className = 'g-brand';
  brand.textContent = 'LUMEN';
  const foot = document.createElement('div');
  foot.className = 'g-foot';
  const title = document.createElement('h1');
  title.className = 'g-title';
  title.textContent = 'Guilloché';
  const num = document.createElement('p');
  num.className = 'g-num';
  num.textContent = 'Nº 008';
  foot.append(title, num);
  card.append(canvas, grain, brand, foot);
  stage.append(card);
  root.append(stage);

  const boot = {
    stageHidden: getComputedStyle(stage).visibility,
    fontWait: true
  };
  stage.dataset.ready = '0';
  stage.dataset.phase = 'rest';

  const ctx = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fineMq = matchMedia('(hover: hover) and (pointer: fine)');
  const ac = new AbortController();
  const signal = ac.signal;

  let reduced = reduceMq.matches;
  let fine = !reduced && fineMq.matches;
  let phase = fine || reduced ? 'rest' : 'guide';
  let lx = lxFromUv(P.restUv[0]);
  let ly = P.restUv[1];
  let vx = 0, vy = 0;
  let targetLx = lx, targetLy = ly;
  let k = P.kRest, kv = 0;
  let pressing = false;
  let t0 = 0, last = 0, ready = false, raf = 0, dead = false;
  let dpr = 1, W = 1, H = 1;
  let rings = null;
  let buckets = null;
  let litLx = NaN, litLy = NaN, litK = NaN;
  const trace = [];
  const segments = P.segments;
  const bucketCount = P.buckets;
  const typeNodes = [brand, title, num];

  function restPose() {
    lx = lxFromUv(P.restUv[0]);
    ly = P.restUv[1];
    vx = 0; vy = 0;
    targetLx = lx; targetLy = ly;
    phase = 'rest';
  }

  function arm(now) {
    t0 = now;
    last = 0;
    k = P.kRest;
    kv = 0;
    if (reduced) {
      fine = false;
      restPose();
      return;
    }
    fine = fineMq.matches;
    if (fine) restPose();
    else {
      phase = 'guide';
      lx = thetaAt(0) / P.thetaScale;
      ly = P.driftY;
      vx = 0; vy = 0;
      targetLx = lx; targetLy = ly;
    }
  }

  function revealOf(i, elapsed) {
    if (reduced) return 1;
    const u = clamp((elapsed - i * P.stagger) / P.drawMs, 0, 1);
    return easeDraw(u);
  }

  function chrome(elapsed) {
    const fadeMs = reduced ? P.reducedFade : P.cardFade;
    const fade = clamp(elapsed / fadeMs, 0, 1);
    let type = fade;
    let rise = 0;
    if (!reduced) {
      const start = (P.rings - 1) * P.stagger + P.drawMs;
      type = clamp((elapsed - start) / P.typeMs, 0, 1);
      rise = P.typeRise * (1 - type);
    }
    return { fade, type, rise };
  }

  function resize() {
    const cssW = Math.max(1, canvas.clientWidth || card.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight || card.clientHeight);
    dpr = Math.min(window.devicePixelRatio || 1, P.dprCap);
    const bw = Math.max(1, Math.round(cssW * dpr));
    const bh = Math.max(1, Math.round(cssH * dpr));
    if (Math.abs(cssW - W) > 0.5 || Math.abs(cssH - H) > 0.5 || !rings) {
      W = cssW;
      H = cssH;
      rings = buildRings(W, H, segments);
      buckets = null;
      litLx = NaN;
    }
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function ensureBuckets() {
    const moved = Math.hypot(uvFromLx(lx) - uvFromLx(litLx), ly - litLy);
    if (buckets && moved <= P.moveEps && Math.abs(k - litK) <= P.moveEps) return false;
    buckets = lightBuckets(rings, W, H, lx, ly, k, segments, bucketCount);
    litLx = lx;
    litLy = ly;
    litK = k;
    return true;
  }

  function draw(elapsed) {
    if (!ctx || !rings) return;
    ensureBuckets();
    const bw = canvas.width, bh = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bw, bh);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 20);
    ctx.clip();
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const paths = new Array(bucketCount);
    for (let i = 0; i < bucketCount; i++) paths[i] = new Path2D();
    const snap = (v) => Math.round(v * dpr) / dpr;
    for (let i = 0; i < P.rings; i++) {
      const n = revealOf(i, elapsed) * segments;
      if (n <= 0) continue;
      const pts = rings[i];
      const row = buckets[i];
      let run = -1;
      const limit = Math.min(segments, n);
      const whole = Math.floor(limit);
      const frac = limit - whole;
      const put = (s, x1, y1) => {
        const b = row[s];
        const x0 = snap(pts[s * 2]);
        const y0 = snap(pts[s * 2 + 1]);
        if (b !== run) {
          paths[b].moveTo(x0, y0);
          run = b;
        }
        paths[b].lineTo(snap(x1), snap(y1));
      };
      for (let s = 0; s < whole; s++) put(s, pts[(s + 1) * 2], pts[(s + 1) * 2 + 1]);
      if (frac > 0 && whole < segments) {
        const s = whole;
        const ax = pts[s * 2], ay = pts[s * 2 + 1];
        const bx = pts[(s + 1) * 2], by = pts[(s + 1) * 2 + 1];
        put(s, ax + (bx - ax) * frac, ay + (by - ay) * frac);
      }
    }
    for (let i = 0; i < bucketCount; i++) {
      const [r, g, b] = colorOf(bucketValue(i, bucketCount));
      ctx.strokeStyle = `rgb(${r.toFixed(3)},${g.toFixed(3)},${b.toFixed(3)})`;
      ctx.stroke(paths[i]);
    }
    ctx.restore();
  }

  function publish(elapsed, view) {
    const theta = lx * P.thetaScale;
    stage.dataset.phase = phase;
    stage.dataset.lx = lx.toFixed(5);
    stage.dataset.ly = ly.toFixed(5);
    stage.dataset.theta = theta.toFixed(4);
    stage.dataset.k = k.toFixed(4);
    stage.dataset.fade = view.fade.toFixed(4);
    stage.dataset.type = view.type.toFixed(4);
    stage.dataset.rise = view.rise.toFixed(3);
    stage.dataset.r0 = revealOf(0, elapsed).toFixed(4);
    stage.dataset.r1 = revealOf(1, elapsed).toFixed(4);
    stage.dataset.r35 = revealOf(35, elapsed).toFixed(4);
    stage.dataset.ready = ready ? '1' : '0';
    stage.dataset.reduced = reduced ? '1' : '0';
    stage.dataset.fine = fine ? '1' : '0';
    stage.dataset.elapsed = elapsed.toFixed(2);
    stage.dataset.dpr = String(dpr);
    stage.dataset.pressing = pressing ? '1' : '0';
    card.style.opacity = String(view.fade);
    const shift = reduced ? 'none' : `translateY(${view.rise.toFixed(3)}px)`;
    brand.style.transform = shift;
    foot.style.transform = shift;
    for (const node of typeNodes) node.style.opacity = String(view.type);
    trace.push({
      t: elapsed, lx, ly, theta, k, phase,
      fade: view.fade, type: view.type, rise: view.rise,
      r0: revealOf(0, elapsed), r35: revealOf(35, elapsed)
    });
    if (trace.length > 2400) trace.splice(0, trace.length - 2400);
  }

  function step(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const elapsed = now - t0;
    if (reduced) {
      restPose();
      k = pressing ? P.kPress : P.kRest;
      kv = 0;
      return elapsed < P.reducedFade + 40;
    }
    const kTarget = pressing ? P.kPress : P.kRest;
    [k, kv] = spring(k, kv, kTarget, dt, P.pressK, P.pressC, P.pressM);
    if (phase === 'guide' || phase === 'drift') {
      const prev = lx;
      const theta = thetaAt(elapsed);
      lx = theta / P.thetaScale;
      ly = P.driftY;
      vx = dt > 0 ? (lx - prev) / dt : 0;
      vy = 0;
      phase = elapsed >= P.guideMs[0] + P.guideMs[1] ? 'drift' : 'guide';
      return true;
    }
    [lx, vx] = spring(lx, vx, targetLx, dt, P.lightK, P.lightC, P.lightM);
    [ly, vy] = spring(ly, vy, targetLy, dt, P.lightK, P.lightC, P.lightM);
    const typeEnd = (P.rings - 1) * P.stagger + P.drawMs + P.typeMs;
    const moving = Math.abs(lx - targetLx) > 1e-4 || Math.abs(ly - targetLy) > 1e-4
      || Math.abs(vx) > 1e-4 || Math.abs(vy) > 1e-4
      || Math.abs(k - kTarget) > 1e-3 || Math.abs(kv) > 1e-3;
    return moving || elapsed < typeEnd + 40;
  }

  function frame() {
    raf = 0;
    if (dead || document.hidden) return;
    const now = performance.now();
    const more = step(now);
    const elapsed = now - t0;
    resize();
    draw(elapsed);
    publish(elapsed, chrome(elapsed));
    if (more) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!ready || dead || document.hidden) return;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function mapEvent(e) {
    const rect = card.getBoundingClientRect();
    const u = clamp((e.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    const v = clamp((e.clientY - rect.top) / Math.max(1, rect.height), 0, 1);
    return [lxFromUv(u), v];
  }

  function fineEvent(e) {
    return e.pointerType === 'mouse' || e.pointerType === 'pen';
  }

  function follow(e) {
    const [x, y] = mapEvent(e);
    targetLx = x;
    targetLy = y;
    phase = 'follow';
    fine = true;
    kick();
  }

  function onMove(e) {
    if (reduced || !fineEvent(e)) return;
    follow(e);
  }

  function onDown(e) {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    pressing = true;
    if (!reduced && fineEvent(e)) follow(e);
    else kick();
  }

  function onUp() {
    if (!pressing) return;
    pressing = false;
    kick();
  }

  stage.addEventListener('pointermove', onMove, { signal });
  stage.addEventListener('pointerdown', onDown, { signal });
  window.addEventListener('pointerup', onUp, { signal });
  window.addEventListener('pointercancel', onUp, { signal });
  window.addEventListener('resize', () => { if (ready) { resize(); draw(performance.now() - t0); kick(); } }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ready) { last = 0; kick(); }
  }, { signal });
  reduceMq.addEventListener('change', () => {
    reduced = reduceMq.matches;
    if (!ready) return;
    arm(performance.now());
    kick();
  }, { signal });
  fineMq.addEventListener('change', () => {
    if (reduced || !ready) return;
    const next = fineMq.matches;
    if (next === fine && phase !== 'guide' && phase !== 'drift') return;
    fine = next;
    if (fine) {
      phase = 'rest';
      targetLx = lxFromUv(P.restUv[0]);
      targetLy = P.restUv[1];
    } else if (phase === 'rest' || phase === 'follow') {
      phase = 'guide';
      t0 = performance.now();
      last = 0;
    }
    kick();
  }, { signal });

  const ro = new ResizeObserver(() => {
    if (!ready) return;
    resize();
    draw(Math.max(0, performance.now() - t0));
  });
  ro.observe(card);

  function shown() {
    if (dead) return;
    resize();
    if (card.getBoundingClientRect().width < 2) {
      requestAnimationFrame(shown);
      return;
    }
    arm(performance.now());
    draw(0);
    requestAnimationFrame(() => {
      if (dead) return;
      const now = performance.now();
      arm(now);
      ready = true;
      stage.dataset.ready = '1';
      publish(0, chrome(0));
      stage.classList.add('on');
      kick();
    });
  }

  const fonts = document.fonts && document.fonts.load
    ? Promise.all([
        document.fonts.load("600 11px 'Inter Var'"),
        document.fonts.load("500 28px 'Inter Var'"),
        document.fonts.load("500 13px 'Inter Var'")
      ]).then(() => document.fonts.ready)
    : Promise.resolve();
  fonts.then(() => { boot.fontWait = false; shown(); }, () => { boot.fontWait = false; shown(); });

  function state() {
    const elapsed = ready ? performance.now() - t0 : 0;
    const view = chrome(elapsed);
    return {
      phase, lx, ly, vx, vy, k, kv, pressing, fine, reduced, ready, elapsed,
      theta: lx * P.thetaScale,
      fade: view.fade, type: view.type, rise: view.rise,
      r0: revealOf(0, elapsed), r1: revealOf(1, elapsed), r35: revealOf(35, elapsed),
      dpr, W, H, segments, buckets: bucketCount,
      lineWidth: 1,
      targetLx, targetLy,
      cardW: card.getBoundingClientRect().width,
      cardH: card.getBoundingClientRect().height
    };
  }

  function sample(cssX, cssY) {
    const x = clamp(Math.round(cssX * dpr), 0, canvas.width - 1);
    const y = clamp(Math.round(cssY * dpr), 0, canvas.height - 1);
    const px = ctx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
  }

  function segment(i, s) {
    if (!rings) return null;
    const pts = rings[i];
    const ax = pts[s * 2], ay = pts[s * 2 + 1];
    const bx = pts[(s + 1) * 2], by = pts[(s + 1) * 2 + 1];
    const theta = lx * P.thetaScale * Math.PI / 180;
    const phi = Math.atan2(by - ay, bx - ax);
    const lightX = uvFromLx(lx) * W;
    const lightY = ly * H;
    const d = segmentDistance(lightX, lightY, ax, ay, bx, by);
    const sigma = P.sigma * W;
    const align = Math.abs(Math.cos(phi - theta)) ** k;
    const fall = 0.35 + 0.65 * Math.exp(-(d * d) / (2 * sigma * sigma));
    const b = align * fall;
    return {
      x: (ax + bx) / 2, y: (ay + by) / 2, b, phi, d,
      bucket: bucketIndex(b, bucketCount),
      color: colorOf(bucketValue(bucketIndex(b, bucketCount), bucketCount))
    };
  }

  function destroy() {
    if (dead) return;
    dead = true;
    ready = false;
    cancelAnimationFrame(raf);
    ac.abort();
    ro.disconnect();
    stage.remove();
    alive -= 1;
    if (alive <= 0) {
      alive = 0;
      if (styleEl) { styleEl.remove(); styleEl = null; }
    }
  }

  return {
    destroy, state, sample, segment, trace, boot, stage, card, canvas,
    thetaAt, colorOf, easeDraw, easeGuide, P
  };
}

export function mounts() {
  return alive;
}
