import { useEffect, useId, useRef } from 'react';

/* Mount: React 18, default export. Render <RimTrace /> in any box.
   Each copy owns its SVG ids and animation. Motion matches the web piece. */

const TOUR_MS = 8000, INTRO_HALF_MS = 4000, BACK_MS = 420, PRESS_MS = 300, RELEASE_MS = 280;
const SEG = 0.12, SEG_PRESS = 0.28, MAGNET_PAD = 48, RADIUS = 20, STROKE = 1.5, INSET = STROKE / 2;
const SPRING_M = { k: 180, d: 22, m: 1 };
const AMBER = '#FFB547', PEAK = 0.95, PEAK_PRESS = 1;

function bez(x1, y1, x2, y2) {
  const A = (a, b) => 1 - 3 * b + 3 * a, B = (a, b) => 3 * b - 6 * a, C = (a) => 3 * a;
  const calc = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const s = slope(t, x1, x2); if (Math.abs(s) < 1e-6) break;
      t -= (calc(t, x1, x2) - x) / s;
    }
    return calc(Math.min(1, Math.max(0, t)), y1, y2);
  };
}
const easeSoft = bez(0.65, 0, 0.35, 1), easeOut = bez(0.16, 1, 0.3, 1);
function roundedRectPath(w, h, r, inset) {
  const x = inset, y = inset, ww = w - inset * 2, hh = h - inset * 2;
  const rr = Math.max(0, Math.min(r - inset, ww / 2, hh / 2));
  const midX = x + ww / 2;
  return [`M ${midX} ${y}`, `L ${x + ww - rr} ${y}`, `A ${rr} ${rr} 0 0 1 ${x + ww} ${y + rr}`, `L ${x + ww} ${y + hh - rr}`, `A ${rr} ${rr} 0 0 1 ${x + ww - rr} ${y + hh}`, `L ${x + rr} ${y + hh}`, `A ${rr} ${rr} 0 0 1 ${x} ${y + hh - rr}`, `L ${x} ${y + rr}`, `A ${rr} ${rr} 0 0 1 ${x + rr} ${y}`, `L ${midX} ${y}`].join(' ');
}
const shortest = (from, to) => { let d = ((to - from) % 1 + 1) % 1; if (d > 0.5) d -= 1; return d; };

export default function RimTrace() {
  const uid = useId().replace(/:/g, '');
  const card = useRef(null);
  const svg = useRef(null);
  const glow = useRef(null);
  const fadeA = useRef(null);
  const fadeB = useRef(null);
  const core = useRef(null);
  useEffect(() => {
    const el = card.current;
    const paths = [glow.current, fadeA.current, fadeB.current, core.current];
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    let perimeter = 1, samples = [], progress = 0, segLen = SEG, peak = PEAK;
    let mode = reduced ? 'static' : 'intro', pressed = false, pressUntil = 0;
    let springOn = false, sp = 0, sv = 0, starget = 0;
    let animActive = false, animFrom = 0, animTo = 0, animT0 = 0, animDur = 0;
    let tourEpoch = performance.now(), introDone = false, tourBase = 0, useTourBase = false;
    let pointerIn = false, px = 0, py = 0, alive = true, raf = 0, last = performance.now();
    let liftFrom = 0, liftTo = 0, liftT0 = 0, liftDur = 1, liftAnim = false;
    function layout() {
      const r = el.getBoundingClientRect();
      const w = Math.max(40, r.width), h = Math.max(40, r.height);
      const d = roundedRectPath(w, h, RADIUS, INSET);
      svg.current.setAttribute('viewBox', `0 0 ${w} ${h}`);
      paths.forEach((p) => p.setAttribute('d', d));
      perimeter = core.current.getTotalLength() || 1;
      samples = [];
      for (let i = 0; i < 256; i++) {
        const t = i / 256, pt = core.current.getPointAtLength(t * perimeter);
        samples.push({ x: pt.x, y: pt.y, t });
      }
    }
    function nearestT(x, y) {
      let best = 0, bd = Infinity;
      for (const s of samples) {
        const d = (s.x - x) ** 2 + (s.y - y) ** 2;
        if (d < bd) { bd = d; best = s.t; }
      }
      return best;
    }
    function tourAt(now) {
      if (reduced) return 0;
      if (!introDone) {
        const t = Math.min(1, Math.max(0, (now - tourEpoch) / INTRO_HALF_MS));
        if (t >= 1) { introDone = true; tourEpoch = now; mode = 'tour'; return 0.5; }
        return easeSoft(t) * 0.5;
      }
      return (0.5 + ((now - tourEpoch) / TOUR_MS) % 1) % 1;
    }
    function applyDash(center, frac) {
      const len = Math.max(1, frac * perimeter);
      const dash = (node, L, op) => {
        const start = ((center * perimeter - L / 2) % perimeter + perimeter) % perimeter;
        node.style.strokeDasharray = `${L} ${Math.max(0, perimeter - L)}`;
        node.style.strokeDashoffset = String(-start);
        node.style.opacity = String(op);
        node.style.stroke = AMBER;
      };
      dash(glow.current, Math.min(perimeter * 0.22, len * 1.6), 0.22 + (peak - PEAK) * 0.5);
      dash(fadeA.current, len * 1.55, peak * 0.22);
      dash(fadeB.current, len * 1.28, peak * 0.45);
      dash(core.current, len, peak);
    }
    const move = (e) => {
      if (reduced || (e.pointerType && e.pointerType !== 'mouse')) return;
      px = e.clientX; py = e.clientY;
      const r = el.getBoundingClientRect();
      const inside = px >= r.left - MAGNET_PAD && px <= r.right + MAGNET_PAD && py >= r.top - MAGNET_PAD && py <= r.bottom + MAGNET_PAD;
      if (inside) {
        const target = nearestT(px - r.left, py - r.top);
        if (mode !== 'magnet') { mode = 'magnet'; springOn = true; animActive = false; sp = progress; sv = 0; }
        starget = sp + shortest(sp, target);
        pointerIn = true;
      } else if (pointerIn && mode === 'magnet') {
        pointerIn = false; mode = 'back'; springOn = false;
        const to = useTourBase ? (tourBase + ((performance.now() - tourEpoch) / TOUR_MS) % 1) % 1 : tourAt(performance.now());
        animFrom = progress; animTo = progress + shortest(progress, to); animT0 = performance.now(); animDur = BACK_MS; animActive = true;
      }
    };
    const down = (e) => { if (reduced || (e.button != null && e.button !== 0)) return; pressed = true; pressUntil = performance.now() + PRESS_MS; segLen = SEG_PRESS; peak = PEAK_PRESS; liftFrom = parseFloat(el.style.translate) || 0; liftTo = -4; liftT0 = performance.now(); liftDur = PRESS_MS; liftAnim = true; };
    const up = () => { if (!pressed) return; pressed = false; liftFrom = parseFloat(el.dataset.lift) || 0; liftTo = 0; liftT0 = performance.now(); liftDur = RELEASE_MS; liftAnim = true; };
    el.addEventListener('pointermove', move);
    window.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    const ro = new ResizeObserver(layout); ro.observe(el); layout();
    const frame = (now) => {
      if (!alive) return;
      const dt = Math.min(0.032, (now - last) / 1000); last = now;
      el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
      if (!pressed && (segLen !== SEG || peak !== PEAK)) {
        segLen += (SEG - segLen) * Math.min(1, dt * 8);
        peak += (PEAK - peak) * Math.min(1, dt * 8);
        if (Math.abs(segLen - SEG) < 0.001) segLen = SEG;
        if (Math.abs(peak - PEAK) < 0.001) peak = PEAK;
      }
      if (liftAnim) {
        const k = Math.min(1, (now - liftT0) / liftDur);
        const v = liftFrom + (liftTo - liftFrom) * easeOut(k);
        el.dataset.lift = String(v);
        el.style.transform = `translateY(${v.toFixed(2)}px)`;
        if (k >= 1) liftAnim = false;
      }
      if (reduced) { progress = 0; applyDash(0, SEG); raf = requestAnimationFrame(frame); return; }
      if (mode === 'magnet' && springOn) {
        const a = (SPRING_M.k * (starget - sp) - SPRING_M.d * sv) / SPRING_M.m;
        sv += a * dt; sp += sv * dt; progress = ((sp % 1) + 1) % 1;
      } else if (animActive) {
        const k = Math.min(1, (now - animT0) / animDur);
        const raw = animFrom + (animTo - animFrom) * easeOut(k);
        progress = ((raw % 1) + 1) % 1;
        if (k >= 1) { animActive = false; if (mode === 'back') { mode = 'tour'; tourEpoch = now; tourBase = progress; useTourBase = true; } }
      } else if (useTourBase) progress = (tourBase + ((now - tourEpoch) / TOUR_MS) % 1) % 1;
      else progress = tourAt(now);
      applyDash(progress, segLen);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointermove', move);
      window.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  const blur = `rim-blur-${uid}`;
  return (
    <div ref={card} data-fw="rim" style={{ width: 'min(360px, 88%)', aspectRatio: '1 / 1.25', margin: 'auto', position: 'relative', background: '#121214', borderRadius: 20, boxShadow: 'inset 0 0 0 1.5px #2A2A2E' }}>
      <svg ref={svg} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }} aria-hidden="true">
        <defs><filter id={blur} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter></defs>
        <path ref={glow} fill="none" stroke={AMBER} strokeWidth="14" strokeLinecap="round" filter={`url(#${blur})`} />
        <path ref={fadeA} fill="none" stroke={AMBER} strokeWidth="8" strokeLinecap="round" />
        <path ref={fadeB} fill="none" stroke={AMBER} strokeWidth="4" strokeLinecap="round" />
        <path ref={core} fill="none" stroke={AMBER} strokeWidth="1.5" />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#EDEDED', fontWeight: 600, letterSpacing: '-0.04em' }}>Rim Trace</div>
    </div>
  );
}
