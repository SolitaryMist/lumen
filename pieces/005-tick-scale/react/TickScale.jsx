import { useEffect, useRef } from 'react';

/* Mount: React 18, default export. Render <TickScale /> in a tall box.
   Register this piece's inter-var.woff2 as family "Inter Var", weight 100 900.
   24 ticks, value spring 200/24, grow 320/30, guide 0→100→20 then drift 50−30·cos. */

const N = 24, K = 200, C = 24, KG = 320, CG = 30;
function easeGuide(t) {
  const x1 = 0.65, y1 = 0, x2 = 0.35, y2 = 1;
  if (t <= 0) return 0; if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const x = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3 - t;
    const d = 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u;
    if (Math.abs(d) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - x / d));
  }
  return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
}

export default function TickScale() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const ticks = [...el.querySelectorAll('i')];
    const num = el.querySelector('b');
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    let value = fine || reduced ? 50 : 0, vel = 0, target = value, mode = fine || reduced ? 'spring' : 'hold';
    const lens = ticks.map(() => 16), lvel = ticks.map(() => 0);
    let raf = 0, last = 0, t0 = performance.now(), scanT0 = 0, driftT0 = 0, alive = true;
    const yTo = (clientY) => {
      const r = el.getBoundingClientRect();
      return Math.min(100, Math.max(0, (1 - (clientY - r.top) / Math.max(1, r.height)) * 100));
    };
    const move = (e) => { if (!fine || reduced || e.pointerType === 'touch') return; mode = 'spring'; target = yTo(e.clientY); };
    const leave = () => { if (fine) target = 50; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    const lenTarget = (i, active) => { const d = Math.abs(i - active); return d === 0 ? 28 : d === 1 ? 20 : 16; };
    const frame = (now) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
      if (reduced) { value = 50; vel = 0; target = 50; }
      else if (!fine && mode === 'hold' && now >= t0 + 160 + 23 * 40) { mode = 'scan'; scanT0 = now; }
      if (!reduced && mode === 'scan') {
        const elapse = now - scanT0;
        if (elapse >= 1400) { driftT0 = scanT0 + 1400; mode = 'drift'; value = 20; vel = 0; }
        else if (elapse <= 760) value = 100 * easeGuide(elapse / 760);
        else value = 100 + (20 - 100) * easeGuide((elapse - 760) / 640);
      } else if (!reduced && mode === 'drift') value = 50 - 30 * Math.cos(((now - driftT0) / 8000) * Math.PI * 2);
      else if (!reduced && mode === 'spring' && dt) {
        const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
        for (let s = 0; s < n; s++) { vel += (-K * (value - target) - C * vel) * h; value += vel * h; }
      }
      const active = Math.min(N - 1, Math.max(0, Math.round(value / 100 * (N - 1))));
      ticks.forEach((node, i) => {
        const goal = lenTarget(i, active);
        if (reduced) lens[i] = goal;
        else if (dt) {
          const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
          for (let s = 0; s < n; s++) {
            const grow = goal > lens[i];
            lvel[i] += (-(grow ? KG : K) * (lens[i] - goal) - (grow ? CG : C) * lvel[i]) * h;
            lens[i] += lvel[i] * h;
          }
        }
        node.style.transform = `scaleX(${(lens[i] / 16).toFixed(4)})`;
        node.style.background = i === active ? '#FFB547' : Math.abs(i - active) === 1 ? '#6B6B6B' : '#2A2A2A';
      });
      num.textContent = String(Math.round(Math.min(100, Math.max(0, value))));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} data-fw="scale" style={{ height: '100%', minHeight: 320, display: 'grid', placeItems: 'center', background: '#0B0B0C' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28, height: 'min(600px, 62%)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
          {Array.from({ length: N }, (_, i) => <i key={i} style={{ display: 'block', width: 16, height: 2, background: '#2A2A2A', transformOrigin: 'left center' }} />)}
        </div>
        <b style={{ color: '#EDEDED', fontWeight: 500, fontSize: 'clamp(56px, 14vw, 88px)', letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>50</b>
      </div>
    </div>
  );
}
