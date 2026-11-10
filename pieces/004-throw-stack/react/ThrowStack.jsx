import { useEffect, useRef } from 'react';

// Throw the top card. Fling past 0.35 width or 800 px/s. Snap spring 380/30. Reduced motion fades in 200ms.
const CARDS = ['Rim', 'Dusk', 'Weight', 'Stack', 'Scale'];
const SNAP = { k: 380, c: 30 }, FLING_X = 0.35, FLING_V = 800;

export default function ThrowStack() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const nodes = [...el.querySelectorAll('article')];
    const cards = nodes.map(() => ({ x: 0, y: 0, vx: 0, vy: 0, mode: 'rest', op: 1 }));
    let order = cards.map((_, i) => i);
    let raf = 0, last = 0, drag = null;
    const samples = [];
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    const down = (e) => {
      const top = order[0];
      if (cards[top].mode === 'fling') return;
      drag = { i: top, sx: e.clientX, sy: e.clientY, x0: cards[top].x, y0: cards[top].y };
      samples.length = 0;
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      if (!drag) return;
      const c = cards[drag.i];
      c.x = drag.x0 + (e.clientX - drag.sx);
      c.y = drag.y0 + (e.clientY - drag.sy) * 0.6;
      samples.push({ t: performance.now(), x: c.x, y: c.y });
    };
    const up = () => {
      if (!drag) return;
      const c = cards[drag.i];
      const now = performance.now();
      const recent = samples.filter((s) => now - s.t < 80);
      let vx = 0;
      if (recent.length >= 2) {
        const a = recent[0], b = recent[recent.length - 1];
        vx = (b.x - a.x) / Math.max(0.016, (b.t - a.t) / 1000);
      }
      const w = el.getBoundingClientRect().width;
      if (Math.abs(c.x) > FLING_X * w || Math.abs(vx) > FLING_V) {
        c.mode = 'fling'; c.t0 = now; c.x0 = c.x; c.dir = Math.sign(c.x || vx) || 1; c.op = 1;
      } else c.mode = 'spring';
      drag = null;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    function frame(now) {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      const w = el.getBoundingClientRect().width || 320;
      cards.forEach((c, i) => {
        if (c.mode === 'fling') {
          const u = Math.min(1, (now - c.t0) / (reduced ? 200 : 360));
          c.x = c.x0 + c.dir * (w * 0.5 + w) * u;
          c.op = 1 - u;
          if (u >= 1) { c.mode = 'rest'; c.x = c.y = 0; c.op = 1; order = [...order.slice(1), i]; }
        } else if (c.mode === 'spring' && !reduced && dt) {
          const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
          for (let s = 0; s < n; s++) {
            c.vx += (-SNAP.k * c.x - SNAP.c * c.vx) * h; c.x += c.vx * h;
            c.vy += (-SNAP.k * c.y - SNAP.c * c.vy) * h; c.y += c.vy * h;
          }
          if (Math.abs(c.x) < 0.4 && Math.abs(c.y) < 0.4) { c.mode = 'rest'; c.x = c.y = 0; }
        } else if (c.mode === 'spring' && reduced) { c.x *= 0.8; c.y *= 0.8; if (Math.abs(c.x) < 1) c.mode = 'rest'; }
      });
      order.forEach((idx, depth) => {
        const node = nodes[idx];
        const c = cards[idx];
        const y = depth * 10 + (idx === drag?.i || c.mode !== 'rest' ? c.y : 0);
        const x = idx === drag?.i || c.mode !== 'rest' ? c.x : 0;
        node.style.transform = `translate(${x}px, ${y}px) scale(${1 - depth * 0.04})`;
        node.style.opacity = String(c.op * (depth > 3 ? 0 : 1));
        node.style.zIndex = String(20 - depth);
      });
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} style={{ position: 'relative', width: 'min(78vw, 320px)', aspectRatio: '8 / 11', margin: 'auto' }}>
      {CARDS.map((name) => (
        <article key={name} style={{ position: 'absolute', inset: 0, borderRadius: 18, background: '#18181C', color: '#E8E6E1', padding: 24, border: '1px solid rgba(255,255,255,.06)' }}>
          <div style={{ width: 24, height: 2, background: '#F2A65A', marginBottom: 14 }} />
          <div style={{ fontSize: 28, letterSpacing: '-0.04em' }}>{name}</div>
        </article>
      ))}
    </div>
  );
}
