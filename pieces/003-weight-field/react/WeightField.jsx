import { useEffect, useRef } from 'react';

/* Mount: React 18, default export. Render <WeightField /> in a tall box.
   Load a variable font if you want the weight axis to draw. Each copy measures its own letters.
   Springs 170/22/mass 1, sweep 1400ms, ping 7000ms, amber bar #F2A65A. */

const P = {
  word: 'LUMEN', wIntro: 100, wRest: 200, wMax: 900, rFactor: 1.6,
  k: 170, c: 22, m: 1, introStagger: 60, introDur: 600, leaveDur: 480, barFade: 300,
  tracking: -0.035, widthDesktop: 0.72, widthMobile: 0.86,
  sweepDur: 1400, pingPeriod: 7000, resumeDelay: 800, resumeBlend: 1000, reducedDur: 200,
};
const bez = (x1, y1, x2, y2) => (t) => {
  if (t <= 0) return 0; if (t >= 1) return 1;
  let u = t;
  for (let i = 0; i < 8; i++) {
    const cx = 3 * x1 * u * (1 - u) ** 2 + 3 * x2 * u * u * (1 - u) + u ** 3 - t;
    const dx = 3 * x1 * (1 - u) ** 2 + 6 * (x2 - x1) * u * (1 - u) + 3 * (1 - x2) * u * u;
    if (Math.abs(dx) < 1e-6) break;
    u = Math.min(1, Math.max(0, u - cx / dx));
  }
  return 3 * y1 * u * (1 - u) ** 2 + 3 * y2 * u * u * (1 - u) + u ** 3;
};
const easeOut = bez(0.22, 1, 0.36, 1), easeInOut = bez(0.65, 0, 0.35, 1);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export default function WeightField() {
  const root = useRef(null);
  useEffect(() => {
    const el = root.current;
    const letters = [...el.querySelectorAll('[data-ch]')];
    const bar = el.querySelector('[data-bar]');
    const probe = el.querySelector('[data-probe]');
    const L = letters.map((node) => ({ node, ch: node.textContent, w: P.wIntro, v: 0, op: 0 }));
    const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
    const noHover = matchMedia('(hover: none)').matches;
    let reduced = reducedMq.matches;
    const onReduce = () => { reduced = reducedMq.matches; };
    reducedMq.addEventListener('change', onReduce);
    let fontSize = 80, R = 80, wordLeft = 0, wordRight = 0, barY = 0;
    let px = null, mode = 'idle', leaveT0 = 0, t0 = performance.now(), lastRelease = 0, dragging = false, tour = null;
    let barX = 0, barV = 0, barW = 2, barWV = 0, barOp = 0, barOpFrom = 0, barOpTo = 0, barOpT0 = 0, barInit = false;
    let raf = 0, last = 0, alive = true;
    function measure() {
      const box = el.getBoundingClientRect();
      const width = box.width || 640;
      for (const l of L) {
        probe.textContent = l.ch;
        probe.style.fontVariationSettings = "'wght' 900, 'opsz' 32";
        l.w900u = (probe.getBoundingClientRect().width || 60) / 100;
        probe.style.fontVariationSettings = "'wght' 200, 'opsz' 32";
        l.w200u = (probe.getBoundingClientRect().width || 40) / 100;
      }
      const sumU = L.reduce((a, l) => a + l.w900u, 0) + P.tracking * (L.length - 1);
      const frac = width <= 760 ? P.widthMobile : P.widthDesktop;
      fontSize = frac * width / Math.max(0.1, sumU);
      let x = (width - sumU * fontSize) / 2;
      L.forEach((l, i) => {
        l.w900 = l.w900u * fontSize; l.w200 = l.w200u * fontSize;
        l.node.parentElement.style.width = l.w900 + 'px';
        l.node.parentElement.style.marginLeft = i ? (P.tracking * fontSize) + 'px' : '0';
        l.cx = x + l.w900 / 2; x += l.w900 + P.tracking * fontSize;
      });
      wordLeft = L[0].cx; wordRight = L[L.length - 1].cx;
      R = L.reduce((a, l) => a + l.w900, 0) / L.length * P.rFactor;
      barY = box.height / 2 + fontSize * 0.44;
    }
    const setBarOp = (to, now) => { if (barOpTo === to) return; barOpFrom = barOp; barOpTo = to; barOpT0 = now; };
    const ping = (ph) => { const mid = (wordLeft + wordRight) / 2, half = (wordRight - wordLeft) / 2; return mid + half * Math.cos(ph); };
    function tourX(now) {
      if (!tour) return null;
      const t = now - tour.t0;
      if (tour.kind === 'sweep') {
        if (t < P.sweepDur) return wordLeft + (wordRight - wordLeft) * easeOut(t / P.sweepDur);
        tour = { kind: 'ping', t0: tour.t0 + P.sweepDur, ph0: 0 };
        return tourX(now);
      }
      const x = ping(tour.ph0 + 2 * Math.PI * t / P.pingPeriod);
      if (tour.from != null && t < P.resumeBlend) { const k = smooth(0, 1, t / P.resumeBlend); return tour.from + (x - tour.from) * k; }
      return x;
    }
    const move = (e) => { if (noHover && !dragging) return; const b = el.getBoundingClientRect(); px = e.clientX - b.left; mode = 'live'; setBarOp(1, performance.now()); };
    const down = (e) => { dragging = true; const b = el.getBoundingClientRect(); px = e.clientX - b.left; mode = 'live'; setBarOp(1, performance.now()); };
    const release = () => { if (!dragging) return; dragging = false; lastRelease = performance.now(); if (noHover) mode = 'hold'; else startLeave(); };
    const startLeave = () => { mode = 'leave'; px = null; leaveT0 = performance.now(); L.forEach((l) => { l.leaveFrom = l.w; }); setBarOp(0, leaveT0); };
    const leave = () => { if (!noHover && !dragging) startLeave(); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('pointerleave', leave);
    const ro = new ResizeObserver(measure); ro.observe(el); measure();
    const frame = (now) => {
      if (!alive) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
      el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
      const tIntro = now - t0;
      let x = null;
      if (mode === 'live' || mode === 'hold') {
        x = px;
        if (mode === 'hold' && now - lastRelease > P.resumeDelay && !reduced) {
          const mid = (wordLeft + wordRight) / 2, half = (wordRight - wordLeft) / 2;
          const c = Math.max(-1, Math.min(1, (px - mid) / half));
          tour = { kind: 'ping', t0: now, ph0: Math.acos(c), from: px }; mode = 'tour'; x = tourX(now);
        }
      } else if (mode === 'tour') { x = tourX(now); px = x; }
      const introDone = tIntro > P.introStagger * (L.length - 1) + P.introDur;
      let heavy = L[0];
      L.forEach((l, i) => {
        const lt = tIntro - i * P.introStagger;
        if (lt < P.introDur) {
          const e = easeOut(Math.max(0, lt) / P.introDur);
          l.op = reduced ? 1 : e; l.w = reduced ? P.wRest : P.wIntro + (P.wRest - P.wIntro) * e; l.v = 0;
        } else {
          l.op = 1;
          if (mode === 'leave') { const k = Math.min(1, (now - leaveT0) / P.leaveDur); l.w = l.leaveFrom + (P.wRest - l.leaveFrom) * easeInOut(k); l.v = 0; }
          else {
            const tgt = x == null ? P.wRest : P.wMax - (P.wMax - P.wRest) * smooth(0, R, Math.abs(x - l.cx));
            if (reduced) {
              if (!l.tw || Math.abs(l.tw.to - tgt) > 4) l.tw = { from: l.w, to: tgt, t0: now };
              const k = Math.min(1, (now - l.tw.t0) / P.reducedDur); l.w = l.tw.from + (l.tw.to - l.tw.from) * k;
            } else {
              const n = 4, h = dt / n;
              for (let s = 0; s < n; s++) { l.v += ((-P.k * (l.w - tgt) - P.c * l.v) / P.m) * h; l.w += l.v * h; }
            }
          }
        }
        l.w = Math.max(P.wIntro, Math.min(P.wMax, l.w));
        l.node.style.opacity = l.op.toFixed(3);
        l.node.style.fontVariationSettings = `'wght' ${l.w.toFixed(1)}, 'opsz' 32`;
        if (l.w > heavy.w) heavy = l;
      });
      const curW = heavy.w200 + (heavy.w900 - heavy.w200) * ((heavy.w - P.wRest) / (P.wMax - P.wRest));
      const tw = 0.3 * Math.max(heavy.w200 || 8, curW || 8), tx = heavy.cx - tw / 2;
      if (!barInit) { barX = tx; barW = tw; barInit = true; }
      if (reduced) { barX = tx; barW = tw; }
      else {
        const n = 4, h = dt / n;
        for (let s = 0; s < n; s++) {
          barV += ((-P.k * (barX - tx) - P.c * barV) / P.m) * h; barX += barV * h;
          barWV += ((-P.k * (barW - tw) - P.c * barWV) / P.m) * h; barW += barWV * h;
        }
      }
      const fk = Math.min(1, (now - barOpT0) / P.barFade);
      barOp = barOpFrom + (barOpTo - barOpFrom) * (Number.isFinite(fk) ? fk : 1);
      bar.style.opacity = String(introDone ? barOp : 0);
      bar.style.width = Math.max(2, barW) + 'px';
      bar.style.transform = `translate(${barX}px, ${barY}px)`;
      if (noHover && !reduced && mode === 'idle' && introDone) { tour = { kind: 'sweep', t0: now }; mode = 'tour'; setBarOp(1, now); }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      alive = false; cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', release);
      el.removeEventListener('pointercancel', release);
      el.removeEventListener('pointerleave', leave);
      reducedMq.removeEventListener('change', onReduce);
    };
  }, []);
  return (
    <div ref={root} data-fw="weight" style={{ position: 'relative', height: '100%', minHeight: 280, background: '#0E0E10', color: '#E8E6E1', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', lineHeight: 0.9, fontSize: 80 }}>
        {P.word.split('').map((ch) => (
          <div key={ch} style={{ display: 'flex', justifyContent: 'center' }}><span data-ch={ch} style={{ opacity: 0 }}>{ch}</span></div>
        ))}
      </div>
      <i data-bar="1" style={{ position: 'absolute', left: 0, top: 0, height: 2, background: '#F2A65A', opacity: 0 }} />
      <span data-probe="1" aria-hidden="true" style={{ position: 'absolute', visibility: 'hidden', fontSize: 100, whiteSpace: 'pre' }} />
    </div>
  );
}
