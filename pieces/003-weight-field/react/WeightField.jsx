import { useEffect, useRef } from 'react';

// LUMEN. Rest 200, peak 900, spring 170/22/mass 1. Sweep 1400ms, then cosine period 7000ms.
const WORD = 'LUMEN';
const W_REST = 200, W_MAX = 900, K = 170, C = 22, MASS = 1;
const SWEEP = 1400, PING = 7000;

export default function WeightField() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const letters = [...el.querySelectorAll('span')];
    const state = letters.map(() => ({ w: W_REST, v: 0 }));
    let raf = 0, last = 0, mode = 'tour', px = null, t0 = performance.now();
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    const move = (e) => { mode = 'follow'; px = e.clientX; };
    const leave = () => { mode = 'tour'; px = null; t0 = performance.now(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', leave);
    function tourX(now) {
      const r = el.getBoundingClientRect();
      const elapse = now - t0;
      const u = elapse < SWEEP ? elapse / SWEEP : 0.5 + 0.5 * Math.cos(((elapse - SWEEP) / PING) * Math.PI * 2);
      return r.left + (elapse < SWEEP ? u : u) * r.width;
    }
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const x = reduced ? null : mode === 'follow' ? px : tourX(now);
      const rects = letters.map((n) => n.getBoundingClientRect());
      const avg = rects.reduce((a, r) => a + r.width, 0) / letters.length;
      const R = avg * 1.6;
      letters.forEach((node, i) => {
        const cx = rects[i].left + rects[i].width / 2;
        const d = x == null ? R : Math.abs(x - cx);
        const t = Math.min(1, Math.max(0, d / R));
        const s = t * t * (3 - 2 * t);
        const goal = W_MAX - (W_MAX - W_REST) * s;
        const st = state[i];
        if (reduced) st.w += (goal - st.w) * Math.min(1, dt / 0.2);
        else if (dt) {
          const n = 4, h = dt / n;
          for (let k = 0; k < n; k++) {
            st.v += ((-K * (st.w - goal) - C * st.v) / MASS) * h;
            st.w += st.v * h;
          }
        }
        node.style.fontVariationSettings = `'wght' ${st.w.toFixed(1)}`;
      });
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
    <div ref={root} style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#0E0E10', color: '#E8E6E1' }}>
      <div style={{ display: 'flex', fontSize: '18vw', letterSpacing: '-0.035em', lineHeight: 0.9 }}>
        {WORD.split('').map((ch) => <span key={ch}>{ch}</span>)}
      </div>
    </div>
  );
}
