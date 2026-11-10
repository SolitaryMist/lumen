<script setup>
import { onMounted, onUnmounted, ref } from 'vue';
/* Mount: Vue 3. <TickScale /> in a tall box. Register this piece's inter-var.woff2 as family "Inter Var", weight 100 900.
   24 ticks, springs 200/24 and 320/30, guide then drift. */
const N = 24, K = 200, C = 24, KG = 320, CG = 30;
const root = ref(null);
let stop = () => {};
function easeGuide(t) {
  const x1 = 0.65, y1 = 0, x2 = 0.35, y2 = 1;
  if (t <= 0) return 0; if (t >= 1) return 1; let u = t;
  for (let i = 0; i < 8; i++) {
    const x = 3*x1*u*(1-u)**2 + 3*x2*u*u*(1-u) + u**3 - t;
    const d = 3*x1*(1-u)**2 + 6*(x2-x1)*u*(1-u) + 3*(1-x2)*u*u;
    if (Math.abs(d) < 1e-6) break; u = Math.min(1, Math.max(0, u - x / d));
  }
  return 3*y1*u*(1-u)**2 + 3*y2*u*u*(1-u) + u**3;
}
onMounted(() => {
  const el = root.value, ticks = [...el.querySelectorAll('i')], num = el.querySelector('b');
  const reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let reduced = reducedMq.matches, value = fine || reduced ? 50 : 0, vel = 0, target = value;
  let mode = fine || reduced ? 'spring' : 'hold', raf = 0, last = 0, alive = true, t0 = performance.now(), scanT0 = 0, driftT0 = 0;
  const lens = ticks.map(() => 16), lvel = ticks.map(() => 0);
  const onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const yTo = (y) => { const r = el.getBoundingClientRect(); return Math.min(100, Math.max(0, (1 - (y - r.top) / Math.max(1, r.height)) * 100)); };
  const move = (e) => { if (!fine || reduced || e.pointerType === 'touch') return; mode = 'spring'; target = yTo(e.clientY); };
  const leave = () => { if (fine) target = 50; };
  el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave);
  const lenTarget = (i, a) => { const d = Math.abs(i - a); return d === 0 ? 28 : d === 1 ? 20 : 16; };
  const frame = (now) => {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
    el.dataset.frames = String((Number(el.dataset.frames) || 0) + 1);
    if (reduced) { value = 50; target = 50; vel = 0; }
    else if (!fine && mode === 'hold' && now >= t0 + 160 + 23 * 40) { mode = 'scan'; scanT0 = now; }
    if (!reduced && mode === 'scan') {
      const elapse = now - scanT0;
      if (elapse >= 1400) { driftT0 = scanT0 + 1400; mode = 'drift'; value = 20; }
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
  stop = () => { alive = false; cancelAnimationFrame(raf); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave); reducedMq.removeEventListener('change', onReduce); };
});
onUnmounted(() => stop());
</script>
<template>
  <div ref="root" data-fw="scale" style="height:100%;min-height:320px;display:grid;place-items:center;background:#0B0B0C">
    <div style="display:flex;align-items:center;gap:28px;height:min(600px,62%)">
      <div style="display:flex;flex-direction:column;justify-content:space-between;height:100%">
        <i v-for="i in N" :key="i" style="display:block;width:16px;height:2px;background:#2A2A2A;transform-origin:left center" />
      </div>
      <b style="color:#EDEDED;font-weight:500;font-size:clamp(56px,14vw,88px);letter-spacing:-0.04em">50</b>
    </div>
  </div>
</template>
