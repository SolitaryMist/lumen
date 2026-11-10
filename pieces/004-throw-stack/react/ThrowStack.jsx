import { useEffect, useRef } from 'react';

/* Mount: React 18, default export. Render <ThrowStack /> in a box at least 440px tall.
   Register this piece's inter-var.woff2 as family "Inter Var", weight 100 900.
   Drag, tilt, and throw match the web piece: snap 380/30, shift 260/26, tilt 200/24. */

const DATA = [
  { title: 'Rim Trace', sub: 'A rim of light that follows you' },
  { title: 'Dusk', sub: 'A gradient that breathes' },
  { title: 'Weight Field', sub: 'Type that turns bold on hover' },
  { title: 'Stack', sub: 'A deck you can throw' },
  { title: 'Coming soon', sub: 'Next piece in the works' },
];
const P = {
  dy: 10, ds: 0.04, shade: 0.06, introStagger: 70, introDur: 700, introFade: 160, textFade: 120, introY: 40, tickFade: 200,
  yDamp: 0.6, rotPerPx: 0.06, rotMax: 14, lift: 0.6, flingX: 0.35, flingV: 800, velWindow: 80, flingDur: 360, flingRot: 24,
  snap: { k: 380, c: 30 }, shift: { k: 260, c: 26 }, shiftStagger: 40, tilt: { k: 200, c: 24 }, tiltMax: 6, perspective: 1000,
  tapSlop: 8, hintIdle: 2500, hintX: 28, hintDur: 900, hintMax: 2, hintGap: 4000, reducedDur: 200,
};
function bez(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1; let t = x;
    for (let i = 0; i < 8; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-6 || Math.abs(d) < 1e-6) break; t -= e / d; }
    return Y(Math.min(1, Math.max(0, t)));
  };
}
const eIntro = bez(0.22, 1, 0.36, 1), eFling = bez(0.2, 0.7, 0.3, 1), eHint = bez(0.65, 0, 0.35, 1);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const spring = (pos, vel, target, s, dt) => { const a = -s.k * (pos - target) - s.c * vel; vel += a * dt; pos += vel * dt; return [pos, vel]; };

export default function ThrowStack() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const nodes = [...el.querySelectorAll('article')];
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    const canHover = matchMedia('(hover: hover) and (pointer: fine)').matches;
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    const cards = nodes.map((node, i) => ({
      i, el: node, shade: node.querySelector('[data-shade]'), content: node.querySelector('[data-body]'), tick: node.querySelector('[data-tick]'),
      depth: i, dv: 0, dTarget: i, dStart: 0, x: 0, vx: 0, y: 0, vy: 0, mode: 'rest', fl: null, tx: 0, tvx: 0, ty: 0, tvy: 0, ttx: 0, tty: 0, introT0: 0, tickT0: 0, lin: null, lin2: null,
    }));
    let order = cards.map((c) => c.i), drag = null, touched = false, hint = null, hintsDone = 0, nextHint = Infinity;
    const samples = [];
    let raf = 0, last = 0, alive = true, W = 320, VW = 800;
    const setDepth = (now) => order.forEach((ci, d) => {
      const c = cards[ci]; if (c.mode === 'fling') return;
      if (c.dTarget !== d) { c.dTarget = d; c.dStart = now + (d < 4 ? d * P.shiftStagger : 0); if (reduced) c.lin = { from: c.depth, to: d, t0: now, dur: P.reducedDur }; }
    });
    const rotOf = (x) => clamp(x * P.rotPerPx, -P.rotMax, P.rotMax);
    const velocity = () => {
      const now = performance.now();
      while (samples.length > 2 && now - samples[0].t > P.velWindow) samples.shift();
      if (samples.length < 2) return [0, 0];
      const a = samples[0], b = samples[samples.length - 1], dt = (b.t - a.t) / 1000;
      return dt > 0 ? [(b.x - a.x) / dt, (b.y - a.y) / dt] : [0, 0];
    };
    function fling(c, dir) {
      const now = performance.now();
      c.mode = 'fling'; c.fl = { t0: now, x0: c.x, y0: c.y, r0: rotOf(c.x), x1: dir * (VW / 2 + W), r1: dir * P.flingRot };
      c.ttx = c.tty = 0; order.push(order.shift()); cards[order[0]].tickT0 = now; setDepth(now);
    }
    const down = (e) => {
      touched = true; hint = null;
      const top = cards[order[0]];
      if (e.target.closest('article') !== top.el || top.mode === 'fling') return;
      top.el.setPointerCapture?.(e.pointerId);
      drag = { id: e.pointerId, c: top, sx: e.clientX, sy: e.clientY, x0: top.x, y0: top.y / P.yDamp };
      top.mode = 'drag'; samples.length = 0; samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    };
    const move = (e) => {
      if (drag && e.pointerId === drag.id) {
        drag.c.x = drag.x0 + (e.clientX - drag.sx);
        drag.c.y = (drag.y0 + (e.clientY - drag.sy)) * P.yDamp;
        samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        return;
      }
      if (canHover && !reduced && e.pointerType === 'mouse') {
        const c = cards[order[0]], r = el.getBoundingClientRect();
        const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        const inside = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
        c.ttx = inside ? clamp(-ny, -1, 1) * P.tiltMax : 0;
        c.tty = inside ? clamp(nx, -1, 1) * P.tiltMax : 0;
      }
    };
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null; const c = d.c;
      samples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
      const [vx, vy] = velocity();
      const moved = Math.hypot(c.x - d.x0, c.y - d.y0);
      if (moved < P.tapSlop) { c.mode = 'spring'; c.vx = c.vy = 0; return; }
      if (Math.abs(c.x) > P.flingX * W || Math.abs(vx) > P.flingV) fling(c, Math.abs(vx) > P.flingV ? Math.sign(vx) : Math.sign(c.x) || 1);
      else { c.mode = 'spring'; c.vx = vx; c.vy = vy * P.yDamp; if (reduced) c.lin2 = { x: c.x, y: c.y, t0: performance.now() }; }
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    const now0 = performance.now();
    cards.forEach((c) => { c.introT0 = now0 + (4 - c.i) * P.introStagger; });
    cards[0].tickT0 = -1e9;
    nextHint = now0 + 4 * P.introStagger + P.introDur + P.hintIdle;
    const frame = (now) => {
      if (!alive) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
      const box = el.getBoundingClientRect(); W = box.width || 320; VW = box.width || 320;
      const steps = Math.max(1, Math.round(dt * 240)), h = dt / steps;
      const top = cards[order[0]];
      const pLift = drag ? Math.min(Math.abs(top.x) / (0.5 * W), 1) : 0;
      if (!reduced && !canHover && !touched && hintsDone < P.hintMax && now >= nextHint && !hint && top.mode === 'rest') { hint = { t0: now }; top.mode = 'hint'; }
      for (const c of cards) {
        const ti = clamp((now - c.introT0) / P.introDur, 0, 1);
        const ei = reduced ? ti : eIntro(ti);
        const io = clamp((now - c.introT0) / P.introFade, 0, 1);
        const tio = clamp((now - c.introT0 - P.introFade) / P.textFade, 0, 1);
        if (c.mode !== 'fling') {
          if (c.lin) { const u = clamp((now - c.lin.t0) / c.lin.dur, 0, 1); c.depth = c.lin.from + (c.lin.to - c.lin.from) * u; if (u >= 1) c.lin = null; }
          else if (now >= c.dStart) for (let s = 0; s < steps; s++) [c.depth, c.dv] = spring(c.depth, c.dv, c.dTarget, P.shift, h);
          if (drag && order[1] === c.i) { c.depth = 1 - pLift * P.lift; c.dv = 0; }
        }
        let rot = 0, op = 1;
        if (c.mode === 'fling') {
          const u = clamp((now - c.fl.t0) / (reduced ? P.reducedDur : P.flingDur), 0, 1);
          if (reduced) { op = 1 - u; }
          else { const e = eFling(u); c.x = c.fl.x0 + (c.fl.x1 - c.fl.x0) * e; c.y = c.fl.y0 * (1 - e); rot = c.fl.r0 + (c.fl.r1 - c.fl.r0) * e; }
          if (u >= 1) { c.mode = 'rest'; c.x = c.y = c.vx = c.vy = 0; c.depth = 4; c.dTarget = 4; c.fl = null; rot = 0; op = 1; }
        } else if (c.mode === 'spring') {
          if (c.lin2) { const u = clamp((now - c.lin2.t0) / P.reducedDur, 0, 1); c.x = c.lin2.x * (1 - u); c.y = c.lin2.y * (1 - u); if (u >= 1) { c.lin2 = null; c.mode = 'rest'; } }
          else for (let s = 0; s < steps; s++) {
            [c.x, c.vx] = spring(c.x, c.vx, 0, P.snap, h); [c.y, c.vy] = spring(c.y, c.vy, 0, P.snap, h);
            if (Math.abs(c.x) < 0.05 && Math.abs(c.vx) < 1 && Math.abs(c.y) < 0.05) { c.x = c.y = c.vx = c.vy = 0; c.mode = 'rest'; }
          }
          rot = rotOf(c.x);
        } else if (c.mode === 'hint' && hint) {
          const u = clamp((now - hint.t0) / P.hintDur, 0, 1);
          c.x = -P.hintX * (u < 0.5 ? eHint(u * 2) : 1 - eHint(u * 2 - 1));
          rot = rotOf(c.x);
          if (u >= 1) { c.x = 0; c.mode = 'rest'; hint = null; hintsDone++; nextHint = hintsDone < P.hintMax ? now + P.hintGap : Infinity; }
        } else rot = rotOf(c.x);
        if (!(c === top && c.mode !== 'fling' && c.mode !== 'drag')) { c.ttx = 0; c.tty = 0; }
        for (let s = 0; s < steps; s++) { [c.tx, c.tvx] = spring(c.tx, c.tvx, c.ttx, P.tilt, h); [c.ty, c.tvy] = spring(c.ty, c.tvy, c.tty, P.tilt, h); }
        const d = c.mode === 'fling' ? 0 : c.depth;
        const yy = d * P.dy + c.y + (1 - ei) * P.introY;
        c.el.style.transform = `perspective(${P.perspective}px) translate3d(${c.x.toFixed(2)}px,${yy.toFixed(2)}px,0) rotate(${rot.toFixed(3)}deg) rotateX(${c.tx.toFixed(3)}deg) rotateY(${c.ty.toFixed(3)}deg) scale(${(1 - d * P.ds).toFixed(4)})`;
        c.el.style.opacity = (op * clamp(4 - d, 0, 1) * io).toFixed(3);
        c.el.style.zIndex = c.mode === 'fling' ? '20' : String(Math.round(100 - d * 10));
        c.content.style.opacity = tio.toFixed(3);
        c.shade.style.opacity = (clamp(d, 0, 4) * P.shade).toFixed(3);
        c.tick.style.opacity = (c === top && c.mode !== 'fling' ? clamp((now - c.tickT0) / P.tickFade, 0, 1) : 0).toFixed(3);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} data-fw="stack" style={{ position: 'relative', width: 'min(78vw, 320px)', height: 440, margin: '40px auto', background: 'transparent' }}>
      {DATA.map((d, i) => (
        <article key={d.title} style={{ position: 'absolute', inset: 0, borderRadius: 18, background: '#18181C', color: '#E8E6E1', border: '1px solid rgba(255,255,255,.06)', overflow: 'hidden' }}>
          <div data-shade="1" style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0 }} />
          <div data-body="1" style={{ position: 'relative', padding: 28, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div data-tick="1" style={{ width: 24, height: 2, background: '#F2A65A', marginBottom: 14 }} />
            <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 0.9 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ marginTop: 'auto' }}><div style={{ fontSize: 15 }}>{d.title}</div><div style={{ fontSize: 13, color: '#6B6A70', marginTop: 4 }}>{d.sub}</div></div>
          </div>
        </article>
      ))}
    </div>
  );
}
