<script setup>
import { onMounted, onUnmounted, ref } from 'vue';

// 24 ticks. Value spring 200/24. Growing length 320/30. Guide 0 to 100 to 20, then drift 50 - 30 cos.
const N = 24, K = 200, C = 24, KG = 320, CG = 30;
const root = ref(null);
let raf = 0, move, leave, reducedMq, onReduce;

onMounted(() => {
  const el = root.value;
  const ticks = [...el.querySelectorAll('i')];
  const num = el.querySelector('b');
  let last = 0, value = 50, vel = 0, target = 50, mode = 'spring';
  const lens = ticks.map(() => 16), lvel = ticks.map(() => 0);
  reducedMq = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let reduced = reducedMq.matches;
  let scanT0 = 0, driftT0 = 0, t0 = performance.now();
  if (!fine && !reduced) { value = 0; mode = 'hold'; }
  onReduce = () => { reduced = reducedMq.matches; };
  reducedMq.addEventListener('change', onReduce);
  const yTo = (clientY) => {
    const r = el.getBoundingClientRect();
    return Math.min(100, Math.max(0, (1 - (clientY - r.top) / r.height) * 100));
  };
  move = (e) => { if (!fine || reduced) return; mode = 'spring'; target = yTo(e.clientY); };
  leave = () => { if (fine) target = 50; };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  const lenTarget = (i, active) => { const d = Math.abs(i - active); return d === 0 ? 28 : d === 1 ? 20 : 16; };
  const frame = (now) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (reduced) { value = 50; target = 50; }
    else if (!fine && mode === 'hold' && now > t0 + 400) { mode = 'scan'; scanT0 = now; }
    if (!reduced && mode === 'scan') {
      const elapse = now - scanT0;
      if (elapse >= 1400) { mode = 'drift'; driftT0 = scanT0 + 1400; value = 20; }
      else value = elapse <= 760 ? 100 * (elapse / 760) : 100 + (20 - 100) * ((elapse - 760) / 640);
    } else if (!reduced && mode === 'drift') {
      value = 50 - 30 * Math.cos(((now - driftT0) / 8000) * Math.PI * 2);
    } else if (!reduced && mode === 'spring' && dt) {
      const n = Math.max(1, Math.round(dt * 240)), h = dt / n;
      for (let s = 0; s < n; s++) { vel += (-K * (value - target) - C * vel) * h; value += vel * h; }
    }
    const active = Math.min(N - 1, Math.max(0, Math.round((value / 100) * (N - 1))));
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
  };
  raf = requestAnimationFrame(frame);
});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  root.value?.removeEventListener('pointermove', move);
  root.value?.removeEventListener('pointerleave', leave);
  reducedMq?.removeEventListener('change', onReduce);
});
</script>

<template>
  <div ref="root" style="height:100%;display:grid;place-items:center;background:#0B0B0C">
    <div style="display:flex;align-items:center;gap:28px">
      <div style="display:flex;flex-direction:column;gap:6px">
        <i v-for="i in N" :key="i" style="display:block;width:16px;height:2px;background:#2A2A2A;transform-origin:left center" />
      </div>
      <b style="color:#EDEDED;font-size:64px;font-weight:500;letter-spacing:-0.04em">50</b>
    </div>
  </div>
</template>
