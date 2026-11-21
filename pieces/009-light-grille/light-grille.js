/* Light Grille — Lumen 009
   Same numbers on the web page, React, and Vue. SwiftUI and Compose
   notes live in their README files (source not in this folder).

   CARD     360×480, aspect 3/4, width min(360px, 86vw). Face #121214,
            1px line rgba(255,255,255,.06), radius 20. Page #0B0B0C.
            Grain tile 128px at 3%. Type is Geist, one weight (600).
   TYPE     Top left LUMEN 12 / 0.08em / #55545D.
            Top right Nº 009 12 / 0.04em / #55545D.
            Bottom left Light Grille 22 / -0.03em / #E8E6E1.
   GRID     240×240, centred. 12×12 cells of 20. Each slit 2×14, radius 1.
            Base fill is rgba(255,255,255,.04) on the face.
            Secondary leak is rgba(232,230,225,.16) over #55545D.
   HOVER    Height 14 → 18 with distance. offsetX = clamp(-4, dx*0.05, 4),
            dx = focusX − slitX. One nearest slit is #FFB547.
            Others fall with d^-1.5 toward the leak, then #55545D, then base.
            Spring stiffness 240, damping 22, mass 1.
            CSS 320ms cubic-bezier(0.16,1,0.3,1).
            SwiftUI response 0.34, dampingFraction 0.78.
   PRESS    Card scale 0.98. Slits go to 16×2 and gather on the horizontal
            mid-line, forming one band. Midpoint #FFB547, sides fade to
            rgba(255,181,71,.15). Spring 380 / 26.
            CSS 180ms cubic-bezier(0.05,0.7,0.1,1).
            SwiftUI response 0.22, dampingFraction 0.65.
   GUIDE    From (−60, 40) along a reverse arc into (60, −40) in 480ms.
            Opacity 0→1 in the first 160ms, cubic-bezier(0,0,0.2,1).
            Then pos(t) = (60 cos(2πt/8000), −40 cos(2πt/8000)), t from
            the end of the guide. Velocity is 0 at 0s / 4s / 8s.
            The pointer leaving returns to this path.
   REDUCED  No guide, no drift, no press scale, no offset. Focus stays at
            the origin. The nearest centre slit holds #FFB547, still.
   ================================================================= */

export const P = {
  cardW: 360,
  cardH: 480,
  radius: 20,
  grid: 240,
  cols: 12,
  rows: 12,
  cell: 20,
  slitW: 2,
  slitH: 14,
  slitR: 1,
  hMax: 18,
  offsetMax: 4,
  offsetK: 0.05,
  pressW: 16,
  pressH: 2,
  pressScale: 0.98,
  amber: [255, 181, 71],
  gray: [85, 84, 93],
  face: [18, 18, 20],
  ink: [232, 230, 225],
  followK: 240,
  followC: 22,
  followM: 1,
  pressK: 380,
  pressC: 26,
  pressM: 1,
  swiftFollow: [0.34, 0.78],
  swiftPress: [0.22, 0.65],
  guideMs: 480,
  fadeMs: 160,
  reducedFade: 200,
  driftPeriod: 8000,
  driftX: 60,
  driftY: -40,
  easeFade: [0, 0, 0.2, 1],
  easeGuide: [0.16, 1, 0.3, 1],
  dprCap: 2,
  joinEps: 0.35
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

export const easeFade = bez(...P.easeFade);
export const easeGuide = bez(...P.easeGuide);

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

export function mix(a, b, t) {
  const u = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u
  ];
}

export function over(bg, fg, a) {
  return [
    bg[0] + (fg[0] - bg[0]) * a,
    bg[1] + (fg[1] - bg[1]) * a,
    bg[2] + (fg[2] - bg[2]) * a
  ];
}

export const COL = {
  base: over(P.face, [255, 255, 255], 0.04),
  gray: P.gray,
  leak: over(P.gray, P.ink, 0.16),
  amber: P.amber,
  pressSide: over(P.face, P.amber, 0.15)
};

/** Cell centres in grid space, origin at the grid centre, y down. */
export function cellCenter(col, row) {
  return [
    (col + 0.5) * P.cell - P.grid / 2,
    (row + 0.5) * P.cell - P.grid / 2
  ];
}

/**
 * Reverse arc from the lower-left end (−60, 40) into the upper-right
 * drift start (60, −40). The bow sits off the diagonal so the path is
 * not the later drift line. u is 0..1 after easing.
 */
export function guidePos(u) {
  const t = clamp(u, 0, 1);
  const p0x = -P.driftX, p0y = -P.driftY;
  const p3x = P.driftX, p3y = P.driftY;
  const cx = p3x - p0x, cy = p3y - p0y;
  const len = Math.hypot(cx, cy) || 1;
  // Bow toward the upper left. End handle stays on the chord so the
  // arrival heads up-right, opposite the drift as it leaves (60, −40).
  const bx = (cy / len) * 48;
  const by = (-cx / len) * 48;
  const p1x = p0x + cx * 0.32 + bx;
  const p1y = p0y + cy * 0.32 + by;
  const p2x = p3x - cx * 0.35;
  const p2y = p3y - cy * 0.35;
  const omt = 1 - t;
  const x = omt*omt*omt*p0x + 3*omt*omt*t*p1x + 3*omt*t*t*p2x + t*t*t*p3x;
  const y = omt*omt*omt*p0y + 3*omt*omt*t*p1y + 3*omt*t*t*p2y + t*t*t*p3y;
  return [x, y];
}

/** Shared clock: guide, then cosine drift. t = 0 at the start of the guide. */
export function scheduledPos(elapsed) {
  const el = elapsed > 0 ? elapsed : 0;
  if (el < P.guideMs) return guidePos(easeGuide(el / P.guideMs));
  const w = ((el - P.guideMs) / P.driftPeriod) * Math.PI * 2;
  const c = Math.cos(w);
  return [P.driftX * c, P.driftY * c];
}

export function leakColor(d) {
  const raw = Math.pow(Math.max(d, 1), -1.5);
  const ref = Math.pow(P.cell, -1.5);
  const t = clamp(raw / ref, 0, 1);
  if (t >= 0.45) return mix(COL.gray, COL.leak, (t - 0.45) / 0.55);
  return mix(COL.base, COL.gray, t / 0.45);
}

export function pressColor(x, peakX) {
  const span = P.grid / 2;
  const u = clamp(Math.abs(x - peakX) / span, 0, 1);
  return mix(COL.amber, COL.pressSide, u);
}

export function rgbCss(c) {
  return `rgb(${c[0].toFixed(3)},${c[1].toFixed(3)},${c[2].toFixed(3)})`;
}

export function nearAmber(c, tol = 8) {
  return Math.abs(c[0] - 255) <= tol && Math.abs(c[1] - 181) <= tol && Math.abs(c[2] - 71) <= tol;
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
.lg-stage{position:absolute;inset:0;display:grid;place-items:center;background:#0B0B0C;visibility:hidden;overflow:hidden;
  user-select:none;-webkit-user-select:none;overscroll-behavior:none;touch-action:none}
.lg-stage.on{visibility:visible}
.lg-card{position:relative;width:min(360px,86vw);aspect-ratio:3/4;background:#121214;border:1px solid rgba(255,255,255,.06);
  border-radius:20px;box-sizing:border-box;overflow:hidden;opacity:0}
.lg-card canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.lg-grain{position:absolute;inset:0;pointer-events:none;opacity:.03;background:url("${grain}") repeat;background-size:128px 128px}
.lg-brand,.lg-title,.lg-num{margin:0;font-family:Geist,ui-sans-serif,system-ui,sans-serif;font-weight:600;
  -webkit-font-smoothing:antialiased;line-height:1;pointer-events:none}
.lg-brand{position:absolute;top:calc(24px * var(--s,1));left:calc(24px * var(--s,1));font-size:calc(12px * var(--s,1));
  letter-spacing:.08em;color:#55545D}
.lg-num{position:absolute;top:calc(24px * var(--s,1));right:calc(24px * var(--s,1));font-size:calc(12px * var(--s,1));
  letter-spacing:.04em;color:#55545D;font-variant-numeric:tabular-nums;font-feature-settings:"tnum" 1}
.lg-title{position:absolute;left:calc(24px * var(--s,1));bottom:calc(24px * var(--s,1));font-size:calc(22px * var(--s,1));
  letter-spacing:-0.03em;color:#E8E6E1;white-space:nowrap}
@media (prefers-reduced-motion:reduce){
  .lg-card{transform:none}
}`;
  document.head.appendChild(style);
}

/**
 * Mount one card inside root. The host supplies a box with a height.
 * Returns a handle; call destroy() on unmount.
 */
export function mountLightGrille(root) {
  if (!root) throw new Error('mountLightGrille needs a host');
  ensureStyle();
  alive += 1;
  if (getComputedStyle(root).position === 'static') root.style.position = 'relative';

  const stage = document.createElement('main');
  stage.className = 'lg-stage';
  stage.setAttribute('aria-label', 'Light Grille. Light leaks through dynamic physical aperture grids.');
  const card = document.createElement('article');
  card.className = 'lg-card';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const grain = document.createElement('div');
  grain.className = 'lg-grain';
  grain.setAttribute('aria-hidden', 'true');
  const brand = document.createElement('p');
  brand.className = 'lg-brand';
  brand.textContent = 'LUMEN';
  const num = document.createElement('p');
  num.className = 'lg-num';
  num.textContent = 'Nº 009';
  const title = document.createElement('h1');
  title.className = 'lg-title';
  title.textContent = 'Light Grille';
  card.append(canvas, grain, brand, num, title);
  stage.append(card);
  root.append(stage);

  const boot = {
    stageHidden: getComputedStyle(stage).visibility,
    fontWait: true
  };
  stage.dataset.ready = '0';
  stage.dataset.phase = 'guide';

  const ctx = canvas.getContext('2d', { alpha: false });
  const reduceMq = matchMedia('(prefers-reduced-motion: reduce)');
  const ac = new AbortController();
  const signal = ac.signal;

  let reduced = reduceMq.matches;
  let phase = reduced ? 'rest' : 'guide';
  let fx = 0, fy = 0, vx = 0, vy = 0;
  let targetX = 0, targetY = 0;
  let press = 0, pv = 0, pressing = false;
  let scale = 1, sv = 0;
  let t0 = 0, last = 0, ready = false, raf = 0, dead = false;
  let returning = false;
  let dpr = 1, W = 1, H = 1, unit = 1;
  let amberIndex = -1;
  let amberCount = 0;
  const trace = [];
  const slits = new Array(P.cols * P.rows);

  function arm(now) {
    t0 = now;
    last = 0;
    press = 0; pv = 0;
    scale = 1; sv = 0;
    returning = false;
    if (reduced) {
      fx = 0; fy = 0; vx = 0; vy = 0;
      targetX = 0; targetY = 0;
      phase = 'rest';
      return;
    }
    const p = scheduledPos(0);
    fx = p[0]; fy = p[1];
    vx = 0; vy = 0;
    targetX = fx; targetY = fy;
    phase = 'guide';
  }

  function mapEvent(e) {
    const rect = card.getBoundingClientRect();
    const s = Math.max(1e-6, rect.width / P.cardW);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    return [(e.clientX - cx) / s, (e.clientY - cy) / s];
  }

  function fineEvent(e) {
    return e.pointerType === 'mouse' || e.pointerType === 'pen';
  }

  function resize() {
    const rect = card.getBoundingClientRect();
    const next = Math.max(1, Math.min(P.dprCap, window.devicePixelRatio || 1));
    const bw = Math.max(1, Math.round(rect.width * next));
    const bh = Math.max(1, Math.round(rect.height * next));
    dpr = next;
    W = rect.width;
    H = rect.height;
    unit = W / P.cardW;
    card.style.setProperty('--s', String(unit));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
  }

  function pickAmber(peakX, peakY, p) {
    let best = 0, bestD = Infinity, bestTie = Infinity;
    const n = P.cols * P.rows;
    for (let i = 0; i < n; i++) {
      const layout = slitLayout(i, peakX, peakY, p);
      const d = Math.hypot(layout.x - peakX, layout.y - peakY);
      const tie = layout.row * P.cols + layout.col;
      if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && tie < bestTie)) {
        best = i;
        bestD = d;
        bestTie = tie;
      }
    }
    return best;
  }

  function slitLayout(i, peakX, peakY, p) {
    const col = i % P.cols;
    const row = (i - col) / P.cols;
    const [rx, ry] = cellCenter(col, row);
    const dx = peakX - rx;
    const dy = peakY - ry;
    const d = Math.hypot(dx, dy);
    const off = reduced ? 0 : clamp(dx * P.offsetK, -P.offsetMax, P.offsetMax);
    const near = Math.pow(P.cell, 1.5) * Math.pow(Math.max(d, 1), -1.5);
    const grow = 14 + (P.hMax - P.slitH) * clamp(near, 0, 1);
    const x = rx + off * (1 - p);
    const y = ry + (0 - ry) * p;
    const w = P.slitW + (P.pressW - P.slitW) * p;
    const h = grow + (P.pressH - grow) * p;
    return { x, y, w, h, d, dx, dy, col, row };
  }

  function colorOfSlit(i, layout, p, peakX) {
    if (i === amberIndex) return COL.amber.slice();
    const hover = leakColor(layout.d);
    if (p <= 0) return hover;
    // The unique amber slit is the only exact #FFB547. Other slits on the
    // band use the side gradient, nudged off the peak so a strict sample
    // still counts one amber fill.
    const band = pressColor(layout.x, peakX);
    if (nearAmber(band, 8)) {
      return mix(band, COL.pressSide, 0.18);
    }
    return mix(hover, band, p);
  }

  function draw() {
    if (!ctx) return;
    const bw = canvas.width, bh = canvas.height;
    const p = reduced ? 0 : clamp(press, 0, 1);
    const peakX = fx;
    const peakY = fy;
    amberIndex = pickAmber(peakX, peakY, p);
    amberCount = 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#121214';
    ctx.fillRect(0, 0, bw, bh);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const snap = (v) => Math.round(v * dpr) / dpr;
    const ox = W / 2;
    const oy = H / 2;
    const r = Math.max(0.5, P.slitR * unit);

    const n = P.cols * P.rows;
    let glowX = 0, glowY = 0, glowW = 2, glowH = 14;
    for (let i = 0; i < n; i++) {
      const layout = slitLayout(i, peakX, peakY, p);
      const color = colorOfSlit(i, layout, p, peakX);
      if (nearAmber(color, 8)) amberCount += 1;
      const w = Math.max(1 / dpr, layout.w * unit);
      const h = Math.max(1 / dpr, layout.h * unit);
      const x = ox + layout.x * unit;
      const y = oy + layout.y * unit;
      slits[i] = { ...layout, color, cssX: x, cssY: y };
      if (i === amberIndex) {
        glowX = x; glowY = y; glowW = w; glowH = h;
      }
    }

    // Soft core under the single amber slit, below the fills.
    {
      const gx = snap(glowX), gy = snap(glowY);
      const radius = Math.max(glowW, glowH) * 2.2 + 6 * unit;
      const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
      g.addColorStop(0, 'rgba(255,181,71,0.22)');
      g.addColorStop(0.6, 'rgba(255,181,71,0.08)');
      g.addColorStop(1, 'rgba(255,181,71,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = 0; i < n; i++) {
      const s = slits[i];
      const w = Math.max(1 / dpr, s.w * unit);
      const h = Math.max(1 / dpr, s.h * unit);
      const x = snap(ox + s.x * unit - w / 2);
      const y = snap(oy + s.y * unit - h / 2);
      ctx.fillStyle = rgbCss(s.color);
      ctx.beginPath();
      ctx.roundRect(x, y, snap(x + w) - x, snap(y + h) - y, r);
      ctx.fill();
    }
  }

  function fadeOf(elapsed) {
    const ms = reduced ? P.reducedFade : P.fadeMs;
    const u = clamp(elapsed / ms, 0, 1);
    return reduced ? u : easeFade(u);
  }

  function publish(elapsed, fade) {
    if (phase === 'follow') stage.dataset.phase = 'follow';
    else if (reduced) stage.dataset.phase = 'rest';
    else if (elapsed < P.guideMs) stage.dataset.phase = 'guide';
    else stage.dataset.phase = 'drift';
    if (phase === 'follow') stage.dataset.phase = 'follow';
    stage.dataset.fx = fx.toFixed(5);
    stage.dataset.fy = fy.toFixed(5);
    stage.dataset.press = press.toFixed(4);
    stage.dataset.pressing = pressing ? '1' : '0';
    stage.dataset.fade = fade.toFixed(4);
    stage.dataset.ready = ready ? '1' : '0';
    stage.dataset.reduced = reduced ? '1' : '0';
    stage.dataset.elapsed = elapsed.toFixed(2);
    stage.dataset.dpr = String(dpr);
    stage.dataset.amber = String(amberIndex);
    stage.dataset.amberCount = String(amberCount);
    stage.dataset.returning = returning ? '1' : '0';
    card.style.opacity = String(fade);
    if (reduced) card.style.transform = 'none';
    else card.style.transform = `scale(${scale.toFixed(5)})`;
    trace.push({ t: elapsed, fx, fy, press, phase, fade, amberIndex, amberCount });
    if (trace.length > 2400) trace.splice(0, trace.length - 2400);
  }

  function step(now) {
    if (frozen) { last = now; return true; }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const elapsed = now - t0;
    const pTarget = (!reduced && pressing) ? 1 : 0;
    const sTarget = (!reduced && pressing) ? P.pressScale : 1;
    [press, pv] = spring(press, pv, pTarget, dt, P.pressK, P.pressC, P.pressM);
    [scale, sv] = spring(scale, sv, sTarget, dt, P.pressK, P.pressC, P.pressM);

    if (reduced) {
      fx = 0; fy = 0; vx = 0; vy = 0;
      press = 0; pv = 0;
      scale = 1; sv = 0;
      phase = 'rest';
      return elapsed < P.reducedFade + 40;
    }

    if (phase === 'follow') {
      [fx, vx] = spring(fx, vx, targetX, dt, P.followK, P.followC, P.followM);
      [fy, vy] = spring(fy, vy, targetY, dt, P.followK, P.followC, P.followM);
      return true;
    }

    const [tx, ty] = scheduledPos(elapsed);
    targetX = tx;
    targetY = ty;
    phase = elapsed < P.guideMs ? 'guide' : 'drift';
    if (returning) {
      [fx, vx] = spring(fx, vx, tx, dt, P.followK, P.followC, P.followM);
      [fy, vy] = spring(fy, vy, ty, dt, P.followK, P.followC, P.followM);
      if (Math.hypot(fx - tx, fy - ty) < P.joinEps && Math.hypot(vx, vy) < 8) {
        fx = tx; fy = ty; vx = 0; vy = 0;
        returning = false;
      }
    } else {
      fx = tx;
      fy = ty;
      vx = 0;
      vy = 0;
    }
    return true;
  }

  function frame() {
    raf = 0;
    if (dead || document.hidden) return;
    const now = performance.now();
    const more = step(now);
    const elapsed = frozen && frozenElapsed != null ? frozenElapsed : now - t0;
    resize();
    draw();
    publish(elapsed, fadeOf(elapsed));
    if (more) raf = requestAnimationFrame(frame);
  }

  function kick() {
    if (!ready || dead || document.hidden) return;
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function follow(e) {
    if (reduced) return;
    const [x, y] = mapEvent(e);
    targetX = x;
    targetY = y;
    phase = 'follow';
    returning = false;
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
    else if (!reduced && e.pointerType === 'touch') follow(e);
    kick();
  }

  function onUp() {
    if (!pressing) return;
    pressing = false;
    kick();
  }

  function onLeave(e) {
    if (reduced) return;
    if (e && e.pointerType && !fineEvent(e) && e.pointerType !== 'touch') return;
    if (phase !== 'follow') return;
    returning = true;
    phase = 'drift';
    kick();
  }

  card.addEventListener('pointermove', onMove, { signal });
  card.addEventListener('pointerdown', onDown, { signal });
  card.addEventListener('pointerleave', onLeave, { signal });
  window.addEventListener('pointerup', onUp, { signal });
  window.addEventListener('pointercancel', onUp, { signal });
  window.addEventListener('resize', () => { if (ready) { resize(); draw(); kick(); } }, { signal });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ready) { last = 0; kick(); }
  }, { signal });
  reduceMq.addEventListener('change', () => {
    reduced = reduceMq.matches;
    if (!ready) return;
    arm(performance.now());
    kick();
  }, { signal });

  const ro = new ResizeObserver(() => {
    if (!ready) return;
    resize();
    draw();
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
    draw();
    requestAnimationFrame(() => {
      if (dead) return;
      const now = performance.now();
      arm(now);
      ready = true;
      stage.dataset.ready = '1';
      publish(0, fadeOf(0));
      stage.classList.add('on');
      kick();
    });
  }

  const fonts = document.fonts && document.fonts.load
    ? Promise.all([
        document.fonts.load('600 12px Geist'),
        document.fonts.load('600 22px Geist')
      ]).then(() => document.fonts.ready)
    : Promise.resolve();
  fonts.then(() => { boot.fontWait = false; shown(); }, () => { boot.fontWait = false; shown(); });

  function state() {
    const elapsed = !ready ? 0 : (frozen && frozenElapsed != null ? frozenElapsed : performance.now() - t0);
    return {
      phase: stage.dataset.phase, fx, fy, vx, vy, press, pv, pressing,
      scale, reduced, ready, elapsed, fade: fadeOf(elapsed),
      dpr, W, H, unit, amberIndex, amberCount, returning,
      targetX, targetY,
      cardW: card.getBoundingClientRect().width,
      cardH: card.getBoundingClientRect().height,
      scheduled: scheduledPos(elapsed)
    };
  }

  function sample(cssX, cssY) {
    const x = clamp(Math.round(cssX * dpr), 0, canvas.width - 1);
    const y = clamp(Math.round(cssY * dpr), 0, canvas.height - 1);
    const px = ctx.getImageData(x, y, 1, 1).data;
    return [px[0], px[1], px[2], px[3]];
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

  let frozen = false;
  let frozenElapsed = null;

  function force(opts = {}) {
    if (opts.reduced != null) reduced = !!opts.reduced;
    if (opts.freeze != null) frozen = !!opts.freeze;
    if (opts.elapsed != null) {
      t0 = performance.now() - opts.elapsed;
      if (frozen) frozenElapsed = opts.elapsed;
    }
    if (opts.freeze === false) frozenElapsed = null;
    if (opts.pressing != null) pressing = !!opts.pressing;
    if (opts.press != null) { press = opts.press; pv = 0; }
    if (opts.scale != null) { scale = opts.scale; sv = 0; }
    if (opts.focus) {
      fx = opts.focus[0];
      fy = opts.focus[1];
      targetX = fx;
      targetY = fy;
      vx = 0;
      vy = 0;
      returning = false;
      phase = opts.phase || 'follow';
    } else if (opts.useScheduled) {
      const el = opts.elapsed != null ? opts.elapsed : (ready ? performance.now() - t0 : 0);
      const pos = scheduledPos(el);
      fx = pos[0];
      fy = pos[1];
      targetX = fx;
      targetY = fy;
      vx = 0;
      vy = 0;
      returning = false;
      phase = el < P.guideMs ? 'guide' : 'drift';
    } else if (opts.phase) {
      phase = opts.phase;
    }
    if (!ready) return state();
    resize();
    draw();
    const elapsed = performance.now() - t0;
    publish(elapsed, fadeOf(elapsed));
    return state();
  }

  return {
    destroy, state, sample, force, boot, stage, card, canvas, slits,
    scheduledPos, leakColor, guidePos, P, trace
  };
}

export function mounts() {
  return alive;
}
