import { useEffect, useRef } from 'react';

// 24 ticks. Value spring 200/24. Growing length 320/30. Guide 0 to 100 to 20, then drift 50 - 30 cos.
const N = 24, K = 200, C = 24, KG = 320, CG = 30;

export default function TickScale() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const ticks = [...el.querySelectorAll('i')];
    const num = el.querySelector('b');
    let raf = 0, last = 0, value = 50, vel = 0, target = 50, mode = 'spring';
    const lens = ticks.map(() => 16), lvel = ticks.map(() => 0);
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let reduced = reducedMq.matches;
    let scanT0 = 0, driftT0 = 0, t0 = performance.now();
    if (!fine && !reduced) { value = 0; mode = 'hold'; }
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    const yTo = (clientY) => {
      const r = el.getBoundingClientRect();
      return Math.min(100, Math.max(0, (1 - (clientY - r.top) / r.height) * 100));
    };
    const move = (e) => { if (!fine || reduced) return; mode = 'spring'; target = yTo(e.clientY); };
    const leave = () => { if (fine) target = 50; };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    function lenTarget(i, active) {
      const d = Math.abs(i - active);
      return d === 0 ? 28 : d === 1 ? 20 : 16;
    }
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (reduced) { value = 50; target = 50; vel = 0; }
      else if (!fine && mode === 'hold' && now > t0 + 400) { mode = 'scan'; scanT0 = now; }
      if (!reduced && mode === 'scan') {
        const elapse = now - scanT0;
        if (elapse >= 1400) { mode = 'drift'; driftT0 = scanT0 + 1400; value = 20; }
        else value = elapse <= 760 ? 100 * (elapse / 760) : 100 + (20 - 100) * ((elapse - 760) / 640);
      } else if (!reduced && mode === 'drift') {
        const phase = ((now - driftT0) / 8000) * Math.PI * 2;
        value = 50 - 30 * Math.cos(phase);
      } else if (!reduced && mode === 'spring' && dt) {
        const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
        for (let s = 0; s < n; s++) { vel += (-K * (value - target) - C * vel) * h; value += vel * h; }
      }
      const active = Math.min(N - 1, Math.max(0, Math.round(value / 100 * (N - 1))));
      ticks.forEach((node, i) => {
        const goal = lenTarget(i, active);
        if (reduced) lens[i] = goal;
        else if (dt) {
          const grow = goal > lens[i];
          const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
          for (let s = 0; s < n; s++) {
            lvel[i] += (-(grow ? KG : K) * (lens[i] - goal) - (grow ? CG : C) * lvel[i]) * h;
            lens[i] += lvel[i] * h;
          }
        }
        node.style.transform = `scaleX(${(lens[i] / 16).toFixed(3)})`;
        node.style.background = i === active ? '#FFB547' : Math.abs(i - active) === 1 ? '#6B6B6B' : '#2A2A2A';
      });
      num.textContent = String(Math.round(Math.min(100, Math.max(0, value))));
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerleave', leave);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#0B0B0C' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Array.from({ length: N }, (_, i) => <i key={i} style={{ display: 'block', width: 16, height: 2, background: '#2A2A2A', transformOrigin: 'left center' }} />)}
        </div>
        <b style={{ color: '#EDEDED', fontSize: 64, fontWeight: 500, letterSpacing: '-0.04em' }}>50</b>
      </div>
    </div>
  );
}
