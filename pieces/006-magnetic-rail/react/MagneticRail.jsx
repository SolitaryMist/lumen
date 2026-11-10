import { useEffect, useRef } from 'react';

/* Mount: React 18, default export. Render <MagneticRail /> in a box.
   Gaussian sigma 56, scale spring 280/28/mass 0.1, bar 220/26, press 320/30.
   Guide 1400ms cubic-bezier(0.45, 0, 0.55, 1), then drift 0.5+0.5·cos over 8000ms.
   Each copy keeps its own nodes. */

const NAMES = ['Rim', 'Mesh', 'Weight', 'Stack', 'Scale'];
const CENTERS = [20, 92, 164, 236, 308];
const SIGMA = 56;
const mag = (d) => 1 + 0.5 * Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1; let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(Math.min(1, Math.max(0, t)));
  };
}
const easeGuide = bez(0.45, 0, 0.55, 1);
function spring(pos, vel, to, dt, k, c, m) {
  if (!(dt > 0)) return [pos, vel];
  const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
  for (let s = 0; s < n; s++) { vel += ((-k * (pos - to) - c * vel) / m) * h; pos += vel * h; }
  return [pos, vel];
}

export default function MagneticRail() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const icons = [...el.querySelectorAll('svg')];
    const labels = [...el.querySelectorAll('em')];
    const bar = el.querySelector('[data-bar]');
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    const scales = CENTERS.map(() => 0.88), svel = CENTERS.map(() => 0), hot = CENTERS.map(() => 0), hvel = CENTERS.map(() => 0);
    let magnet = fine || reduced ? 164 : 20, magnetV = 0, nearest = fine || reduced ? 2 : 0;
    let barX = magnet, barV = 0, phase = reduced ? 'still' : 'enter', inside = false, pointerX = magnet;
    let markOp = 0, fading = false, fadeFrom = 0, fadeTo = 1, fadeT0 = 0;
    let raf = 0, last = 0, t0 = performance.now(), guideT0 = 0, driftT0 = 0, alive = true;
    let snap = false, snapTarget = 164, snapAnchor = 164;
    hot[nearest] = 1;
    const local = (x) => x - el.getBoundingClientRect().left;
    const move = (e) => {
      if (!fine || reduced || (e.pointerType && e.pointerType !== 'mouse' && e.pointerType !== 'pen')) return;
      inside = true; pointerX = local(e.clientX);
      if (phase === 'enter' || phase === 'still') return;
      if (snap && Math.abs(pointerX - snapAnchor) <= 4) return;
      snap = false; phase = 'follow'; magnet = pointerX; magnetV = 0;
    };
    const leave = () => {
      inside = false;
      if (!fine || reduced || phase === 'enter' || phase === 'still') return;
      phase = 'away'; fadeFrom = markOp; fadeTo = 0; fadeT0 = performance.now(); fading = true;
    };
    const down = (e) => {
      const item = e.target.closest?.('[data-i]');
      if (!item || !fine || reduced || phase === 'enter') return;
      snap = true; snapTarget = CENTERS[Number(item.dataset.i)]; snapAnchor = local(e.clientX); magnetV = 0; phase = 'snap';
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    el.addEventListener('pointerdown', down);
    const frame = (now) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
      if (reduced || phase === 'still') {
        magnet = 164; nearest = 2; barX = 164; markOp = 1; scales.fill(1); hot.fill(0); hot[2] = 1;
      } else {
        const end = t0 + 760;
        if (phase === 'enter' && now >= end) {
          if (fine && inside) { phase = 'follow'; magnet = pointerX; }
          else if (fine) phase = 'idle';
          else { phase = 'guide'; guideT0 = end; }
        }
        if (phase === 'guide') {
          const elapse = now - guideT0;
          if (elapse >= 1400) { driftT0 = guideT0 + 1400; phase = 'drift'; }
          else magnet = 20 + easeGuide(Math.min(1, elapse / 1400)) * 288;
        }
        if (phase === 'drift') magnet = 20 + (0.5 + 0.5 * Math.cos(((now - driftT0) / 8000) * Math.PI * 2)) * 288;
        else if (phase === 'snap') [magnet, magnetV] = spring(magnet, magnetV, snapTarget, dt, 320, 30, 1);
        else if (phase === 'idle') magnet = 164;
        else if (phase === 'follow') magnet = pointerX;
        if (phase !== 'away') nearest = CENTERS.reduce((b, c, i) => Math.abs(c - magnet) < Math.abs(CENTERS[b] - magnet) ? i : b, 0);
        CENTERS.forEach((c, i) => {
          const goal = phase === 'away' ? 1 : mag(magnet - c);
          const hgoal = phase === 'away' ? 0 : (i === nearest ? 1 : 0);
          if (now < t0 + i * 60) { scales[i] = 0.88; svel[i] = 0; }
          else {
            const step = Math.min(dt, (now - (t0 + i * 60)) / 1000);
            [scales[i], svel[i]] = spring(scales[i], svel[i], goal, step, 280, 28, 0.1);
            [hot[i], hvel[i]] = spring(hot[i], hvel[i], hgoal, step, 280, 28, 0.1);
          }
        });
        if (phase !== 'away') [barX, barV] = spring(barX, barV, CENTERS[nearest], dt, 220, 26, 1);
        if (now < end) markOp = 0;
        else if (fading) {
          const u = Math.min(1, Math.max(0, (now - fadeT0) / 200));
          markOp = fadeFrom + (fadeTo - fadeFrom) * u;
          if (u >= 1) { fading = false; markOp = fadeTo; }
        } else if (phase === 'away') markOp = 0;
        else markOp = 1;
      }
      CENTERS.forEach((_, i) => {
        const influence = Math.max(0, Math.min(1, (scales[i] - 1) / 0.5));
        const lift = 4 * Math.max(0, Math.min(1, hot[i])) * influence;
        icons[i].style.transform = `translateY(${(-lift).toFixed(2)}px) scale(${scales[i].toFixed(4)})`;
        const col = `rgb(${Math.round(107 + (242 - 107) * Math.max(0, Math.min(1, hot[i])))},${Math.round(107 + (242 - 107) * Math.max(0, Math.min(1, hot[i])))},${Math.round(107 + (242 - 107) * Math.max(0, Math.min(1, hot[i])))})`;
        icons[i].style.color = col; labels[i].style.color = col;
        labels[i].style.fontVariationSettings = `"wght" ${(400 + 100 * Math.max(0, Math.min(1, hot[i]))).toFixed(1)}`;
      });
      const w = 40 * scales[nearest];
      bar.style.width = w + 'px';
      bar.style.transform = `translateX(${barX - w / 2}px)`;
      bar.style.opacity = String(markOp);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      el.removeEventListener('pointerdown', down);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} data-fw="rail" style={{ minHeight: 280, display: 'grid', placeItems: 'center', background: '#0C0C0C', color: '#F2F2F2', padding: 24 }}>
      <div>
        <h1 style={{ margin: '0 0 8px', textAlign: 'center', fontWeight: 500, fontSize: 'clamp(28px, 8vw, 40px)', letterSpacing: '-0.035em', lineHeight: 1 }}>Magnetic rail</h1>
        <p style={{ margin: '0 0 28px', textAlign: 'center', color: '#8A8A8A', fontSize: 12 }}>Proximity scale</p>
        <div style={{ position: 'relative', width: 328, height: 78 }}>
          {NAMES.map((name, i) => (
            <div key={name} data-i={i} style={{ position: 'absolute', left: CENTERS[i] - 20, width: 40, textAlign: 'center' }}>
              <svg viewBox="0 0 40 40" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ display: 'block', transformOrigin: '50% 100%', color: '#6B6B6B' }}>
                {i === 0 && <circle cx="20" cy="20" r="8.5" />}
                {i === 1 && [12, 20, 28].flatMap((y) => [12, 20, 28].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.15" />))}
                {i === 2 && [13, 20, 27].map((x) => <line key={x} x1={x} y1="11" x2={x} y2="29" />)}
                {i === 3 && [9, 17.5, 26].map((y) => <rect key={y} x="11" y={y} width="18" height="5" rx="1.2" />)}
                {i === 4 && [10, 15, 20, 25, 30].map((y) => <line key={y} x1="14" y1={y} x2="26" y2={y} />)}
              </svg>
              <em style={{ display: 'block', marginTop: 8, fontSize: 11, fontStyle: 'normal', color: '#6B6B6B' }}>{name}</em>
            </div>
          ))}
          <i data-bar="1" style={{ position: 'absolute', left: 0, top: 66, height: 2, borderRadius: 1, background: '#FFB547', opacity: 0 }} />
        </div>
      </div>
    </div>
  );
}
